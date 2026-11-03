"use client"

import { useMemo, useState, useTransition } from 'react'
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
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { respondToAgentApprovals, runAgentTask } from '@/app/actions/agent'
import { testTelegramConnection } from '@/app/actions/integrations'
import { saveProductSearch, updateProductPricing } from '@/app/actions/workspace'
import { calculatePricing, formatRub, type PricingInputs } from '@/lib/pricing'
import { demoOrders, demoProducts } from './demo-data'
import type { AgentTaskPreview, DemoProduct, IntegrationStatus, SavedProductSearch, SectionId, WorkspaceData } from './types'
import { LiveAnalyticsView, LiveCatalogView, LiveEditorView, LiveOrdersView, LiveReviewView, LiveSuppliersView } from './live-workspace-views'

type WorkspaceViewsProps = {
  section: SectionId
  onNavigate: (section: SectionId) => void
  data: WorkspaceData
  agentTasks: AgentTaskPreview[]
  integrations: IntegrationStatus[]
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

function approvalDetails(approval: AgentTaskPreview['pendingApprovals'][number]) {
  const input = approval.input
  const show = (value: unknown) => Array.isArray(value) ? value.join(', ') : String(value ?? '—')

  if (approval.toolName === 'createProductDraft') {
    return [
      ['Название', show(input.name)],
      ['Категория', show(input.category)],
      ['Источник', show(input.source)],
      ['Закупка CNY', input.purchasePriceCny == null ? 'не указана' : Number(input.purchasePriceCny).toLocaleString('ru-RU')],
      ['Себестоимость', input.purchasePriceRub == null ? 'не указана' : formatRub(Number(input.purchasePriceRub))],
      ['Цена продажи', input.salePriceRub == null ? 'не указана' : formatRub(Number(input.salePriceRub))],
      ['Размеры', show(input.sizes)],
    ]
  }
  if (approval.toolName === 'updateOrderStatus') {
    return [
      ['Заказ', `…${show(input.orderId).slice(-8)}`],
      ['Новый статус', show(input.status)],
    ]
  }
  return [
    ['Категория', show(input.category)],
    ['Сумма', input.amountRub == null ? '—' : formatRub(Number(input.amountRub))],
    ['Комментарий', show(input.notes)],
  ]
}

function approvalTitle(toolName: AgentTaskPreview['pendingApprovals'][number]['toolName']) {
  if (toolName === 'createProductDraft') return 'Создать черновик товара'
  if (toolName === 'updateOrderStatus') return 'Изменить статус заказа'
  return 'Добавить расход'
}

function AgentView({ initialTasks }: { initialTasks: AgentTaskPreview[] }) {
  const [task, setTask] = useState('')
  const [tasks, setTasks] = useState(initialTasks)
  const [selectedTaskId, setSelectedTaskId] = useState(initialTasks[0]?.id ?? '')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const suggestions = ['Покажи активные товары в каталоге', 'Какие заказы сейчас в пути?', 'Создай черновик товара из моего описания']
  const activeTask = tasks.find((item) => item.id === selectedTaskId) ?? tasks[0]

  function submitTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const prompt = task.trim()
    if (!prompt || pending) return
    setError('')
    startTransition(async () => {
      try {
        const result = await runAgentTask(prompt)
        if (!result.ok) {
          setError(result.reason === 'invalid_input' ? 'Введите задачу длиной до 4 000 символов.' : result.reason === 'rate_limited' ? 'Лимит достигнут: не более 10 запросов за час.' : result.reason === 'api_key_missing' ? 'Добавьте DEEPSEEK_API_KEY в переменные окружения проекта, чтобы включить агента.' : 'DeepSeek API временно недоступен. История попытки сохранена; попробуйте позже.')
          return
        }
        setTasks((current) => [result.task, ...current.filter((item) => item.id !== result.task.id)].slice(0, 20))
        setSelectedTaskId(result.task.id)
        setTask('')
      } catch {
        setError('Не удалось выполнить запрос. Проверьте соединение и повторите попытку.')
      }
    })
  }

  function decideApprovals(approved: boolean) {
    if (!activeTask?.pendingApprovals.length || pending) return
    setError('')
    const decisions = activeTask.pendingApprovals.map(({ approvalId }) => ({ approvalId, approved }))
    startTransition(async () => {
      try {
        const result = await respondToAgentApprovals(activeTask.id, decisions)
        if (!result.ok) {
          setError(result.reason === 'stale_approval' ? 'Это подтверждение уже обработано. Обновите страницу и проверьте историю задач.' : 'Не удалось обработать подтверждение. Повторите попытку.')
          return
        }
        setTasks((current) => [result.task, ...current.filter((item) => item.id !== result.task.id)].slice(0, 20))
        setSelectedTaskId(result.task.id)
      } catch {
        setError('Не удалось обработать подтверждение. Проверьте историю задачи перед повтором.')
      }
    })
  }

  return (
    <div className="space-y-5">
      <SectionHeading title="AI-агент" description="Выполняет цепочки действий в CloStore. Изменения в базе — только после вашего подтверждения." action={<Badge variant="outline" className="w-fit border-emerald-300/20 text-emerald-100"><span className="mr-2 size-1.5 rounded-full bg-emerald-300" />DeepSeek API</Badge>} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="flex min-h-[480px] flex-col border-white/[0.07] bg-card/80 shadow-none">
          <CardHeader className="flex flex-row items-center gap-3 border-b border-white/[0.06]">
            <span className="flex size-9 items-center justify-center rounded-lg bg-white/[0.05] text-muted-foreground"><Sparkles /></span><div><CardTitle>Рабочий диалог</CardTitle><p className="mt-1 text-xs text-muted-foreground">{tasks[0]?.model ?? 'deepseek-flash'} · история сохраняется в Neon</p></div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-between gap-6 p-5">
            <div className="max-h-[420px] space-y-4 overflow-y-auto pr-1">
              {activeTask ? <>
                <div className="ml-auto max-w-xl rounded-xl border border-white/[0.08] bg-white/[0.045] p-4"><p className="text-xs text-muted-foreground">Ваша задача</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{activeTask.prompt}</p></div>
                <div className="max-w-xl rounded-xl border border-white/[0.07] bg-white/[0.025] p-4"><p className="mb-2 text-xs text-muted-foreground">Ответ агента</p>{activeTask.response ? <p className="whitespace-pre-wrap text-sm leading-6">{activeTask.response}</p> : <p className="text-sm text-muted-foreground">{activeTask.status === 'running' ? 'Задача выполняется…' : 'Запрос завершился ошибкой. Отправьте его повторно.'}</p>}<p className="mt-3 text-[10px] text-muted-foreground">{new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Moscow' }).format(new Date(activeTask.createdAt))}{activeTask.inputTokens != null && activeTask.outputTokens != null ? ` · ${activeTask.inputTokens + activeTask.outputTokens} токенов` : ''}</p></div>
                {activeTask.pendingApprovals.length > 0 && <Card className="max-w-xl border-amber-300/20 bg-amber-300/[0.04] shadow-none"><CardHeader><CardTitle className="text-sm">Нужно ваше подтверждение</CardTitle><p className="text-xs text-muted-foreground">Агент не выполнит эти изменения без вашего решения.</p></CardHeader><CardContent className="flex flex-col gap-4">
                  {activeTask.pendingApprovals.map((approval) => <div key={approval.approvalId} className="rounded-lg border border-white/[0.08] bg-background/50 p-3"><p className="text-sm font-medium">{approvalTitle(approval.toolName)}</p>{approval.reason && <p className="mt-1 text-xs text-muted-foreground">{approval.reason}</p>}<dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs"><>{approvalDetails(approval).map(([label, value]) => <div key={label} className="contents"><dt className="text-muted-foreground">{label}</dt><dd className="break-words text-right">{value}</dd></div>)}</></dl></div>)}
                  <div className="flex flex-wrap gap-2"><Button type="button" disabled={pending} onClick={() => decideApprovals(true)}><Check data-icon="inline-start" />{pending ? 'Выполняю…' : 'Подтвердить все'}</Button><Button type="button" variant="outline" disabled={pending} onClick={() => decideApprovals(false)}><X data-icon="inline-start" />Отклонить все</Button></div>
                </CardContent></Card>}
              </> : <div className="max-w-xl rounded-xl border border-white/[0.07] bg-white/[0.025] p-4"><p className="text-sm leading-6">Опишите цель обычным языком. Агент использует каталог, заказы и финансовые инструменты приложения.</p><p className="mt-3 text-xs text-muted-foreground">Создание карточек, изменения статусов заказов и запись расходов — только с подтверждением. Публикации и действия в Telegram или Avito пока недоступны.</p></div>}
              {pending && <div role="status" className="max-w-xl rounded-xl border border-white/[0.07] bg-white/[0.025] p-4 text-sm text-muted-foreground">DeepSeek выполняет шаг задачи…</div>}
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            </div>
            <form onSubmit={submitTask} className="space-y-3">
              <div className="flex flex-wrap gap-2">{suggestions.map((item) => <Button key={item} type="button" variant="outline" size="sm" disabled={pending} onClick={() => setTask(item)}>{item}</Button>)}</div>
              <Field>
                <FieldLabel htmlFor="agent-task" className="sr-only">Текст задачи</FieldLabel>
                <Textarea id="agent-task" maxLength={4000} value={task} onChange={(event) => setTask(event.target.value)} placeholder="Опишите задачу для AI-агента…" className="min-h-24 resize-y border-white/10 bg-black/10" />
              </Field>
              <div className="flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">До 4 000 символов · действия требуют подтверждения</span><Button type="submit" disabled={!task.trim() || pending}>{pending ? <><LoaderCircle data-icon="inline-start" className="animate-spin" /> Выполняю…</> : <><Send data-icon="inline-start" /> Запустить агента</>}</Button></div>
            </form>
          </CardContent>
        </Card>
        <aside className="space-y-4">
          <Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Последние задания</CardTitle><p className="text-xs text-muted-foreground">Сохранённая история · до 20 задач</p></CardHeader><CardContent className="space-y-2">{tasks.length ? tasks.slice(0, 8).map((item) => <button key={item.id} type="button" onClick={() => setSelectedTaskId(item.id)} className={`w-full rounded-lg border p-3 text-left transition-colors ${selectedTaskId === item.id ? 'border-white/15 bg-white/[0.05]' : 'border-white/[0.06] hover:bg-white/[0.03]'}`}><span className="block truncate text-xs font-medium">{item.prompt}</span><span className="mt-1 block text-[10px] text-muted-foreground">{item.status === 'completed' ? 'Готово' : item.status === 'running' ? 'Выполняется' : item.status === 'awaiting_approval' ? 'Нужно подтверждение' : 'Ошибка'} · {new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeZone: 'Europe/Moscow' }).format(new Date(item.createdAt))}</span></button>) : <div className="rounded-lg border border-dashed border-white/10 p-4 text-center"><MessageSquareText className="mx-auto text-muted-foreground" /><p className="mt-3 text-sm">Сохранённых задач пока нет</p></div>}</CardContent></Card>
          <Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Доступ к данным</CardTitle></CardHeader><CardContent className="space-y-3 text-xs leading-5 text-muted-foreground"><p>DeepSeek API получает только данные каталога, заказов и финансов, необходимые для ответа. Контакты покупателей агенту не передаются.</p><p>Изменения записываются в Neon только после подтверждения. Отказ не меняет данные; Telegram, Avito, закупки и интернет-поиск пока не подключены к агенту.</p></CardContent></Card>
        </aside>
      </div>
    </div>
  )
}


function getMarketplaceSearchUrl(search: SavedProductSearch, source: string) {
  const keywords = [search.query, search.category, search.style, search.colorMaterial, ...search.sizes].filter(Boolean).join(' ')
  if (source === 'pinduoduo') {
    const url = new URL('https://mobile.yangkeduo.com/search_result.html')
    url.searchParams.set('search_key', keywords)
    return url.toString()
  }
  if (source === 'grailed') {
    const url = new URL('https://www.grailed.com/shop')
    url.searchParams.set('query', keywords)
    return url.toString()
  }
  if (source === 'custom' && search.customSourceUrl) {
    const url = new URL(search.customSourceUrl)
    url.searchParams.set('query', keywords)
    return url.toString()
  }
  return null
}

const marketplaceLabels: Record<string, string> = {
  pinduoduo: 'Pinduoduo',
  grailed: 'Grailed',
  custom: 'Свой источник',
}

function SearchView({ data, onNavigate }: { data: WorkspaceData; onNavigate: (section: SectionId) => void }) {
  const [notice, setNotice] = useState('')
  const [isPending, startTransition] = useTransition()
  const [history, setHistory] = useState(data.savedSearches)
  const [activeSearch, setActiveSearch] = useState<SavedProductSearch | null>(data.savedSearches[0] ?? null)

  function requestSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      try {
        const result = await saveProductSearch(formData)
        setHistory((current) => [result.search, ...current.filter((search) => search.id !== result.search.id)].slice(0, 20))
        setActiveSearch(result.search)
        setNotice('Запрос сохранён. Откройте выбранную площадку для ручного просмотра; автоматический сбор не выполняется.')
      } catch {
        setNotice('Не удалось сохранить запрос. Проверьте обязательные поля, диапазон цены и URL своего источника.')
      }
    })
  }

  return (
    <div className="space-y-5">
      <SectionHeading title="Поиск товаров" description="Сохраните критерии и откройте поиск на выбранных площадках." action={<Button variant="outline" onClick={() => onNavigate('settings')}><Settings2 data-icon="inline-start" /> Источники</Button>} />
      <div className="rounded-lg border border-sky-400/15 bg-sky-400/[0.04] p-3 text-xs leading-5 text-sky-100/75">Запросы сохраняются в вашем рабочем пространстве. Результаты открываются на официальных сайтах для ручного просмотра — автоматический сбор и импорт не выполняются.</div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Параметры поиска</CardTitle><p className="text-xs text-muted-foreground">Точные условия помогут сократить лишние результаты</p></CardHeader>
          <CardContent><form onSubmit={requestSearch} className="space-y-5">
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <Field className="md:col-span-2"><FieldLabel htmlFor="search-query">Что ищем</FieldLabel><Input id="search-query" name="query" required maxLength={240} placeholder="Например, мужская куртка в стиле archive" /></Field>
              <Field><FieldLabel htmlFor="search-category">Категория</FieldLabel><Input id="search-category" name="category" maxLength={120} placeholder="Верхняя одежда" /></Field>
              <Field><FieldLabel htmlFor="search-style">Стиль</FieldLabel><Input id="search-style" name="style" maxLength={120} placeholder="Avant-garde, archive…" /></Field>
              <Field><FieldLabel htmlFor="search-min">Цена от, CNY</FieldLabel><Input id="search-min" name="minPriceCny" type="number" min="0" step="0.01" placeholder="80" /></Field>
              <Field><FieldLabel htmlFor="search-max">Цена до, CNY</FieldLabel><Input id="search-max" name="maxPriceCny" type="number" min="0" step="0.01" placeholder="250" /></Field>
              <Field><FieldLabel htmlFor="search-sizes">Размеры</FieldLabel><Input id="search-sizes" name="sizes" maxLength={240} placeholder="S, M, L" /></Field>
              <Field><FieldLabel htmlFor="search-color">Цвет и материал</FieldLabel><Input id="search-color" name="colorMaterial" maxLength={180} placeholder="Чёрный, хлопок" /></Field>
              <Field className="md:col-span-2"><FieldLabel htmlFor="search-custom-url">URL своего источника</FieldLabel><Input id="search-custom-url" name="customSourceUrl" type="url" maxLength={2048} placeholder="https://example.com/search" /></Field>
            </FieldGroup>
            <FieldSet className="gap-2">
              <FieldLegend variant="label">Где искать</FieldLegend>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" name="sources" value="pinduoduo" defaultChecked className="accent-primary" /> Pinduoduo</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="sources" value="grailed" defaultChecked className="accent-primary" /> Grailed</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="sources" value="custom" className="accent-primary" /> Свой источник</label>
              </div>
            </FieldSet>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4"><span className="text-xs text-muted-foreground">Критерии сохраняются отдельно для каждого аккаунта</span><Button type="submit" disabled={isPending}><Search data-icon="inline-start" /> {isPending ? 'Сохраняем…' : 'Сохранить запрос'}</Button></div>
          </form>{notice && <p role="status" className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-muted-foreground">{notice}</p>}</CardContent>
        </Card>
        <div className="space-y-4">
          <Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Открыть площадку</CardTitle><p className="text-xs text-muted-foreground">{activeSearch ? `Запрос: ${activeSearch.query}` : 'Сначала сохраните запрос'}</p></CardHeader><CardContent className="space-y-3">
            {activeSearch ? <>
              <p className="text-xs leading-5 text-muted-foreground">{[activeSearch.category, activeSearch.style, activeSearch.sizes.length ? `Размеры: ${activeSearch.sizes.join(', ')}` : '', activeSearch.minPriceCny !== null || activeSearch.maxPriceCny !== null ? `Цена: ${activeSearch.minPriceCny ?? '—'}–${activeSearch.maxPriceCny ?? '—'} CNY` : ''].filter(Boolean).join(' · ') || 'Дополнительные фильтры не заданы.'}</p>
              {activeSearch.sources.map((source) => {
                const href = getMarketplaceSearchUrl(activeSearch, source)
                if (!href) return null
                return <a key={source} href={href} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-lg border border-white/[0.07] px-3 py-2.5 text-sm transition-colors hover:bg-white/[0.04]">{marketplaceLabels[source] ?? source}<ExternalLink className="size-4 text-muted-foreground" /></a>
              })}
              <p className="text-xs leading-5 text-muted-foreground">Ценовые и другие дополнительные фильтры сохранены в запросе, но при необходимости задаются вручную на площадке.</p>
            </> : <p className="text-sm text-muted-foreground">Сохранённые запросы появятся здесь.</p>}
          </CardContent></Card>
          <Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>История запросов</CardTitle><p className="text-xs text-muted-foreground">Последние 20 запросов этого аккаунта</p></CardHeader><CardContent className="space-y-2">
            {history.length ? history.map((search) => <button key={search.id} type="button" onClick={() => setActiveSearch(search)} className="flex w-full items-start justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[0.04]"><span className="min-w-0"><span className="block truncate text-sm">{search.query}</span><span className="mt-1 block text-xs text-muted-foreground">{new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(search.createdAt))}</span></span><Clock3 className="mt-0.5 size-4 shrink-0 text-muted-foreground" /></button>) : <p className="text-sm text-muted-foreground">Пока нет сохранённых запросов.</p>}
          </CardContent></Card>
          <Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Безопасный сбор</CardTitle></CardHeader><CardContent className="text-xs leading-5 text-muted-foreground">Площадки открываются отдельно. Проверяйте правила площадки и используйте только разрешённые способы доступа; автоматизированный сбор в приложении отключён.</CardContent></Card>
        </div>
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

function PricingView({ data }: { data: WorkspaceData }) {
  const [selectedId, setSelectedId] = useState('')
  const [values, setValues] = useState<PricingInputs>({ purchasePriceCny: 0, cnyToRub: 0, brokerFeePercent: 0, chinaShippingRub: 0, internationalShippingRub: 0, extraCostsRub: 0, otherFeesRub: 0, salePriceRub: 0 })
  const [pending, startTransition] = useTransition()
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const product = data.products.find((item) => item.id === selectedId)
  const result = calculatePricing(values)

  function update(key: keyof PricingInputs, value: string) {
    setValues((current) => ({ ...current, [key]: Number(value) || 0 }))
  }

  function selectProduct(productId: string) {
    setSelectedId(productId)
    const selected = data.products.find((item) => item.id === productId)
    if (selected) setValues((current) => ({ ...current, purchasePriceCny: selected.purchaseCny, salePriceRub: selected.salePriceRub }))
    setNotice('')
    setError('')
  }

  function savePricing() {
    if (!product || values.cnyToRub <= 0) return
    setNotice('')
    setError('')
    startTransition(async () => {
      try {
        const saved = await updateProductPricing(product.id, values.purchasePriceCny, result.landedCostRub, values.salePriceRub)
        if (!saved.ok) {
          setError('Товар не найден. Обновите страницу и повторите попытку.')
          return
        }
        setNotice('Себестоимость и цена продажи сохранены в карточке товара.')
      } catch {
        setError('Не удалось сохранить цены. Проверьте значения и повторите попытку.')
      }
    })
  }

  const fields: { key: keyof PricingInputs; label: string; step?: string }[] = [
    { key: 'purchasePriceCny', label: 'Закупочная цена, CNY', step: '0.01' },
    { key: 'cnyToRub', label: 'Курс CNY / RUB', step: '0.01' },
    { key: 'brokerFeePercent', label: 'Коми��сия посредника, %', step: '0.1' },
    { key: 'chinaShippingRub', label: 'Доставка по Китаю, ₽', step: '0.01' },
    { key: 'internationalShippingRub', label: 'Международная доставка, ₽', step: '0.01' },
    { key: 'extraCostsRub', label: 'Дополнительные расходы, ₽', step: '0.01' },
    { key: 'otherFeesRub', label: 'Прочие комиссии, ₽', step: '0.01' },
    { key: 'salePriceRub', label: 'Цена продажи, ₽', step: '0.01' },
  ]

  return <div className="flex flex-col gap-5"><SectionHeading title="Ценообразование" description="Рассчитайте и сохраните себестоимость и цену реального товара." /><p className="text-sm text-muted-foreground">Курс CNY вводится вручную и не обновляется автоматически. Доставка и комиссии в расчёте не сохраняются отдельно.</p><div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]"><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Параметры расчёта</CardTitle><p className="text-xs text-muted-foreground">Выберите товар или внесите значения вручную.</p></CardHeader><CardContent><FieldGroup className="grid gap-4 sm:grid-cols-2"><Field className="sm:col-span-2"><FieldLabel htmlFor="pricing-product">Карточка товара</FieldLabel><select id="pricing-product" value={selectedId} onChange={(event) => selectProduct(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="">Расчёт без сохранения в товар</option>{data.products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>{fields.map(({ key, label, step }) => <Field key={key}><FieldLabel htmlFor={`pricing-${key}`}>{label}</FieldLabel><Input id={`pricing-${key}`} type="number" min="0" step={step ?? '0.01'} value={values[key]} onChange={(event) => update(key, event.target.value)} /></Field>)}</FieldGroup></CardContent></Card><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Итог</CardTitle></CardHeader><CardContent className="flex flex-col gap-3"><ResultRow label="Закупка в рублях" value={formatRub(result.purchaseRub)} /><ResultRow label="Комиссия посредника" value={formatRub(result.brokerFeeRub)} /><Separator className="bg-white/10" /><ResultRow label="Себестоимость" value={formatRub(result.landedCostRub)} strong /><ResultRow label="Цена продажи" value={formatRub(values.salePriceRub)} /><div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Прибыль</span><span className={`font-semibold tabular-nums ${result.profitRub >= 0 ? 'text-emerald-200' : 'text-rose-200'}`}>{formatRub(result.profitRub)}</span></div><div className="mt-2 flex items-center justify-between text-xs text-muted-foreground"><span>Маржа {result.marginPercent.toFixed(1)}%</span><span>Наценка {result.markupPercent.toFixed(1)}%</span></div></div>{notice && <p role="status" className="text-sm text-emerald-200">{notice}</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="button" disabled={!product || values.cnyToRub <= 0 || pending} onClick={savePricing}>{pending ? 'Сохраняю…' : 'Сохранить в товар'}</Button><p className="text-xs leading-5 text-muted-foreground">Для ру��ного расчёта укажите фактический курс. Сохранение обновляет закупку в CNY, себестоимость в RUB и цену продажи.</p></CardContent></Card></div></div>
}

function ResultRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className="flex items-center justify-between gap-3 text-sm"><span className={strong ? 'font-medium' : 'text-muted-foreground'}>{label}</span><span className={`tabular-nums ${strong ? 'font-semibold' : ''}`}>{value}</span></div> }

function PublicationView({ channel }: { channel: 'Telegram' }) {
  const [text, setText] = useState('')
  const [notice, setNotice] = useState('')
  function saveDraft(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setNotice('Черновик подготовлен тол��к�� в текущем окне. Публикация не отправлялась.') }
  return <div className="space-y-5"><SectionHeading title="Telegram" description="Подготовка карточек и публикаций для Telegram." action={<Badge variant="outline" className="w-fit border-white/10 text-muted-foreground"><span className="mr-2 size-1.5 rounded-full bg-white/20" />Подключение через Vercel Connect</Badge>} /><DemoNotice>Черновик не отправляется автоматически. Для публикации нужно задать получателя и отдельно подтвердить отправку.</DemoNotice><div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]"><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Редактор публикации</CardTitle><p className="text-xs text-muted-foreground">Сначала сохраните черновик и проверьте текст</p></CardHeader><CardContent><form onSubmit={saveDraft} className="space-y-4"><FieldGroup><Field><FieldLabel htmlFor="listing-title">Заголовок</FieldLabel><Input id="listing-title" placeholder="Назв��ние модели" /></Field><Field><FieldLabel htmlFor="listing-text">Описание</FieldLabel><Textarea id="listing-text" value={text} onChange={(event) => setText(event.target.value)} className="min-h-40 resize-y" placeholder="Описание товара, материалы, размеры и условия заказа" /></Field></FieldGroup><div className="flex flex-wrap items-center justify-between gap-3"><Button type="button" variant="outline"><ImagePlus data-icon="inline-start" /> Выбрать фото</Button><Button type="submit" variant="secondary">Сохранить черновик</Button></div></form>{notice && <p role="status" className="mt-4 text-xs text-muted-foreground">{notice}</p>}</CardContent></Card><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Проверка перед публикацией</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">{['Текст карточки проверен', 'Фото выбраны', 'Цена подтверждена', 'Публикация подтверждена'].map((item) => <div key={item} className="flex items-center gap-3 text-muted-foreground"><span className="size-4 rounded-full border border-white/15" />{item}</div>)}<Separator className="bg-white/10" /><p className="text-xs leading-5 text-muted-foreground">Черновик хранится только в текущем окне; отправка через {channel} пока не запускается.</p></CardContent></Card></div></div>
}

