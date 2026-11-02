"use client"

import { useMemo, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileSpreadsheet,
  ImagePlus,
  Link2,
  LoaderCircle,
  MessageSquareText,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  Send,
  Settings2,
  Shirt,
  Sparkles,
  Truck,
  Wallet,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { calculatePricing, formatRub, type PricingInputs } from '@/lib/pricing'
import { demoOrders, demoProducts } from './demo-data'
import type { DemoProduct, SectionId, WorkspaceData } from './types'
import { LiveAnalyticsView, LiveCatalogView, LiveOrdersView, LiveReviewView, LiveSuppliersView } from './live-workspace-views'

type WorkspaceViewsProps = {
  section: SectionId
  onNavigate: (section: SectionId) => void
  data: WorkspaceData
}

function SectionHeading({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="mb-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">CloStore AI / рабочая область</p><h1 className="text-2xl font-semibold tracking-tight">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>
      {action}
    </div>
  )
}

function DemoNotice({ children = 'Демонстрационные данные · изменения доступны только в текущем сеансе' }: { children?: string }) {
  return <div className="flex items-center gap-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.06] px-3 py-2 text-xs text-amber-100/80"><span className="size-1.5 shrink-0 rounded-full bg-amber-200" />{children}</div>
}

function statusTone(status: string) {
  if (status.includes('Ожидает')) return 'border-amber-400/20 bg-amber-400/[0.07] text-amber-100'
  if (status === 'В пути' || status === 'Заказан у поставщика') return 'border-sky-400/20 bg-sky-400/[0.07] text-sky-100'
  if (status === 'Прибыл' || status === 'Завершён' || status === 'Опубликован') return 'border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-100'
  return 'border-white/10 text-muted-foreground'
}

function AgentView() {
  const [task, setTask] = useState('')
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState('')
  const suggestions = ['Найти аналоги на Pinduoduo', 'Проверить поставщика', 'Рассчитать цену продажи']

  function prepareDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!task.trim()) return
    setDraft(task.trim())
    setNotice('Задача сохранена как локальный черновик. AI-провайдер не подключён, запрос не отправлялся.')
    setTask('')
  }

  return (
    <div className="space-y-5">
      <SectionHeading title="AI-агент" description="Подготовьте задачу для агента. Вызовы инструментов и внешние действия пока отключены." action={<Badge variant="outline" className="w-fit border-white/10 text-muted-foreground"><span className="mr-2 size-1.5 rounded-full bg-white/20" />Не подключён</Badge>} />
      <DemoNotice>Режим подготовки · отправка запросов и действия с товарами пока недоступны</DemoNotice>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="flex min-h-[480px] flex-col border-white/[0.07] bg-card/80 shadow-none">
          <CardHeader className="flex flex-row items-center gap-3 border-b border-white/[0.06]">
            <span className="flex size-9 items-center justify-center rounded-lg bg-white/[0.05] text-muted-foreground"><Sparkles /></span><div><CardTitle>Рабочий диалог</CardTitle><p className="mt-1 text-xs text-muted-foreground">Сессия не подключена к модели</p></div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-between gap-6 p-5">
            <div className="space-y-4">
              <div className="max-w-xl rounded-xl border border-white/[0.07] bg-white/[0.025] p-4"><p className="text-sm leading-6">Опишите цель обычным языком. Перед закупкой, публикацией и изменением финансовых данных будет требоваться подтверждение.</p><p className="mt-3 text-xs text-muted-foreground">Сейчас это только интерфейс черновика — действия не выполняются.</p></div>
              {draft && <div className="ml-auto max-w-xl rounded-xl border border-white/[0.08] bg-white/[0.045] p-4"><p className="text-xs text-muted-foreground">Черновик задачи</p><p className="mt-2 text-sm leading-6">{draft}</p></div>}
              {notice && <p role="status" className="text-xs text-amber-100/75">{notice}</p>}
            </div>
            <form onSubmit={prepareDraft} className="space-y-3">
              <div className="flex flex-wrap gap-2">{suggestions.map((item) => <Button key={item} type="button" variant="outline" size="sm" onClick={() => setTask(item)}>{item}</Button>)}</div>
              <Field>
                <FieldLabel htmlFor="agent-task" className="sr-only">Текст задачи</FieldLabel>
                <Textarea id="agent-task" value={task} onChange={(event) => setTask(event.target.value)} placeholder="Например: найди 10 вещей в стиле Rick Owens до 2 500 ₽…" className="min-h-24 resize-y border-white/10 bg-black/10" />
              </Field>
              <div className="flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">Текст останется только в текущем окне</span><Button type="submit" disabled={!task.trim()}><Send data-icon="inline-start" /> Сохранить черновик</Button></div>
            </form>
          </CardContent>
        </Card>
        <aside className="space-y-4">
          <Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Последние задания</CardTitle><p className="text-xs text-muted-foreground">Нет подключённых задач</p></CardHeader><CardContent><div className="rounded-lg border border-dashed border-white/10 p-4 text-center"><MessageSquareText className="mx-auto text-muted-foreground" /><p className="mt-3 text-sm">История появится после подключения</p></div></CardContent></Card>
          <Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Порядок выполнения</CardTitle></CardHeader><CardContent className="space-y-3">{['Анализ запроса', 'Поиск источников', 'Проверка поставщика', 'Расчёт ц��ны', 'Подтверждение'].map((step, index) => <div key={step} className="flex items-center gap-3 text-xs text-muted-foreground"><span className="flex size-6 items-center justify-center rounded-full border border-white/10">{index + 1}</span>{step}</div>)}</CardContent></Card>
        </aside>
      </div>
    </div>
  )
}

