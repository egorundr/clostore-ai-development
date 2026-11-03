'use server'

import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { products, publicationTemplates, publications } from '@/lib/db/schema'
import { getPersonalWorkspaceUserId } from '@/lib/personal-workspace'
import type { PublicationTemplate } from '@/components/clostore/types'

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

const saveTemplateSchema = z.object({
  name: z.string().trim().min(1, 'Укажите название шаблона.').max(80),
  title: z.string().trim().min(1, 'Заполните заголовок, который войдёт в шаблон.').max(120),
  body: z.string().trim().max(3800),
  imageUrls: z.array(z.string().max(2048)).max(10),
})

const createDraftSchema = z.object({
  templateId: z.string().min(1).max(64),
  productId: z.string().min(1).max(64),
})

function renderTemplate(value: string, product: { name: string; category: string; salePriceRub: string; sizes: string[]; description: string }) {
  const variables: Record<string, string> = {
    productName: product.name,
    category: product.category,
    price: Number(product.salePriceRub) > 0
      ? new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(product.salePriceRub))
      : '',
    sizes: product.sizes.join(', '),
    description: product.description,
  }

  return value.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g, (_, name: string) => variables[name] ?? '').trim()
}

export async function savePublicationTemplate(input: unknown) {
  const userId = await getPersonalWorkspaceUserId()
  const parsed = saveTemplateSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? 'Проверьте поля шаблона.' }

  let imageUrls: string[]
  try {
    imageUrls = parseImageUrls(parsed.data.imageUrls)
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : 'Проверьте ссылки на фото.' }
  }

  const id = randomUUID()
  const now = new Date()
  await db.insert(publicationTemplates).values({
    id,
    userId,
    name: parsed.data.name,
    title: parsed.data.title,
    body: parsed.data.body,
    imageUrls,
    createdAt: now,
    updatedAt: now,
  })

  const template: PublicationTemplate = {
    id,
    name: parsed.data.name,
    title: parsed.data.title,
    body: parsed.data.body,
    imageUrls,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }
  revalidatePath('/')
  return { ok: true as const, template }
}

export async function deletePublicationTemplate(templateId: string) {
  const userId = await getPersonalWorkspaceUserId()
  if (typeof templateId !== 'string' || !templateId.trim() || templateId.length > 64) return { ok: false as const }

  const [deleted] = await db.delete(publicationTemplates).where(and(
    eq(publicationTemplates.id, templateId),
    eq(publicationTemplates.userId, userId),
  )).returning({ id: publicationTemplates.id })

  if (!deleted) return { ok: false as const }
  revalidatePath('/')
  return { ok: true as const }
}

export async function createPublicationFromTemplate(input: unknown) {
  const userId = await getPersonalWorkspaceUserId()
  const parsed = createDraftSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Выберите шаблон и товар.' }

  const [template] = await db.select().from(publicationTemplates).where(and(
    eq(publicationTemplates.id, parsed.data.templateId),
    eq(publicationTemplates.userId, userId),
  )).orderBy(desc(publicationTemplates.updatedAt)).limit(1)
  const [product] = await db.select().from(products).where(and(
    eq(products.id, parsed.data.productId),
    eq(products.userId, userId),
  )).limit(1)

  if (!template || !product) return { ok: false as const, message: 'Шаблон или товар больше недоступен. Обновите страницу.' }

  const title = renderTemplate(template.title, product)
  const body = renderTemplate(template.body, product)
  const imageUrls = Array.isArray(product.images) && product.images.length
    ? product.images.slice(0, 10)
    : Array.isArray(template.imageUrls) ? template.imageUrls.slice(0, 10) : []
  const message = [title, body, 'Контакт: @clostorelink'].filter(Boolean).join('\n\n')

  if (!title || title.length > 120 || body.length > 3800 || message.length > 4000) {
    return { ok: false as const, message: 'После подстановки проверьте заголовок и длину текста шаблона.' }
  }
  if (imageUrls.length && message.length > 1000) {
    return { ok: false as const, message: 'Для черновика с фото сократите текст до лимита Telegram в 1000 символов.' }
  }

  const id = randomUUID()
  const now = new Date()
  await db.insert(publications).values({
    id,
    userId,
    productId: product.id,
    channel: 'telegram',
    title,
    body,
    imageUrls,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  })

  revalidatePath('/')
  return {
    ok: true as const,
    publication: { id, productId: product.id, title, body, imageUrls },
  }
}