function EditorView() {
  return <div className="space-y-5"><SectionHeading title="Редактор карточек" description="Подготовьте отдельные версии описания для каналов продаж." /><DemoNotice /><div className="grid gap-4 xl:grid-cols-2">{(['Telegram'] as const).map((channel) => <Card key={channel} className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>{channel}</CardTitle><p className="text-xs text-muted-foreground">Черновик карточки · не опубликован</p></CardHeader><CardContent className="space-y-3"><Input placeholder="Заголовок товара" /><Textarea className="min-h-36" placeholder="Описание, размеры, материал, условия заказа" /><div className="flex justify-between"><Button variant="outline" size="sm"><ImagePlus data-icon="inline-start" /> Фотографии</Button><Button size="sm" variant="secondary">Сохранить черновик</Button></div></CardContent></Card>)}</div></div>
}

function AnalyticsView() {
  const revenue = demoOrders.reduce((total, order) => total + order.salePrice, 0)
  const profit = demoOrders.reduce((total, order) => total + order.salePrice - order.cost, 0)
  return <div className="space-y-5"><SectionHeading title="Аналитика" description="Показатели рассчитываются на основе заказов и продаж." action={<Button variant="outline">Период: демо</Button>} /><DemoNotice /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><SmallStat icon={Wallet} label="Выручка" value={formatRub(revenue)} /><SmallStat icon={ArrowRight} label="Валовая прибыль" value={formatRub(profit)} /><SmallStat icon={Package} label="Количество заказов" value={String(demoOrders.length)} /><SmallStat icon={Clock3} label="Средний чек" value={formatRub(revenue / Math.max(demoOrders.length, 1))} /></div><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Нет подключённ��й истор��и продаж</CardTitle><p className="text-xs text-muted-foreground">Графики по месяцам появятся после сохранения реальных заказов.</p></CardHeader><CardContent><div className="flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed border-white/10 text-center"><FileSpreadsheet className="text-muted-foreground" /><p className="mt-3 text-sm font-medium">Реальные отчёты пока недоступны</p><p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">Сводные карточки выше вычислены только по четырём демонстрационным заказам. Конверсия и просмотры не подставляются без данных.</p></div></CardContent></Card></div>
}

