'use server'

import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { orders, products, suppliers } from '@/lib/db/schema'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

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

export async function createProduct(formData: FormData) {
  const userId = await getUserId()
  const name = readText(formData, 'name', 180, true)
  const category = readText(formData, 'category', 120)
  const source = readText(formData, 'source', 120)
  const supplierName = readText(formData, 'supplierName', 180)
  const sourceUrl = readText(formData, 'sourceUrl', 2048)
  const purchasePriceCny = readAmount(formData, 'purchasePriceCny')
  const purchasePriceRub = readAmount(formData, 'purchasePriceRub')
  const salePriceRub = readAmount(formData, 'salePriceRub')
  const sizes = [...new Set(readText(formData, 'sizes', 240).split(',').map((size) => size.trim()).filter(Boolean))].slice(0, 20)

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
      status: 'review',
      listingStatus: 'unpublished',
    })
  })

  revalidatePath('/')
  return { ok: true }
}

export async function updateProductReview(productId: string, decision: 'approved' | 'rejected') {
  const userId = await getUserId()
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
  const userId = await getUserId()
  const customerName = readText(formData, 'customer', 160, true)
  const customerContact = readText(formData, 'contact', 240, true)
  const productName = readText(formData, 'product', 180, true)
  const size = readText(formData, 'size', 40)
  const salePriceRub = readAmount(formData, 'salePrice', true)

  if (salePriceRub <= 0) throw new Error('Invalid input')

  await db.insert(orders).values({
    id: randomUUID(),
    userId,
    customerName,
    customerContact,
    productName,
    size,
    status: 'Ожидает оплаты',
    salePriceRub: String(salePriceRub),
    costRub: '0',
  })

  revalidatePath('/')
  return { ok: true }
}

export async function updateOrder(orderId: string, formData: FormData) {
  const userId = await getUserId()
  if (typeof orderId !== 'string' || orderId.length > 64) throw new Error('Invalid input')

  const status = readText(formData, 'status', 40, true)
  const validStatuses = ['Ожидает оплаты', 'Ожидает закупки', 'Заказан у поставщика', 'В пути', 'Прибыл', 'Завершён']
  if (!validStatuses.includes(status)) throw new Error('Invalid input')

  const costRub = readAmount(formData, 'costRub', true)
  const tracking = readText(formData, 'tracking', 120)
  const [updated] = await db.update(orders)
    .set({ status, costRub: String(costRub), tracking: tracking || null, updatedAt: new Date() })
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
    .returning({ id: orders.id })

  if (!updated) return { ok: false }
  revalidatePath('/')
  return { ok: true }
}
