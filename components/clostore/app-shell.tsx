"use client"

import { useState } from 'react'
import {
  Activity,
  Bell,
  Bot,
  Boxes,
  ChevronDown,
  Command,
  CreditCard,
  FileEdit,
  LayoutDashboard,
  Menu,
  MessageCircle,
  PackageCheck,
  Search,
  Settings,
  Shirt,
  ShoppingBag,
  Sparkles,
  Truck,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { DashboardView } from './dashboard-view'
import { WorkspaceView } from './workspace-views'
import type { AgentTaskPreview, IntegrationStatus, NavigationGroup, SectionId, WorkspaceData } from './types'

const navigation: NavigationGroup[] = [
  {
    label: 'Рабочая область',
    items: [
      { id: 'dashboard', label: 'Обзор', icon: LayoutDashboard },
      { id: 'agent', label: 'AI-агент', icon: Bot },
      { id: 'search', label: 'Поиск товаров', icon: Search },
      { id: 'review', label: 'Очередь проверки', icon: PackageCheck },
    ],
  },
  {
    label: 'Магазин',
    items: [
      { id: 'catalog', label: 'Каталог', icon: Shirt },
      { id: 'editor', label: 'Редактор карточек', icon: FileEdit },
      { id: 'suppliers', label: 'Поставщики', icon: Users },
      { id: 'orders', label: 'Заказы', icon: ShoppingBag },
    ],
  },
  {
    label: 'Продажи и данные',
    items: [
      { id: 'telegram', label: 'Telegram', icon: MessageCircle },
      { id: 'pricing', label: 'Ценообразование', icon: CreditCard },
      { id: 'analytics', label: 'Аналитика', icon: Activity },
      { id: 'ai-usage', label: 'Расходы на AI', icon: Wallet },
    ],
  },
  {
    label: 'Система',
    items: [{ id: 'settings', label: 'Настройки', icon: Settings }],
  },
]

const sectionTitles: Record<SectionId, string> = {
  dashboard: 'Обзор',
  agent: 'AI-агент',
  search: 'Поиск товаров',
  review: 'Очередь проверки',
  catalog: 'Каталог',
  editor: 'Редактор карточек',
  suppliers: 'Поставщики',
  orders: 'Заказы',
  telegram: 'Telegram',
  pricing: 'Ценообразование',
  analytics: 'Аналитика',
  'ai-usage': 'Расходы на AI',
  settings: 'Настройки',
}

function Sidebar({ active, onNavigate, mobile = false, onClose, reviewCount }: { active: SectionId; onNavigate: (section: SectionId) => void; mobile?: boolean; onClose?: () => void; reviewCount: number }) {
  return (
    <aside className={`flex h-full flex-col border-r border-white/[0.07] bg-[#141618] ${mobile ? 'w-[290px]' : 'w-[250px]'}`}>
      <div className="flex h-[72px] items-center justify-between border-b border-white/[0.06] px-5">
        <button className="flex items-center gap-3 text-left" onClick={() => onNavigate('dashboard')} aria-label="CloStore AI, на главную">
          <span className="flex size-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-foreground"><Boxes /></span>
          <span><span className="block text-sm font-semibold tracking-tight">CloStore <span className="text-muted-foreground">AI</span></span><span className="mt-0.5 block text-[10px] uppercase tracking-[0.15em] text-muted-foreground">fashion workspace</span></span>
        </button>
        {mobile && <Button size="icon-sm" variant="ghost" aria-label="Закрыть меню" onClick={onClose}><X /></Button>}
      </div>
      <div className="px-3 pt-4">
        <div className="flex items-center justify-between rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
          <div className="flex items-center gap-2.5"><span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-200/40" /><span className="relative inline-flex size-2 rounded-full bg-amber-200" /></span><span className="text-xs font-medium">DeepSeek подключён</span></div>
          <ChevronDown className="text-muted-foreground" />
        </div>
      </div>
      <nav aria-label="Основная навигация" className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {navigation.map((group) => (
          <div key={group.label} className="mb-5 last:mb-0">
            <p className="mb-2 px-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">{group.label}</p>
            <div className="flex flex-col gap-0.5">
              {group.items.map(({ id, label, icon: Icon }) => (
                <button key={id} aria-current={active === id ? 'page' : undefined} onClick={() => { onNavigate(id); onClose?.() }} className={`group flex h-9 items-center gap-3 rounded-md px-2.5 text-left text-[13px] transition-colors ${active === id ? 'bg-white/[0.08] text-foreground' : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'}`}>
                  <Icon className={active === id ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'} />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {id === 'review' && reviewCount > 0 ? <span className="flex size-5 items-center justify-center rounded-full bg-white/[0.08] text-[10px] text-foreground">{reviewCount}</span> : null}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="px-3 pb-3">
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
          <div className="flex items-center gap-2 text-xs font-medium"><Sparkles className="text-muted-foreground" /> Быстрый старт</div>
          <p className="mt-2 text-[11px] leading-4 text-muted-foreground">Добавьте товары и заказы, чтобы заполнить сводку.</p>
          <button onClick={() => { onNavigate('catalog'); onClose?.() }} className="mt-2 text-xs text-foreground underline decoration-white/20 underline-offset-4 hover:decoration-white/60">Открыть каталог</button>
        </div>
      </div>
      <Separator className="bg-white/[0.06]" />
      <div className="px-4 py-4"><p className="text-xs font-medium">Личное пространство</p><p className="mt-0.5 text-[10px] text-muted-foreground">Доступ без входа</p></div>
    </aside>
  )
}

export function CloStoreApp({ initialData, initialAgentTasks, integrations }: { initialData: WorkspaceData; initialAgentTasks: AgentTaskPreview[]; integrations: IntegrationStatus[] }) {
  const [active, setActive] = useState<SectionId>('dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [quickActionsOpen, setQuickActionsOpen] = useState(false)

  function navigate(section: SectionId) {
    setActive(section)
    setMobileOpen(false)
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <div className="sticky top-0 hidden h-screen shrink-0 lg:block"><Sidebar active={active} onNavigate={navigate} reviewCount={initialData.summary.reviewCount} /></div>
        {mobileOpen && <div className="fixed inset-0 z-50 lg:hidden"><button className="absolute inset-0 bg-black/70" aria-label="Закрыть меню" onClick={() => setMobileOpen(false)} /><div className="relative h-full w-fit"><Sidebar active={active} onNavigate={navigate} mobile onClose={() => setMobileOpen(false)} reviewCount={initialData.summary.reviewCount} /></div></div>}
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-[64px] items-center gap-3 border-b border-white/[0.07] bg-background/95 px-4 backdrop-blur sm:px-6 lg:px-8">
            <Button className="lg:hidden" size="icon" variant="ghost" aria-label="Открыть меню" onClick={() => setMobileOpen(true)}><Menu /></Button>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{sectionTitles[active]}</p><p className="hidden text-[10px] text-muted-foreground sm:block">Управление магазином · Europe/Moscow</p></div>
            <div className="relative hidden w-full max-w-[260px] md:block"><Search className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Поиск по приложению" placeholder="Поиск по приложению" className="h-8 border-white/[0.08] bg-white/[0.025] pl-9 text-xs" onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) navigate('search') }} /></div>
            <Badge variant="outline" className="hidden border-white/[0.08] bg-white/[0.025] text-[10px] text-muted-foreground xl:inline-flex"><span className="mr-1.5 size-1.5 rounded-full bg-emerald-300" />Neon подключён</Badge>
            <div className="relative">
              <Button size="icon" variant="ghost" aria-label="Уведомления" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((value) => !value)}><Bell /></Button>
              {notificationsOpen && <div className="absolute right-0 z-40 mt-2 w-72 rounded-xl border border-white/10 bg-[#1b1d20] p-4 shadow-2xl"><p className="text-sm font-medium">Уведомления</p><p className="mt-2 text-xs leading-5 text-muted-foreground">Пока нет подключённых уведомлений. Здесь появятся события по заказам и задачам.</p></div>}
            </div>
            <Button className="hidden sm:inline-flex" variant="outline" size="sm" onClick={() => setQuickActionsOpen(true)}><Command data-icon="inline-start" /> Быстрое действие</Button>
          </header>
          <main className="mx-auto w-full max-w-[1560px] px-4 py-6 sm:px-6 sm:py-7 lg:px-8">
            {active === 'dashboard' ? <DashboardView data={initialData} onNavigate={navigate} /> : <WorkspaceView section={active} onNavigate={navigate} data={initialData} agentTasks={initialAgentTasks} integrations={integrations} />}
          </main>
          <footer className="px-4 pb-5 text-center text-[10px] text-muted-foreground/60 sm:px-6">CloStore AI · рабочее пространство · ранняя версия</footer>
        </div>
      </div>
      <Dialog open={quickActionsOpen} onOpenChange={setQuickActionsOpen}>
        <DialogContent className="border-white/10 bg-[#1b1d20]">
          <DialogHeader><DialogTitle>Быстрое действие</DialogTitle><DialogDescription>Перейдите к основному сценарию. Никакие внешние операции не запускаются автоматически.</DialogDescription></DialogHeader>
          <div className="grid gap-2">
            {[
              { label: 'Запустить поиск товаров', section: 'search' as const, icon: Search },
              { label: 'Открыть AI-агента', section: 'agent' as const, icon: Bot },
              { label: 'Создать заказ', section: 'orders' as const, icon: Truck },
              { label: 'Открыть каталог', section: 'catalog' as const, icon: Shirt },
            ].map(({ label, section, icon: Icon }) => <Button key={section} variant="outline" className="justify-start" onClick={() => { navigate(section); setQuickActionsOpen(false) }}><Icon data-icon="inline-start" />{label}</Button>)}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
