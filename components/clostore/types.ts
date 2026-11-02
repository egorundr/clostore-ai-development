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
  | 'avito'
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
