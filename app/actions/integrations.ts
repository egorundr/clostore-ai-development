'use server'

import { randomUUID } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { products, publications } from '@/lib/db/schema'
import { getPersonalWorkspaceUserId } from '@/lib/personal-workspace'
import { sendTelegramPublication, verifyTelegramConnection } from '@/lib/integrations/telegram'

function parseImageUrls(value: unknown) {
  if (!Array.isArray(value) || value.length > 10) throw new Error('Укажите не более 10 ссылок на фото.')

  return [...new Set(value.map((item) => {
    if (typeof item !== 'string' || item.length > 2048) throw new Error('Проверьте ссылки на фото.')
    try {
      const url = new URL(item.trim())
      if (url.protocol !== 'https:' || url.username || url.password || url.hostname === 'localhost' || url.hostname.endsWith('.local')) throw new Error('Invalid URL')
      return url.toString()
    } catch {
      throw new Error('Каждое фото должно быть доступно по публичной HTTPS-ссылке.')
    }
  }))]
}

function parseDraftInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Проверьте данные публикации.')
  const input = value as Record<string, unknown>
  const id = typeof input.id === 'string' ? input.id.trim() : ''
  const productId = typeof input.productId === 'string' && input.productId.trim() ? input.productId.trim() : null
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  const body = typeof input.body === 'string' ? input.body.trim() : ''
  const imageUrls = parseImageUrls(input.imageUrls)
  const message = [title, body, 'Контакт: @clostorelink'].filter(Boolean).join('\n\n')

  if (id.length > 64 || (productId && productId.length > 64) || !title || title.length > 120 || body.length > 3800 || !message || message.length > 4000) {
    throw new Error('Заголовок обязателен; проверьте длину текста публикации.')
  }
  if (imageUrls.length > 0 && message.length > 1000) {
    throw new Error('Публикация с фото ограничена 1000 символами Telegram.')
  }

  return { id, productId, title, body, imageUrls }
}

export async function testTelegramConnection() {
  try {
    return { ok: true as const, message: await verifyTelegramConnection() }
  } catch {
    return { ok: false as const, message: 'Не удалось проверить Telegram через Vercel Connect. Проверьте подключение бота и доступность Bot API.' }
  }
}

export async function saveTelegramPublication(value: unknown) {
  const userId = await getPersonalWorkspaceUserId()
  let input: ReturnType<typeof parseDraftInput>
  try {
    input = parseDraftInput(value)
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : 'Проверьте данные публикации.' }
  }

  if (input.productId) {
    const [product] = await db.select({ id: products.id }).from(products)
      .where(and(eq(products.id, input.productId), eq(products.userId, userId)))
      .limit(1)
    if (!product) return { ok: false as const, message: 'Товар не найден в вашем каталоге.' }
  }

  const now = new Date()
  if (input.id) {
    const [updated] = await db.update(publications).set({
      productId: input.productId,
      title: input.title,
      body: input.body,
      imageUrls: input.imageUrls,
      status: 'draft',
      externalMessageId: null,
      publishedAt: null,
      error: '',
      updatedAt: now,
    }).where(and(
      eq(publications.id, input.id),
      eq(publications.userId, userId),
      eq(publications.channel, 'telegram'),
      inArray(publications.status, ['draft', 'failed']),
    )).returning({ id: publications.id })

    if (!updated) return { ok: false as const, message: 'Черновик уже опубликован или недоступен.' }
    revalidatePath('/')
    return { ok: true as const, id: updated.id }
  }

  const id = randomUUID()
  await db.insert(publications).values({
    id,
    userId,
    productId: input.productId,
    channel: 'telegram',
    title: input.title,
    body: input.body,
    imageUrls: input.imageUrls,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  })
  revalidatePath('/')
  return { ok: true as const, id }
}

export async function publishTelegramPublication(publicationId: string) {
  const userId = await getPersonalWorkspaceUserId()
  if (typeof publicationId !== 'string' || publicationId.length > 64) return { ok: false as const, message: 'Публикация не найдена.' }

  const [publication] = await db.select().from(publications).where(and(
    eq(publications.id, publicationId),
    eq(publications.userId, userId),
    eq(publications.channel, 'telegram'),
  )).limit(1)
  if (!publication) return { ok: false as const, message: 'Публикация не найдена.' }

  const [claimed] = await db.update(publications).set({ status: 'publishing', error: '', updatedAt: new Date() })
    .where(and(
      eq(publications.id, publicationId),
      eq(publications.userId, userId),
      eq(publications.channel, 'telegram'),
      inArray(publications.status, ['draft', 'failed']),
    )).returning({ id: publications.id })
  if (!claimed) return { ok: false as const, message: 'Публикация уже обрабатывается или была отправлена.' }

  let externalMessageId: string | null
  try {
    externalMessageId = await sendTelegramPublication({
      title: publication.title,
      body: publication.body,
      imageUrls: Array.isArray(publication.imageUrls) ? publication.imageUrls : [],
    })
  } catch {
    const error = 'Не удалось отправить публикацию. Проверьте права бота, адрес канала и публичный доступ к фото.'
    await db.update(publications).set({ status: 'failed', error, updatedAt: new Date() })
      .where(and(eq(publications.id, publicationId), eq(publications.userId, userId)))
    revalidatePath('/')
    return { ok: false as const, message: error }
  }

  await db.update(publications).set({
    status: 'published',
    externalMessageId,
    publishedAt: new Date(),
    error: '',
    updatedAt: new Date(),
  }).where(and(eq(publications.id, publicationId), eq(publications.userId, userId)))
  if (publication.productId) {
    await db.update(products).set({ listingStatus: 'published', updatedAt: new Date() })
      .where(and(eq(products.id, publication.productId), eq(products.userId, userId)))
  }
  revalidatePath('/')
  return { ok: true as const, message: 'Публикация отправлена в Telegram.' }
}