function AiUsageView({ tasks }: { tasks: AgentTaskPreview[] }) {
  const completed = tasks.filter((task) => task.status === 'completed')
  const inputTokens = completed.reduce((total, task) => total + (task.inputTokens ?? 0), 0)
  const outputTokens = completed.reduce((total, task) => total + (task.outputTokens ?? 0), 0)
  return <div className="space-y-5"><SectionHeading title="Ра��ходы н�� AI" description="Фактическое потребление токенов в последних сохранённых задачах." /><div className="grid gap-3 sm:grid-cols-3"><SmallStat icon={MessageSquareText} label="Выполнено задач" value={String(completed.length)} /><SmallStat icon={ArrowRight} label="Входящие токены" value={inputTokens.toLocaleString('ru-RU')} /><SmallStat icon={Sparkles} label="Исходящие токены" value={outputTokens.toLocaleString('ru-RU')} /></div><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>DeepSeek API</CardTitle><p className="text-xs text-muted-foreground">Показаны последние {tasks.length} задач из сохранённой истории.</p></CardHeader><CardContent className="space-y-4"><div className="rounded-lg border border-white/[0.07] p-4"><div className="flex justify-between text-xs"><span className="text-muted-foreground">Токены в истории</span><span>{(inputTokens + outputTokens).toLocaleString('ru-RU')}</span></div><Progress value={0} className="mt-3 h-1.5" /><p className="mt-3 text-xs leading-5 text-muted-foreground">Стоимость не рассчитывается по приблизительным тарифам. Сверяйте её в личном кабинете DeepSeek; приложение сохраняет фактическое число токенов каждого завершённого запроса.</p></div>{completed.length === 0 && <p className="text-sm text-muted-foreground">После первого запроса появятся фактические счётчики токенов.</p>}</CardContent></Card></div>
}

