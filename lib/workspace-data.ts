import 'server-only'

import { and, count, desc, eq, gte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { financialTransactions, orderStatusHistory, orders, productSearches, products, suppliers } from '@/lib/db/schema'
import type { OrderStatus, WorkspaceData } from '@/components/clostore/types'

const orderStatuses: OrderStatus[] = [
  'Ожидает оплаты',
  'Ожидает закупки',
  'Заказан у поставщика',
  'В пути',
  'Прибыл',
  'Завершён',
  'Отменён',
  'Проблема / возврат',
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

  const [orderRows, productRows, supplierRows, searchRows, historyRows, transactionRows, orderTotals, transactionTotals, reviewTotals, publishedTotals, trendRows, expenseTrendRows] = await Promise.all([
    db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt)).limit(100),
    db.select().from(products).where(eq(products.userId, userId)).orderBy(desc(products.createdAt)).limit(200),
    db.select().from(suppliers).where(eq(suppliers.userId, userId)).orderBy(suppliers.name).limit(200),
    db.select().from(productSearches).where(eq(productSearches.userId, userId)).orderBy(desc(productSearches.createdAt)).limit(20),
    db.select().from(orderStatusHistory).where(eq(orderStatusHistory.userId, userId)).orderBy(desc(orderStatusHistory.createdAt)).limit(1000),
    db.select().from(financialTransactions).where(eq(financialTransactions.userId, userId)).orderBy(desc(financialTransactions.occurredAt)).limit(100),
    db.select({
      total: count(),
      active: sql<number>`count(*) filter (where ${orders.status} not in ('Завершён', 'Отменён'))`,
      unitCount: sql<string>`coalesce(sum(${orders.quantity}), 0)::text`,
      paidOrderCount: sql<string>`count(*) filter (where ${orders.paymentStatus} = 'Оплачен')::text`,
      revenue: sql<string>`coalesce(sum(${orders.salePriceRub} * ${orders.quantity}) filter (where ${orders.paymentStatus} = 'Оплачен'), 0)::text`,
      cost: sql<string>`coalesce(sum(${orders.costRub} * ${orders.quantity}) filter (where ${orders.paymentStatus} = 'Оплачен'), 0)::text`,
    }).from(orders).where(eq(orders.userId, userId)),
    db.select({ total: sql<string>`coalesce(sum(${financialTransactions.amountRub}), 0)::text` })
      .from(financialTransactions).where(eq(financialTransactions.userId, userId)),
    db.select({ total: count() }).from(products).where(and(eq(products.userId, userId), eq(products.status, 'review'))),
    db.select({ total: count() }).from(products).where(and(eq(products.userId, userId), eq(products.listingStatus, 'published'))),
    db.select({ createdAt: orders.createdAt, salePriceRub: orders.salePriceRub, costRub: orders.costRub, quantity: orders.quantity })
      .from(orders)
      .where(and(eq(orders.userId, userId), eq(orders.paymentStatus, 'Оплачен'), gte(orders.createdAt, since)))
      .orderBy(orders.createdAt),
    db.select({ occurredAt: financialTransactions.occurredAt, amountRub: financialTransactions.amountRub })
      .from(financialTransactions)
      .where(and(eq(financialTransactions.userId, userId), gte(financialTransactions.occurredAt, since)))
      .orderBy(financialTransactions.occurredAt),
  ])

  const supplierNames = new Map(supplierRows.map((supplier) => [supplier.id, supplier.name]))
  const supplierProductCounts = new Map<string, number>()
  const historyByOrder = new Map<string, typeof historyRows>()
  for (const item of historyRows) {
    const items = historyByOrder.get(item.orderId) ?? []
    items.push(item)
    historyByOrder.set(item.orderId, items)
  }

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

  const trendByMonth = new Map<string, { revenue: number; grossProfit: number; expenses: number }>()
  for (const order of trendRows) {
    const key = monthKey(order.createdAt)
    const current = trendByMonth.get(key) ?? { revenue: 0, grossProfit: 0, expenses: 0 }
    const quantity = Number(order.quantity) || 1
    const revenue = amount(order.salePriceRub) * quantity
    current.revenue += revenue
    current.grossProfit += revenue - amount(order.costRub) * quantity
    trendByMonth.set(key, current)
  }
  for (const expense of expenseTrendRows) {
    const key = monthKey(expense.occurredAt)
    const current = trendByMonth.get(key) ?? { revenue: 0, grossProfit: 0, expenses: 0 }
    current.expenses += amount(expense.amountRub)
    trendByMonth.set(key, current)
  }

  const monthFormatter = new Intl.DateTimeFormat('ru-RU', { month: 'short', timeZone: 'UTC' })
  const revenueTrend = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 5 + index, 1))
    const values = trendByMonth.get(monthKey(date)) ?? { revenue: 0, grossProfit: 0, expenses: 0 }
    return { month: monthFormatter.format(date), ...values, profit: values.grossProfit - values.expenses }
  })

  const totals = orderTotals[0]
  const revenue = amount(totals?.revenue)
  const cost = amount(totals?.cost)
  const grossProfit = revenue - cost
  const additionalExpenses = amount(transactionTotals[0]?.total)

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
      color: order.color,
      quantity: order.quantity,
      createdAt: new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', timeZone: 'Europe/Moscow' }).format(order.createdAt),
      status: safeOrderStatus(order.status),
      paymentStatus: order.paymentStatus,
      procurementStatus: order.procurementStatus,
      deliveryStatus: order.deliveryStatus,
      salePrice: amount(order.salePriceRub),
      cost: amount(order.costRub),
      supplier: order.supplierName || '—',
      supplierProductUrl: order.supplierProductUrl,
      threadUrl: order.threadUrl,
      expectedArrivalAt: order.expectedArrivalAt?.toISOString() ?? null,
      notes: order.notes,
      tracking: order.tracking ?? undefined,
      history: (historyByOrder.get(order.id) ?? []).map((item) => ({
        id: item.id,
        field: item.field,
        previousValue: item.previousValue,
        newValue: item.newValue,
        note: item.note,
        createdAt: item.createdAt.toISOString(),
      })),
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
    transactions: transactionRows.map((transaction) => ({
      id: transaction.id,
      category: transaction.category,
      amountRub: amount(transaction.amountRub),
      notes: transaction.notes,
      occurredAt: new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Moscow' }).format(transaction.occurredAt),
    })),
    revenueTrend,
    summary: {
      orderCount: Number(totals?.total ?? 0),
      paidOrderCount: Number(totals?.paidOrderCount ?? 0),
      activeOrderCount: Number(totals?.active ?? 0),
      unitCount: Number(totals?.unitCount ?? 0),
      revenue,
      cost,
      grossProfit,
      additionalExpenses,
      netProfit: grossProfit - additionalExpenses,
      reviewCount: Number(reviewTotals[0]?.total ?? 0),
      publishedCount: Number(publishedTotals[0]?.total ?? 0),
    },
  }
}