function SearchView() {
  const [notice, setNotice] = useState('')
  function requestSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice('Поиск не запущен: внешние источники и адаптеры ещё не подключены.')
  }

  return (
    <div className="space-y-5">
      <SectionHeading title="Поиск товаров" description="Соберите критерии и источники для будущего поиска." action={<Button variant="outline"><Settings2 data-icon="inline-start" /> Источники</Button>} />
      <DemoNotice>Источники показаны для настройки. Автоматический сбор данных не выполняется.</DemoNotice>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Параметры поиска</CardTitle><p className="text-xs text-muted-foreground">Точные условия помогут сократить лишние результаты</p></CardHeader>
          <CardContent><form onSubmit={requestSearch} className="space-y-5">
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <Field className="md:col-span-2"><FieldLabel htmlFor="search-query">Что ищем</FieldLabel><Input id="search-query" placeholder="Например, мужская куртка в стиле archive" /></Field>
              <Field><FieldLabel htmlFor="search-category">Категория</FieldLabel><Input id="search-category" placeholder="Верхняя одежда" /></Field>
              <Field><FieldLabel htmlFor="search-style">Стиль</FieldLabel><Input id="search-style" placeholder="Avant-garde, archive…" /></Field>
              <Field><FieldLabel htmlFor="search-min">Цена от, CNY</FieldLabel><Input id="search-min" type="number" min="0" placeholder="80" /></Field>
              <Field><FieldLabel htmlFor="search-max">Цена до, CNY</FieldLabel><Input id="search-max" type="number" min="0" placeholder="250" /></Field>
              <Field><FieldLabel htmlFor="search-sizes">Размеры</FieldLabel><Input id="search-sizes" placeholder="S, M, L" /></Field>
              <Field><FieldLabel htmlFor="search-color">Цвет и материал</FieldLabel><Input id="search-color" placeholder="Чёрный, хлопок" /></Field>
            </FieldGroup>
            <div className="flex flex-wrap gap-2"><Badge variant="outline" className="border-white/10">Pinduoduo · не подключён</Badge><Badge variant="outline" className="border-white/10">Grailed · не подключён</Badge><Badge variant="outline" className="border-white/10">Свой источник</Badge></div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4"><span className="text-xs text-muted-foreground">Запросы будут доступны после настройки адаптеров</span><Button type="submit"><Search data-icon="inline-start" /> Подготовить поиск</Button></div>
          </form>{notice && <p role="status" className="mt-4 rounded-lg border border-amber-400/15 bg-amber-400/[0.05] p-3 text-xs text-amber-100/80">{notice}</p>}</CardContent>
        </Card>
        <div className="space-y-4"><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Источники</CardTitle><p className="text-xs text-muted-foreground">Менеджер источников</p></CardHeader><CardContent className="space-y-3">{[{ name: 'Pinduoduo', desc: 'API / ручная проверка' }, { name: 'Grailed', desc: 'Ресайкл-площадка' }, { name: 'Свой источник', desc: 'Добавить URL' }].map((source) => <div key={source.name} className="flex items-center gap-3"><span className="flex size-8 items-center justify-center rounded-md bg-white/[0.04]"><Link2 /></span><span className="min-w-0 flex-1"><span className="block text-sm">{source.name}</span><span className="text-xs text-muted-foreground">{source.desc}</span></span><span className="size-1.5 rounded-full bg-white/20" /></div>)}</CardContent></Card><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Безопасный сбор</CardTitle></CardHeader><CardContent className="text-xs leading-5 text-muted-foreground">Перед подключением источника нужно проверить доступ к данным, условия площадки, авторизацию и ограничения автоматизированного сбора.</CardContent></Card></div>
      </div>
    </div>
  )
}

