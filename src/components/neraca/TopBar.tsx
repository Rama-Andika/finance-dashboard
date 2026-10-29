import { useRouter, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  Menu,
  Sun,
  Moon,
  Bell,
  ChevronDown,
  LogOut,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Route as RootRoute } from '~/routes/__root'
import { setPrefsFn } from '~/functions/prefs.fn'
import { logoutFn } from '~/functions/auth.fn'
import { filterOptionsQueryOptions } from '~/queries/filters.queries'
import { EntityPicker } from '~/components/neraca/EntityPicker'
import { PeriodSelect } from '~/components/neraca/PeriodSelect'
import type { Preset, Horizon, GlobalSearch, PaymentPlanSearch } from '~/lib/filters/search-schema'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { cn } from '~/lib/cn'

export interface TopBarProps {
  user?: { userId: string; name: string } | null
  onOpenMobileMenu?: () => void
  onOpenDataChecks?: () => void
  dataChecksCount?: number
  className?: string
}

const PAGE_TITLES: Record<string, { id: string; en: string }> = {
  '/summary': { id: 'Ringkasan', en: 'Summary' },
  '/revenue': { id: 'Pendapatan', en: 'Revenue' },
  '/cash-position': { id: 'Posisi Kas', en: 'Cash Position' },
  '/cash-flow': { id: 'Arus Kas', en: 'Cash Flow' },
  '/profit-loss': { id: 'Laba Rugi', en: 'Profit & Loss' },
  '/payables': { id: 'Utang', en: 'Payables' },
  '/receivables': { id: 'Piutang', en: 'Receivables' },
  '/payment-plan': { id: 'Rencana Bayar', en: 'Payment Plan' },
  '/budget': { id: 'Anggaran', en: 'Budget vs Actual' },
  '/settings/account-mapping': { id: 'Pemetaan Akun', en: 'Account Mapping' },
}

