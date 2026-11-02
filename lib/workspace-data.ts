import 'server-only'

import { and, count, desc, eq, gte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { orders, productSearches, products, suppliers } from '@/lib/db/schema'
import type { OrderStatus, WorkspaceData } from '@/components/clostore/types'

const orderStatuses: OrderStatus[] = [
  'Ожидает оплаты',
  'Ожидает закупки',
  'Заказан у поставщика',
  'В пути',
  'Прибыл',
  'Завершён',
]

function safeOrderStatus(value: string): OrderStatus {
  return orderStatuses.includes(value as OrderStatus) ? value as OrderStatus : 'Ожидает оплаты'
}

function amount(value: string | null | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export async function getWorkspaceData(userId: string): Promise<WorkspaceData> {
  const since = new Date()
  since.setUTCMonth(since.getUTCMonth() - 5, 1)
  since.setUTCHours(0, 0, 0, 0)

  const [orderRows, productRows, supplierRows, searchRows, orderTotals, reviewTotals, publishedTotals, trendRows] = await Promise.all([
    db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt)).limit(100),
    db.select().from(products).where(eq(products.userId, userId)).orderBy(desc(products.createdAt)).limit(200),
    db.select().from(suppliers).where(eq(suppliers.userId, userId)).orderBy(suppliers.name).limit(200),
    db.select().from(productSearches).where(eq(productSearches.userId, userId)).orderBy(desc(productSearches.createdAt)).limit(20),
    db.select({
      total: count(),
      active: sql<number>`count(*) filter (where ${orders.status} <> 'Завершён')`,
      revenue: sql<string>`coalesce(sum(${orders.salePriceRub}), 0)::text`,
      cost: sql<string>`coalesce(sum(${orders.costRub}), 0)::text`,
    }).from(orders).where(eq(orders.userId, userId)),
    db.select({ total: count() }).from(products).where(and(eq(products.userId, userId), eq(products.status, 'review'))),
    db.select({ total: count() }).from(products).where(and(eq(products.userId, userId), eq(products.listingStatus, 'published'))),
    db.select({ createdAt: orders.createdAt, salePriceRub: orders.salePriceRub, costRub: orders.costRub })
      .from(orders)
      .where(and(eq(orders.userId, userId), gte(orders.createdAt, since)))
      .orderBy(orders.createdAt),
  ])

  const supplierNames = new Map(supplierRows.map((supplier) => [supplier.id, supplier.name]))
  const supplierProductCounts = new Map<string, number>()

  const mappedProducts = productRows.map((product) => {
    if (product.supplierId) {
      supplierProductCounts.set(product.supplierId, (supplierProductCounts.get(product.supplierId) ?? 0) + 1)
    }

    return {
      id: product.id,
      name: product.name,
      category: product.category,
      source: product.source || '—',
      sourceUrl: product.sourceUrl,
      supplier: product.supplierId ? supplierNames.get(product.supplierId) ?? '—' : '—',
      supplierId: product.supplierId,
      purchaseCny: amount(product.purchasePriceCny),
      purchaseRub: amount(product.purchasePriceRub),
      salePriceRub: amount(product.salePriceRub),
      sizes: Array.isArray(product.sizes) ? product.sizes : [],
      description: product.description,
      status: product.status === 'review' ? 'На рассмотрении' : product.status === 'active' ? 'В каталоге' : product.status === 'rejected' ? 'Отклонён' : 'Черновик',
      listingStatus: product.listingStatus === 'published' ? 'Опубликован' : product.listingStatus === 'draft' ? 'Черновик' : 'Не опубликован',
    }
  })

  const trendByMonth = new Map<string, { revenue: number; profit: number }>()
  for (const order of trendRows) {
    const key = monthKey(order.createdAt)
    const current = trendByMonth.get(key) ?? { revenue: 0, profit: 0 }
    const revenue = amount(order.salePriceRub)
    current.revenue += revenue
    current.profit += revenue - amount(order.costRub)
    trendByMonth.set(key, current)
  }

  const monthFormatter = new Intl.DateTimeFormat('ru-RU', { month: 'short', timeZone: 'UTC' })
  const revenueTrend = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 5 + index, 1))
    const values = trendByMonth.get(monthKey(date)) ?? { revenue: 0, profit: 0 }
    return { month: monthFormatter.format(date), ...values }
  })

  const totals = orderTotals[0]

  return {
    savedSearches: searchRows.map((search) => ({
      id: search.id,
      query: search.query,
      category: search.category,
      style: search.style,
      minPriceCny: search.minPriceCny === null ? null : amount(search.minPriceCny),
      maxPriceCny: search.maxPriceCny === null ? null : amount(search.maxPriceCny),
      sizes: Array.isArray(search.sizes) ? search.sizes : [],
      colorMaterial: search.colorMaterial,
      sources: Array.isArray(search.sources) ? search.sources : [],
      customSourceUrl: search.customSourceUrl,
      createdAt: search.createdAt.toISOString(),
    })),
    orders: orderRows.map((order) => ({
      id: `CS-${order.id.slice(0, 8).toUpperCase()}`,
      recordId: order.id,
      customer: order.customerName,
      contact: order.customerContact,
      product: order.productName,
      size: order.size,
      createdAt: new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', timeZone: 'Europe/Moscow' }).format(order.createdAt),
      status: safeOrderStatus(order.status),
      salePrice: amount(order.salePriceRub),
      cost: amount(order.costRub),
      supplier: order.supplierName || '—',
      tracking: order.tracking ?? undefined,
    })),
    products: mappedProducts,
    suppliers: supplierRows.map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
      platform: supplier.platform || 'Не указана',
      storeUrl: supplier.storeUrl,
      status: supplier.status,
      notes: supplier.notes,
      productCount: supplierProductCounts.get(supplier.id) ?? 0,
    })),
    revenueTrend,
    summary: {
      orderCount: Number(totals?.total ?? 0),
      activeOrderCount: Number(totals?.active ?? 0),
      revenue: amount(totals?.revenue),
      cost: amount(totals?.cost),
      reviewCount: Number(reviewTotals[0]?.total ?? 0),
      publishedCount: Number(publishedTotals[0]?.total ?? 0),
    },
  }
}