function ReviewQueueView() {
  const [items, setItems] = useState(() => demoProducts.filter((product) => product.status === 'На рассмотрении'))
  const [message, setMessage] = useState('')
  const [resolved, setResolved] = useState<string[]>([])

  function resolve(id: string, action: 'approved' | 'rejected') {
    setItems((current) => current.filter((product) => product.id !== id))
    setResolved((current) => [...current, id])
    setMessage(action === 'approved' ? 'Демо-карточка отмечена как одобренная. В базу она не записана.' : 'Демо-карточка отклонена только в текущем окне.')
  }

  return <div className="space-y-5"><SectionHeading title="Очередь проверки" description="Проверьте найденные товары перед добавлением в каталог." action={<Badge variant="outline" className="w-fit border-white/10">{items.length} на рассмотрении</Badge>} /><DemoNotice />
    {message && <p role="status" className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-muted-foreground">{message}</p>}
    {items.length === 0 ? <Card className="border-white/[0.07] bg-card/80 shadow-none"><CardContent className="py-16 text-center"><CheckCircle2 className="mx-auto text-muted-foreground" /><p className="mt-3 font-medium">Очередь разобрана</p><p className="mt-1 text-sm text-muted-foreground">Решения по {resolved.length} демо-карточкам не сохраняются после обновления страницы.</p></CardContent></Card> : <div className="grid gap-4 lg:grid-cols-2">{items.map((product) => <ReviewProductCard key={product.id} product={product} onResolve={resolve} />)}</div>}
  </div>
}

function ReviewProductCard({ product, onResolve }: { product: DemoProduct; onResolve: (id: string, action: 'approved' | 'rejected') => void }) {
  const cost = Math.round(product.purchaseCny * 12.7 + 1350)
  const sale = Math.round(cost * 1.75)
  return <Card className="overflow-hidden border-white/[0.07] bg-card/80 shadow-none"><div className="flex gap-4 border-b border-white/[0.06] p-4 sm:p-5"><div className="flex size-20 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-[#202225] text-muted-foreground"><Shirt /></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><h2 className="font-medium">{product.name}</h2><p className="mt-1 text-xs text-muted-foreground">{product.category} · источник: {product.source}</p></div><Badge variant="outline" className="shrink-0 border-white/10">{product.id}</Badge></div><p className="mt-3 text-xs text-muted-foreground">Поставщик: {product.supplier} · Размеры {product.sizes.join(', ')}</p></div></div><CardContent className="space-y-4 p-4 sm:p-5"><div className="grid grid-cols-3 gap-2"><Metric label="Закупка" value={`${product.purchaseCny} ¥`} /><Metric label="Себестоимость" value={formatRub(cost)} /><Metric label="Цена продажи" value={formatRub(sale)} /></div><div className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-xs leading-5 text-muted-foreground"><Sparkles className="mt-0.5 shrink-0" />Оценка соответствия и цены здесь не подтверждены источником. Проверьте характеристики и поставщика вручную.</div><div className="flex flex-wrap justify-between gap-2"><Button variant="outline" size="sm" onClick={() => onResolve(product.id, 'rejected')}><X data-icon="inline-start" /> Отклонить</Button><div className="flex gap-2"><Button variant="secondary" size="sm"><ExternalLink data-icon="inline-start" /> Источник</Button><Button size="sm" onClick={() => onResolve(product.id, 'approved')}><Check data-icon="inline-start" /> Одобрить</Button></div></div></CardContent></Card>
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-md bg-white/[0.03] p-2.5"><p className="text-[10px] text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium tabular-nums">{value}</p></div> }

function CatalogView() {
  const [query, setQuery] = useState('')
  const products = useMemo(() => demoProducts.filter((product) => `${product.name} ${product.category} ${product.supplier}`.toLowerCase().includes(query.toLowerCase())), [query])
  return <div className="space-y-5"><SectionHeading title="Каталог" description="Одобренные товары, карточки и состояние публикаций." action={<Button><Plus data-icon="inline-start" /> Добавить товар</Button>} /><DemoNotice /><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="relative w-full sm:max-w-sm"><Search className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название, категория, поставщик" className="pl-9" /></div><span className="text-xs text-muted-foreground">{products.length} из {demoProducts.length} демо-товаров</span></CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Товар</TableHead><TableHead>Поставщик</TableHead><TableHead>Размеры</TableHead><TableHead>Публикация</TableHead><TableHead className="text-right">Закупка</TableHead></TableRow></TableHeader><TableBody>{products.map((product) => <TableRow key={product.id}><TableCell><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-lg bg-white/[0.04] text-muted-foreground"><Shirt /></span><span><span className="block font-medium">{product.name}</span><span className="text-xs text-muted-foreground">{product.category} · {product.id}</span></span></div></TableCell><TableCell>{product.supplier}</TableCell><TableCell className="text-muted-foreground">{product.sizes.join(', ')}</TableCell><TableCell><Badge variant="outline" className={statusTone(product.listingStatus)}>{product.listingStatus}</Badge></TableCell><TableCell className="text-right tabular-nums">{product.purchaseCny} ¥</TableCell></TableRow>)}</TableBody></Table></div></Card></div>
}