export function TopBar({
  user,
  onOpenMobileMenu,
  onOpenDataChecks,
  dataChecksCount = 0,
  className,
}: TopBarProps) {
  const router = useRouter()
  const routerState = useRouterState()
  const { prefs } = RootRoute.useRouteContext()
  const { t } = useTranslation()

  const userName = user?.name || t('ui.topBar.user')
  const initials = userName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U'

  const handleLogout = async () => {
    await logoutFn()
    await router.invalidate()
    router.navigate({ to: '/login', search: { redirect: '/summary' } })
  }

  const currentPath = routerState.location.pathname
  const titleInfo = PAGE_TITLES[currentPath] || { id: 'Dashboard', en: 'Dashboard' }
  const pageTitle = prefs.lang === 'id' ? titleInfo.id : titleInfo.en

  const search = useRouterState({
    select: (s) => (s.location.search as Partial<GlobalSearch & PaymentPlanSearch>) || {},
  })

  const { data: filterOptions } = useQuery(filterOptionsQueryOptions())

  const isPaymentPlan = currentPath === '/payment-plan'
  const currentEntity = (search.entity as string) || 'all'
  const currentPreset = (search.preset as Preset) || 'this-month'
  const currentP13 = Boolean(search.p13)
  const currentHorizon = (search.horizon as Horizon) || '7'

  const handleEntityApply = (newEntity: string) => {
    ;(router.navigate as any)({
      search: (prev: any) => ({
        ...prev,
        entity: newEntity,
      }),
    })
  }

  const handlePresetChange = (newPreset: Preset) => {
    ;(router.navigate as any)({
      search: (prev: any) => ({
        ...prev,
        preset: newPreset,
      }),
    })
  }

  const handleP13Change = (newP13: boolean) => {
    ;(router.navigate as any)({
      search: (prev: any) => ({
        ...prev,
        p13: newP13,
      }),
    })
  }

  const handleHorizonChange = (newHorizon: Horizon) => {
    ;(router.navigate as any)({
      search: (prev: any) => ({
        ...prev,
        horizon: newHorizon,
      }),
    })
  }

  const toggleTheme = async () => {
    const nextTheme = prefs.theme === 'light' ? 'dark' : 'light'
    await setPrefsFn({ data: { theme: nextTheme } })
    router.invalidate()
  }

  const toggleLang = async () => {
    const nextLang = prefs.lang === 'en' ? 'id' : 'en'
    await setPrefsFn({ data: { lang: nextLang } })
    router.invalidate()
  }

  return (
    <header className={cn('nr-topbar flex-col md:flex-row gap-3 py-3 md:py-0', className)}>
      <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
        <div className="flex items-center gap-2">
          {onOpenMobileMenu && (
            <button
              type="button"
              onClick={onOpenMobileMenu}
              aria-label="Buka menu"
              className="nr-btn nr-btn-icon md:hidden"
            >
              <Menu className="nr-icon" size={18} strokeWidth={1.75} />
            </button>
          )}
          <h1 className="nr-topbar-title">{pageTitle}</h1>
        </div>

        {/* Action icons on mobile top row */}
        <div className="flex items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={toggleTheme}
            className="nr-btn nr-btn-icon"
            aria-label={prefs.theme === 'light' ? 'Ganti ke tema gelap' : 'Ganti ke tema terang'}
          >
            {prefs.theme === 'light' ? (
              <Moon className="nr-icon" size={18} strokeWidth={1.75} />
            ) : (
              <Sun className="nr-icon" size={18} strokeWidth={1.75} />
            )}
          </button>
          <button
            type="button"
            onClick={toggleLang}
            className="nr-btn h-9 px-2 text-xs font-semibold"
            aria-label="Ganti bahasa"
          >
            {prefs.lang.toUpperCase()}
          </button>
        </div>
      </div>

      {/* Global filters: Entitas + Periode */}
      <div className="flex items-center gap-2 w-full md:w-auto md:ml-auto">
        <EntityPicker
          entities={filterOptions?.entities || []}
          selectedToken={currentEntity}
          onApply={handleEntityApply}
        />

        <PeriodSelect
          preset={currentPreset}
          p13={currentP13}
          onPresetChange={handlePresetChange}
          onP13Change={handleP13Change}
          presetHints={filterOptions?.presets}
          isForwardMode={isPaymentPlan}
          horizon={currentHorizon}
          onHorizonChange={handleHorizonChange}
        />
      </div>

      {/* Desktop action buttons: Theme, Lang, Notifications, User Profile */}
      <div className="hidden md:flex items-center gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          className="nr-btn nr-btn-icon"
          aria-label={prefs.theme === 'light' ? 'Ganti ke tema gelap' : 'Ganti ke tema terang'}
        >
          {prefs.theme === 'light' ? (
            <Moon className="nr-icon" size={18} strokeWidth={1.75} />
          ) : (
            <Sun className="nr-icon" size={18} strokeWidth={1.75} />
          )}
        </button>

        <button
          type="button"
          onClick={toggleLang}
          className="nr-btn h-9 px-2.5 text-xs font-semibold"
          aria-label="Ganti bahasa"
        >
          {prefs.lang.toUpperCase()}
        </button>

        <button
          type="button"
          onClick={onOpenDataChecks}
          className="nr-btn nr-btn-icon relative"
          aria-label="Data perlu dicek"
        >
          <Bell className="nr-icon" size={18} strokeWidth={1.75} />
          {dataChecksCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-danger text-on-danger text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {dataChecksCount}
            </span>
          )}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="nr-user ml-2 cursor-pointer border-0 bg-transparent text-left focus:outline-none"
              aria-label="Menu Pengguna"
            >
              <span className="nr-avatar">{initials}</span>
              <span className="hidden xl:inline">{userName}</span>
              <ChevronDown className="nr-icon nr-icon-sm ml-1 hidden xl:inline" size={14} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={handleLogout}
              className="cursor-pointer text-danger focus:text-danger focus:bg-danger-subtle"
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>{t('auth.logout')}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
