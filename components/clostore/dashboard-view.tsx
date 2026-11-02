'use client'

import { Activity, ArrowRight, Box, CircleAlert, Clock3, PackageCheck, Plus, Search, Sparkles, Wallet } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { formatRub } from '@/lib/pricing'
import type { SectionId, WorkspaceData } from './types'

type DashboardViewProps = {
  data: WorkspaceData
  onNavigate: (section: SectionId) => void
}

const chartConfig = {
  revenue: { label: 'Выручка', color: 'var(--chart-1)' },
  profit: { label: 'Прибыль', color: 'var(--chart-2)' },
}

function shortRub(value: number) {
  return new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

export function DashboardView({ data, onNavigate }: DashboardViewProps) {
  const today = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Moscow',
  }).format(new Date())
  const profit = data.summary.revenue - data.summary.cost
  const averageCheck = data.summary.orderCount ? data.summary.revenue / data.summary.orderCount : 0
  const attentionOrder = data.orders.find((order) => order.status === 'Ожидает закупки')
  const metrics = [
    { label: 'Выручка', value: formatRub(data.summary.revenue), icon: Wallet, note: 'По сохранённым заказам' },
    { label: 'Прибыль', value: formatRub(profit), icon: Activity, note: 'Выручка минус себестоимость' },
    { label: 'Заказы', value: String(data.summary.orderCount), icon: Box, note: `${data.summary.activeOrderCount} требуют контроля` },
    { label: 'Средний чек', value: data.summary.orderCount ? formatRub(averageCheck) : '—', icon: Wallet, note: 'По всем сохранённым заказам' },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2"><span className="text-sm text-muted-foreground">{today}</span><Badge variant="outline" className="border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-100">Данные из Neon</Badge></div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Добрый день</h1>
          <p className="mt-1 text-sm text-muted-foreground">Сводка по сохранённым товарам и заказам</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => onNavigate('search')}><Search data-icon="inline-start" /> Поиск товаров</Button>
          <Button onClick={() => onNavigate('orders')}><Plus data-icon="inline-start" /> Новый заказ</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, icon: Icon, note }) => (
          <Card key={label} className="border-white/[0.07] bg-card/80 shadow-none">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{label}</span><span className="flex size-8 items-center justify-center rounded-lg bg-white/[0.04] text-muted-foreground"><Icon /></span></div>
              <p className="mt-4 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.85fr)]">
        <Card className="border-white/[0.07] bg-card/80 shadow-none">
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div><CardTitle>Динамика магазина</CardTitle><p className="mt-1 text-xs text-muted-foreground">Выручка и прибыль по сохранённым заказам · 6 месяцев</p></div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('analytics')}>Аналитика <ArrowRight data-icon="inline-end" /></Button>
          </CardHeader>
          <CardContent>
            {data.summary.orderCount ? <>
              <div className="mb-4 flex flex-wrap gap-5 text-xs text-muted-foreground"><span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-chart-1" />Выручка</span><span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-chart-2" />Прибыль</span></div>
              <ChartContainer config={chartConfig} className="h-[230px] w-full aspect-auto">
                <AreaChart data={data.revenueTrend} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <defs><linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-revenue)" stopOpacity={0.22} /><stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0} /></linearGradient><linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-profit)" stopOpacity={0.14} /><stop offset="95%" stopColor="var(--color-profit)" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} tickMargin={10} />
                  <YAxis axisLine={false} tickLine={false} tickFormatter={shortRub} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} width={42} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatRub(Number(value))} />} />
                  <Area type="monotone" dataKey="revenue" stroke="var(--color-revenue)" strokeWidth={2} fill="url(#revenueFill)" />
                  <Area type="monotone" dataKey="profit" stroke="var(--color-profit)" strokeWidth={2} fill="url(#profitFill)" />
                </AreaChart>
              </ChartContainer>
            </> : <div className="flex min-h-[230px] flex-col items-center justify-center text-center"><p className="text-sm font-medium">Пока нет сохранённых продаж</p><p className="mt-1 text-xs text-muted-foreground">После добавления заказов здесь появится график.</p></div>}
          </CardContent>
        </Card>

        <Card className="border-white/[0.07] bg-card/80 shadow-none">
          <CardHeader className="flex-row items-center justify-between"><div><CardTitle>Нужно внимания</CardTitle><p className="mt-1 text-xs text-muted-foreground">Сигналы по вашим данным</p></div><CircleAlert className="text-amber-200" /></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {attentionOrder ? <button onClick={() => onNavigate('orders')} className="flex w-full items-start gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-left transition hover:bg-white/[0.05]"><span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-200"><Clock3 /></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">Ожидает закупки</span><span className="mt-1 block text-xs text-muted-foreground">{attentionOrder.id} · {attentionOrder.product}</span></span><ArrowRight className="mt-1 text-muted-foreground" /></button> : <div className="rounded-lg border border-white/[0.06] p-3 text-sm text-muted-foreground">Нет заказов, ожидающих закупки.</div>}
            <button onClick={() => onNavigate('review')} className="flex w-full items-start gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-left transition hover:bg-white/[0.05]"><span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-white/[0.05] text-muted-foreground"><PackageCheck /></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">Очередь проверки</span><span className="mt-1 block text-xs text-muted-foreground">{data.summary.reviewCount} карточек ждут решения</span></span><ArrowRight className="mt-1 text-muted-foreground" /></button>
            <div className="rounded-lg border border-white/[0.06] p-3"><div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Поставщики</span><span>{data.suppliers.length}</span></div><div className="mt-2 flex items-center justify-between text-xs"><span className="text-muted-foreground">Опубликовано</span><span>{data.summary.publishedCount}</span></div></div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <Card className="border-white/[0.07] bg-card/80 shadow-none">
          <CardHeader className="flex-row items-center justify-between gap-3"><div><CardTitle>Последние заказы</CardTitle><p className="mt-1 text-xs text-muted-foreground">{data.summary.orderCount} сохранено в базе</p></div><Button variant="ghost" size="sm" onClick={() => onNavigate('orders')}>Все заказы <ArrowRight data-icon="inline-end" /></Button></CardHeader>
          <CardContent>
            {data.orders.length ? data.orders.slice(0, 3).map((order) => <div key={order.id} className="flex flex-wrap items-center gap-3 border-t border-white/[0.05] py-3 first:border-0"><div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-[10px] font-medium text-muted-foreground">{order.id.slice(-4)}</div><div className="min-w-[140px] flex-1"><p className="truncate text-sm font-medium">{order.product}</p><p className="mt-1 text-xs text-muted-foreground">{order.customer} · {order.createdAt}</p></div><Badge variant="outline" className="border-white/10 text-muted-foreground">{order.status}</Badge><span className="ml-auto text-sm font-medium tabular-nums">{formatRub(order.salePrice)}</span></div>) : <p className="py-8 text-center text-sm text-muted-foreground">Заказов пока нет.</p>}
          </CardContent>
        </Card>

        <Card className="border-white/[0.07] bg-card/80 shadow-none">
          <CardHeader className="flex-row items-center justify-between"><div><CardTitle>AI-агент</CardTitle><p className="mt-1 text-xs text-muted-foreground">Подготовка к подключению</p></div><span className="size-2 rounded-full bg-white/20" /></CardHeader>
          <CardContent><div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-4"><div className="flex size-9 items-center justify-center rounded-lg bg-white/[0.05] text-muted-foreground"><Sparkles /></div><p className="mt-3 text-sm font-medium">Внешние задачи отключены</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Автоматизация и публикация не запускались. Подключите провайдера и отдельно подтвердите действия.</p><Button className="mt-4 w-full" variant="outline" onClick={() => onNavigate('settings')}>Настройки <ArrowRight data-icon="inline-end" /></Button></div><div className="mt-4 flex items-center justify-between text-xs text-muted-foreground"><span>Средний чек</span><span className="text-foreground">{data.summary.orderCount ? formatRub(averageCheck) : '—'}</span></div></CardContent>
        </Card>
      </div>
      <p className="flex items-center justify-center gap-2 pb-1 text-[11px] text-muted-foreground/70"><span className="size-1.5 rounded-full bg-emerald-300" />Показатели загружены из Neon с фильтрацией по аккаунту</p>
    </div>
  )
}