function OrdersView() {
  const [query, setQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [message, setMessage] = useState('')
  const filtered = useMemo(() => demoOrders.filter((order) => `${order.id} ${order.customer} ${order.product} ${order.status}`.toLowerCase().includes(query.toLowerCase())), [query])

  function saveDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setDialogOpen(false)
    setMessage('Форма заказа проверена. Черновик не сохранён: подключение базы ещё не готово.')
  }

  return <div className="space-y-5"><SectionHeading title="Заказы" description="Оплата, закупка и доставка в одном рабочем списке." action={<Button onClick={() => setDialogOpen(true)}><Plus data-icon="inline-start" /> Новый заказ</Button>} /><DemoNotice />
    {message && <p role="status" className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-muted-foreground">{message}</p>}
    <div className="grid gap-3 sm:grid-cols-3"><SmallStat icon={Clock3} label="Ожидают действия" value={String(demoOrders.filter((order) => order.status.includes('Ожидает')).length)} /><SmallStat icon={Package} label="В обработке" value={String(demoOrders.filter((order) => ['Заказан у поставщика', 'В пути'].includes(order.status)).length)} /><SmallStat icon={Truck} label="Демо-заказов" value={String(demoOrders.length)} /></div>
    <Card className="border-white/[0.07] bg-card/80 shadow-none"><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="relative w-full sm:max-w-sm"><Search className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Покупатель, товар, номер заказа" className="pl-9" /></div><Button variant="outline" size="sm"><ArrowDownToLine data-icon="inline-start" /> Экспорт</Button></CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Заказ</TableHead><TableHead>Покупатель / товар</TableHead><TableHead>Этап</TableHead><TableHead>Поставщик</TableHead><TableHead className="text-right">Сумма</TableHead></TableRow></TableHeader><TableBody>{filtered.map((order) => <TableRow key={order.id}><TableCell><span className="font-medium">{order.id}</span><span className="mt-1 block text-xs text-muted-foreground">{order.createdAt}</span></TableCell><TableCell><span className="block">{order.customer}</span><span className="mt-1 block text-xs text-muted-foreground">{order.product} · {order.size}</span></TableCell><TableCell><Badge variant="outline" className={statusTone(order.status)}>{order.status}</Badge>{order.tracking && <span className="mt-1 block text-[10px] text-muted-foreground">Трек: {order.tracking}</span>}</TableCell><TableCell className="text-muted-foreground">{order.supplier}</TableCell><TableCell className="text-right"><span className="font-medium tabular-nums">{formatRub(order.salePrice)}</span><span className="mt-1 block text-xs text-muted-foreground">прибыль {formatRub(order.salePrice - order.cost)}</span></TableCell></TableRow>)}</TableBody></Table></div></Card>
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-lg border-white/10 bg-[#1b1d20]"><DialogHeader><DialogTitle>Новый заказ</DialogTitle><DialogDescription>Заполните основные поля. До подключения базы заказ останется только в форме.</DialogDescription></DialogHeader><form onSubmit={saveDraft} className="space-y-4"><FieldGroup className="grid gap-3 sm:grid-cols-2"><Field><FieldLabel htmlFor="order-customer">Покупатель</FieldLabel><Input id="order-customer" required placeholder="Имя клиента" /></Field><Field><FieldLabel htmlFor="order-contact">Контакт</FieldLabel><Input id="order-contact" required placeholder="Телефон или Telegram" /></Field><Field className="sm:col-span-2"><FieldLabel htmlFor="order-product">Товар</FieldLabel><Input id="order-product" required placeholder="Название товара" /></Field><Field><FieldLabel htmlFor="order-size">Размер</FieldLabel><Input id="order-size" placeholder="M" /></Field><Field><FieldLabel htmlFor="order-sale">Цена продажи, ₽</FieldLabel><Input id="order-sale" required type="number" min="1" placeholder="12900" /></Field></FieldGroup><DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button><Button type="submit">Проверить форму</Button></DialogFooter></form></DialogContent></Dialog>
  </div>
}

function SmallStat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) { return <Card className="border-white/[0.07] bg-card/80 shadow-none"><CardContent className="flex items-center gap-3 p-4"><span className="flex size-9 items-center justify-center rounded-lg bg-white/[0.04] text-muted-foreground"><Icon /></span><span><span className="block text-xs text-muted-foreground">{label}</span><span className="mt-1 block text-lg font-semibold">{value}</span></span></CardContent></Card> }

function SuppliersView() {
  const rows = [{ name: 'North Room', platform: 'Pinduoduo', reviews: 'Не проверены', history: 'Нет истории' }, { name: 'Form Studio', platform: 'Pinduoduo', reviews: 'Не проверены', history: 'Нет истории' }, { name: 'Archive Lab', platform: 'Grailed', reviews: 'Данные недоступны', history: 'Нет истории' }]
  return <div className="space-y-5"><SectionHeading title="Поставщики" description="Карточки продавцов и история проверок качества." action={<Button variant="outline"><Plus data-icon="inline-start" /> Добавить поставщика</Button>} /><DemoNotice /><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Список поставщиков</CardTitle><p className="text-xs text-muted-foreground">Рейтинги не отображаются без подтверждённых данных</p></CardHeader><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Поставщик</TableHead><TableHead>Площадка</TableHead><TableHead>Отзывы</TableHead><TableHead>Проверка</TableHead><TableHead className="text-right">Товары</TableHead></TableRow></TableHeader><TableBody>{rows.map((row, index) => <TableRow key={row.name}><TableCell className="font-medium">{row.name}</TableCell><TableCell>{row.platform}</TableCell><TableCell className="text-muted-foreground">{row.reviews}</TableCell><TableCell><Badge variant="outline" className="border-white/10 text-muted-foreground">{row.history}</Badge></TableCell><TableCell className="text-right">{demoProducts.filter((product) => product.supplier === row.name).length}</TableCell></TableRow>)}</TableBody></Table></div></Card><p className="text-xs text-muted-foreground">Поля рейтинга, количества заказов и стабильности наличия появятся после подключения источника данных.</p></div>
}

function PricingView() {
  const [values, setValues] = useState<PricingInputs>({ purchasePriceCny: 286, cnyToRub: 12.7, brokerFeePercent: 5, chinaShippingRub: 250, internationalShippingRub: 950, extraCostsRub: 150, otherFeesRub: 120, salePriceRub: 18900 })
  const result = calculatePricing(values)
  function update(key: keyof PricingInputs, value: string) { setValues((current) => ({ ...current, [key]: Number(value) || 0 })) }
  const fields: { key: keyof PricingInputs; label: string; step?: string }[] = [
    { key: 'purchasePriceCny', label: 'Закупочная цена, CNY' },
    { key: 'cnyToRub', label: 'Курс CNY / RUB', step: '0.01' },
    { key: 'brokerFeePercent', label: 'Комиссия посредника, %', step: '0.1' },
    { key: 'chinaShippingRub', label: 'Доставка по Китаю, ₽' },
    { key: 'internationalShippingRub', label: 'Международная доставка, ₽' },
    { key: 'extraCostsRub', label: 'Дополнительные расходы, ₽' },
    { key: 'otherFeesRub', label: 'Прочие комиссии, ₽' },
    { key: 'salePriceRub', label: 'Цена продажи, ₽' },
  ]
  return <div className="space-y-5"><SectionHeading title="Ценообразование" description="Прозрачный расчёт себестоимости, прибыли и маржинальности." /><DemoNotice>Пример расчёта. Курс введён вручную, актуальность не проверялась.</DemoNotice><div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]"><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Параметры</CardTitle><p className="text-xs text-muted-foreground">Все вычисления выполняются программно</p></CardHeader><CardContent><FieldGroup className="grid gap-4 sm:grid-cols-2">{fields.map(({ key, label, step }) => <Field key={key}><FieldLabel htmlFor={`pricing-${key}`}>{label}</FieldLabel><Input id={`pricing-${key}`} type="number" min="0" step={step ?? '1'} value={values[key]} onChange={(event) => update(key, event.target.value)} /></Field>)}</FieldGroup></CardContent></Card><div className="space-y-4"><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Итог</CardTitle></CardHeader><CardContent className="space-y-3"><ResultRow label="Закупка в рублях" value={formatRub(result.purchaseRub)} /><ResultRow label="Комиссия посредника" value={formatRub(result.brokerFeeRub)} /><Separator className="bg-white/10" /><ResultRow label="Себестоимость" value={formatRub(result.landedCostRub)} strong /><ResultRow label="Цена продажи" value={formatRub(values.salePriceRub)} /><div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Прибыль</span><span className={`font-semibold tabular-nums ${result.profitRub >= 0 ? 'text-emerald-200' : 'text-rose-200'}`}>{formatRub(result.profitRub)}</span></div><div className="mt-2 flex items-center justify-between text-xs text-muted-foreground"><span>Маржа {result.marginPercent.toFixed(1)}%</span><span>Наценка {result.markupPercent.toFixed(1)}%</span></div></div></CardContent></Card><p className="px-1 text-xs leading-5 text-muted-foreground">Расчёт не заменяет проверку комиссии площадки и фактической стоимости доставки. Сохранение настроек будет доступно после подключения базы.</p></div></div></div>
}

function ResultRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className="flex items-center justify-between gap-3 text-sm"><span className={strong ? 'font-medium' : 'text-muted-foreground'}>{label}</span><span className={`tabular-nums ${strong ? 'font-semibold' : ''}`}>{value}</span></div> }

function PublicationView({ channel }: { channel: 'Avito' | 'Telegram' }) {
  const [text, setText] = useState('')
  const [notice, setNotice] = useState('')
  function saveDraft(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setNotice('Черновик подготовлен тольк�� в текущем окне. Публикация не отправлялась.') }
  return <div className="space-y-5"><SectionHeading title={channel === 'Avito' ? 'Avito' : 'Telegram'} description={`Подготовка карточек и публикаций для ${channel}.`} action={<Badge variant="outline" className="w-fit border-white/10 text-muted-foreground"><span className="mr-2 size-1.5 rounded-full bg-white/20" />Интеграция не подключена</Badge>} /><DemoNotice>Публикация отключена до настройки официального канала и подтверждения пользователя</DemoNotice><div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]"><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Редактор публикации</CardTitle><p className="text-xs text-muted-foreground">Сначала сохраните черновик и проверьте текст</p></CardHeader><CardContent><form onSubmit={saveDraft} className="space-y-4"><FieldGroup><Field><FieldLabel htmlFor="listing-title">Заголовок</FieldLabel><Input id="listing-title" placeholder="Назв��ние модели" /></Field><Field><FieldLabel htmlFor="listing-text">Описание</FieldLabel><Textarea id="listing-text" value={text} onChange={(event) => setText(event.target.value)} className="min-h-40 resize-y" placeholder="Описание товара, материалы, размеры и условия заказа" /></Field></FieldGroup><div className="flex flex-wrap items-center justify-between gap-3"><Button type="button" variant="outline"><ImagePlus data-icon="inline-start" /> Выбрать фото</Button><Button type="submit" variant="secondary">Сохранить черновик</Button></div></form>{notice && <p role="status" className="mt-4 text-xs text-muted-foreground">{notice}</p>}</CardContent></Card><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Проверка перед публикацией</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">{['Текст карточки проверен', 'Фото выбраны', 'Цена подтверждена', 'Публикация подтверждена'].map((item) => <div key={item} className="flex items-center gap-3 text-muted-foreground"><span className="size-4 rounded-full border border-white/15" />{item}</div>)}<Separator className="bg-white/10" /><p className="text-xs leading-5 text-muted-foreground">Пока {channel} не подключён, отправка и статус публикации не имитируются.</p></CardContent></Card></div></div>
}

