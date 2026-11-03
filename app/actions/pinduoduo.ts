'use server'

import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { products, suppliers } from '@/lib/db/schema'
import { getPersonalWorkspaceUserId } from '@/lib/personal-workspace'
import { issuePinduoduoExtensionToken } from '@/lib/pinduoduo-extension-token'
import { runAgentTask } from '@/app/actions/agent'

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
  if (existing) return { ok: true as const, alreadySaved: true as const, productId: existing.id }

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

export async function createPinduoduoImportReport(rawProductIds: unknown) {
  const parsed = z.array(z.string().trim().min(1).max(64)).min(1).max(12).safeParse(rawProductIds)
  if (!parsed.success) return { ok: false as const, reason: 'invalid_input' as const }

  const productIds = [...new Set(parsed.data)]
  const prompt = [
    'Подготовь отчёт по товарам, которые только что импортированы с Pinduoduo, и предложи безопасное оформление их черновых карточек.',
    `Работай строго с этими ID: ${JSON.stringify(productIds)}. Сначала вызови searchCatalog с productIds и source Pinduoduo.`,
    'В отчёте перечисли название, закупочную цену в CNY, количество фото, категорию и текущий статус. Отдельно укажи, каких данных для готовой карточки не хватает; нулевые цены в рублях не трактуй как реальные цены или маржу.',
    'Если по названию и уже сохранённому описанию можно подготовить аккуратное название, категорию или описание без выдуманных характеристик, вызови updateProductCard для существующей карточки, передав её точные id и currentName из searchCatalog. Не меняй цены, размеры, статус и источник; не создавай дубликаты через createProductDraft.',
    'Все изменения карточек должны остаться на подтверждении пользователя. Не говори, что они уже применены. Не придумывай материал, свойства, размеры, продавца, цену в рублях, доставку или спрос. Если данных недостаточно — оставь поле как есть и отметь это в отчёте.',
  ].join('\n')

  return runAgentTask(prompt)
}

export async function createPinduoduoExtensionToken() {
  try {
    const userId = await getPersonalWorkspaceUserId()
    const token = issuePinduoduoExtensionToken(userId)
    return { ok: true as const, ...token }
  } catch {
    return { ok: false as const, message: 'Не удалось создать временный токен импорта.' }
  }
}
