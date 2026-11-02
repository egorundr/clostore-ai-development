"use client"

import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Box,
  CircleAlert,
  Clock3,
  PackageCheck,
  Plus,
  Search,
  Sparkles,
  Store,
  Wallet,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { demoOrders, demoProducts, demoRevenueTrend } from './demo-data'
import type { SectionId } from './types'
import { formatRub } from '@/lib/pricing'

type DashboardViewProps = {
  onNavigate: (section: SectionId) => void
}

const chartConfig = {
  revenue: { label: 'Выручка', color: 'var(--chart-1)' },
  profit: { label: 'Прибыль', color: 'var(--chart-2)' },
}

function shortRub(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

export function DashboardView({ onNavigate }: DashboardViewProps) {
  const today = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Moscow',
  }).format(new Date())
  const revenue = demoOrders.reduce((total, order) => total + order.salePrice, 0)
  const profit = demoOrders.reduce((total, order) => total + order.salePrice - order.cost, 0)
  const averageCheck = demoOrders.length ? revenue / demoOrders.length : 0
  const activeOrders = demoOrders.filter((order) => order.status !== 'Завершён').length
  const reviewCount = demoProducts.filter((product) => product.status === 'На рассмотрении').length
  const publishedCount = demoProducts.filter((product) => product.listingStatus === 'Опубликован').length

  const metrics = [
    {
      label: 'Выручка',
      value: formatRub(revenue),
      icon: Wallet,
      note: 'Демо-заказы',
      trend: '+12,8%',
      positive: true,
    },
    {
      label: 'Прибыль',
      value: formatRub(profit),
      icon: Activity,
      note: 'После себестоимости',
      trend: '+8,4%',
      positive: true,
    },
    {
      label: 'Заказы',
      value: String(demoOrders.length),
      icon: Box,
      note: `${activeOrders} требуют контроля`,
      trend: 'Активные',
      positive: false,
    },
    {
      label: 'Средний чек',
      value: formatRub(averageCheck),
      icon: Store,
      note: 'На основе демо-заказов',
      trend: 'RUB',
      positive: false,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{today}</span>
            <Badge variant="outline" className="border-amber-500/25 bg-amber-500/10 text-amber-200">
              Демонстрационные данные
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Добрый день</h1>
          <p className="mt-1 text-sm text-muted-foreground">Сводка по магазину и ближайшим задачам</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => onNavigate('search')}>
            <Search data-icon="inline-start" /> Найти товар
          </Button>
          <Button onClick={() => onNavigate('orders')}>
            <Plus data-icon="inline-start" /> Новый заказ
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, icon: Icon, note, trend, positive }) => (
          <Card key={label} className="border-white/[0.07] bg-card/80 shadow-none">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{label}</span>
                <span className="flex size-8 items-center justify-center rounded-lg bg-white/[0.04] text-muted-foreground">
                  <Icon />
                </span>
              </div>
              <div className="mt-4 flex items-end justify-between gap-2">
                <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
                <span className={`mb-1 inline-flex items-center gap-1 text-xs ${positive ? 'text-emerald-300' : 'text-muted-foreground'}`}>
                  {positive ? <ArrowUpRight /> : null}{trend}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.85fr)]">
        <Card className="border-white/[0.07] bg-card/80 shadow-none">
          <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
            <div>
              <CardTitle>Динамика магазина</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Выручка и прибыль · данные-пример</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('analytics')}>
              Аналитика <ArrowRight data-icon="inline-end" />
            </Button>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="mb-4 flex flex-wrap gap-5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-chart-1" /> Выручка</span>
              <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-chart-2" /> Прибыль</span>
            </div>
            <ChartContainer config={chartConfig} className="h-[230px] w-full aspect-auto">
              <AreaChart data={demoRevenueTrend} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-revenue)" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-profit)" stopOpacity={0.14} />
                    <stop offset="95%" stopColor="var(--color-profit)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} tickMargin={10} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={shortRub} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} width={42} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatRub(Number(value))} />} />
                <Area type="monotone" dataKey="revenue" stroke="var(--color-revenue)" strokeWidth={2} fill="url(#revenueFill)" />
                <Area type="monotone" dataKey="profit" stroke="var(--color-profit)" strokeWidth={2} fill="url(#profitFill)" />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="border-white/[0.07] bg-card/80 shadow-none">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Нужно внимания</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Операционные сигналы</p>
            </div>
            <CircleAlert className="text-amber-200" />
          </CardHeader>
          <CardContent className="space-y-2">
            <button onClick={() => onNavigate('orders')} className="flex w-full items-start gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-left transition hover:bg-white/[0.05]">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-200"><Clock3 /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium">Не оформлен выкуп</span><span className="mt-1 block text-xs text-muted-foreground">Заказ CS-2048 ожидает закупки</span></span>
              <ArrowRight className="mt-1 text-muted-foreground" />
            </button>
            <button onClick={() => onNavigate('review')} className="flex w-full items-start gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-left transition hover:bg-white/[0.05]">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-white/[0.05] text-muted-foreground"><PackageCheck /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium">Товар на проверке</span><span className="mt-1 block text-xs text-muted-foreground">{reviewCount} карточка ждёт решения</span></span>
              <ArrowRight className="mt-1 text-muted-foreground" />
            </button>
            <div className="mt-3 rounded-lg border border-white/[0.06] p-3">
              <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Интеграции</span><span className="text-amber-200">2 требуют настройки</span></div>
              <div className="mt-2 flex gap-1.5"><span className="size-1.5 rounded-full bg-emerald-300" /><span className="size-1.5 rounded-full bg-emerald-300" /><span className="size-1.5 rounded-full bg-white/15" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <Card className="border-white/[0.07] bg-card/80 shadow-none">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div><CardTitle>Последние заказы</CardTitle><p className="mt-1 text-xs text-muted-foreground">{demoOrders.length} демонстрационные записи</p></div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('orders')}>Все заказы <ArrowRight data-icon="inline-end" /></Button>
          </CardHeader>
          <CardContent className="space-y-1">
            {demoOrders.slice(0, 3).map((order) => (
              <div key={order.id} className="flex flex-wrap items-center gap-3 border-t border-white/[0.05] py-3 first:border-0">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-xs font-medium text-muted-foreground">{order.id.slice(-2)}</div>
                <div className="min-w-[140px] flex-1"><p className="truncate text-sm font-medium">{order.product}</p><p className="mt-1 text-xs text-muted-foreground">{order.customer} · {order.createdAt}</p></div>
                <Badge variant="outline" className="border-white/10 text-muted-foreground">{order.status}</Badge>
                <span className="ml-auto text-sm font-medium tabular-nums">{formatRub(order.salePrice)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-white/[0.07] bg-card/80 shadow-none">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div><CardTitle>AI-агент</CardTitle><p className="mt-1 text-xs text-muted-foreground">Подготовка к подключению</p></div>
            <span className="size-2 rounded-full bg-white/20" />
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-4">
              <div className="flex size-9 items-center justify-center rounded-lg bg-white/[0.05] text-muted-foreground"><Sparkles /></div>
              <p className="mt-3 text-sm font-medium">Модель пока не подключена</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Задачи не запускаются автоматически. Настройте AI-провайдера, чтобы включить поиск и генерацию.</p>
              <Button className="mt-4 w-full" variant="outline" onClick={() => onNavigate('settings')}>Настроить интеграции <ArrowRight data-icon="inline-end" /></Button>
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground"><span>Объявления опубликованы</span><span className="text-foreground">{publishedCount}</span></div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground"><span>Средний чек</span><span className="text-foreground">{formatRub(averageCheck)}</span></div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground"><span>Потенциал прибыли</span><span className="inline-flex items-center gap-1 text-emerald-300"><ArrowUpRight /> {formatRub(profit)}</span></div>
          </CardContent>
        </Card>
      </div>
      <p className="flex items-center justify-center gap-2 pb-1 text-[11px] text-muted-foreground/70"><ArrowDownRight /> Все показатели на этой странице — демонстрационные и не сохранены в базе</p>
    </div>
  )
}