function EditorView() {
  return <div className="space-y-5"><SectionHeading title="Редактор карточек" description="Подготовьте отдельные версии описания для каналов продаж." /><DemoNotice /><div className="grid gap-4 xl:grid-cols-2">{(['Avito', 'Telegram'] as const).map((channel) => <Card key={channel} className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>{channel}</CardTitle><p className="text-xs text-muted-foreground">Черновик карточки · не опубликован</p></CardHeader><CardContent className="space-y-3"><Input placeholder="Заголовок товара" /><Textarea className="min-h-36" placeholder="Описание, размеры, материал, условия заказа" /><div className="flex justify-between"><Button variant="outline" size="sm"><ImagePlus data-icon="inline-start" /> Фотографии</Button><Button size="sm" variant="secondary">Сохранить черновик</Button></div></CardContent></Card>)}</div></div>
}

function AnalyticsView() {
  const revenue = demoOrders.reduce((total, order) => total + order.salePrice, 0)
  const profit = demoOrders.reduce((total, order) => total + order.salePrice - order.cost, 0)
  return <div className="space-y-5"><SectionHeading title="Аналитика" description="Показатели рассчитываются на основе заказов и продаж." action={<Button variant="outline">Период: демо</Button>} /><DemoNotice /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><SmallStat icon={Wallet} label="Выручка" value={formatRub(revenue)} /><SmallStat icon={ArrowRight} label="Валовая прибыль" value={formatRub(profit)} /><SmallStat icon={Package} label="Количество заказов" value={String(demoOrders.length)} /><SmallStat icon={Clock3} label="Средний чек" value={formatRub(revenue / Math.max(demoOrders.length, 1))} /></div><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Нет подключённой истории продаж</CardTitle><p className="text-xs text-muted-foreground">Графики по месяцам появятся после сохранения реальных заказов.</p></CardHeader><CardContent><div className="flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed border-white/10 text-center"><FileSpreadsheet className="text-muted-foreground" /><p className="mt-3 text-sm font-medium">Реальные отчёты пока недоступны</p><p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">Сводные карточки выше вычислены только по четырём демонстрационным заказам. Конверсия и просмотры не подставляются без данных.</p></div></CardContent></Card></div>
}