function SettingsView({ integrations }: { integrations: IntegrationStatus[] }) {
  const [testResults, setTestResults] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  function testConnection(provider: 'telegram') {
    if (pending) return
    startTransition(async () => {
      const result = await testTelegramConnection()
      setTestResults((current) => ({ ...current, [provider]: result.message }))
    })
  }

  return <div className="space-y-5"><SectionHeading title="Настройки" description="Провайдеры, каналы продаж и правила работы приложения." /><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Подключения</CardTitle><p className="text-xs text-muted-foreground">Секреты не отображаются в интерфейсе. Добавляйте переменные в Vars проекта; статусы показывают только наличие конфигурации, не успешность API-проверки.</p></CardHeader><CardContent className="divide-y divide-white/[0.06]">{integrations.map((item) => <div key={item.name} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center"><span className={`size-2 shrink-0 rounded-full ${item.configured ? 'bg-emerald-300' : 'bg-white/20'}`} /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>{item.requiredVariables.length > 0 && <p className="mt-1 break-words font-mono text-[10px] text-muted-foreground/80">Переменные: {item.requiredVariables.join(', ')}</p>}</div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={item.configured ? 'w-fit border-emerald-300/20 text-emerald-100' : 'w-fit border-white/10 text-muted-foreground'}>{item.state}</Badge>{item.testProvider && <Button type="button" size="sm" variant="outline" disabled={!item.configured || pending} onClick={() => testConnection(item.testProvider!)}>{pending ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : null}Проверить</Button>}</div>{item.testProvider && testResults[item.testProvider] && <p role="status" className="mt-2 text-xs text-muted-foreground">{testResults[item.testProvider]}</p>}</div>)}</CardContent></Card><div className="grid gap-4 xl:grid-cols-2"><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Ценообразование</CardTitle></CardHeader><CardContent className="space-y-3"><ResultRow label="Основная валюта" value="RUB" /><ResultRow label="Дополнительная валюта" value="CNY" /><ResultRow label="Часовой пояс" value="Europe/Moscow" /><Button variant="outline" size="sm">Изменить параметры</Button></CardContent></Card><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Безопасность</CardTitle></CardHeader><CardContent className="space-y-3 text-xs leading-5 text-muted-foreground"><p>Вход и регистрация в приложении отключены. Данные доступны на странице без проверки пользователя.</p><p>Перед публикацией ограничьте д��ступ к деплою средствами Vercel: публичный адрес сам по себе не защищает данные.</p></CardContent></Card></div></div>
}

function PlaceholderView({ section, onNavigate }: Pick<WorkspaceViewsProps, 'section' | 'onNavigate'>) {
  const titles: Record<SectionId, [string, string]> = {
    dashboard: ['Обзор', 'Сводка по магазину и ближайшим задачам'], agent: ['AI-агент', 'Подготовьте задачу для агента'], search: ['Поиск товаров', 'Соберите критерии и источники'], review: ['Очередь проверки', 'Проверка карточек перед каталогом'], catalog: ['Каталог', 'Товары магазина'], editor: ['Редактор карточек', 'Подготовка описаний'], suppliers: ['Поставщики', 'Карточки продавцов'], orders: ['Заказы', 'Оплата, закупка и доставка'], telegram: ['Telegram', 'Канал публикаций'], pricing: ['Ценообразование', 'Себестоимость и цена продажи'], analytics: ['Аналитика', 'Показатели магазина'], 'ai-usage': ['Расходы на AI', 'Фактическое потребление'], settings: ['Настройки', 'Провайдеры и параметры'],
  }
  const [title, description] = titles[section]
  return <div className="space-y-5"><SectionHeading title={title} description={description} /><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardContent className="flex min-h-72 flex-col items-center justify-center text-center"><span className="flex size-12 items-center justify-center rounded-xl bg-white/[0.04] text-muted-foreground"><LoaderCircle /></span><h2 className="mt-4 text-base font-medium">Раздел подготовлен</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Этот экран подключается к реальным данным по мере готовности backend-модулей.</p><Button className="mt-5" variant="outline" onClick={() => onNavigate('settings')}>Проверить интеграции <ArrowRight data-icon="inline-end" /></Button></CardContent></Card></div>
}

export function WorkspaceView({ section, onNavigate, data, agentTasks, integrations }: WorkspaceViewsProps) {
  switch (section) {
    case 'review': return <LiveReviewView data={data} />
    case 'catalog': return <LiveCatalogView data={data} />
    case 'orders': return <LiveOrdersView data={data} />
    case 'suppliers': return <LiveSuppliersView data={data} />
    case 'analytics': return <LiveAnalyticsView data={data} onNavigate={onNavigate} />
    case 'agent': return <AgentView initialTasks={agentTasks} />
    case 'search': return <SearchView data={data} onNavigate={onNavigate} />
    case 'pricing': return <PricingView data={data} />
    case 'telegram': return <PublicationView channel="Telegram" />
    case 'editor': return <LiveEditorView data={data} />
    case 'ai-usage': return <AiUsageView tasks={agentTasks} />
    case 'settings': return <SettingsView integrations={integrations} />
    default: return <PlaceholderView section={section} onNavigate={onNavigate} />
  }
}
