'use client'

import { useMemo, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check, Package, Plus, Search, Wallet } from 'lucide-react'
import { createOrder, createProduct, createSupplier, updateOrder, updateProduct, updateProductReview } from '@/app/actions/workspace'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatRub } from '@/lib/pricing'
import type { OrderStatus, SectionId, WorkspaceData, WorkspaceOrder, WorkspaceProduct } from './types'

const statusTone = (status: string) => {
  if (status.includes('Ожидает')) return 'border-amber-400/20 bg-amber-400/[0.07] text-amber-100'
  if (status === 'В пути' || status === 'Заказан у поставщика') return 'border-sky-400/20 bg-sky-400/[0.07] text-sky-100'
  if (status === 'Прибыл' || status === 'Завершён' || status === 'Опубликован' || status === 'В каталоге') return 'border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-100'
  return 'border-white/10 text-muted-foreground'
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

function DataTableEmpty({ text }: { text: string }) {
  return <TableRow><TableCell colSpan={8} className="h-28 text-center text-sm text-muted-foreground">{text}</TableCell></TableRow>
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
          </FieldGroup>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button><Button type="submit" disabled={pending}>{pending ? 'Сохраняю…' : 'Сохранить товар'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function OrderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
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
        await createOrder(payload)
        form.reset()
        onOpenChange(false)
        router.refresh()
      } catch {
        setError('Не удалось сохранить заказ. Проверьте поля и попробуйте ещё раз.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-[#1b1d20] sm:max-w-lg">
        <DialogHeader><DialogTitle>Новый заказ</DialogTitle><DialogDescription>Добавьте заказ покупателя; запись сохранится в вашей базе.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field><FieldLabel htmlFor="order-customer">Покупатель</FieldLabel><Input id="order-customer" name="customer" maxLength={160} required /></Field>
            <Field><FieldLabel htmlFor="order-contact">Контакт</FieldLabel><Input id="order-contact" name="contact" maxLength={240} required /></Field>
            <Field className="sm:col-span-2"><FieldLabel htmlFor="order-product">Товар</FieldLabel><Input id="order-product" name="product" maxLength={180} required /></Field>
            <Field><FieldLabel htmlFor="order-size">Размер</FieldLabel><Input id="order-size" name="size" maxLength={40} /></Field>
            <Field><FieldLabel htmlFor="order-price">Цена продажи, ₽</FieldLabel><Input id="order-price" name="salePrice" type="number" min="0.01" max="100000000" step="0.01" inputMode="decimal" required /></Field>
          </FieldGroup>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button><Button type="submit" disabled={pending}>{pending ? 'Сохраняю…' : 'Создать заказ'}</Button></DialogFooter>
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
          </FieldGroup>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(null)}>Отмена</Button><Button type="submit" disabled={pending}>{pending ? 'Сохраняю…' : 'Сохранить изменения'}</Button></DialogFooter>
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
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>Товары <span className="ml-2 text-sm font-normal text-muted-foreground">{data.products.length}</span></CardTitle><div className="relative w-full sm:max-w-xs"><Search aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Поиск по каталогу" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Название, категория, поставщик" className="pl-9" /></div></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table><TableHeader><TableRow><TableHead>Товар</TableHead><TableHead>Поставщик</TableHead><TableHead>Закупка</TableHead><TableHead>Цена продажи</TableHead><TableHead>Размеры</TableHead><TableHead>Проверка</TableHead><TableHead>Публикация</TableHead></TableRow></TableHeader>
            <TableBody>{filtered.length ? filtered.map((product) => <TableRow key={product.id}><TableCell><div className="flex items-start justify-between gap-3"><div><span className="font-medium">{product.name}</span><span className="mt-1 block text-xs text-muted-foreground">{product.category || 'Без категории'}</span></div><Button type="button" size="sm" variant="ghost" className="shrink-0" aria-label={`Редактировать ${product.name}`} onClick={() => setEditingProduct(product)}>Изменить</Button></div></TableCell><TableCell>{product.supplier}</TableCell><TableCell>{product.purchaseCny ? `${product.purchaseCny.toLocaleString('ru-RU')} CNY` : '—'}</TableCell><TableCell>{product.salePriceRub ? formatRub(product.salePriceRub) : '—'}</TableCell><TableCell>{product.sizes.length ? product.sizes.join(', ') : '—'}</TableCell><TableCell><Badge variant="outline" className={statusTone(product.status)}>{product.status}</Badge></TableCell><TableCell><Badge variant="outline" className={statusTone(product.listingStatus)}>{product.listingStatus}</Badge></TableCell></TableRow>) : <DataTableEmpty text={search ? 'Ничего не найдено.' : 'Каталог пока пуст. Добавьте первый товар.'} />}</TableBody>
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

  const statuses: OrderStatus[] = ['Ожидает оплаты', 'Ожидает закупки', 'Заказан у поставщика', 'В пути', 'Прибыл', 'Завершён']

  return (
    <Dialog open={Boolean(order)} onOpenChange={(open) => { if (!open) onOpenChange(null) }}>
      <DialogContent className="border-white/10 bg-[#1b1d20] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Обновить заказ {order.id}</DialogTitle>
          <DialogDescription>Сохраните фактический статус, себестоимость и трек-номер.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="order-update-status">Статус</FieldLabel>
              <select id="order-update-status" name="status" defaultValue={order.status} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="order-update-cost">Фактическая себестоимость, ₽</FieldLabel>
              <Input id="order-update-cost" name="costRub" type="number" min="0" max="100000000" step="0.01" defaultValue={order.cost} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="order-update-tracking">Трек-номер</FieldLabel>
              <Input id="order-update-tracking" name="tracking" maxLength={120} defaultValue={order.tracking ?? ''} />
            </Field>
          </FieldGroup>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(null)}>Отмена</Button>
            <Button type="submit" disabled={pending}>{pending ? 'Сохраняю…' : 'Сохранить изменения'}</Button>
          </DialogFooter>
        </form>
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
    const matchesSearch = `${order.id} ${order.customer} ${order.contact} ${order.product}`.toLowerCase().includes(search.toLowerCase())
    return matchesSearch && (statusFilter === 'all' || order.status === statusFilter)
  }), [data.orders, search, statusFilter])

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading title="Заказы" description="Заказы из вашей базы с поиском и фильтром по статусу." action={<Button onClick={() => setOpen(true)}><Plus data-icon="inline-start" /> Новый заказ</Button>} />
      <Card className="border-white/[0.07] bg-card/80 shadow-none">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>Все заказы <span className="ml-2 text-sm font-normal text-muted-foreground">{data.summary.orderCount}</span></CardTitle><div className="flex flex-col gap-2 sm:flex-row"><Input aria-label="Поиск заказов" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Покупатель, товар, ID" className="sm:w-56" /><select aria-label="Фильтр по статусу" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="all">Все статусы</option>{(['Ожидает оплаты', 'Ожидает закупки', 'Заказан у поставщика', 'В пути', 'Прибыл', 'Завершён'] as OrderStatus[]).map((status) => <option key={status} value={status}>{status}</option>)}</select></div></CardHeader>
        <CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>ID / дата</TableHead><TableHead>Покупатель</TableHead><TableHead>Товар</TableHead><TableHead>Статус</TableHead><TableHead>Продажа</TableHead><TableHead>Себестоимость</TableHead><TableHead>Прибыль</TableHead><TableHead>Трек</TableHead></TableRow></TableHeader>
          <TableBody>{filtered.length ? filtered.map((order) => <TableRow key={order.id}><TableCell><span className="font-mono text-xs">{order.id}</span><span className="mt-1 block text-xs text-muted-foreground">{order.createdAt}</span></TableCell><TableCell><span className="font-medium">{order.customer}</span><span className="mt-1 block text-xs text-muted-foreground">{order.contact}</span></TableCell><TableCell>{order.product}{order.size && <span className="mt-1 block text-xs text-muted-foreground">Размер {order.size}</span>}</TableCell><TableCell><Badge variant="outline" className={statusTone(order.status)}>{order.status}</Badge></TableCell><TableCell>{formatRub(order.salePrice)}</TableCell><TableCell>{order.cost ? formatRub(order.cost) : '—'}</TableCell><TableCell>{order.cost ? formatRub(order.salePrice - order.cost) : '—'}</TableCell><TableCell><div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center"><span>{order.tracking || '—'}</span><Button type="button" variant="outline" size="sm" onClick={() => setEditingOrder(order)}>Изменить</Button></div></TableCell></TableRow>) : <DataTableEmpty text={search || statusFilter !== 'all' ? 'Заказы не найдены.' : 'Заказов пока нет. Создайте первую запись.'} />}</TableBody>
        </Table></CardContent>
      </Card>
      <OrderDialog open={open} onOpenChange={setOpen} />
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

export function LiveSuppliersView({ data }: { data: WorkspaceData }) {
  const [open, setOpen] = useState(false)

  return <div className="flex flex-col gap-5"><SectionHeading title="Поставщики" description="Поставщики и количество товаров, связанных с ними." action={<Button onClick={() => setOpen(true)}><Plus data-icon="inline-start" /> Добавить поставщика</Button>} /><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Список поставщиков <span className="ml-2 text-sm font-normal text-muted-foreground">{data.suppliers.length}</span></CardTitle></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Поставщик</TableHead><TableHead>Источник</TableHead><TableHead>Товары</TableHead><TableHead>Статус</TableHead></TableRow></TableHeader><TableBody>{data.suppliers.length ? data.suppliers.map((supplier) => <TableRow key={supplier.id}><TableCell className="font-medium">{supplier.name}</TableCell><TableCell>{supplier.platform}</TableCell><TableCell>{supplier.productCount}</TableCell><TableCell><Badge variant="outline" className={statusTone(supplier.status === 'active' ? 'Активен' : supplier.status)}>{supplier.status === 'active' ? 'Активен' : supplier.status}</Badge></TableCell></TableRow>) : <DataTableEmpty text="Поставщики появятся после добавления товара с поставщиком." />}</TableBody></Table></CardContent></Card><SupplierDialog open={open} onOpenChange={setOpen} /></div>
}

export function LiveAnalyticsView({ data, onNavigate }: { data: WorkspaceData; onNavigate: (section: SectionId) => void }) {
  const profit = data.summary.revenue - data.summary.cost
  const averageCheck = data.summary.orderCount ? data.summary.revenue / data.summary.orderCount : 0
  const metrics = [
    { label: 'Выручка', value: formatRub(data.summary.revenue), icon: Wallet },
    { label: 'Прибыль', value: formatRub(profit), icon: Package },
    { label: 'Заказы', value: String(data.summary.orderCount), icon: Package },
    { label: 'Средний чек', value: data.summary.orderCount ? formatRub(averageCheck) : '—', icon: ArrowRight },
  ]

  return <div className="flex flex-col gap-5"><SectionHeading title="Аналитика" description="Показатели рассчитаны по заказам, сохранённым в Neon." action={<Button variant="outline" onClick={() => onNavigate('orders')}>Открыть заказы <ArrowRight data-icon="inline-end" /></Button>} /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ label, value, icon: Icon }) => <Card key={label} className="border-white/[0.07] bg-card/80 shadow-none"><CardContent className="flex items-center justify-between gap-4 p-4"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold tabular-nums">{value}</p></div><Icon className="text-muted-foreground" /></CardContent></Card>)}</div><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>История продаж</CardTitle><p className="text-xs text-muted-foreground">Продажи и расчётная прибыль за последние шесть месяцев.</p></CardHeader><CardContent>{data.summary.orderCount ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{data.revenueTrend.map((item) => <div key={item.month} className="rounded-lg border border-white/[0.06] p-3"><p className="text-xs capitalize text-muted-foreground">{item.month}</p><p className="mt-2 text-sm font-medium">{formatRub(item.revenue)}</p><p className="mt-1 text-xs text-muted-foreground">прибыль {formatRub(item.profit)}</p></div>)}</div> : <div className="flex min-h-40 flex-col items-center justify-center text-center"><p className="text-sm font-medium">Пока нет сохранённых продаж</p><p className="mt-1 text-xs text-muted-foreground">После добавления заказов здесь появится история.</p><Button variant="outline" size="sm" className="mt-4" onClick={() => onNavigate('orders')}>Создать заказ</Button></div>}</CardContent></Card></div>
}
