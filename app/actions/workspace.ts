'use server'

import { randomUUID } from 'node:crypto'
import ExcelJS from 'exceljs'
import { and, desc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { financialTransactions, orderStatusHistory, orders, productSearches, products, suppliers } from '@/lib/db/schema'
import { getPersonalWorkspaceUserId } from '@/lib/personal-workspace'

function readText(formData: FormData, key: string, maxLength: number, required = false) {
  const value = formData.get(key)
  const result = typeof value === 'string' ? value.trim() : ''
  if (required && !result) throw new Error('Invalid input')
  if (result.length > maxLength) throw new Error('Invalid input')
  return result
}

function readAmount(formData: FormData, key: string, required = false) {
  const raw = readText(formData, key, 32)
  if (!raw && !required) return 0
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0 || value > 100_000_000) throw new Error('Invalid input')
  return Math.round(value * 100) / 100
}

function readQuantity(formData: FormData) {
  const raw = readText(formData, 'quantity', 8)
  const value = raw ? Number(raw) : 1
  if (!Number.isInteger(value) || value < 1 || value > 1000) throw new Error('Invalid input')
  return value
}

function readOptionalUrl(formData: FormData, key: string) {
  const raw = readText(formData, key, 2048)
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Invalid URL')
    return url.toString()
  } catch {
    throw new Error('Invalid input')
  }
}

