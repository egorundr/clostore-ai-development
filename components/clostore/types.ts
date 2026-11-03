import type { LucideIcon } from 'lucide-react'

export type SectionId =
  | 'dashboard'
  | 'agent'
  | 'search'
  | 'review'
  | 'catalog'
  | 'editor'
  | 'suppliers'
  | 'orders'
  | 'telegram'
  | 'pricing'
  | 'analytics'
  | 'ai-usage'
  | 'settings'

export type NavigationItem = {
  id: SectionId
  label: string
  icon: LucideIcon
  count?: number
}

export type OrderStatus =
  | 'Ожидает оплаты'
  | 'Ожидает закупки'
  | 'Заказан у поставщика'
  | 'В пути'
  | 'Прибыл'
  | 'Завершён'
  | 'Отменён'
  | 'Проблема / возврат'

export type DemoOrder = {
  id: string
  customer: string
  product: string
  size: string
  createdAt: string
  status: OrderStatus
  salePrice: number
  cost: number
  supplier: string
  tracking?: string
}

export type DemoProduct = {
  id: string
  name: string
  category: string
  source: string
  supplier: string
  purchaseCny: number
  sizes: string[]
  status: 'На рассмотрении' | 'В каталоге' | 'Черновик'
  listingStatus: 'Не опубликован' | 'Опубликован' | 'Черновик'
}

export type NavigationGroup = {
  label: string
  items: NavigationItem[]
}

export type WorkspaceOrder = {
  id: string
  recordId: string
  customer: string
  contact: string
  product: string
  size: string
  color: string
  quantity: number
  createdAt: string
  status: OrderStatus
  paymentStatus: string
  procurementStatus: string
  deliveryStatus: string
  salePrice: number
  cost: number
  supplier: string
  supplierProductUrl: string | null
  threadUrl: string | null
  expectedArrivalAt: string | null
  notes: string
  tracking?: string
  history: OrderStatusChange[]
}

export type OrderStatusChange = {
  id: string
  field: string
  previousValue: string
  newValue: string
  note: string
  createdAt: string
}

export type FinancialTransaction = {
  id: string
  category: string
  amountRub: number
  notes: string
  occurredAt: string
}

export type WorkspaceProduct = {
  id: string
  name: string
  category: string
  source: string
  sourceUrl: string | null
  supplier: string
  supplierId: string | null
  purchaseCny: number
  purchaseRub: number
  salePriceRub: number
  sizes: string[]
  images: string[]
  description: string
  status: string
  listingStatus: string
}

export type WorkspacePublication = {
  id: string
  productId: string | null
  channel: string
  title: string
  body: string
  imageUrls: string[]
  status: string
  externalMessageId: string | null
  publishedAt: string | null
  error: string
  createdAt: string
}

export type WorkspaceSupplier = {
  id: string
  name: string
  platform: string
  storeUrl: string | null
  status: string
  notes: string
  productCount: number
}

export type IntegrationStatus = {
  name: string
  detail: string
  state: string
  configured: boolean
  requiredVariables: string[]
  testProvider: 'telegram' | null
}

export type AgentPendingApproval = {
  approvalId: string
  toolName: 'createProductDraft' | 'updateOrderStatus' | 'recordExpense'
  input: Record<string, unknown>
  reason?: string
}

export type AgentUsageSummary = {
  taskCount: number
  inputTokens: number
  outputTokens: number
}

export type AgentTaskPreview = {
  id: string
  prompt: string
  response: string
  pendingApprovals: AgentPendingApproval[]
  status: 'running' | 'awaiting_approval' | 'completed' | 'failed' | 'cancelled'
  model: string
  inputTokens: number | null
  outputTokens: number | null
  createdAt: string
}

export type SavedProductSearch = {
  id: string
  query: string
  category: string
  style: string
  minPriceCny: number | null
  maxPriceCny: number | null
  sizes: string[]
  colorMaterial: string
  sources: string[]
  customSourceUrl: string
  createdAt: string
}

export type WorkspaceData = {
  savedSearches: SavedProductSearch[]
  orders: WorkspaceOrder[]
  products: WorkspaceProduct[]
  publications: WorkspacePublication[]
  suppliers: WorkspaceSupplier[]
  transactions: FinancialTransaction[]
  revenueTrend: { month: string; revenue: number; grossProfit: number; expenses: number; profit: number }[]
  summary: {
    orderCount: number
    paidOrderCount: number
    activeOrderCount: number
    unitCount: number
    revenue: number
    cost: number
    grossProfit: number
    additionalExpenses: number
    netProfit: number
    reviewCount: number
    publishedCount: number
  }
}