function AiUsageView() {
  return <div className="space-y-5"><SectionHeading title="Расходы на AI" description="Фактическое потребление токенов и стоимость запросов." /><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardContent className="flex flex-col items-center justify-center py-16 text-center"><Wallet className="text-muted-foreground" /><h2 className="mt-4 text-lg font-medium">Фактических расходов пока нет</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">AI-провайдер не подключён. Токены и стоимость не оцениваются и не придумываются. После подключения появятся логи по моделям и задачам.</p><div className="mt-6 w-full max-w-sm rounded-lg border border-white/[0.07] p-4 text-left"><div className="flex justify-between text-xs"><span className="text-muted-foreground">Месячный бюджет</span><span>не задан</span></div><Progress value={0} className="mt-3 h-1.5" /><div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>Нет данных</span><span>Пороговые уведомления не настроены</span></div></div></CardContent></Card></div>
}

function SettingsView() {
  const integrations = [
    { name: 'Neon', detail: 'Каталог, заказы и поставщики сохраняются в Neon', state: 'Подключён', connected: true },
    { name: 'Vercel AI Gateway', detail: 'Доступен в проекте · генерация пока не включена', state: 'Доступен', connected: false },
    { name: 'DeepSeek API', detail: 'Ключ не настроен на сервере', state: 'Не настроен', connected: false },
    { name: 'Telegram Bot API', detail: 'Токен не задан', state: 'Не подключён', connected: false },
    { name: 'Avito API', detail: 'Авторизация не настроена', state: 'Не подключён', connected: false },
  ]
  return <div className="space-y-5"><SectionHeading title="Настройки" description="Провайдеры, каналы продаж и правила работы приложения." /><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Подключения</CardTitle><p className="text-xs text-muted-foreground">Секреты хранятся только в серверной конфигурации</p></CardHeader><CardContent className="divide-y divide-white/[0.06]">{integrations.map((item) => <div key={item.name} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center"><span className={`size-2 shrink-0 rounded-full ${item.connected ? 'bg-emerald-300' : item.name === 'Neon' ? 'bg-amber-200' : 'bg-white/20'}`} /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{item.detail}</p></div><Badge variant="outline" className={item.connected ? 'w-fit border-emerald-300/20 text-emerald-100' : 'w-fit border-white/10 text-muted-foreground'}>{item.state}</Badge></div>)}</CardContent></Card><div className="grid gap-4 xl:grid-cols-2"><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Ценообразование</CardTitle></CardHeader><CardContent className="space-y-3"><ResultRow label="Основная валюта" value="RUB" /><ResultRow label="Дополнительная валюта" value="CNY" /><ResultRow label="Часовой пояс" value="Europe/Moscow" /><Button variant="outline" size="sm">Изменить параметры</Button></CardContent></Card><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Безопасность</CardTitle></CardHeader><CardContent className="space-y-3 text-xs leading-5 text-muted-foreground"><p>Вход и регистрация в приложении отключены. Данные доступны на странице без проверки пользователя.</p><p>Перед публикацией ограничьте доступ к деплою средствами Vercel: публичный адрес сам по себе не защищает данные.</p></CardContent></Card></div></div>
}

function PlaceholderView({ section, onNavigate }: Pick<WorkspaceViewsProps, 'section' | 'onNavigate'>) {
  const titles: Record<SectionId, [string, string]> = {
    dashboard: ['Обзор', 'Сводка по магазину и ближайшим задачам'], agent: ['AI-агент', 'Подготовьте задачу для агента'], search: ['Поиск товаров', 'Соберите критерии и источники'], review: ['Очередь проверки', 'Проверка карточек перед каталогом'], catalog: ['Каталог', 'Товары магазина'], editor: ['Редактор карточек', 'Подготовка описаний'], suppliers: ['Поставщики', 'Карточки продавцов'], orders: ['Заказы', 'Оплата, закупка и доставка'], avito: ['Avito', 'Публикации и объявления'], telegram: ['Telegram', 'Канал публикаций'], pricing: ['Ценообразование', 'Себестоимость и цена продажи'], analytics: ['Аналитика', 'Показатели магазина'], 'ai-usage': ['Расходы на AI', 'Фактическое потребление'], settings: ['Настройки', 'Провайдеры и параметры'],
  }
  const [title, description] = titles[section]
  return <div className="space-y-5"><SectionHeading title={title} description={description} /><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardContent className="flex min-h-72 flex-col items-center justify-center text-center"><span className="flex size-12 items-center justify-center rounded-xl bg-white/[0.04] text-muted-foreground"><LoaderCircle /></span><h2 className="mt-4 text-base font-medium">Раздел подготовлен</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Этот экран подключается к реальным данным по мере готовности backend-модулей.</p><Button className="mt-5" variant="outline" onClick={() => onNavigate('settings')}>Проверить интеграции <ArrowRight data-icon="inline-end" /></Button></CardContent></Card></div>
}

export function WorkspaceView({ section, onNavigate, data }: WorkspaceViewsProps) {
  switch (section) {
    case 'review': return <LiveReviewView data={data} />
    case 'catalog': return <LiveCatalogView data={data} />
    case 'orders': return <LiveOrdersView data={data} />
    case 'suppliers': return <LiveSuppliersView data={data} />
    case 'analytics': return <LiveAnalyticsView data={data} onNavigate={onNavigate} />
    case 'agent': return <AgentView />
    case 'search': return <SearchView />
    case 'pricing': return <PricingView />
    case 'avito': return <PublicationView channel="Avito" />
    case 'telegram': return <PublicationView channel="Telegram" />
    case 'editor': return <EditorView />
    case 'analytics': return <AnalyticsView />
    case 'ai-usage': return <AiUsageView />
    case 'settings': return <SettingsView />
    default: return <PlaceholderView section={section} onNavigate={onNavigate} />
  }
}