function readOptionalDate(formData: FormData, key: string) {
  const raw = readText(formData, key, 10)
  if (!raw) return null
  const date = new Date(`${raw}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) throw new Error('Invalid input')
  return date
}

const orderStatuses = ['Ожидает оплаты', 'Ожидает закупки', 'Заказан у поставщика', 'В пути', 'Прибыл', 'Завершён', 'Отменён', 'Проблема / возврат']
const paymentStatuses = ['Ожидает оплаты', 'Частично оплачен', 'Оплачен', 'Возврат']
const procurementStatuses = ['Не заказан', 'Заказан у поставщика', 'Оплачен поставщику', 'Получен в Китае', 'Проблема']
const deliveryStatuses = ['Не отправлен', 'В пути по Китаю', 'Международная доставка', 'Прибыл', 'Передан покупателю', 'Проблема']

function readChoice(formData: FormData, key: string, options: string[]) {
  const value = readText(formData, key, 80, true)
  if (!options.includes(value)) throw new Error('Invalid input')
  return value
}

export async function saveProductSearch(formData: FormData) {
  const userId = await getPersonalWorkspaceUserId()
  const query = readText(formData, 'query', 240, true)
  const category = readText(formData, 'category', 120)
  const style = readText(formData, 'style', 120)
  const minRaw = readText(formData, 'minPriceCny', 32)
  const maxRaw = readText(formData, 'maxPriceCny', 32)
  const minPriceCny = minRaw ? readAmount(formData, 'minPriceCny', true) : null
  const maxPriceCny = maxRaw ? readAmount(formData, 'maxPriceCny', true) : null
  if (minPriceCny !== null && maxPriceCny !== null && minPriceCny > maxPriceCny) throw new Error('Invalid input')

  const sizes = [...new Set(readText(formData, 'sizes', 240).split(',').map((size) => size.trim()).filter(Boolean))].slice(0, 20)
  const colorMaterial = readText(formData, 'colorMaterial', 180)
  const allowedSources = new Set(['pinduoduo', 'grailed', 'custom'])
  const sources = [...new Set(formData.getAll('sources').filter((source): source is string => typeof source === 'string' && allowedSources.has(source)))]
  if (!sources.length) throw new Error('Invalid input')

  let customSourceUrl = ''
  if (sources.includes('custom')) {
    const rawUrl = readText(formData, 'customSourceUrl', 2048, true)
    try {
      const url = new URL(rawUrl)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Invalid URL')
      customSourceUrl = url.toString()
    } catch {
      throw new Error('Invalid input')
    }
  }

  const id = randomUUID()
  const createdAt = new Date()
  await db.insert(productSearches).values({
    id,
    userId,
    query,
    category,
    style,
    minPriceCny: minPriceCny === null ? null : String(minPriceCny),
    maxPriceCny: maxPriceCny === null ? null : String(maxPriceCny),
    sizes,
    colorMaterial,
    sources,
    customSourceUrl,
    createdAt,
  })

  revalidatePath('/')
  return {
    ok: true,
    search: {
      id,
      query,
      category,
      style,
      minPriceCny,
      maxPriceCny,
      sizes,
      colorMaterial,
      sources,
      customSourceUrl,
      createdAt: createdAt.toISOString(),
    },
  }
}

type ExportColumn = { header: string; width: number }
type ExportCell = string | number

async function toXlsx(sheetName: string, columns: ExportColumn[], rows: ExportCell[][]) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'CloStore AI'
  const worksheet = workbook.addWorksheet(sheetName)
  worksheet.columns = columns.map((column, index) => ({ ...column, key: `column${index + 1}` }))
  rows.forEach((row) => worksheet.addRow(row))
  worksheet.getRow(1).font = { bold: true }
  worksheet.views = [{ state: 'frozen', ySplit: 1 }]
  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer).toString('base64')
}

export async function createSupplier(formData: FormData) {
  const userId = await getPersonalWorkspaceUserId()
  const name = readText(formData, 'name', 180, true)
  const platform = readText(formData, 'platform', 120)
  const notes = readText(formData, 'notes', 4000)
  const rawStoreUrl = readText(formData, 'storeUrl', 2048)
  let storeUrl: string | null = null

  if (rawStoreUrl) {
    try {
      const url = new URL(rawStoreUrl)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Invalid URL')
      storeUrl = url.toString()
    } catch {
      throw new Error('Invalid input')
    }
  }

  const [existing] = await db.select({ id: suppliers.id }).from(suppliers)
    .where(and(eq(suppliers.userId, userId), eq(suppliers.name, name)))
    .limit(1)

  if (existing) return { ok: false }

  await db.insert(suppliers).values({
    id: randomUUID(),
    userId,
    name,
    platform,
    storeUrl,
    notes,
  })

  revalidatePath('/')
  return { ok: true }
}

export async function updateSupplier(supplierId: string, formData: FormData) {
  const userId = await getPersonalWorkspaceUserId()
  if (typeof supplierId !== 'string' || supplierId.length > 64) throw new Error('Invalid input')

  const name = readText(formData, 'name', 180, true)
  const platform = readText(formData, 'platform', 120)
  const notes = readText(formData, 'notes', 4000)
  const rawStoreUrl = readText(formData, 'storeUrl', 2048)
  const status = readText(formData, 'status', 20, true)
  if (!['active', 'inactive'].includes(status)) throw new Error('Invalid input')

  let storeUrl: string | null = null
  if (rawStoreUrl) {
    try {
      const url = new URL(rawStoreUrl)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Invalid URL')
      storeUrl = url.toString()
    } catch {
      throw new Error('Invalid input')
    }
  }

  const [duplicate] = await db.select({ id: suppliers.id }).from(suppliers)
    .where(and(eq(suppliers.userId, userId), eq(suppliers.name, name)))
    .limit(1)
  if (duplicate && duplicate.id !== supplierId) return { ok: false }

  const [updated] = await db.update(suppliers)
    .set({ name, platform, storeUrl, notes, status, updatedAt: new Date() })
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.userId, userId)))
    .returning({ id: suppliers.id })

  if (!updated) return { ok: false }
  revalidatePath('/')
  return { ok: true }
}

export async function createProduct(formData: FormData) {
  const userId = await getPersonalWorkspaceUserId()
  const name = readText(formData, 'name', 180, true)
  const category = readText(formData, 'category', 120)
  const source = readText(formData, 'source', 120)
  const supplierName = readText(formData, 'supplierName', 180)
  const rawSourceUrl = readText(formData, 'sourceUrl', 2048)
  const purchasePriceCny = readAmount(formData, 'purchasePriceCny')
  const purchasePriceRub = readAmount(formData, 'purchasePriceRub')
  const salePriceRub = readAmount(formData, 'salePriceRub')
  const sizes = [...new Set(readText(formData, 'sizes', 240).split(',').map((size) => size.trim()).filter(Boolean))].slice(0, 20)
  const description = readText(formData, 'description', 8000)
  let sourceUrl: string | null = null

  if (rawSourceUrl) {
    try {
      const url = new URL(rawSourceUrl)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Invalid URL')
      sourceUrl = url.toString()
    } catch {
      throw new Error('Invalid input')
    }
  }

  await db.transaction(async (tx) => {
    let supplierId: string | null = null

    if (supplierName) {
      const existing = await tx.select({ id: suppliers.id }).from(suppliers)
        .where(and(eq(suppliers.userId, userId), eq(suppliers.name, supplierName)))
        .limit(1)

      if (existing[0]) {
        supplierId = existing[0].id
      } else {
        supplierId = randomUUID()
        await tx.insert(suppliers).values({
          id: supplierId,
          userId,
          name: supplierName,
          platform: source || 'Свой источник',
        })
      }
    }

    await tx.insert(products).values({
      id: randomUUID(),
      userId,
      supplierId,
      name,
      category,
      source,
      sourceUrl: sourceUrl || null,
      purchasePriceCny: String(purchasePriceCny),
      purchasePriceRub: String(purchasePriceRub),
      salePriceRub: String(salePriceRub),
      sizes,
      description,
      status: 'review',
      listingStatus: 'unpublished',
    })
  })

  revalidatePath('/')
  return { ok: true }
}

export async function updateProduct(productId: string, formData: FormData) {
  const userId = await getPersonalWorkspaceUserId()
  if (typeof productId !== 'string' || productId.length > 64) throw new Error('Invalid input')

  const name = readText(formData, 'name', 180, true)
  const category = readText(formData, 'category', 120)
  const source = readText(formData, 'source', 120)
  const supplierName = readText(formData, 'supplierName', 180)
  const rawSourceUrl = readText(formData, 'sourceUrl', 2048)
  const purchasePriceCny = readAmount(formData, 'purchasePriceCny')
  const purchasePriceRub = readAmount(formData, 'purchasePriceRub')
  const salePriceRub = readAmount(formData, 'salePriceRub')
  const sizes = [...new Set(readText(formData, 'sizes', 240).split(',').map((size) => size.trim()).filter(Boolean))].slice(0, 20)
  const description = readText(formData, 'description', 8000)
  let sourceUrl: string | null = null

  if (rawSourceUrl) {
    try {
      const url = new URL(rawSourceUrl)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Invalid URL')
      sourceUrl = url.toString()
    } catch {
      throw new Error('Invalid input')
    }
  }

  const updated = await db.transaction(async (tx) => {
    const [existingProduct] = await tx.select({ id: products.id }).from(products)
      .where(and(eq(products.id, productId), eq(products.userId, userId)))
      .limit(1)
    if (!existingProduct) return false

    let supplierId: string | null = null
    if (supplierName) {
      const [existingSupplier] = await tx.select({ id: suppliers.id }).from(suppliers)
        .where(and(eq(suppliers.userId, userId), eq(suppliers.name, supplierName)))
        .limit(1)

      supplierId = existingSupplier?.id ?? randomUUID()
      if (!existingSupplier) {
        await tx.insert(suppliers).values({ id: supplierId, userId, name: supplierName, platform: source || 'Свой источник' })
      }
    }

    await tx.update(products).set({
      name,
      category,
      source,
      supplierId,
      sourceUrl,
      purchasePriceCny: String(purchasePriceCny),
      purchasePriceRub: String(purchasePriceRub),
      salePriceRub: String(salePriceRub),
      sizes,
      description,
      updatedAt: new Date(),
    }).where(and(eq(products.id, productId), eq(products.userId, userId)))

    return true
  })

  if (!updated) return { ok: false }
  revalidatePath('/')
  return { ok: true }
}

export async function deleteProduct(productId: string) {
  const userId = await getPersonalWorkspaceUserId()
  if (typeof productId !== 'string' || productId.length > 64) throw new Error('Invalid input')

  const [deleted] = await db.delete(products)
    .where(and(eq(products.id, productId), eq(products.userId, userId)))
    .returning({ id: products.id })

  if (!deleted) return { ok: false }
  revalidatePath('/')
  return { ok: true }
}

export async function updateProductReview(productId: string, decision: 'approved' | 'rejected') {
  const userId = await getPersonalWorkspaceUserId()
  if (typeof productId !== 'string' || productId.length > 64) throw new Error('Invalid input')

  const [updated] = await db.update(products)
    .set({ status: decision === 'approved' ? 'active' : 'rejected', updatedAt: new Date() })
    .where(and(eq(products.id, productId), eq(products.userId, userId), eq(products.status, 'review')))
    .returning({ id: products.id })

  if (!updated) return { ok: false }
  revalidatePath('/')
  return { ok: true }
}

export async function createOrder(formData: FormData) {
  const userId = await getPersonalWorkspaceUserId()
  const customerName = readText(formData, 'customer', 160, true)
  const customerContact = readText(formData, 'contact', 240, true)
  const productId = readText(formData, 'productId', 64)
  const manualProductName = readText(formData, 'product', 180)
  const manualSalePrice = readAmount(formData, 'salePrice')
  const manualCost = readAmount(formData, 'cost')
  const size = readText(formData, 'size', 40)
  const color = readText(formData, 'color', 80)
  const quantity = readQuantity(formData)
  const supplierInput = readText(formData, 'supplier', 180)
  const supplierProductUrlInput = readOptionalUrl(formData, 'supplierProductUrl')
  const threadUrl = readOptionalUrl(formData, 'threadUrl')
  const expectedArrivalAt = readOptionalDate(formData, 'expectedArrivalAt')
  const notes = readText(formData, 'notes', 4000)
  let productName = manualProductName
  let salePriceRub = manualSalePrice
  let costRub = manualCost
  let supplierName = supplierInput
  let supplierProductUrl = supplierProductUrlInput
  let linkedProductId: string | null = null

  if (productId) {
    const [catalogProduct] = await db.select({
      id: products.id,
      name: products.name,
      status: products.status,
      salePriceRub: products.salePriceRub,
      purchasePriceRub: products.purchasePriceRub,
      sourceUrl: products.sourceUrl,
      supplierName: suppliers.name,
    }).from(products)
      .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
      .where(and(eq(products.id, productId), eq(products.userId, userId)))
      .limit(1)

    if (!catalogProduct || catalogProduct.status !== 'active') return { ok: false }
    productName = catalogProduct.name
    salePriceRub = Number(catalogProduct.salePriceRub)
    costRub = Number(catalogProduct.purchasePriceRub)
    supplierName = catalogProduct.supplierName ?? ''
    supplierProductUrl = supplierProductUrlInput ?? catalogProduct.sourceUrl
    linkedProductId = catalogProduct.id
  }

  if (!productName || salePriceRub <= 0) throw new Error('Invalid input')

  const orderId = randomUUID()
  const initialStatuses = [
    { field: 'Статус заказа', value: 'Ожидает оплаты' },
    { field: 'Оплата', value: 'Ожидает оплаты' },
    { field: 'Выкуп', value: 'Не заказан' },
    { field: 'Доставка', value: 'Не отправлен' },
  ]
  await db.transaction(async (tx) => {
    await tx.insert(orders).values({
      id: orderId,
      userId,
      productId: linkedProductId,
      customerName,
      customerContact,
      productName,
      size,
      color,
      quantity,
      status: 'Ожидает оплаты',
      paymentStatus: 'Ожидает оплаты',
      procurementStatus: 'Не заказан',
      deliveryStatus: 'Не отправлен',
      salePriceRub: String(salePriceRub),
      costRub: String(costRub),
      supplierName,
      supplierProductUrl,
      threadUrl,
      expectedArrivalAt,
      notes,
    })
    await tx.insert(orderStatusHistory).values(initialStatuses.map(({ field, value }) => ({
      id: randomUUID(),
      userId,
      orderId,
      field,
      previousValue: '',
      newValue: value,
      note: 'Заказ создан',
    })))
  })

  revalidatePath('/')
  return { ok: true }
}

export async function updateOrder(orderId: string, formData: FormData) {
  const userId = await getPersonalWorkspaceUserId()
  if (typeof orderId !== 'string' || orderId.length > 64) throw new Error('Invalid input')

  const customerName = readText(formData, 'customer', 160, true)
  const customerContact = readText(formData, 'contact', 240, true)
  const productName = readText(formData, 'product', 180, true)
  const size = readText(formData, 'size', 40)
  const color = readText(formData, 'color', 80)
  const quantity = readQuantity(formData)
  const status = readChoice(formData, 'status', orderStatuses)
  const paymentStatus = readChoice(formData, 'paymentStatus', paymentStatuses)
  const procurementStatus = readChoice(formData, 'procurementStatus', procurementStatuses)
  const deliveryStatus = readChoice(formData, 'deliveryStatus', deliveryStatuses)
  const salePriceRub = readAmount(formData, 'salePrice', true)
  const costRub = readAmount(formData, 'costRub', true)
  const supplierName = readText(formData, 'supplier', 180)
  const supplierProductUrl = readOptionalUrl(formData, 'supplierProductUrl')
  const threadUrl = readOptionalUrl(formData, 'threadUrl')
  const expectedArrivalAt = readOptionalDate(formData, 'expectedArrivalAt')
  const tracking = readText(formData, 'tracking', 120)
  const notes = readText(formData, 'notes', 4000)
  const changeNote = readText(formData, 'historyNote', 800)

  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
      .limit(1)
    if (!existing) return false

    await tx.update(orders).set({
      customerName,
      customerContact,
      productName,
      size,
      color,
      quantity,
      status,
      paymentStatus,
      procurementStatus,
      deliveryStatus,
      salePriceRub: String(salePriceRub),
      costRub: String(costRub),
      supplierName,
      supplierProductUrl,
      threadUrl,
      expectedArrivalAt,
      tracking: tracking || null,
      notes,
      updatedAt: new Date(),
    }).where(and(eq(orders.id, orderId), eq(orders.userId, userId)))

    const changes = [
      { field: 'Статус заказа', previousValue: existing.status, newValue: status },
      { field: 'Оплата', previousValue: existing.paymentStatus, newValue: paymentStatus },
      { field: 'Выкуп', previousValue: existing.procurementStatus, newValue: procurementStatus },
      { field: 'Доставка', previousValue: existing.deliveryStatus, newValue: deliveryStatus },
    ].filter((change) => change.previousValue !== change.newValue)

    if (changes.length) {
      await tx.insert(orderStatusHistory).values(changes.map((change) => ({
        id: randomUUID(),
        userId,
        orderId,
        ...change,
        note: changeNote,
      })))
    }
    return true
  })

  if (!updated) return { ok: false }
  revalidatePath('/')
  return { ok: true }
}

export async function deleteOrder(orderId: string) {
  const userId = await getPersonalWorkspaceUserId()
  if (typeof orderId !== 'string' || orderId.length > 64) throw new Error('Invalid input')

  const [deleted] = await db.delete(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
    .returning({ id: orders.id })

  if (!deleted) return { ok: false }
  revalidatePath('/')
  return { ok: true }
}

export async function createFinancialTransaction(formData: FormData) {
  const userId = await getPersonalWorkspaceUserId()
  const category = readChoice(formData, 'category', ['Упаковка', 'Доставка', 'Комиссии', 'Реклама', 'Подписки и сервисы', 'Прочее'])
  const amountRub = readAmount(formData, 'amountRub', true)
  if (amountRub <= 0) throw new Error('Invalid input')
  const notes = readText(formData, 'notes', 1000)
  const occurredAt = readOptionalDate(formData, 'occurredAt') ?? new Date()

  await db.insert(financialTransactions).values({
    id: randomUUID(),
    userId,
    category,
    amountRub: String(amountRub),
    notes,
    occurredAt,
  })

  revalidatePath('/')
  return { ok: true }
}

export async function updateProductDescription(productId: string, description: string) {
  const userId = await getPersonalWorkspaceUserId()
  if (typeof productId !== 'string' || productId.length > 64) throw new Error('Invalid input')
  if (typeof description !== 'string' || description.length > 8000) throw new Error('Invalid input')

  const [updated] = await db.update(products)
    .set({ description: description.trim(), updatedAt: new Date() })
    .where(and(eq(products.id, productId), eq(products.userId, userId)))
    .returning({ id: products.id })

  if (!updated) return { ok: false }
  revalidatePath('/')
  return { ok: true }
}

export async function updateProductPricing(productId: string, purchasePriceCny: number, purchasePriceRub: number, salePriceRub: number) {
  const userId = await getPersonalWorkspaceUserId()
  if (typeof productId !== 'string' || productId.length > 64) throw new Error('Invalid input')
  const amounts = [purchasePriceCny, purchasePriceRub, salePriceRub]
  if (amounts.some((amount) => typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > 100_000_000)) {
    throw new Error('Invalid input')
  }

  const [updated] = await db.update(products)
    .set({
      purchasePriceCny: String(Math.round(purchasePriceCny * 100) / 100),
      purchasePriceRub: String(Math.round(purchasePriceRub * 100) / 100),
      salePriceRub: String(Math.round(salePriceRub * 100) / 100),
      updatedAt: new Date(),
    })
    .where(and(eq(products.id, productId), eq(products.userId, userId)))
    .returning({ id: products.id })

  if (!updated) return { ok: false }
  revalidatePath('/')
  return { ok: true }
}

export async function exportOrdersXlsx() {
  const userId = await getPersonalWorkspaceUserId()
  const rows = await db.select().from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt))

  return toXlsx(
    'Заказы',
    [
      { header: 'ID', width: 18 },
      { header: 'Дата', width: 20 },
      { header: 'Покупатель', width: 24 },
      { header: 'Контакт', width: 24 },
      { header: 'Товар', width: 32 },
      { header: 'Размер', width: 12 },
      { header: 'Цвет', width: 16 },
      { header: 'Количество', width: 14 },
      { header: 'Статус заказа', width: 24 },
      { header: 'Оплата', width: 20 },
      { header: 'Выкуп', width: 24 },
      { header: 'Доставка', width: 24 },
      { header: 'Продажа за единицу, RUB', width: 22 },
      { header: 'Себестоимость за единицу, RUB', width: 28 },
      { header: 'Продажа всего, RUB', width: 20 },
      { header: 'Себестоимость всего, RUB', width: 24 },
      { header: 'Поставщик', width: 24 },
      { header: 'Ссылка на товар', width: 40 },
      { header: 'Переписка', width: 40 },
      { header: 'Ожидаемое поступление', width: 20 },
      { header: 'Трек-номер', width: 20 },
      { header: 'Заметки', width: 42 },
    ],
    rows.map((order) => {
      const salePrice = Number(order.salePriceRub)
      const cost = Number(order.costRub)
      return [
        order.id,
        new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Moscow' }).format(order.createdAt),
        order.customerName,
        order.customerContact,
        order.productName,
        order.size,
        order.color,
        order.quantity,
        order.status,
        order.paymentStatus,
        order.procurementStatus,
        order.deliveryStatus,
        salePrice,
        cost,
        salePrice * order.quantity,
        cost * order.quantity,
        order.supplierName,
        order.supplierProductUrl ?? '',
        order.threadUrl ?? '',
        order.expectedArrivalAt ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeZone: 'Europe/Moscow' }).format(order.expectedArrivalAt) : '',
        order.tracking ?? '',
        order.notes,
      ]
    }),
  )
}

export async function exportProductsXlsx() {
  const userId = await getPersonalWorkspaceUserId()
  const rows = await db.select({
    id: products.id,
    name: products.name,
    category: products.category,
    supplier: suppliers.name,
    source: products.source,
    sourceUrl: products.sourceUrl,
    purchasePriceCny: products.purchasePriceCny,
    purchasePriceRub: products.purchasePriceRub,
    salePriceRub: products.salePriceRub,
    sizes: products.sizes,
    status: products.status,
    listingStatus: products.listingStatus,
    description: products.description,
  }).from(products)
    .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
    .where(eq(products.userId, userId))
    .orderBy(desc(products.createdAt))

  return toXlsx(
    'Каталог',
    [
      { header: 'ID', width: 18 },
      { header: 'Название', width: 32 },
      { header: 'Категория', width: 20 },
      { header: 'Поставщик', width: 24 },
      { header: 'Источник', width: 20 },
      { header: 'Ссылка', width: 36 },
      { header: 'Закупка, CNY', width: 18 },
      { header: 'Себестоимость, RUB', width: 20 },
      { header: 'Цена продажи, RUB', width: 20 },
      { header: 'Размеры', width: 24 },
      { header: 'Статус', width: 20 },
      { header: 'Публикация', width: 20 },
      { header: 'Описание', width: 48 },
    ],
    rows.map((product) => [
      product.id,
      product.name,
      product.category,
      product.supplier ?? '',
      product.source,
      product.sourceUrl ?? '',
      Number(product.purchasePriceCny),
      Number(product.purchasePriceRub),
      Number(product.salePriceRub),
      Array.isArray(product.sizes) ? product.sizes.join(', ') : '',
      product.status,
      product.listingStatus,
      product.description,
    ]),
  )
}
