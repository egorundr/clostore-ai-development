'use server'

import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { products, suppliers } from '@/lib/db/schema'
import { getPersonalWorkspaceUserId } from '@/lib/personal-workspace'

const importProductSchema = z.object({
  name: z.string().trim().min(2, 'Укажите название товара.').max(180),
  productUrl: z.string().url('Введите ссылку на товар.').max(2048),
  priceCny: z.number().finite().nonnegative().max(100_000_000),
  sellerName: z.string().trim().max(180).optional().default(''),
  salesHint: z.string().trim().max(120).optional().default(''),
  imageUrls: z.array(z.string().url().max(2048)).max(10),
})

function isPinduoduoUrl(value: string) {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    return url.protocol === 'https:' && !url.username && !url.password && (
      hostname === 'pinduoduo.com' || hostname.endsWith('.pinduoduo.com') ||
      hostname === 'yangkeduo.com' || hostname.endsWith('.yangkeduo.com')
    )
  } catch {
    return false
  }
}

function validateImageUrls(values: string[]) {
  return values.map((value) => {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.hostname === 'localhost' || url.hostname.endsWith('.local')) {
      throw new Error('Фото должны быть доступны по HTTPS-ссылкам.')
    }
    return url.toString()
  })
}

export async function importPinduoduoProduct(input: unknown) {
  const userId = await getPersonalWorkspaceUserId()
  const parsed = importProductSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? 'Проверьте данные товара.' }
  if (!isPinduoduoUrl(parsed.data.productUrl)) return { ok: false as const, message: 'Нужна HTTPS-ссылка с сайта Pinduoduo.' }

  let imageUrls: string[]
  try {
    imageUrls = validateImageUrls(parsed.data.imageUrls)
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : 'Проверьте ссылки на фото.' }
  }

  const productUrl = new URL(parsed.data.productUrl).toString()
  const [existing] = await db.select({ id: products.id }).from(products).where(and(
    eq(products.userId, userId),
    eq(products.sourceUrl, productUrl),
  )).limit(1)
  if (existing) return { ok: true as const, alreadySaved: true as const }

  const productId = randomUUID()
  const supplierName = parsed.data.sellerName
  const [matchingSupplier] = supplierName
    ? await db.select({ id: suppliers.id }).from(suppliers).where(and(
      eq(suppliers.userId, userId),
      eq(suppliers.name, supplierName),
      eq(suppliers.platform, 'Pinduoduo'),
    )).limit(1)
    : []

  const supplierId = matchingSupplier?.id ?? (supplierName ? randomUUID() : null)
  const description = parsed.data.salesHint ? `Подсказка Pinduoduo: ${parsed.data.salesHint}` : ''

  await db.transaction(async (tx) => {
    if (supplierName && supplierId && !matchingSupplier) {
      await tx.insert(suppliers).values({
        id: supplierId,
        userId,
        name: supplierName,
        platform: 'Pinduoduo',
        storeUrl: productUrl,
      })
    }

    await tx.insert(products).values({
      id: productId,
      userId,
      supplierId,
      name: parsed.data.name,
      category: '',
      source: 'Pinduoduo',
      sourceUrl: productUrl,
      purchasePriceCny: String(parsed.data.priceCny),
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
