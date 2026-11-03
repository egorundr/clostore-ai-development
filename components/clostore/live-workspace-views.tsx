'use client'

import { useMemo, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check, Download, ExternalLink, Package, Plus, Search, Wallet } from 'lucide-react'
import { createFinancialTransaction, createOrder, createProduct, createSupplier, deleteOrder, deleteProduct, exportOrdersXlsx, exportProductsXlsx, updateOrder, updateProduct, updateProductDescription, updateProductReview, updateSupplier } from '@/app/actions/workspace'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { formatRub } from '@/lib/pricing'
import type { OrderStatus, SectionId, WorkspaceData, WorkspaceOrder, WorkspaceProduct, WorkspaceSupplier } from './types'

const orderStatuses: OrderStatus[] = ['Ожидает оплаты', 'Ожидает закупки', 'Заказан у поставщика', 'В пути', 'Прибыл', 'Завершён', 'Отменён', 'Проблема / возврат']
const paymentStatuses = ['Ожидает оплаты', 'Частично оплачен', 'Оплачен', 'Возврат']
const procurementStatuses = ['Не заказан', 'Заказан у поставщика', 'Оплачен поставщику', 'Получен в Китае', 'Проблема']
const deliveryStatuses = ['Не отправлен', 'В пути по Китаю', 'Международная доставка', 'Прибыл', 'Передан покупателю', 'Проблема']
const expenseCategories = ['Упаковка', 'Доставка', 'Комиссии', 'Реклама', 'Подписки и сервисы', 'Прочее']

const statusTone = (status: string) => {
  if (status.includes('Ожидает')) return 'border-amber-400/20 bg-amber-400/[0.07] text-amber-100'
  if (status === 'В пути' || status === 'Заказан у поставщика') return 'border-sky-400/20 bg-sky-400/[0.07] text-sky-100'
  if (status === 'Прибыл' || status === 'Завершён' || status === 'Опубликован' || status === 'В каталоге' || status === 'Оплачен') return 'border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-100'
  if (status === 'Отменён' || status === 'Проблема' || status === 'Проблема / возврат') return 'border-rose-400/20 bg-rose-400/[0.07] text-rose-100'
  return 'border-white/10 text-muted-foreground'
}

function dateForInput(value: string | null) {
  return value ? new Date(value).toISOString().slice(0, 10) : ''
}

function SectionHeading({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="mb-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">CloStore AI / рабочая область</p>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  )
}

function DataTableEmpty({ text, colSpan = 8 }: { text: string; colSpan?: number }) {
  return <TableRow><TableCell colSpan={colSpan} className="h-28 text-center text-sm text-muted-foreground">{text}</TableCell></TableRow>
}

