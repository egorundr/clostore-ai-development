'use server'

import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { products, suppliers } from '@/lib/db/schema'
import { getPersonalWorkspaceUserId } from '@/lib/personal-workspace'
import { searchPinduoduoByImage as runImageSearch, searchPinduoduoProducts as runProductSearch } from '@/lib/integrations/pinduoduo'
import type { PinduoduoSearchResult } from '@/components/clostore/types'

const productSearchSchema = z.object({
  query: z.string().trim().min(2, 'Введите минимум два символа.').max(120),
  minPriceCny: z.number().finite().min(0).max(100_000_000).nullable().optional(),
  maxPriceCny: z.number().finite().min(0).max(100_000_000).nullable().optional(),
})

const imageSearchSchema = z.object({ imageUrl: z.string().url().max(2048) })

const importResultSchema = z.object({
  goodsId: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(180),
  priceCny: z.number().finite().nonnegative().max(100_000_000).nullable(),
  imageUrl: z.string().url().max(2048).nullable(),
  productUrl: z.string().url().max(2048),
  sellerName: z.string().max(180).nullable(),
  salesHint: z.string().max(120).nullable(),
})

function isPinduoduoUrl(value: string) {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    return url.protocol === 'https:' && (
      hostname === 'pinduoduo.com' || hostname.endsWith('.pinduoduo.com') ||
      hostname === 'yangkeduo.com' || hostname.endsWith('.yangkeduo.com')
    )
  } catch {
    return false
  }
}

async function validateSearchImage(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Загрузите фото в формате JPEG или PNG.')
  }

  const hostname = url.hostname.toLowerCase()
  const isVercelBlob = hostname === 'public.blob.vercel-storage.com' || hostname.endsWith('.public.blob.vercel-storage.com')
  if (url.protocol !== 'https:' || url.username || url.password || !isVercelBlob || !/\.(?:jpe?g|png)$/i.test(url.pathname)) {
    throw new Error('Для поиска используйте загруженное сюда фото JPEG или PNG.')
  }

  let response: Response
  try {
    response = await fetch(url, { method: 'HEAD', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000) })
  } catch {
    throw new Error('Не удалось проверить загруженное фото. Загрузите его ещё раз.')
  }

  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  const contentLength = Number(response.headers.get('content-length'))
  if (!response.ok || !['image/jpeg', 'image/png'].includes(contentType ?? '') || !Number.isFinite(contentLength) || contentLength < 1 || contentLength > 500 * 1024) {
    throw new Error('Фото должно быть JPEG или PNG и весить не больше 500 КБ.')
  }

  return url.toString()
}

function searchFailureMessage(error: unknown) {
  if (error instanceof Error && error.message === 'pinduoduo_not_configured') {
    return 'Добавьте PINDUODUO_CLIENT_ID и PINDUODUO_CLIENT_SECRET в переменные проекта, чтобы включить поиск.'
  }
  if (error instanceof Error && /^(Для поиска|Фото |Загрузите)/.test(error.message)) return error.message
  if (error instanceof Error && error.message === 'Введите минимум два символа.') return error.message
  if (error instanceof Error && error.message === 'pinduoduo_api_rejected') {
    return 'Pinduoduo отклонил запрос. Проверьте доступ приложения к этому методу и правильность API-подписи.'
  }
  return 'Не удалось получить результаты Pinduoduo. Проверьте подключение API и повторите попытку.'
}

export async function searchPinduoduoProducts(input: unknown) {
  await getPersonalWorkspaceUserId()
  const parsed = productSearchSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? 'Проверьте параметры поиска.' }
  if (parsed.data.minPriceCny != null && parsed.data.maxPriceCny != null && parsed.data.minPriceCny > parsed.data.maxPriceCny) {
    return { ok: false as const, message: 'Цена «от» не может быть выше цены «до».' }
  }

  try {
    const results = await runProductSearch(parsed.data)
    return { ok: true as const, results }
  } catch (error) {
    return { ok: false as const, message: searchFailureMessage(error) }
  }
}

export async function searchPinduoduoByImage(input: unknown) {
  await getPersonalWorkspaceUserId()
  const parsed = imageSearchSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Загрузите фото для поиска.' }

  try {
    const imageUrl = await validateSearchImage(parsed.data.imageUrl)
    const results = await runImageSearch(imageUrl)
    return { ok: true as const, results }
  } catch (error) {
    return { ok: false as const, message: searchFailureMessage(error) }
  }
}

export async function addPinduoduoResultToReview(input: unknown) {
  const userId = await getPersonalWorkspaceUserId()
  const parsed = importResultSchema.safeParse(input)
  if (!parsed.success || !isPinduoduoUrl(parsed.data?.productUrl ?? '')) {
    return { ok: false as const, message: 'Данные товара или ссылка Pinduoduo некорректны.' }
  }

  const result: PinduoduoSearchResult = parsed.data
  const [existing] = await db.select({ id: products.id }).from(products).where(and(
    eq(products.userId, userId),
    eq(products.sourceUrl, result.productUrl),
  )).limit(1)
  if (existing) return { ok: true as const, alreadySaved: true as const }

  const productId = randomUUID()
  const supplierName = result.sellerName?.trim().slice(0, 180) || ''
  const imageUrls = result.imageUrl ? [result.imageUrl] : []
  const description = result.salesHint ? `Подсказка Pinduoduo: ${result.salesHint}` : ''

  await db.transaction(async (tx) => {
    let supplierId: string | null = null
    if (supplierName) {
      const [existingSupplier] = await tx.select({ id: suppliers.id }).from(suppliers).where(and(
        eq(suppliers.userId, userId),
        eq(suppliers.name, supplierName),
        eq(suppliers.platform, 'Pinduoduo'),
      )).limit(1)

      if (existingSupplier) {
        supplierId = existingSupplier.id
      } else {
        supplierId = randomUUID()
        await tx.insert(suppliers).values({
          id: supplierId,
          userId,
          name: supplierName,
          platform: 'Pinduoduo',
          storeUrl: result.productUrl,
        })
      }
    }

    await tx.insert(products).values({
      id: productId,
      userId,
      supplierId,
      name: result.name,
      category: '',
      source: 'Pinduoduo',
      sourceUrl: result.productUrl,
      purchasePriceCny: String(result.priceCny ?? 0),
      purchasePriceRub: '0',
      salePriceRub: '0',
      sizes: [],
      images: imageUrls,
      description,
      status: 'review',
      listingStatus: 'unpublished',
    })
  })

  revalidatePath('/')
  return { ok: true as const, alreadySaved: false as const, productId }
}
