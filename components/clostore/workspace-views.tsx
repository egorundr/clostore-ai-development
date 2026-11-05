"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  History,
  ImagePlus,
  Link2,
  LoaderCircle,
  MessageSquareText,
  MoreHorizontal,
  Package,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
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
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker'
import { Message, MessageAvatar, MessageContent, MessageFooter, MessageHeader } from '@/components/ui/message'
import { MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from '@/components/ui/message-scroller'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { cancelAgentTask, continueAgentTask, createAgentPinduoduoSearchToken, getAgentTasks, respondToAgentApprovals, runAgentTask, setAgentPinduoduoSearchEnabled } from '@/app/actions/agent'
import { publishTelegramPublication, saveTelegramPublication, testTelegramConnection } from '@/app/actions/integrations'
import { saveProductSearch, updateProductPricing } from '@/app/actions/workspace'
import { PinduoduoSearchPanel } from './pinduoduo-search-panel'
import { PublicationTemplateTools } from './publication-template-tools'
import { ProductPhotoPreparation } from './product-photo-preparation'
import { calculatePricing, formatRub, type PricingInputs } from '@/lib/pricing'
import { demoOrders, demoProducts } from './demo-data'
import { ImageUploadField } from './image-upload-field'
import type { AgentTaskPreview, AgentUsageSummary, DemoProduct, IntegrationStatus, SavedProductSearch, SectionId, WorkspaceData, WorkspacePublication } from './types'
import { LiveAnalyticsView, LiveCatalogView, LiveEditorView, LiveOrdersView, LiveReviewView, LiveSuppliersView } from './live-workspace-views'

type WorkspaceViewsProps = {
  section: SectionId
  onNavigate: (section: SectionId) => void
  data: WorkspaceData
  agentTasks: AgentTaskPreview[]
  agentUsage: AgentUsageSummary
  agentSearchEnabled: boolean
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
  if (approval.toolName === 'updateProductCard') {
    return [
      ['Товар', show(input.currentName)],
      ['Название', input.name == null ? 'Без изменения' : show(input.name)],
      ['Категория', input.category == null ? 'Без изменения' : show(input.category)],
      ['Описание', input.description == null ? 'Без изменения' : show(input.description)],
    ]
  }
  if (approval.toolName === 'updateOrderStatus') {
    return [
      ['Заказ', `…${show(input.orderId).slice(-8)}`],
      ['Новый статус', show(input.status)],
    ]
  }
  if (approval.toolName === 'requestPinduoduoBrowserSearch') {
    return [
      ['Запрос поиска', show(input.query)],
      ['Что произойдёт', 'Откроется поиск Pinduoduo только после нажатия в расширении'],
      ['Передача результатов', 'Только видимые карточки после отдельного подтверждения в расширении'],
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
  if (toolName === 'updateProductCard') return 'Подготовить карточку товара'
  if (toolName === 'updateOrderStatus') return 'Изменить статус заказа'
  if (toolName === 'requestPinduoduoBrowserSearch') return 'Запустить поиск Pinduoduo'
  return 'Добавить расход'
}

function agentTaskStatusLabel(status: string) {
  if (status === 'completed') return 'Готово'
  if (status === 'running') return 'В работе'
  if (status === 'awaiting_approval') return 'Нужно решение'
  if (status === 'awaiting_browser') return 'Ждёт браузер'
  if (status === 'browser_running') return 'Браузер открыт'
  if (status === 'cancelled') return 'Отменена'
  return 'Ошибка'
}

function agentTaskStatusClass(status: string) {
  if (status === 'completed') return 'border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-100'
  if (status === 'running') return 'border-sky-300/20 bg-sky-300/[0.07] text-sky-100'
  if (status === 'awaiting_approval') return 'border-amber-300/20 bg-amber-300/[0.07] text-amber-100'
  if (status === 'awaiting_browser' || status === 'browser_running') return 'border-violet-300/20 bg-violet-300/[0.07] text-violet-100'
  return 'border-white/10 bg-white/[0.03] text-muted-foreground'
}

function AgentView({ initialTasks, products, templates, onNavigate, initialSearchEnabled }: { initialTasks: AgentTaskPreview[]; products: WorkspaceData['products']; templates: WorkspaceData['publicationTemplates']; onNavigate: (section: SectionId) => void; initialSearchEnabled: boolean }) {
  const [task, setTask] = useState('')
  const [tasks, setTasks] = useState(initialTasks)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(initialTasks[0]?.id ?? null)
  const [historyQuery, setHistoryQuery] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const [refreshing, setRefreshing] = useState(false)
  const [searchEnabled, setSearchEnabled] = useState(initialSearchEnabled)
  const [searchPermissionPending, setSearchPermissionPending] = useState(false)
  const [searchPermissionMessage, setSearchPermissionMessage] = useState('')
  const [searchToken, setSearchToken] = useState('')
  const [searchTokenCopied, setSearchTokenCopied] = useState(false)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const suggestions = ['Покажи активные товары в каталоге', 'Какие заказы сейчас в пути?', 'Найди похожие товары на Pinduoduo', 'Составь отчёт по товарам Pinduoduo и подготовь карточки', 'Создай черновик товара из моего описания']
  const activeTask = selectedTaskId ? tasks.find((item) => item.id === selectedTaskId) ?? tasks[0] : undefined
  const shouldPollAgentTasks = Boolean(activeTask && ['running', 'awaiting_browser', 'browser_running'].includes(activeTask.status))
  const { data: refreshedTasks } = useSWR(
    shouldPollAgentTasks ? `agent-tasks:${activeTask?.id}` : null,
    () => getAgentTasks(),
    { refreshInterval: 4000, revalidateOnFocus: true },
  )
  useEffect(() => {
    if (refreshedTasks) setTasks(refreshedTasks)
  }, [refreshedTasks])
  const filteredTasks = useMemo(() => {
    const query = historyQuery.trim().toLocaleLowerCase('ru-RU')
    return tasks.filter((item) => item.prompt.toLocaleLowerCase('ru-RU').includes(query)).slice(0, 12)
  }, [historyQuery, tasks])
  const shortDate = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeZone: 'Europe/Moscow' })
  const dateTime = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Moscow' })

  function startNewTask() {
    setSelectedTaskId(null)
    setTask('')
    setError('')
    requestAnimationFrame(() => composerRef.current?.focus())
  }

  function chooseSuggestion(prompt: string) {
    setTask(prompt)
    composerRef.current?.focus()
  }

  function submitTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const prompt = task.trim()
    if (!prompt || pending) return
    setError('')
    startTransition(async () => {
      try {
        const result = activeTask?.status === 'completed'
          ? await continueAgentTask(activeTask.id, prompt)
          : await runAgentTask(prompt)
        if (!result.ok) {
          setError(result.reason === 'invalid_input' ? 'Введите задачу длиной до 4 000 символов.' : result.reason === 'rate_limited' ? 'Лимит достигнут: не более 10 запросов за час.' : result.reason === 'api_key_missing' ? 'Добавьте DEEPSEEK_API_KEY в переменные окружения проекта, чтобы включить агента.' : result.reason === 'not_continuable' ? 'Эту задачу ещё нельзя продолжить. Дождитесь завершения или начните новую.' : result.reason === 'stale_task' ? 'Исходная задача не найдена. Обновите историю задач.' : 'DeepSeek API временно недоступен. История попытки сохранена; попробуйте позже.')
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

  async function changeSearchPermission(enabled: boolean) {
    if (searchPermissionPending) return
    setSearchPermissionPending(true)
    setSearchPermissionMessage('')
    try {
      const result = await setAgentPinduoduoSearchEnabled(enabled)
      if (!result.ok) {
        setSearchPermissionMessage('Не удалось сохранить разрешение. Обновите страницу и повторите попытку.')
        return
      }
      setSearchEnabled(result.enabled)
      setSearchToken(result.browserToken ?? '')
      setSearchTokenCopied(false)
      setSearchPermissionMessage(enabled
        ? 'Постоянный поиск включён. Скопируйте токен в расширение, чтобы подключить его один раз.'
        : 'Разрешение выключено. Текущий токен расширения больше не может получать команды.')
    } catch {
      setSearchPermissionMessage('Не удалось сохранить разрешение. Проверьте соединение и повторите попытку.')
    } finally {
      setSearchPermissionPending(false)
    }
  }

  async function revealSearchToken() {
    if (searchPermissionPending) return
    setSearchPermissionPending(true)
    setSearchPermissionMessage('')
    try {
      const result = await createAgentPinduoduoSearchToken()
      if (!result.ok) {
        setSearchPermissionMessage('Сначала включите постоянное разрешение поиска.')
        return
      }
      setSearchToken(result.browserToken)
      setSearchTokenCopied(false)
      setSearchPermissionMessage('Токен создан. Вставьте его в popup расширения Clostore Pinduoduo.')
    } catch {
      setSearchPermissionMessage('Не удалось создать токен подключения. Повторите попытку.')
    } finally {
      setSearchPermissionPending(false)
    }
  }

  async function copySearchToken() {
    if (!searchToken) return
    try {
      await navigator.clipboard.writeText(searchToken)
      setSearchTokenCopied(true)
      setSearchPermissionMessage('Токен скопирован. Вставьте его в расширение и сохраните подключение.')
    } catch {
      setSearchPermissionMessage('Не удалось скопировать автоматически. Выделите токен и скопируйте его вручную.')
    }
  }

  async function refreshAgentTasks() {
    if (pending || refreshing) return
    setError('')
    setRefreshing(true)
    try {
      const latestTasks = await getAgentTasks()
      setTasks(latestTasks)
      if (selectedTaskId && !latestTasks.some((item) => item.id === selectedTaskId)) {
        setSelectedTaskId(latestTasks[0]?.id ?? null)
      }
    } catch {
      setError('Не удалось обновить историю задач.')
    } finally {
      setRefreshing(false)
    }
  }

  function cancelPendingTask() {
    const canCancelBrowserTask = activeTask?.status === 'awaiting_browser' || activeTask?.status === 'browser_running'
    if ((!activeTask?.pendingApprovals.length && !canCancelBrowserTask) || pending || !activeTask) return
    setError('')
    startTransition(async () => {
      try {
        const result = await cancelAgentTask(activeTask.id)
        if (!result.ok) {
          setError('Эта задача уже обработана. Обновите историю задач.')
          return
        }
        setTasks((current) => current.map((item) => item.id === result.task.id ? result.task : item))
      } catch {
        setError('Не удалось отменить задачу. Проверьте её статус и повторите попытку.')
      }
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] pb-4">
        <div className="min-w-0">
          <p className="hidden text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground sm:block">CloStore AI / рабочая область</p>
          <div className="flex flex-wrap items-center gap-2 sm:mt-2 sm:gap-3">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">AI-агент</h1>
            <Badge variant="outline" className="border-emerald-300/20 text-emerald-100"><span className="mr-2 size-1.5 rounded-full bg-emerald-300" />DeepSeek API</Badge>
          </div>
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">Работайте с каталогом, заказами и расходами — под вашим контролем.</p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={startNewTask} className="shrink-0 px-2.5 sm:px-3"><Plus data-icon="inline-start" /><span className="sm:hidden">Новая</span><span className="hidden sm:inline">Новая задача</span></Button>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
        <Card className="flex h-[calc(100svh-165px)] min-h-[360px] flex-col overflow-hidden border-white/[0.07] bg-card/80 shadow-none md:h-auto md:min-h-[580px]">
          <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-white/[0.06]">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-emerald-300/10 bg-emerald-300/[0.06] text-emerald-100"><Sparkles /></span>
              <div className="min-w-0">
                <CardTitle className="truncate">{activeTask ? 'Задача' : 'Новая задача'}</CardTitle>
                <p className="mt-1 truncate text-xs text-muted-foreground">{activeTask?.model ?? tasks[0]?.model ?? 'deepseek-flash'} · история сохраняется в Neon</p>
              </div>
            </div>
            {activeTask && <Badge variant="outline" className={agentTaskStatusClass(activeTask.status)}>{agentTaskStatusLabel(activeTask.status)}</Badge>}
          </CardHeader>

          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            {activeTask ? <MessageScrollerProvider key={activeTask.id} defaultScrollPosition="end" autoScroll>
              <MessageScroller className="min-h-[100px] flex-1 md:min-h-[280px]">
                <MessageScrollerViewport aria-label="История диалога с AI-агентом" className="px-5 py-6 sm:px-7">
                  <MessageScrollerContent className="min-h-full justify-start">
                    {activeTask.conversation.map((turn, index) => <MessageScrollerItem key={`${activeTask.id}-turn-${index}`} messageId={`${activeTask.id}-turn-${index}`} className={turn.role === 'user' ? 'flex justify-end' : ''} scrollAnchor={index === activeTask.conversation.length - 1}>
                      {turn.role === 'user' ? <Message align="end" className="max-w-[88%]">
                        <MessageContent className="items-end">
                          <MessageHeader className="px-1">Вы</MessageHeader>
                          <Bubble variant="muted" align="end"><BubbleContent className="whitespace-pre-wrap border-white/[0.06] px-4 py-3 text-sm leading-6">{turn.text}</BubbleContent></Bubble>
                        </MessageContent>
                      </Message> : <Message>
                        <MessageAvatar className="size-8 rounded-xl border border-emerald-300/10 bg-emerald-300/[0.06] text-emerald-100"><Sparkles className="size-4" /></MessageAvatar>
                        <MessageContent>
                          <MessageHeader className="gap-2 px-0"><span className="text-foreground">CloStore AI</span><span aria-hidden="true" className="text-muted-foreground/60">·</span><span>{activeTask.model}</span></MessageHeader>
                          <Bubble variant="ghost"><BubbleContent className="whitespace-pre-wrap px-0 py-0 text-sm leading-7 text-foreground">{turn.text}</BubbleContent></Bubble>
                          {index === activeTask.conversation.length - 1 && <MessageFooter className="gap-2 px-0 text-[10px]">
                            <time dateTime={new Date(activeTask.createdAt).toISOString()}>{dateTime.format(new Date(activeTask.createdAt))}</time>
                            {activeTask.inputTokens != null && activeTask.outputTokens != null && <><span aria-hidden="true">·</span><span>{activeTask.inputTokens + activeTask.outputTokens} токенов</span></>}
                          </MessageFooter>}
                        </MessageContent>
                      </Message>}
                    </MessageScrollerItem>)}
                    {activeTask.pendingApprovals.length > 0 && <MessageScrollerItem messageId={`${activeTask.id}-approval`}>
                      <Card className="ml-10 max-w-2xl border-amber-300/20 bg-amber-300/[0.04] shadow-none">
                        <CardHeader className="gap-1.5">
                          <CardTitle className="flex items-center gap-2 text-sm"><ShieldCheck className="text-amber-200" />Нужно ваше подтверждение</CardTitle>
                          <p className="text-xs text-muted-foreground">{activeTask.pendingApprovals.some((approval) => approval.toolName === 'requestPinduoduoBrowserSearch') ? 'Подтверждение поставит запрос в очередь расширения. Затем откройте расширение и выполните поиск вручную.' : 'Проверьте детали: агент не применит изменения без вашего решения.'}</p>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                          {activeTask.pendingApprovals.map((approval) => <div key={approval.approvalId} className="rounded-lg border border-white/[0.08] bg-background/50 p-3">
                            <p className="text-sm font-medium">{approvalTitle(approval.toolName)}</p>
                            {approval.reason && <p className="mt-1 text-xs text-muted-foreground">{approval.reason}</p>}
                            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">{approvalDetails(approval).map(([label, value]) => <div key={label} className="contents"><dt className="text-muted-foreground">{label}</dt><dd className="break-words text-right">{value}</dd></div>)}</dl>
                          </div>)}
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" disabled={pending} onClick={() => decideApprovals(true)}><Check data-icon="inline-start" />{pending ? 'Выполняю…' : activeTask.pendingApprovals.some((approval) => approval.toolName === 'requestPinduoduoBrowserSearch') ? 'Подтвердить поиск' : 'Подтвердить изменения'}</Button>
                            <Button type="button" variant="outline" disabled={pending} onClick={() => decideApprovals(false)}><X data-icon="inline-start" />Отклонить</Button>
                            <Button type="button" variant="ghost" disabled={pending} onClick={cancelPendingTask}>Отменить задачу</Button>
                          </div>
                        </CardContent>
                      </Card>
                    </MessageScrollerItem>}
                    {activeTask.browserCommand && (activeTask.status === 'awaiting_browser' || activeTask.status === 'browser_running') && <MessageScrollerItem messageId={`${activeTask.id}-browser-command`}>
                      <Card className="ml-10 max-w-2xl border-violet-300/20 bg-violet-300/[0.04] shadow-none">
                        <CardHeader className="gap-1.5">
                          <CardTitle className="flex items-center gap-2 text-sm"><Search className="text-violet-200" />Поиск в браузере</CardTitle>
                          <p className="text-xs text-muted-foreground">Команда уже в очереди. Если постоянное разрешение включено, подключённое расширение выполнит её автоматически.</p>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-3">
                          <div className="rounded-lg border border-white/[0.08] bg-background/50 p-3">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{activeTask.browserCommand.mode === 'photo' ? 'Тип поиска' : 'Поисковый запрос'}</p>
                            <p className="mt-1 break-words text-sm">{activeTask.browserCommand.mode === 'photo' ? 'Визуальный поиск по фото' : activeTask.browserCommand.query}</p>
                          </div>
                          <p className="text-xs leading-5 text-muted-foreground">{activeTask.browserCommand.mode === 'photo'
                            ? 'Расширение автоматически загрузит фото в фоновую вкладку Pinduoduo и передаст видимые карточки агенту. При включённом разрешении от вас не требуется действий на сайте.'
                            : 'При включённом разрешении расширение само откроет фоновую вкладку и вернёт видимые карточки. CAPTCHA и страницы проверки останавливают поиск.'}</p>
                          <Button type="button" variant="outline" className="self-start" disabled={pending} onClick={cancelPendingTask}>Отменить задачу</Button>
                        </CardContent>
                      </Card>
                    </MessageScrollerItem>}
                    {pending && <MessageScrollerItem messageId="agent-pending"><Marker role="status" className="text-muted-foreground"><MarkerIcon><LoaderCircle className="animate-spin" /></MarkerIcon><MarkerContent>Агент анализирует задачу и данные магазина…</MarkerContent></Marker></MessageScrollerItem>}
                    {error && <MessageScrollerItem messageId="agent-error"><Marker role="alert" className="text-destructive"><MarkerIcon><X /></MarkerIcon><MarkerContent>{error}</MarkerContent></Marker></MessageScrollerItem>}
                  </MessageScrollerContent>
                </MessageScrollerViewport>
                <MessageScrollerButton direction="end" className="rounded-full shadow-lg" />
              </MessageScroller>
            </MessageScrollerProvider> : <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-4 sm:p-7">
              <Empty className="w-full max-w-2xl border-0 py-2 sm:py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon" className="hidden size-12 rounded-2xl border border-emerald-300/10 bg-emerald-300/[0.06] text-emerald-100 sm:flex"><Sparkles className="size-5" /></EmptyMedia>
                  <EmptyTitle className="text-lg sm:text-xl">С чего начнём?</EmptyTitle>
                  <EmptyDescription className="hidden sm:block">Поставьте задачу обычным языком. Агент поможет разобраться в данных магазина и подготовит следующий шаг.</EmptyDescription>
                </EmptyHeader>
                <EmptyContent className="mt-3 hidden w-full max-w-2xl grid-cols-1 gap-2 sm:grid sm:grid-cols-2">
                  {suggestions.map((item) => <Button key={item} type="button" variant="outline" size="sm" disabled={pending} className="h-auto min-h-11 justify-between gap-3 whitespace-normal px-3 py-2.5 text-left leading-5" onClick={() => chooseSuggestion(item)}><span className="min-w-0 flex-1">{item}</span><ArrowRight data-icon="inline-end" /></Button>)}
                </EmptyContent>
              </Empty>
              {pending && <Marker role="status" className="text-muted-foreground"><MarkerIcon><LoaderCircle className="animate-spin" /></MarkerIcon><MarkerContent>Агент анализирует задачу и данные магазина…</MarkerContent></Marker>}
              {error && <Marker role="alert" className="text-destructive"><MarkerIcon><X /></MarkerIcon><MarkerContent>{error}</MarkerContent></Marker>}
            </div>}

            <form onSubmit={submitTask} className="border-t border-white/[0.07] bg-background/20 p-4 sm:p-5">
              <Field>
                <FieldLabel htmlFor="agent-task" className="sr-only">Текст задачи</FieldLabel>
                <Textarea ref={composerRef} id="agent-task" aria-describedby="agent-composer-hint" maxLength={4000} disabled={pending} value={task} onChange={(event) => setTask(event.target.value)} onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                    event.preventDefault()
                    event.currentTarget.form?.requestSubmit()
                  }
                }} placeholder={activeTask?.status === 'completed' ? 'Уточните задачу — контекст диалога сохранится' : 'Например: покажи заказы в пути и выдели те, где нужна проверка'} className="min-h-20 resize-y border-0 bg-transparent px-1 py-2 shadow-none focus-visible:ring-0" />
              </Field>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="shrink-0">До 4 000 символов</span>
                  <span id="agent-composer-hint" className="sr-only sm:not-sr-only sm:truncate">{activeTask?.status === 'completed' ? 'Сообщение продолжит этот диалог; «Новая задача» сбросит контекст.' : 'Изменения — только после подтверждения'}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <kbd className="hidden rounded-md border border-white/[0.08] bg-white/[0.025] px-2 py-1 text-[10px] text-muted-foreground sm:inline-flex">Ctrl / ⌘ Enter</kbd>
                  <span className="text-[10px] tabular-nums text-muted-foreground">{task.length.toLocaleString('ru-RU')} / 4 000</span>
                  <Button type="submit" disabled={!task.trim() || pending}>
                    {pending ? <><LoaderCircle data-icon="inline-start" className="animate-spin" />Отправляем…</> : <><Send data-icon="inline-start" />Отправить</>}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>

        <aside className="flex flex-col gap-4 xl:sticky xl:top-24">
          <ProductPhotoPreparation products={products} templates={templates} onNavigate={onNavigate} />
          <Card className="border-white/[0.07] bg-card/80 shadow-none">
            <CardHeader className="gap-3 pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <History className="shrink-0 text-muted-foreground" />
                  <div className="min-w-0"><CardTitle>История задач</CardTitle><p className="mt-1 text-xs text-muted-foreground">Последние 20 запусков</p></div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button type="button" variant="ghost" size="icon-sm" disabled={pending || refreshing} onClick={refreshAgentTasks} aria-label="Обновить историю задач">
                    <RefreshCw className={refreshing ? 'animate-spin' : ''} />
                  </Button>
                  <Badge variant="secondary" className="tabular-nums">{tasks.length}</Badge>
                </div>
              </div>
              <div className="relative">
                <Search aria-hidden="true" className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
                <Input aria-label="Поиск по истории задач" value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Найти задачу" className="h-9 border-white/[0.08] bg-white/[0.025] pl-9 text-xs" />
              </div>
            </CardHeader>
            <CardContent className="flex max-h-[48vh] flex-col gap-1.5 overflow-y-auto px-3 pb-3">
              {filteredTasks.length ? filteredTasks.map((item) => {
                const selected = selectedTaskId === item.id
                return <button key={item.id} type="button" aria-pressed={selected} onClick={() => { setSelectedTaskId(item.id); setError('') }} className={`w-full rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? 'border-white/15 bg-white/[0.06]' : 'border-transparent hover:border-white/[0.07] hover:bg-white/[0.03]'}`}>
                  <span className="block truncate text-xs font-medium leading-5">{item.prompt}</span>
                  <span className="mt-2 flex items-center justify-between gap-2">
                    <Badge variant="outline" className={`max-w-full truncate text-[10px] ${agentTaskStatusClass(item.status)}`}>{agentTaskStatusLabel(item.status)}</Badge>
                    <time dateTime={new Date(item.createdAt).toISOString()} className="shrink-0 text-[10px] text-muted-foreground">{shortDate.format(new Date(item.createdAt))}</time>
                  </span>
                </button>
              }) : <p className="px-3 py-8 text-center text-xs leading-5 text-muted-foreground">{tasks.length ? 'Задач по этому запросу не найдено.' : 'История появится посл�� первого запуска.'}</p>}
            </CardContent>
          </Card>

          <Card className="border-white/[0.07] bg-card/80 shadow-none">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-300/[0.06] text-emerald-100"><ShieldCheck /></span>
                <div><CardTitle>Контекст и доступ</CardTitle><p className="mt-1 text-xs text-muted-foreground">Ограниченные права</p></div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-xs leading-5 text-muted-foreground">
              <div>
                <p className="font-medium text-foreground">Доступно агенту</p>
                <div className="mt-2 flex flex-wrap gap-1.5"><Badge variant="secondary"><Package data-icon="inline-start" />Каталог</Badge><Badge variant="secondary"><Truck data-icon="inline-start" />Заказы</Badge><Badge variant="secondary"><Wallet data-icon="inline-start" />Финансы</Badge><Badge variant="secondary"><Search data-icon="inline-start" />Pinduoduo через браузер</Badge></div>
              </div>
              <FieldSet className="gap-2 rounded-lg border border-white/[0.07] bg-background/40 p-3">
                <FieldLegend variant="label">Постоянное разрешение</FieldLegend>
                <Field>
                  <label htmlFor="agent-pinduoduo-search" className="flex cursor-pointer items-start gap-2.5 text-foreground">
                    <input
                      id="agent-pinduoduo-search"
                      type="checkbox"
                      checked={searchEnabled}
                      disabled={searchPermissionPending}
                      onChange={(event) => changeSearchPermission(event.target.checked)}
                      aria-describedby="agent-pinduoduo-search-description"
                      className="mt-0.5 size-4 shrink-0 accent-primary"
                    />
                    <span className="text-xs font-medium leading-5">Разрешить агенту искать на Pinduoduo без повторного подтверждения</span>
                  </label>
                  <FieldDescription id="agent-pinduoduo-search-description" className="mt-1 pl-[26px] text-[11px] leading-5">
                    По запросу в чате расширение откроет фоновую вкладку и вернёт видимые карточки. CAPTCHA остановит поиск. Покупки, публикации и изменения каталога по-прежнему требуют отдельного подтверждения.
                  </FieldDescription>
                </Field>
                {searchEnabled && <div className="flex flex-col gap-2">
                  {!searchToken && <Button type="button" size="sm" variant="outline" disabled={searchPermissionPending} onClick={revealSearchToken}>
                    {searchPermissionPending ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : null}Получить токен расширения
                  </Button>}
                  {searchToken && <>
                    <Textarea aria-label="Токен постоянного поиска для расширения" value={searchToken} readOnly rows={3} className="resize-none break-all font-mono text-[10px]" />
                    <Button type="button" size="sm" variant="outline" onClick={copySearchToken}>
                      <Copy data-icon="inline-start" />{searchTokenCopied ? 'Скопировано' : 'Скопировать токен'}
                    </Button>
                  </>}
                  <p className="text-[10px] leading-4 text-muted-foreground">В popup расширения укажите адрес Clostore и вставьте токен. При первом подключении подтвердите доступ к сайту Clostore и Pinduoduo. Токен действует год и сразу отзывается при выключении разрешения. После повторного включения подключите расширение с новым токеном.</p>
                </div>}
                {searchPermissionMessage && <p role="status" aria-live="polite" className="text-[11px] leading-5 text-muted-foreground">{searchPermissionMessage}</p>}
              </FieldSet>
              <Separator className="bg-white/[0.06]" />
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-200" />
                <div><p className="font-medium text-foreground">Изменения под контролем</p><p className="mt-1">Создание и редактирование карточек, обновление статусов и расходы — только после вашего подтверждения.</p></div>
              </div>
              <p>Контакты покупателей не передаются. Постоянное разрешение распространяется только на поиск в Pinduoduo и отзывается этим переключателем.</p>
            </CardContent>
          </Card>
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
        setNotice('Запрос сохранён. Откройте поиск Pinduoduo выше и считайте видимые карточки браузерным расширением.')
      } catch {
        setNotice('Не удалось сохранить запрос. Проверьте обязательные поля, диапазон цены и URL своего источника.')
      }
    })
  }

  return (
    <div className="space-y-5">
      <SectionHeading title="Поиск товаров" description="Задайте запрос или приложите фото; расширение может автоматически искать и возвращать видимые карточки Pinduoduo." action={<Button variant="outline" onClick={() => onNavigate('settings')}><Settings2 data-icon="inline-start" /> Источники</Button>} />
      <div className="rounded-lg border border-sky-400/15 bg-sky-400/[0.04] p-3 text-xs leading-5 text-sky-100/75">Расширение использует существующую сессию Chrome и работает в фоновой вкладке. Пароль и cookies не читаются; при CAPTCHA или блокировке поиск останавливается.</div>
      <PinduoduoSearchPanel onSearchStarted={() => onNavigate('agent')} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Параметры поиска</CardTitle><p className="text-xs text-muted-foreground">Точные условия помогут сократить лишние результаты</p></CardHeader>
          <CardContent><form onSubmit={requestSearch} className="space-y-5">
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <Field className="md:col-span-2"><FieldLabel htmlFor="search-query">Что ��щем</FieldLabel><Input id="search-query" name="query" required maxLength={240} placeholder="Например, мужская куртка в стиле archive" /></Field>
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
          <Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Доступ к источникам</CardTitle></CardHeader><CardContent className="text-xs leading-5 text-muted-foreground">Поиск открывается в официальном Pinduoduo, а импорт использует только скопированные вами данные. Для Grailed и собственных источников сохраняйте запрос и открывайте сайт вручную.</CardContent></Card>
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
    {items.length === 0 ? <Card className="border-white/[0.07] bg-card/80 shadow-none"><CardContent className="py-16 text-center"><CheckCircle2 className="mx-auto text-muted-foreground" /><p className="mt-3 font-medium">Очере��ь разобрана</p><p className="mt-1 text-sm text-muted-foreground">Решения по {resolved.length} демо-карточкам не сохраняются после обновления страницы.</p></CardContent></Card> : <div className="grid gap-4 lg:grid-cols-2">{items.map((product) => <ReviewProductCard key={product.id} product={product} onResolve={resolve} />)}</div>}
  </div>
}

function ReviewProductCard({ product, onResolve }: { product: DemoProduct; onResolve: (id: string, action: 'approved' | 'rejected') => void }) {
  const cost = Math.round(product.purchaseCny * 12.7 + 1350)
  const sale = Math.round(cost * 1.75)
  return <Card className="overflow-hidden border-white/[0.07] bg-card/80 shadow-none"><div className="flex gap-4 border-b border-white/[0.06] p-4 sm:p-5"><div className="flex size-20 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-[#202225] text-muted-foreground"><Shirt /></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><h2 className="font-medium">{product.name}</h2><p className="mt-1 text-xs text-muted-foreground">{product.category} · источник: {product.source}</p></div><Badge variant="outline" className="shrink-0 border-white/10">{product.id}</Badge></div><p className="mt-3 text-xs text-muted-foreground">Поставщик: {product.supplier} · Размеры {product.sizes.join(', ')}</p></div></div><CardContent className="space-y-4 p-4 sm:p-5"><div className="grid grid-cols-3 gap-2"><Metric label="Закупка" value={`${product.purchaseCny} ¥`} /><Metric label="Себестоимость" value={formatRub(cost)} /><Metric label="Цена продажи" value={formatRub(sale)} /></div><div className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-xs leading-5 text-muted-foreground"><Sparkles className="mt-0.5 shrink-0" />Оценка соответствия и цены здесь не подтверждены источником. Проверьте характеристики и поставщика вручную.</div><div className="flex flex-wrap justify-between gap-2"><Button variant="outline" size="sm" onClick={() => onResolve(product.id, 'rejected')}><X data-icon="inline-start" /> Отклонить</Button><div className="flex gap-2"><Button variant="secondary" size="sm"><ExternalLink data-icon="inline-start" /> Источни��</Button><Button size="sm" onClick={() => onResolve(product.id, 'approved')}><Check data-icon="inline-start" /> Одобрить</Button></div></div></CardContent></Card>
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
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-lg border-white/10 bg-[#1b1d20]"><DialogHeader><DialogTitle>Новый заказ</DialogTitle><DialogDescription>Заполните основные поля. До подключения базы заказ останется только в форме.</DialogDescription></DialogHeader><form onSubmit={saveDraft} className="space-y-4"><FieldGroup className="grid gap-3 sm:grid-cols-2"><Field><FieldLabel htmlFor="order-customer">Покупатель</FieldLabel><Input id="order-customer" required placeholder="Имя клиента" /></Field><Field><FieldLabel htmlFor="order-contact">Контакт</FieldLabel><Input id="order-contact" required placeholder="Телефон ил�� Telegram" /></Field><Field className="sm:col-span-2"><FieldLabel htmlFor="order-product">Товар</FieldLabel><Input id="order-product" required placeholder="Название товара" /></Field><Field><FieldLabel htmlFor="order-size">Размер</FieldLabel><Input id="order-size" placeholder="M" /></Field><Field><FieldLabel htmlFor="order-sale">Цена продажи, ₽</FieldLabel><Input id="order-sale" required type="number" min="1" placeholder="12900" /></Field></FieldGroup><DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button><Button type="submit">Проверить форму</Button></DialogFooter></form></DialogContent></Dialog>
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
    { key: 'brokerFeePercent', label: 'Комиссия посредника, %', step: '0.1' },
    { key: 'chinaShippingRub', label: 'Доставка по Китаю, ₽', step: '0.01' },
    { key: 'internationalShippingRub', label: 'Международная доставка, ₽', step: '0.01' },
    { key: 'extraCostsRub', label: 'Дополнительные расходы, ₽', step: '0.01' },
    { key: 'otherFeesRub', label: 'Прочие комиссии, ₽', step: '0.01' },
    { key: 'salePriceRub', label: 'Цена продажи, ₽', step: '0.01' },
  ]

  return <div className="flex flex-col gap-5"><SectionHeading title="Ценообразование" description="Рассчитайте и сохраните себестоимость и цену реального товара." /><p className="text-sm text-muted-foreground">Курс CNY вводится вручную и не обновляется автоматически. Доставка и комиссии в расчёте не сохраняются отдельно.</p><div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]"><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Параметры расчёта</CardTitle><p className="text-xs text-muted-foreground">Выберите товар или внесите значения вручную.</p></CardHeader><CardContent><FieldGroup className="grid gap-4 sm:grid-cols-2"><Field className="sm:col-span-2"><FieldLabel htmlFor="pricing-product">Карточка товара</FieldLabel><select id="pricing-product" value={selectedId} onChange={(event) => selectProduct(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="">Расчёт без сохранения в товар</option>{data.products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>{fields.map(({ key, label, step }) => <Field key={key}><FieldLabel htmlFor={`pricing-${key}`}>{label}</FieldLabel><Input id={`pricing-${key}`} type="number" min="0" step={step ?? '0.01'} value={values[key]} onChange={(event) => update(key, event.target.value)} /></Field>)}</FieldGroup></CardContent></Card><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Итог</CardTitle></CardHeader><CardContent className="flex flex-col gap-3"><ResultRow label="Закупка в рублях" value={formatRub(result.purchaseRub)} /><ResultRow label="Комиссия посредника" value={formatRub(result.brokerFeeRub)} /><Separator className="bg-white/10" /><ResultRow label="Себестоимость" value={formatRub(result.landedCostRub)} strong /><ResultRow label="Цена продажи" value={formatRub(values.salePriceRub)} /><div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Прибыль</span><span className={`font-semibold tabular-nums ${result.profitRub >= 0 ? 'text-emerald-200' : 'text-rose-200'}`}>{formatRub(result.profitRub)}</span></div><div className="mt-2 flex items-center justify-between text-xs text-muted-foreground"><span>Маржа {result.marginPercent.toFixed(1)}%</span><span>Наценка {result.markupPercent.toFixed(1)}%</span></div></div>{notice && <p role="status" className="text-sm text-emerald-200">{notice}</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="button" disabled={!product || values.cnyToRub <= 0 || pending} onClick={savePricing}>{pending ? 'Сохраняю…' : 'Сохранить в товар'}</Button><p className="text-xs leading-5 text-muted-foreground">Для ручного расчёта укажите фактический курс. Сохранение об��овляет закупку в CNY, себестоимость в RUB и цену продажи.</p></CardContent></Card></div></div>
}

function ResultRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className="flex items-center justify-between gap-3 text-sm"><span className={strong ? 'font-medium' : 'text-muted-foreground'}>{label}</span><span className={`tabular-nums ${strong ? 'font-semibold' : ''}`}>{value}</span></div> }

function publicationStatusLabel(status: string) {
  if (status === 'published') return 'Опубликована'
  if (status === 'publishing') return 'Отправляется'
  if (status === 'failed') return 'Ошибк�� отправки'
  return 'Черновик'
}

function PublicationView({ data }: { data: WorkspaceData }) {
  const router = useRouter()
  const [draftId, setDraftId] = useState('')
  const [productId, setProductId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [images, setImages] = useState('')
  const [pending, startTransition] = useTransition()
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const imageUrls = images.split(/\r?\n/).map((url) => url.trim()).filter(Boolean)
  const selectedProduct = data.products.find((product) => product.id === productId)
  const publicationText = [title.trim(), body.trim(), 'Контакт: @clostorelink'].filter(Boolean).join('\n\n')

  function selectProduct(id: string) {
    setProductId(id)
    const product = data.products.find((item) => item.id === id)
    if (!product) {
      setDraftId('')
      setTitle('')
      setBody('')
      setImages('')
      setNotice('')
      setError('')
      return
    }
    setDraftId('')
    setTitle(product.name)
    setBody([product.description, product.sizes.length ? `Размеры: ${product.sizes.join(', ')}` : '', product.salePriceRub > 0 ? `Цена: ${formatRub(product.salePriceRub)}` : ''].filter(Boolean).join('\n'))
    setImages(product.images.join('\n'))
    setError('')
  }

  function editDraft(publication: WorkspacePublication) {
    if (publication.status !== 'draft' && publication.status !== 'failed') return
    setDraftId(publication.id)
    setProductId(publication.productId ?? '')
    setTitle(publication.title)
    setBody(publication.body)
    setImages(publication.imageUrls.join('\n'))
    setNotice('Черновик загружен в редактор.')
    setError('')
  }

  function saveDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice('')
    setError('')
    startTransition(async () => {
      try {
        const result = await saveTelegramPublication({
          id: draftId || undefined,
          productId: productId || null,
          title,
          body,
          imageUrls,
        })
        if (!result.ok) {
          setError(result.message)
          return
        }
        setDraftId(result.id)
        setNotice('Черновик сохранён в Neon.')
        router.refresh()
      } catch {
        setError('Не удалось сохранить черновик. Проверьте заголовок, длину текста и ссылки на фото.')
      }
    })
  }

  function publishDraft() {
    if (!draftId) {
      setError('Сначала сохраните черновик.')
      return
    }
    if (!window.confirm('Отправить эту публикацию в канал @clostorelink?')) return
    setNotice('')
    setError('')
    startTransition(async () => {
      try {
        const result = await publishTelegramPublication(draftId)
        if (!result.ok) {
          setError(result.message)
          router.refresh()
          return
        }
        setNotice(result.message)
        router.refresh()
      } catch {
        setError('Не удалось завершить отправку. Проверьте историю публикаций перед повторной попыткой.')
        router.refresh()
      }
    })
  }

  return <div className="flex flex-col gap-5">
    <SectionHeading title="Telegram" description="Сохраняйте черновики, проверяйте фото и отправляйте публикации в канал." action={<Badge variant="outline" className="w-fit border-emerald-300/20 text-emerald-100"><span className="mr-2 size-1.5 rounded-full bg-emerald-300" />@clostorelink</Badge>} />
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="border-white/[0.07] bg-card/80 shadow-none">
        <CardHeader><CardTitle>Редактор публикации</CardTitle><p className="text-xs text-muted-foreground">Черновик сохраняется в Neon; отправка выполняется только после отдельного подтверждения.</p></CardHeader>
        <CardContent>
          <PublicationTemplateTools
            initialTemplates={data.publicationTemplates}
            products={data.products}
            title={title}
            body={body}
            imageUrls={imageUrls}
            onDraftCreated={(publication) => {
              setDraftId(publication.id)
              setProductId(publication.productId)
              setTitle(publication.title)
              setBody(publication.body)
              setImages(publication.imageUrls.join('\n'))
              setNotice('Черновик создан из шаблона и сохранён в Neon.')
              setError('')
              router.refresh()
            }}
          />
          <form onSubmit={saveDraft} className="space-y-4">
            <FieldGroup>
              <Field><FieldLabel htmlFor="publication-product">Заполнить из каталога</FieldLabel><select id="publication-product" value={productId} onChange={(event) => selectProduct(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="">Новая публикация</option>{data.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></Field>
              <Field><FieldLabel htmlFor="listing-title">Заголовок</FieldLabel><Input id="listing-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required placeholder="Название модели" /></Field>
              <Field><FieldLabel htmlFor="listing-text">Описание</FieldLabel><Textarea id="listing-text" value={body} onChange={(event) => setBody(event.target.value)} maxLength={3800} className="min-h-36 resize-y" placeholder="Описание товара, материалы, размеры и условия заказа" /><p className="text-xs text-muted-foreground">До 1000 символов с фото или до 4000 без фото.</p></Field>
              <ImageUploadField id="listing-images" label="Фото для Telegram" value={imageUrls} onChange={(urls) => setImages(urls.join('\n'))} />
            </FieldGroup>
            <div className="flex flex-wrap gap-2"><Button type="submit" variant="secondary" disabled={pending}>{pending ? 'Сохраняю…' : draftId ? 'Сохранить черновик' : 'Сохранить черновик'}</Button><Button type="button" onClick={publishDraft} disabled={pending || !draftId}>{pending ? 'Отправляю…' : 'Опубликовать'}</Button></div>
          </form>
          {notice && <p role="status" className="mt-4 text-sm text-emerald-200">{notice}</p>}
          {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
          <section aria-labelledby="telegram-preview-title" className="mt-5 rounded-lg border border-white/[0.07] bg-white/[0.025] p-4">
            <h3 id="telegram-preview-title" className="text-sm font-medium">Предпросмотр сообщения</h3>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{publicationText || 'Текст публикации появится здесь.'}</p>
            {selectedProduct && <p className="mt-2 text-xs text-muted-foreground">Цена продажи из каталога: {selectedProduct.salePriceRub ? formatRub(selectedProduct.salePriceRub) : 'не указана'}</p>}
          </section>
        </CardContent>
      </Card>
      <Card className="border-white/[0.07] bg-card/80 shadow-none">
        <CardHeader><CardTitle>История публикаций</CardTitle><p className="text-xs text-muted-foreground">Статусы и ошибки сохраняются в Neon.</p></CardHeader>
        <CardContent>{data.publications.length ? <ol className="flex flex-col divide-y divide-white/[0.06]">{data.publications.map((publication) => <li key={publication.id} className="py-3 first:pt-0 last:pb-0"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{publication.title || 'Без заголовка'}</p><p className="mt-1 text-xs text-muted-foreground">{publicationStatusLabel(publication.status)} · {new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(publication.publishedAt ?? publication.createdAt))}</p></div>{(publication.status === 'draft' || publication.status === 'failed') && <Button type="button" size="sm" variant="ghost" onClick={() => editDraft(publication)}>Изменить</Button>}</div>{publication.error && <p className="mt-2 text-xs text-destructive">{publication.error}</p>}</li>)}</ol> : <p className="text-sm text-muted-foreground">Сохранённых публикаций пока нет.</p>}</CardContent>
      </Card>
    </div>
  </div>
}

function EditorView() {
  return <div className="space-y-5"><SectionHeading title="Редактор карточек" description="Подг��товьте отдельные версии описания для каналов продаж." /><DemoNotice /><div className="grid gap-4 xl:grid-cols-2">{(['Telegram'] as const).map((channel) => <Card key={channel} className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>{channel}</CardTitle><p className="text-xs text-muted-foreground">Черновик карточки · не опубликован</p></CardHeader><CardContent className="space-y-3"><Input placeholder="Заголовок товара" /><Textarea className="min-h-36" placeholder="Описание, размеры, материал, у��ловия заказа" /><div className="flex justify-between"><Button variant="outline" size="sm"><ImagePlus data-icon="inline-start" /> Фотографии</Button><Button size="sm" variant="secondary">Сохранить черновик</Button></div></CardContent></Card>)}</div></div>
}

function AnalyticsView() {
  const revenue = demoOrders.reduce((total, order) => total + order.salePrice, 0)
  const profit = demoOrders.reduce((total, order) => total + order.salePrice - order.cost, 0)
  return <div className="space-y-5"><SectionHeading title="Аналитика" description="Показатели рассчитываются на основе заказов и продаж." action={<Button variant="outline">Период: демо</Button>} /><DemoNotice /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><SmallStat icon={Wallet} label="Выручка" value={formatRub(revenue)} /><SmallStat icon={ArrowRight} label="Валовая прибыль" value={formatRub(profit)} /><SmallStat icon={Package} label="Количество заказов" value={String(demoOrders.length)} /><SmallStat icon={Clock3} label="Средний чек" value={formatRub(revenue / Math.max(demoOrders.length, 1))} /></div><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Нет подключённой истории продаж</CardTitle><p className="text-xs text-muted-foreground">Графики по месяцам появятся после сохранения реальных заказов.</p></CardHeader><CardContent><div className="flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed border-white/10 text-center"><FileSpreadsheet className="text-muted-foreground" /><p className="mt-3 text-sm font-medium">Реальные отчёты пока недоступны</p><p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">Сводные карточки выше вычислены только по четырём демонстрационным заказам. Конверсия и просмотры не подставляются без данных.</p></div></CardContent></Card></div>
}

function AiUsageView({ tasks, usage }: { tasks: AgentTaskPreview[]; usage: AgentUsageSummary }) {
  const totalTokens = usage.inputTokens + usage.outputTokens
  return <div className="flex flex-col gap-5"><SectionHeading title="Расходы на AI" description="Фактические счётчики DeepSeek по всем сохранённым задачам." /><div className="grid gap-3 sm:grid-cols-3"><SmallStat icon={MessageSquareText} label="Задач всего" value={String(usage.taskCount)} /><SmallStat icon={ArrowRight} label="Входящие токены" value={usage.inputTokens.toLocaleString('ru-RU')} /><SmallStat icon={Sparkles} label="Исходящие токены" value={usage.outputTokens.toLocaleString('ru-RU')} /></div><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>DeepSeek API</CardTitle><p className="text-xs text-muted-foreground">Общие счётчики агрегированы из Neon; ниже показаны последние {tasks.length} задач.</p></CardHeader><CardContent className="flex flex-col gap-4"><div className="rounded-lg border border-white/[0.07] p-4"><div className="flex justify-between text-xs"><span className="text-muted-foreground">Токены за весь период</span><span className="tabular-nums">{totalTokens.toLocaleString('ru-RU')}</span></div><p className="mt-3 text-xs leading-5 text-muted-foreground">Стоимость и бюджет не показываются: приложение не получает подтверждённый тариф и billing-данные DeepSeek, поэтому не подставляет оценочные суммы.</p></div>{tasks.length ? <div className="flex flex-col divide-y divide-white/[0.06]">{tasks.map((task) => <div key={task.id} className="flex flex-col gap-1 py-3 first:pt-0 sm:flex-row sm:items-center sm:gap-3"><span className="min-w-0 flex-1 truncate text-sm">{task.prompt}</span><span className="text-xs text-muted-foreground">{agentTaskStatusLabel(task.status)}</span><span className="whitespace-nowrap font-mono text-[10px] text-muted-foreground">{task.inputTokens ?? '—'} / {task.outputTokens ?? '—'} токенов</span></div>)}</div> : <p className="text-sm text-muted-foreground">После первого запроса появятся реальные счётчики токенов.</p>}</CardContent></Card></div>
}

function SettingsView({ integrations, onNavigate }: { integrations: IntegrationStatus[]; onNavigate: (section: SectionId) => void }) {
  const [testResults, setTestResults] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  function testConnection(provider: 'telegram') {
    if (pending) return
    startTransition(async () => {
      const result = await testTelegramConnection()
      setTestResults((current) => ({ ...current, [provider]: result.message }))
    })
  }

  return <div className="space-y-5"><SectionHeading title="Настро��ки" description="Провайдеры, каналы продаж и правила работы приложения." /><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Подключения</CardTitle><p className="text-xs text-muted-foreground">Секреты не отображаются в интерфейсе. Добавляйте переменные в Vars проекта; статусы показывают только наличие конфигурации, не успешность API-проверки.</p></CardHeader><CardContent className="divide-y divide-white/[0.06]">{integrations.map((item) => <div key={item.name} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center"><span className={`size-2 shrink-0 rounded-full ${item.configured ? 'bg-emerald-300' : 'bg-white/20'}`} /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>{item.requiredVariables.length > 0 && <p className="mt-1 break-words font-mono text-[10px] text-muted-foreground/80">Переменные: {item.requiredVariables.join(', ')}</p>}</div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={item.configured ? 'w-fit border-emerald-300/20 text-emerald-100' : 'w-fit border-white/10 text-muted-foreground'}>{item.state}</Badge>{item.testProvider && <Button type="button" size="sm" variant="outline" disabled={!item.configured || pending} onClick={() => testConnection(item.testProvider!)}>{pending ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : null}Проверить</Button>}</div>{item.testProvider && testResults[item.testProvider] && <p role="status" className="mt-2 text-xs text-muted-foreground">{testResults[item.testProvider]}</p>}</div>)}</CardContent></Card><div className="grid gap-4 xl:grid-cols-2"><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Ценообразование</CardTitle></CardHeader><CardContent className="space-y-3"><ResultRow label="Основная валюта" value="RUB" /><ResultRow label="Дополнительная валюта" value="CNY" /><ResultRow label="Часовой пояс" value="Europe/Moscow" /><Button variant="outline" size="sm" onClick={() => onNavigate('pricing')}>Открыть ценообразование</Button></CardContent></Card><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardHeader><CardTitle>Безопасность</CardTitle></CardHeader><CardContent className="space-y-3 text-xs leading-5 text-muted-foreground"><p>Вход и регистрация в приложении отключены. Данные доступны на странице без проверки пользователя.</p><p>Перед публикацией ограничьте доступ к деплою средствами Vercel: публичный адрес сам по себе не защищает данные.</p></CardContent></Card></div></div>
}

function PlaceholderView({ section, onNavigate }: Pick<WorkspaceViewsProps, 'section' | 'onNavigate'>) {
  const titles: Record<SectionId, [string, string]> = {
    dashboard: ['Обзор', 'Сводка по магазину и ближайшим задачам'], agent: ['AI-агент', 'Подготовьте задачу для агента'], search: ['Поиск товаров', 'Соберите критерии и источники'], review: ['Очередь проверки', 'Проверка карточек перед каталогом'], catalog: ['Каталог', 'Товары магазина'], editor: ['Редактор карточек', 'Подготовка описаний'], suppliers: ['Поставщики', 'Карточки продавцов'], orders: ['Заказы', 'Оплата, закупка и доставка'], telegram: ['Telegram', 'Канал публикаций'], pricing: ['Ценообразование', 'Себестоимость и цена продажи'], analytics: ['Аналитика', 'Показатели магазина'], 'ai-usage': ['Расходы на AI', 'Фактическое потребление'], settings: ['Настройки', 'Провайдеры и параметры'],
  }
  const [title, description] = titles[section]
  return <div className="space-y-5"><SectionHeading title={title} description={description} /><Card className="border-white/[0.07] bg-card/80 shadow-none"><CardContent className="flex min-h-72 flex-col items-center justify-center text-center"><span className="flex size-12 items-center justify-center rounded-xl bg-white/[0.04] text-muted-foreground"><LoaderCircle /></span><h2 className="mt-4 text-base font-medium">Раздел подготовлен</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Этот экран подключается к реальным данным по мере готовности backend-модулей.</p><Button className="mt-5" variant="outline" onClick={() => onNavigate('settings')}>Проверить интеграции <ArrowRight data-icon="inline-end" /></Button></CardContent></Card></div>
}

export function WorkspaceView({ section, onNavigate, data, agentTasks, agentUsage, agentSearchEnabled, integrations }: WorkspaceViewsProps) {
  switch (section) {
    case 'review': return <LiveReviewView data={data} />
    case 'catalog': return <LiveCatalogView data={data} />
    case 'orders': return <LiveOrdersView data={data} />
    case 'suppliers': return <LiveSuppliersView data={data} />
    case 'analytics': return <LiveAnalyticsView data={data} onNavigate={onNavigate} />
    case 'agent': return <AgentView initialTasks={agentTasks} products={data.products} templates={data.publicationTemplates} onNavigate={onNavigate} initialSearchEnabled={agentSearchEnabled} />
    case 'search': return <SearchView data={data} onNavigate={onNavigate} />
    case 'pricing': return <PricingView data={data} />
    case 'telegram': return <PublicationView data={data} />
    case 'editor': return <LiveEditorView data={data} />
    case 'ai-usage': return <AiUsageView tasks={agentTasks} usage={agentUsage} />
    case 'settings': return <SettingsView integrations={integrations} onNavigate={onNavigate} />
    default: return <PlaceholderView section={section} onNavigate={onNavigate} />
  }
}