function ExportXlsxButton({ action, filename }: { action: () => Promise<string>; filename: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function download() {
    setError('')
    startTransition(async () => {
      try {
        const base64 = await action()
        const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
        const file = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        const url = URL.createObjectURL(file)
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        link.click()
        link.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      } catch {
        setError('Не удалось подготовить файл Excel. Повторите попытку.')
      }
    })
  }

  return <div className="flex flex-col items-end gap-1"><Button type="button" variant="outline" size="sm" disabled={pending} onClick={download}><Download data-icon="inline-start" />{pending ? 'Готовлю…' : 'Экспорт XLSX'}</Button>{error && <p role="alert" className="text-xs text-destructive">{error}</p>}</div>
}

function ProductDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const payload = new FormData(form)
    setError('')
    startTransition(async () => {
      try {
        await createProduct(payload)
        form.reset()
        onOpenChange(false)
        router.refresh()
      } catch {
        setError('Не удалось сохранить товар. Проверьте поля и попробуйте ещё раз.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-white/10 bg-[#1b1d20] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Новый товар</DialogTitle>
          <DialogDescription>Товар будет сохранён в вашем каталоге и попадёт в очередь проверки.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2"><FieldLabel htmlFor="product-name">Название</FieldLabel><Input id="product-name" name="name" maxLength={180} required /></Field>
            <Field><FieldLabel htmlFor="product-category">Категория</FieldLabel><Input id="product-category" name="category" maxLength={120} /></Field>
            <Field><FieldLabel htmlFor="product-source">Источник / площадка</FieldLabel><Input id="product-source" name="source" maxLength={120} placeholder="Например, 1688" /></Field>
            <Field><FieldLabel htmlFor="product-supplier">Поставщик</FieldLabel><Input id="product-supplier" name="supplierName" maxLength={180} /></Field>
            <Field><FieldLabel htmlFor="product-sizes">Размеры через запятую</FieldLabel><Input id="product-sizes" name="sizes" maxLength={240} placeholder="S, M, L" /></Field>
            <Field><FieldLabel htmlFor="product-cny">Закупка, CNY</FieldLabel><Input id="product-cny" name="purchasePriceCny" type="number" min="0" max="100000000" step="0.01" inputMode="decimal" /></Field>
            <Field><FieldLabel htmlFor="product-cost">Себестоимость, ₽</FieldLabel><Input id="product-cost" name="purchasePriceRub" type="number" min="0" max="100000000" step="0.01" inputMode="decimal" /></Field>
            <Field><FieldLabel htmlFor="product-price">Цена продажи, ₽</FieldLabel><Input id="product-price" name="salePriceRub" type="number" min="0" max="100000000" step="0.01" inputMode="decimal" /></Field>
            <Field className="sm:col-span-2"><FieldLabel htmlFor="product-url">Ссылка на товар</FieldLabel><Input id="product-url" name="sourceUrl" type="url" maxLength={2048} /></Field>
            <Field className="sm:col-span-2"><FieldLabel htmlFor="product-description">Описание</FieldLabel><Textarea id="product-description" name="description" maxLength={8000} rows={4} /></Field>
          </FieldGroup>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button><Button type="submit" disabled={pending}>{pending ? 'Сохраняю…' : 'Сохранить товар'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function OrderDialog({ open, onOpenChange, products }: { open: boolean; onOpenChange: (open: boolean) => void; products: WorkspaceProduct[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [productId, setProductId] = useState('')
  const sellableProducts = products.filter((product) => product.status === 'В каталоге' && product.salePriceRub > 0)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const payload = new FormData(form)
    setError('')
    startTransition(async () => {
      try {
        const result = await createOrder(payload)
        if (!result.ok) {
          setError('Выбранный товар больше недоступен. Обновите список и попробуйте снова.')
          return
        }
        form.reset()
        setProductId('')
        onOpenChange(false)
        router.refresh()
      } catch {
        setError('Не удалось сохранить заказ. Проверьте поля и попробуйте ещё раз.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) { setProductId(''); setError('') } onOpenChange(nextOpen) }}>
      <DialogContent className="border-white/10 bg-[#1b1d20] sm:max-w-lg">
        <DialogHeader><DialogTitle>Новый заказ</DialogTitle><DialogDescription>Добавьте заказ покупателя; запись сохранится в вашей базе.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field><FieldLabel htmlFor="order-customer">Покупатель</FieldLabel><Input id="order-customer" name="customer" maxLength={160} required /></Field>
            <Field><FieldLabel htmlFor="order-contact">Контакт</FieldLabel><Input id="order-contact" name="contact" maxLength={240} required /></Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="order-product-id">Товар из каталога</FieldLabel>
              <select id="order-product-id" name="productId" value={productId} onChange={(event) => setProductId(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Ввести заказ вручную</option>
                {sellableProducts.map((product) => <option key={product.id} value={product.id}>{product.name} · {formatRub(product.salePriceRub)}</option>)}
              </select>
            </Field>
            {!productId && <Field className="sm:col-span-2"><FieldLabel htmlFor="order-product">Название товара</FieldLabel><Input id="order-product" name="product" maxLength={180} required /></Field>}
            <Field><FieldLabel htmlFor="order-size">Размер</FieldLabel><Input id="order-size" name="size" maxLength={40} /></Field>
            <Field><FieldLabel htmlFor="order-color">Цвет</FieldLabel><Input id="order-color" name="color" maxLength={80} /></Field>
            <Field><FieldLabel htmlFor="order-quantity">Количество</FieldLabel><Input id="order-quantity" name="quantity" type="number" min="1" max="1000" step="1" defaultValue="1" required /></Field>
            {!productId && <Field><FieldLabel htmlFor="order-price">Цена продажи за единицу, ₽</FieldLabel><Input id="order-price" name="salePrice" type="number" min="0.01" max="100000000" step="0.01" inputMode="decimal" required /></Field>}
            {!productId && <Field><FieldLabel htmlFor="order-cost">Себестоимость за единицу, ₽</FieldLabel><Input id="order-cost" name="cost" type="number" min="0" max="100000000" step="0.01" inputMode="decimal" /></Field>}
            <Field><FieldLabel htmlFor="order-supplier">Поставщик</FieldLabel><Input id="order-supplier" name="supplier" maxLength={180} /></Field>
            <Field><FieldLabel htmlFor="order-arrival">Ожидаемое поступление</FieldLabel><Input id="order-arrival" name="expectedArrivalAt" type="date" /></Field>
            <Field className="sm:col-span-2"><FieldLabel htmlFor="order-supplier-url">Ссылка на товар у поставщика</FieldLabel><Input id="order-supplier-url" name="supplierProductUrl" type="url" maxLength={2048} /></Field>
            <Field className="sm:col-span-2"><FieldLabel htmlFor="order-thread-url">Ссылка на переписку с покупателем</FieldLabel><Input id="order-thread-url" name="threadUrl" type="url" maxLength={2048} /></Field>
            <Field className="sm:col-span-2"><FieldLabel htmlFor="order-notes">Заметки по заказу</FieldLabel><Textarea id="order-notes" name="notes" maxLength={4000} rows={3} /></Field>
            {productId && <p className="text-xs text-muted-foreground sm:col-span-2">Цена, себестоимость и поставщик будут взяты из карточки товара. Ссылки и дополнительные сведения можно указать ниже.</p>}
          </FieldGroup>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => { setProductId(''); onOpenChange(false) }}>Отмена</Button><Button type="submit" disabled={pending}>{pending ? 'Сохраняю…' : 'Создать заказ'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ProductEditDialog({ product, onOpenChange }: { product: WorkspaceProduct | null; onOpenChange: (product: WorkspaceProduct | null) => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!product) return

    const payload = new FormData(event.currentTarget)
    setError('')
    startTransition(async () => {
      try {
        const result = await updateProduct(product.id, payload)
        if (!result.ok) {
          setError('Товар не найден в личном каталоге.')
          return
        }
        onOpenChange(null)
        router.refresh()
      } catch {
        setError('Не удалось обновить товар. Проверьте поля и попробуйте ещё раз.')
      }
    })
  }

  if (!product) return null

  return (
    <Dialog open={Boolean(product)} onOpenChange={(open) => { if (!open) onOpenChange(null) }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-white/10 bg-[#1b1d20] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Редактировать товар</DialogTitle>
          <DialogDescription>Изменения сохраняются в личном каталоге.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2"><FieldLabel htmlFor="edit-product-name">Название</FieldLabel><Input id="edit-product-name" name="name" maxLength={180} defaultValue={product.name} required /></Field>
            <Field><FieldLabel htmlFor="edit-product-category">Категория</FieldLabel><Input id="edit-product-category" name="category" maxLength={120} defaultValue={product.category} /></Field>
            <Field><FieldLabel htmlFor="edit-product-source">Источник / площадка</FieldLabel><Input id="edit-product-source" name="source" maxLength={120} defaultValue={product.source} /></Field>
            <Field><FieldLabel htmlFor="edit-product-supplier">Поставщик</FieldLabel><Input id="edit-product-supplier" name="supplierName" maxLength={180} defaultValue={product.supplier === '—' ? '' : product.supplier} /></Field>
            <Field><FieldLabel htmlFor="edit-product-sizes">Размеры через запятую</FieldLabel><Input id="edit-product-sizes" name="sizes" maxLength={240} defaultValue={product.sizes.join(', ')} /></Field>
            <Field><FieldLabel htmlFor="edit-product-cny">Закупка, CNY</FieldLabel><Input id="edit-product-cny" name="purchasePriceCny" type="number" min="0" max="100000000" step="0.01" defaultValue={product.purchaseCny} /></Field>
            <Field><FieldLabel htmlFor="edit-product-cost">Себестоимость, ₽</FieldLabel><Input id="edit-product-cost" name="purchasePriceRub" type="number" min="0" max="100000000" step="0.01" defaultValue={product.purchaseRub} /></Field>
            <Field><FieldLabel htmlFor="edit-product-price">Цена продажи, ₽</FieldLabel><Input id="edit-product-price" name="salePriceRub" type="number" min="0" max="100000000" step="0.01" defaultValue={product.salePriceRub} /></Field>
            <Field className="sm:col-span-2"><FieldLabel htmlFor="edit-product-url">Ссылка на товар</FieldLabel><Input id="edit-product-url" name="sourceUrl" type="url" maxLength={2048} defaultValue={product.sourceUrl ?? ''} /></Field>
            <Field className="sm:col-span-2"><FieldLabel htmlFor="edit-product-description">Описание</FieldLabel><Textarea id="edit-product-description" name="description" maxLength={8000} rows={4} defaultValue={product.description} /></Field>
          </FieldGroup>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between"><Button type="button" variant="outline" disabled={pending} onClick={() => { if (window.confirm(`Удалить товар «${product.name}»? Связанные заказы сохранят название товара.`)) startTransition(async () => { try { const result = await deleteProduct(product.id); if (!result.ok) throw new Error('Product not found'); onOpenChange(null); router.refresh() } catch { setError('Не удалось удалить товар.') } }) }}>Удалить товар</Button><div className="flex gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(null)}>Отмена</Button><Button type="submit" disabled={pending}>{pending ? 'Сохраняю…' : 'Сохранить изменения'}</Button></div></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function LiveCatalogView({ data }: { data: WorkspaceData }) {
  const [open, setOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<WorkspaceProduct | null>(null)
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => data.products.filter((product) => `${product.name} ${product.category} ${product.supplier}`.toLowerCase().includes(search.toLowerCase())), [data.products, search])

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading title="Каталог" description="Товары и цены, сохранённые в вашей базе." action={<Button onClick={() => setOpen(true)}><Plus data-icon="inline-start" /> Добавить товар</Button>} />
      <Card className="border-white/[0.07] bg-card/80 shadow-none">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>Товары <span className="ml-2 text-sm font-normal text-muted-foreground">{data.products.length}</span></CardTitle><div className="flex flex-col gap-2 sm:flex-row"><div className="relative w-full sm:max-w-xs"><Search aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Поиск по каталогу" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Название, категория, поставщик" className="pl-9" /></div><ExportXlsxButton action={exportProductsXlsx} filename="clostore-catalog.xlsx" /></div></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table><TableHeader><TableRow><TableHead>Товар</TableHead><TableHead>Поставщик</TableHead><TableHead>Закупка</TableHead><TableHead>Цена продажи</TableHead><TableHead>Размеры</TableHead><TableHead>Проверка</TableHead><TableHead>Публикация</TableHead></TableRow></TableHeader>
            <TableBody>{filtered.length ? filtered.map((product) => <TableRow key={product.id}><TableCell><div className="flex items-start justify-between gap-3"><div><span className="font-medium">{product.name}</span><span className="mt-1 block text-xs text-muted-foreground">{product.category || 'Без категории'}</span></div><Button type="button" size="sm" variant="ghost" className="shrink-0" aria-label={`Редактировать ${product.name}`} onClick={() => setEditingProduct(product)}>Изменить</Button></div></TableCell><TableCell>{product.supplier}</TableCell><TableCell>{product.purchaseCny ? `${product.purchaseCny.toLocaleString('ru-RU')} CNY` : '—'}</TableCell><TableCell>{product.salePriceRub ? formatRub(product.salePriceRub) : '—'}</TableCell><TableCell>{product.sizes.length ? product.sizes.join(', ') : '—'}</TableCell><TableCell><Badge variant="outline" className={statusTone(product.status)}>{product.status}</Badge></TableCell><TableCell><Badge variant="outline" className={statusTone(product.listingStatus)}>{product.listingStatus}</Badge></TableCell></TableRow>) : <DataTableEmpty colSpan={7} text={search ? 'Ничего не найдено.' : 'Каталог пока пуст. Добавьте первый товар.'} />}</TableBody>
          </Table>
        </CardContent>
      </Card>
      <ProductDialog open={open} onOpenChange={setOpen} />
      <ProductEditDialog product={editingProduct} onOpenChange={setEditingProduct} />
    </div>
  )
}

function OrderUpdateDialog({ order, onOpenChange }: { order: WorkspaceOrder | null; onOpenChange: (order: WorkspaceOrder | null) => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!order) return

    const payload = new FormData(event.currentTarget)
    setError('')
    startTransition(async () => {
      try {
        const result = await updateOrder(order.recordId, payload)
        if (!result.ok) throw new Error('Order not found')
        onOpenChange(null)
        router.refresh()
      } catch {
        setError('Не удалось обновить заказ. Проверьте поля и попробуйте ещё раз.')
      }
    })
  }

  if (!order) return null

  return (
    <Dialog open={Boolean(order)} onOpenChange={(open) => { if (!open) onOpenChange(null) }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-white/10 bg-[#1b1d20] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Обновить заказ {order.id}</DialogTitle>
          <DialogDescription>Сохраните фактический статус, себестоимость и трек-номер.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field><FieldLabel htmlFor="order-update-customer">Покупатель</FieldLabel><Input id="order-update-customer" name="customer" maxLength={160} defaultValue={order.customer} required /></Field>
            <Field><FieldLabel htmlFor="order-update-contact">Контакт</FieldLabel><Input id="order-update-contact" name="contact" maxLength={240} defaultValue={order.contact} required /></Field>
            <Field className="sm:col-span-2"><FieldLabel htmlFor="order-update-product">Товар</FieldLabel><Input id="order-update-product" name="product" maxLength={180} defaultValue={order.product} required /></Field>
            <Field><FieldLabel htmlFor="order-update-size">Размер</FieldLabel><Input id="order-update-size" name="size" maxLength={40} defaultValue={order.size} /></Field>
            <Field><FieldLabel htmlFor="order-update-color">Цвет</FieldLabel><Input id="order-update-color" name="color" maxLength={80} defaultValue={order.color} /></Field>
            <Field><FieldLabel htmlFor="order-update-quantity">Количество</FieldLabel><Input id="order-update-quantity" name="quantity" type="number" min="1" max="1000" step="1" defaultValue={order.quantity} required /></Field>
            <Field><FieldLabel htmlFor="order-update-status">Статус заказа</FieldLabel><select id="order-update-status" name="status" defaultValue={order.status} className="h-9 rounded-md border border-input bg-background px-3 text-sm">{orderStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></Field>
            <Field><FieldLabel htmlFor="order-payment-status">Оплата</FieldLabel><select id="order-payment-status" name="paymentStatus" defaultValue={order.paymentStatus} className="h-9 rounded-md border border-input bg-background px-3 text-sm">{paymentStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></Field>
            <Field><FieldLabel htmlFor="order-procurement-status">Выкуп у поставщика</FieldLabel><select id="order-procurement-status" name="procurementStatus" defaultValue={order.procurementStatus} className="h-9 rounded-md border border-input bg-background px-3 text-sm">{procurementStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></Field>
            <Field><FieldLabel htmlFor="order-delivery-status">Доставка</FieldLabel><select id="order-delivery-status" name="deliveryStatus" defaultValue={order.deliveryStatus} className="h-9 rounded-md border border-input bg-background px-3 text-sm">{deliveryStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></Field>
            <Field><FieldLabel htmlFor="order-update-sale">Цена продажи за единицу, ₽</FieldLabel><Input id="order-update-sale" name="salePrice" type="number" min="0.01" max="100000000" step="0.01" defaultValue={order.salePrice} required /></Field>
            <Field><FieldLabel htmlFor="order-update-cost">Себестоимость за единицу, ₽</FieldLabel><Input id="order-update-cost" name="costRub" type="number" min="0" max="100000000" step="0.01" defaultValue={order.cost} required /></Field>
            <Field><FieldLabel htmlFor="order-update-supplier">Поставщик</FieldLabel><Input id="order-update-supplier" name="supplier" maxLength={180} defaultValue={order.supplier === '—' ? '' : order.supplier} /></Field>
            <Field><FieldLabel htmlFor="order-update-arrival">Ожидаемое поступление</FieldLabel><Input id="order-update-arrival" name="expectedArrivalAt" type="date" defaultValue={dateForInput(order.expectedArrivalAt)} /></Field>
            <Field><FieldLabel htmlFor="order-update-tracking">Трек-номер</FieldLabel><Input id="order-update-tracking" name="tracking" maxLength={120} defaultValue={order.tracking ?? ''} /></Field>
            <Field><FieldLabel htmlFor="order-update-supplier-url">Ссылка на товар у поставщика</FieldLabel><Input id="order-update-supplier-url" name="supplierProductUrl" type="url" maxLength={2048} defaultValue={order.supplierProductUrl ?? ''} /></Field>
            <Field className="sm:col-span-2"><FieldLabel htmlFor="order-update-thread-url">Переписка с покупателем</FieldLabel><Input id="order-update-thread-url" name="threadUrl" type="url" maxLength={2048} defaultValue={order.threadUrl ?? ''} /></Field>
            <Field className="sm:col-span-2"><FieldLabel htmlFor="order-update-notes">Заметки</FieldLabel><Textarea id="order-update-notes" name="notes" maxLength={4000} rows={3} defaultValue={order.notes} /></Field>
            <Field className="sm:col-span-2"><FieldLabel htmlFor="order-history-note">Комментарий к изменению статуса</FieldLabel><Input id="order-history-note" name="historyNote" maxLength={800} placeholder="Например, поставщик подтвердил отправку" /></Field>
          </FieldGroup>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between">
            <Button type="button" variant="outline" disabled={pending} onClick={() => { if (window.confirm(`Удалить заказ ${order.id}?`)) startTransition(async () => { try { const result = await deleteOrder(order.recordId); if (!result.ok) throw new Error('Order not found'); onOpenChange(null); router.refresh() } catch { setError('Не удалось удалить заказ.') } }) }}>Удалить заказ</Button>
            <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(null)}>Отмена</Button><Button type="submit" disabled={pending}>{pending ? 'Сохраняю…' : 'Сохранить изменения'}</Button></div>
          </DialogFooter>
        </form>
        <Separator />
        <section aria-labelledby="order-status-history-title" className="pt-1">
          <h3 id="order-status-history-title" className="text-sm font-medium">История изменений</h3>
          {order.history.length ? <ol className="mt-3 max-h-40 space-y-3 overflow-y-auto">{order.history.map((item) => <li key={item.id} className="border-l border-white/10 pl-3 text-xs"><p className="font-medium">{item.field}: {item.previousValue || '—'} → {item.newValue}</p><p className="mt-1 text-muted-foreground">{new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.createdAt))}{item.note ? ` · ${item.note}` : ''}</p></li>)}</ol> : <p className="mt-2 text-xs text-muted-foreground">Изменений пока нет.</p>}
        </section>
      </DialogContent>
    </Dialog>
  )
}

export function LiveOrdersView({ data }: { data: WorkspaceData }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [editingOrder, setEditingOrder] = useState<WorkspaceOrder | null>(null)
  const filtered = useMemo(() => data.orders.filter((order) => {
    const matchesSearch = `${order.id} ${order.customer} ${order.contact} ${order.product} ${order.supplier}`.toLowerCase().includes(search.toLowerCase())
    return matchesSearch && (statusFilter === 'all' || order.status === statusFilter)
  }), [data.orders, search, statusFilter])

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading title="Заказы" description="Управляйте заказами, этапами выкупа и доставки, оплатой и историей изменений." action={<Button onClick={() => setOpen(true)}><Plus data-icon="inline-start" /> Новый заказ</Button>} />
      <Card className="border-white/[0.07] bg-card/80 shadow-none">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>Все заказы <span className="ml-2 text-sm font-normal text-muted-foreground">{data.summary.orderCount} · {data.summary.unitCount} шт.</span></CardTitle><div className="flex flex-col gap-2 sm:flex-row"><Input aria-label="Поиск заказов" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Покупатель, товар, ID" className="sm:w-56" /><select aria-label="Фильтр по статусу" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="all">Все статусы</option>{orderStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select><ExportXlsxButton action={exportOrdersXlsx} filename="clostore-orders.xlsx" /></div></CardHeader>
        <CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>ID / дата</TableHead><TableHead>Покупатель</TableHead><TableHead>Товар / параметры</TableHead><TableHead>Статус</TableHead><TableHead>Оплата</TableHead><TableHead>Выкуп</TableHead><TableHead>Доставка</TableHead><TableHead>Продажа · всего</TableHead><TableHead>Себестоимость · всего</TableHead><TableHead>Валовая прибыль</TableHead><TableHead>Действия</TableHead></TableRow></TableHeader>
          <TableBody>{filtered.length ? filtered.map((order) => { const orderRevenue = order.salePrice * order.quantity; const orderCost = order.cost * order.quantity; return <TableRow key={order.id}><TableCell><span className="font-mono text-xs">{order.id}</span><span className="mt-1 block text-xs text-muted-foreground">{order.createdAt}</span></TableCell><TableCell><span className="font-medium">{order.customer}</span><span className="mt-1 block text-xs text-muted-foreground">{order.contact}</span></TableCell><TableCell><span className="font-medium">{order.product}</span><span className="mt-1 block text-xs text-muted-foreground">{[order.size && `Размер ${order.size}`, order.color && `Цвет ${order.color}`, `${order.quantity} шт.`].filter(Boolean).join(' · ')}</span></TableCell><TableCell><Badge variant="outline" className={statusTone(order.status)}>{order.status}</Badge></TableCell><TableCell><Badge variant="outline" className={statusTone(order.paymentStatus)}>{order.paymentStatus}</Badge></TableCell><TableCell>{order.procurementStatus}</TableCell><TableCell>{order.deliveryStatus}</TableCell><TableCell className="whitespace-nowrap">{formatRub(orderRevenue)}<span className="mt-1 block text-xs text-muted-foreground">{formatRub(order.salePrice)} / шт.</span></TableCell><TableCell className="whitespace-nowrap">{formatRub(orderCost)}</TableCell><TableCell className="whitespace-nowrap">{formatRub(orderRevenue - orderCost)}</TableCell><TableCell><div className="flex flex-col items-start gap-2"><div className="flex gap-2">{order.tracking && <span className="text-xs text-muted-foreground">{order.tracking}</span>}{order.threadUrl && <a href={order.threadUrl} target="_blank" rel="noreferrer" className="text-xs underline underline-offset-4">Переписка</a>}</div><Button type="button" variant="outline" size="sm" onClick={() => setEditingOrder(order)}>Изменить</Button></div></TableCell></TableRow> }) : <DataTableEmpty colSpan={11} text={search || statusFilter !== 'all' ? 'Заказы не найдены.' : 'Заказов пока нет. Создайте первую запись.'} />}</TableBody>
        </Table></CardContent>
      </Card>
      <OrderDialog open={open} onOpenChange={setOpen} products={data.products} />
      <OrderUpdateDialog order={editingOrder} onOpenChange={setEditingOrder} />
    </div>
  )
}

export function LiveReviewView({ data }: { data: WorkspaceData }) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const pendingProducts = data.products.filter((product) => product.status === 'На рассмотрении')

  async function decide(productId: string, decision: 'approved' | 'rejected') {
    setPendingId(productId)
    setNotice('')
    try {
      const result = await updateProductReview(productId, decision)
      setNotice(result.ok ? decision === 'approved' ? 'Товар одобрен и перемещён в каталог.' : 'Товар отклонён.' : 'Карточка уже была обработана.')
      router.refresh()
    } catch {
      setNotice('Не удалось обновить статус карточки.')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading title="Очередь проверки" description="Проверяйте сохранённые товары перед добавлением в каталог." />
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
      {pendingProducts.length ? <div className="grid gap-4 xl:grid-cols-2">{pendingProducts.map((product) => <ReviewCard key={product.id} product={product} pending={pendingId === product.id} onDecide={decide} />)}</div> : <Card className="border-white/[0.07] bg-card/80 shadow-none"><CardContent className="flex min-h-56 flex-col items-center justify-center text-center"><Check className="text-emerald-300" /><h2 className="mt-3 text-base font-medium">Очередь пуста</h2><p className="mt-1 text-sm text-muted-foreground">Новые товары появятся здесь после сохранения.</p></CardContent></Card>}
    </div>
  )
}

export function LiveEditorView({ data }: { data: WorkspaceData }) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState(data.products[0]?.id ?? '')
  const [pending, startTransition] = useTransition()
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const product = data.products.find((item) => item.id === selectedId) ?? data.products[0]

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!product) return
    const form = new FormData(event.currentTarget)
    const description = form.get('description')
    if (typeof description !== 'string') return

    setError('')
    setNotice('')
    startTransition(async () => {
      try {
        const result = await updateProductDescription(product.id, description)
        if (!result.ok) {
          setError('Карточка товара не найдена.')
          return
        }
        setNotice('Описание сохранено в карточке товара.')
        router.refresh()
      } catch {
        setError('Не удалось сохранить описание. Попробуйте ещё раз.')
      }
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading title="Редактор карточек" description="Редактируйте и сохраняйте описание товара в своей базе." />
      {product ? <Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Карточка товара</CardTitle><p className="text-xs text-muted-foreground">Сохранение записывает изменения в Neon; публикация не выполняется.</p></CardHeader><CardContent><form onSubmit={submit} className="flex flex-col gap-4"><FieldGroup><Field><FieldLabel htmlFor="editor-product">Товар</FieldLabel><select id="editor-product" value={product.id} onChange={(event) => { setSelectedId(event.target.value); setNotice(''); setError('') }} className="h-9 rounded-md border border-input bg-background px-3 text-sm">{data.products.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.status}</option>)}</select></Field><Field><FieldLabel htmlFor="editor-description">Описание</FieldLabel><Textarea id="editor-description" name="description" maxLength={8000} rows={9} key={product.id} defaultValue={product.description} placeholder="Опишите материал, крой, размеры и особенности товара" /><p className="text-xs text-muted-foreground">До 8 000 символов. Проверяйте характеристики вручную.</p></Field></FieldGroup>{notice && <p role="status" className="text-sm text-emerald-200">{notice}</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end"><Button type="submit" disabled={pending}>{pending ? 'Сохраняю…' : 'Сохранить описание'}</Button></div></form></CardContent></Card> : <Card className="border-white/[0.07] bg-card/80 shadow-none"><CardContent className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">Сначала добавьте товар в каталог.</CardContent></Card>}
    </div>
  )
}

function ReviewCard({ product, pending, onDecide }: { product: WorkspaceProduct; pending: boolean; onDecide: (id: string, decision: 'approved' | 'rejected') => void }) {
  return <Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle className="text-base">{product.name}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{product.category || 'Без категории'} · {product.source}</p></div><Badge variant="outline" className={statusTone(product.status)}>{product.status}</Badge></CardHeader><CardContent className="flex flex-col gap-4"><div className="grid grid-cols-2 gap-3 rounded-lg border border-white/[0.06] p-3 text-sm"><div><p className="text-xs text-muted-foreground">Закупка</p><p className="mt-1">{product.purchaseCny ? `${product.purchaseCny.toLocaleString('ru-RU')} CNY` : 'Не задана'}</p></div><div><p className="text-xs text-muted-foreground">Цена продажи</p><p className="mt-1">{product.salePriceRub ? formatRub(product.salePriceRub) : 'Не задана'}</p></div><div><p className="text-xs text-muted-foreground">Себестоимость</p><p className="mt-1">{product.purchaseRub ? formatRub(product.purchaseRub) : 'Не задана'}</p></div><div><p className="text-xs text-muted-foreground">Размеры</p><p className="mt-1">{product.sizes.length ? product.sizes.join(', ') : 'Не заданы'}</p></div></div>{product.supplier && product.supplier !== '—' && <p className="text-xs text-muted-foreground">Поставщик: {product.supplier}</p>}<div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={pending} onClick={() => onDecide(product.id, 'rejected')}>Отклонить</Button><Button disabled={pending} onClick={() => onDecide(product.id, 'approved')}><Check data-icon="inline-start" />{pending ? 'Сохраняю…' : 'Одобрить'}</Button></div></CardContent></Card>
}

function SupplierDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const payload = new FormData(form)
    setError('')
    startTransition(async () => {
      try {
        const result = await createSupplier(payload)
        if (!result.ok) {
          setError('Поставщик с таким названием уже существует.')
          return
        }
        form.reset()
        onOpenChange(false)
        router.refresh()
      } catch {
        setError('Не удалось сохранить поставщика. Проверьте поля и попробуйте ещё раз.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-[#1b1d20] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Новый поставщик</DialogTitle>
          <DialogDescription>Запись сохранится в вашей базе поставщиков.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <FieldGroup>
            <Field><FieldLabel htmlFor="supplier-name">Название</FieldLabel><Input id="supplier-name" name="name" maxLength={180} required /></Field>
            <Field><FieldLabel htmlFor="supplier-platform">Площадка или источник</FieldLabel><Input id="supplier-platform" name="platform" maxLength={120} placeholder="Например, 1688" /></Field>
            <Field><FieldLabel htmlFor="supplier-url">Ссылка на магазин</FieldLabel><Input id="supplier-url" name="storeUrl" type="url" maxLength={2048} /></Field>
            <Field><FieldLabel htmlFor="supplier-notes">Заметки</FieldLabel><Textarea id="supplier-notes" name="notes" maxLength={4000} rows={3} /></Field>
          </FieldGroup>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button type="submit" disabled={pending}>{pending ? 'Сохраняю…' : 'Сохранить поставщика'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function SupplierEditDialog({ supplier, onOpenChange }: { supplier: WorkspaceSupplier | null; onOpenChange: (supplier: WorkspaceSupplier | null) => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supplier) return
    const payload = new FormData(event.currentTarget)
    setError('')
    startTransition(async () => {
      try {
        const result = await updateSupplier(supplier.id, payload)
        if (!result.ok) {
          setError('Такое название уже используется или поставщик не найден.')
          return
        }
        onOpenChange(null)
        router.refresh()
      } catch {
        setError('Не удалось обновить поставщика. Проверьте поля и попробуйте ещё раз.')
      }
    })
  }

  if (!supplier) return null

  return <Dialog open={Boolean(supplier)} onOpenChange={(open) => { if (!open) onOpenChange(null) }}><DialogContent className="border-white/10 bg-[#1b1d20] sm:max-w-lg"><DialogHeader><DialogTitle>Поставщик</DialogTitle><DialogDescription>Изменения сохраняются в вашей базе.</DialogDescription></DialogHeader><form onSubmit={submit} className="flex flex-col gap-5"><FieldGroup><Field><FieldLabel htmlFor="edit-supplier-name">Название</FieldLabel><Input id="edit-supplier-name" name="name" maxLength={180} defaultValue={supplier.name} required /></Field><Field><FieldLabel htmlFor="edit-supplier-platform">Площадка или источник</FieldLabel><Input id="edit-supplier-platform" name="platform" maxLength={120} defaultValue={supplier.platform === 'Не указана' ? '' : supplier.platform} /></Field><Field><FieldLabel htmlFor="edit-supplier-url">Ссылка на магазин</FieldLabel><Input id="edit-supplier-url" name="storeUrl" type="url" maxLength={2048} defaultValue={supplier.storeUrl ?? ''} /></Field><Field><FieldLabel htmlFor="edit-supplier-notes">Заметки</FieldLabel><Textarea id="edit-supplier-notes" name="notes" maxLength={4000} rows={3} defaultValue={supplier.notes} /></Field><Field><FieldLabel htmlFor="edit-supplier-status">Статус</FieldLabel><select id="edit-supplier-status" name="status" defaultValue={supplier.status} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="active">Активен</option><option value="inactive">Архивный</option></select></Field></FieldGroup>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(null)}>Отмена</Button><Button type="submit" disabled={pending}>{pending ? 'Сохраняю…' : 'Сохранить поставщика'}</Button></DialogFooter></form></DialogContent></Dialog>
}

export function LiveSuppliersView({ data }: { data: WorkspaceData }) {
  const [open, setOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<WorkspaceSupplier | null>(null)

  return <div className="flex flex-col gap-5"><SectionHeading title="Поставщики" description="Управляйте сохранёнными источниками и их статусом." action={<Button onClick={() => setOpen(true)}><Plus data-icon="inline-start" /> Добавить поставщика</Button>} /><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Список поставщиков <span className="ml-2 text-sm font-normal text-muted-foreground">{data.suppliers.length}</span></CardTitle></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Поставщик</TableHead><TableHead>Площадка</TableHead><TableHead>Магазин</TableHead><TableHead>Товары</TableHead><TableHead>Статус</TableHead><TableHead><span className="sr-only">Действия</span></TableHead></TableRow></TableHeader><TableBody>{data.suppliers.length ? data.suppliers.map((supplier) => <TableRow key={supplier.id}><TableCell><span className="font-medium">{supplier.name}</span>{supplier.notes && <span className="mt-1 block max-w-xs truncate text-xs text-muted-foreground">{supplier.notes}</span>}</TableCell><TableCell>{supplier.platform}</TableCell><TableCell>{supplier.storeUrl ? <a href={supplier.storeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm underline underline-offset-4">Открыть <ExternalLink aria-hidden="true" /></a> : '—'}</TableCell><TableCell>{supplier.productCount}</TableCell><TableCell><Badge variant="outline" className={statusTone(supplier.status === 'active' ? 'Активен' : supplier.status)}>{supplier.status === 'active' ? 'Активен' : 'Архивный'}</Badge></TableCell><TableCell><Button type="button" size="sm" variant="ghost" onClick={() => setEditingSupplier(supplier)}>Изменить</Button></TableCell></TableRow>) : <DataTableEmpty colSpan={6} text="Поставщики появятся после добавления товара с поставщиком." />}</TableBody></Table></CardContent></Card><SupplierDialog open={open} onOpenChange={setOpen} /><SupplierEditDialog supplier={editingSupplier} onOpenChange={setEditingSupplier} /></div>
}

function ExpenseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const payload = new FormData(form)
    setError('')
    startTransition(async () => {
      try {
        await createFinancialTransaction(payload)
        form.reset()
        onOpenChange(false)
        router.refresh()
      } catch {
        setError('Не удалось сохранить расход. Проверьте поля и попробуйте ещё раз.')
      }
    })
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="border-white/10 bg-[#1b1d20] sm:max-w-lg"><DialogHeader><DialogTitle>Добавить расход</DialogTitle><DialogDescription>Расход попадёт в финансовый журнал и расчёт чистой прибыли.</DialogDescription></DialogHeader><form onSubmit={submit} className="flex flex-col gap-5"><FieldGroup><Field><FieldLabel htmlFor="expense-category">Категория</FieldLabel><select id="expense-category" name="category" className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue="Доставка">{expenseCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></Field><Field><FieldLabel htmlFor="expense-amount">Сумма, ₽</FieldLabel><Input id="expense-amount" name="amountRub" type="number" min="0.01" max="100000000" step="0.01" required /></Field><Field><FieldLabel htmlFor="expense-date">Дата расхода</FieldLabel><Input id="expense-date" name="occurredAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></Field><Field><FieldLabel htmlFor="expense-notes">Комментарий</FieldLabel><Textarea id="expense-notes" name="notes" maxLength={1000} rows={3} /></Field></FieldGroup>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button><Button type="submit" disabled={pending}>{pending ? 'Сохраняю…' : 'Сохранить расход'}</Button></DialogFooter></form></DialogContent></Dialog>
}

export function LiveAnalyticsView({ data, onNavigate }: { data: WorkspaceData; onNavigate: (section: SectionId) => void }) {
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false)
  const averageCheck = data.summary.paidOrderCount ? data.summary.revenue / data.summary.paidOrderCount : 0
  const metrics = [
    { label: 'Сумма заказов', value: formatRub(data.summary.revenue), icon: Wallet },
    { label: 'Валовая прибыль', value: formatRub(data.summary.grossProfit), icon: Package },
    { label: 'Дополнительные расходы', value: formatRub(data.summary.additionalExpenses), icon: ArrowRight },
    { label: 'Чистая прибыль', value: formatRub(data.summary.netProfit), icon: Wallet },
    { label: 'Заказы · единицы', value: `${data.summary.orderCount} · ${data.summary.unitCount}`, icon: Package },
    { label: 'Средний чек', value: data.summary.orderCount ? formatRub(averageCheck) : '—', icon: ArrowRight },
  ]

  return <div className="flex flex-col gap-5"><SectionHeading title="Финансы и аналитика" description="Продажи рассчитаны по всем сохранённым заказам; дополнительные расходы учитываются отдельно." action={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => onNavigate('orders')}>Открыть заказы <ArrowRight data-icon="inline-end" /></Button><Button onClick={() => setExpenseDialogOpen(true)}><Plus data-icon="inline-start" /> Добавить расход</Button></div>} /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{metrics.map(({ label, value, icon: Icon }) => <Card key={label} className="border-white/[0.07] bg-card/80 shadow-none"><CardContent className="flex items-center justify-between gap-4 p-4"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold tabular-nums">{value}</p></div><Icon aria-hidden="true" className="text-muted-foreground" /></CardContent></Card>)}</div><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Динамика за шесть месяцев</CardTitle><p className="text-xs text-muted-foreground">Валовая прибыль = сумма заказов минус себестоимость; чистая прибыль также учитывает журнал расходов.</p></CardHeader><CardContent><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{data.revenueTrend.map((item) => <div key={item.month} className="rounded-lg border border-white/[0.06] p-3"><p className="text-xs capitalize text-muted-foreground">{item.month}</p><p className="mt-2 text-sm font-medium">Заказы {formatRub(item.revenue)}</p><p className="mt-1 text-xs text-muted-foreground">Валовая прибыль {formatRub(item.grossProfit)}</p><p className="mt-1 text-xs text-muted-foreground">Расходы {formatRub(item.expenses)}</p><p className="mt-1 text-xs font-medium">Чистая прибыль {formatRub(item.profit)}</p></div>)}</div></CardContent></Card><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Журнал расходов <span className="ml-2 text-sm font-normal text-muted-foreground">{data.transactions.length}</span></CardTitle><p className="text-xs text-muted-foreground">Последние 100 операций. Расходы не смешиваются с себестоимостью товара.</p></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Дата</TableHead><TableHead>Категория</TableHead><TableHead>Комментарий</TableHead><TableHead className="text-right">Сумма</TableHead></TableRow></TableHeader><TableBody>{data.transactions.length ? data.transactions.map((transaction) => <TableRow key={transaction.id}><TableCell className="whitespace-nowrap">{transaction.occurredAt}</TableCell><TableCell>{transaction.category}</TableCell><TableCell className="max-w-sm truncate">{transaction.notes || '—'}</TableCell><TableCell className="text-right font-medium">{formatRub(transaction.amountRub)}</TableCell></TableRow>) : <DataTableEmpty colSpan={4} text="Расходов пока нет. Добавьте упаковку, доставку, комиссию или другой расход." />}</TableBody></Table></CardContent></Card><ExpenseDialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen} /></div>
}
