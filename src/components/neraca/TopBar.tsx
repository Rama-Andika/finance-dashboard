import { useRouter, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  Menu,
  Bell,
  ChevronDown,
  LogOut,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ThemeToggle, LangToggle } from '~/components/neraca/PrefsToggles'
import { logoutFn } from '~/functions/auth.fn'
import { filterOptionsQueryOptions } from '~/queries/filters.queries'
import { EntityPicker } from '~/components/neraca/EntityPicker'
import { PeriodSelect } from '~/components/neraca/PeriodSelect'
import { useTopBarFilters } from '~/components/neraca/useTopBarFilters'
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

const PAGE_TITLE_KEYS: Record<string, string> = {
  '/summary': 'nav.summary',
  '/revenue': 'nav.revenue',
  '/cash-position': 'nav.cashPosition',
  '/cash-flow': 'nav.cashFlow',
  '/profit-loss': 'nav.pnl',
  '/payables': 'nav.payables',
  '/receivables': 'nav.receivables',
  '/payment-plan': 'nav.paymentPlan',
  '/budget': 'nav.budget',
  '/settings/account-mapping': 'nav.accountMapping',
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
  const { t } = useTranslation()

  const userName = user?.name || t('ui.topBar.user')
  const initials = userName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U'

  const handleLogout = async () => {
    // Read the page BEFORE logging out: invalidate() makes the auth guard bounce to /login at once.
    const here = router.state.location.href
    await logoutFn()
    await router.invalidate()
    router.navigate({ to: '/login', search: { redirect: here } })
  }

  const currentPath = routerState.location.pathname
  const titleKey = PAGE_TITLE_KEYS[currentPath]
  const pageTitle = titleKey ? t(titleKey) : 'Dashboard'

  const { data: filterOptions } = useQuery(filterOptionsQueryOptions())

  const {
    isPaymentPlan,
    currentEntity,
    currentPreset,
    currentFrom,
    currentTo,
    currentHorizon,
    handleEntityApply,
    handlePresetChange,
    handleRangeChange,
    handleHorizonChange,
  } = useTopBarFilters()

  return (
    <header className={cn('nr-topbar flex-col md:flex-row gap-3', className)}>
      <div className="flex items-center gap-2 sm:gap-3 w-full md:w-auto justify-between md:justify-start min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {onOpenMobileMenu && (
            <div className="md:hidden shrink-0 flex items-center">
              <button
                type="button"
                onClick={onOpenMobileMenu}
                aria-label={t('ui.shell.openMenu')}
                className="nr-btn nr-btn-icon"
              >
                <Menu className="nr-icon" size={18} strokeWidth={1.75} />
              </button>
            </div>
          )}
          <h1 className="nr-topbar-title truncate text-lg sm:text-2xl">{pageTitle}</h1>
        </div>

        {/* Action icons on mobile top row */}
        <div className="flex items-center gap-1.5 md:hidden shrink-0">
          <ThemeToggle />
          <LangToggle />
          {onOpenDataChecks && (
            <button
              type="button"
              onClick={onOpenDataChecks}
              className="nr-btn nr-btn-icon relative"
              aria-label={t('ui.shell.dataChecksNeeded')}
            >
              <Bell className="nr-icon" size={18} strokeWidth={1.75} />
              {dataChecksCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-danger text-on-danger text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {dataChecksCount}
                </span>
              )}
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent p-0 focus:outline-none ml-1"
                aria-label={t('ui.shell.userMenu')}
              >
                <span className="nr-avatar w-8 h-8 text-xs">{initials}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-line shadow-pop">
              <DropdownMenuItem
                onClick={handleLogout}
                className="cursor-pointer text-danger focus:text-danger focus:bg-danger-soft hover:bg-danger-soft"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>{t('auth.logout')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Global filters: Entitas + Periode */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto md:ml-auto">
        <EntityPicker
          entities={filterOptions?.entities || []}
          selectedToken={currentEntity}
          onApply={handleEntityApply}
        />

        <PeriodSelect
          preset={currentPreset}
          from={currentFrom}
          to={currentTo}
          months={filterOptions?.months}
          onRangeChange={handleRangeChange}
          onPresetChange={handlePresetChange}
          presetHints={filterOptions?.presets}
          isForwardMode={isPaymentPlan}
          horizon={currentHorizon}
          onHorizonChange={handleHorizonChange}
        />
      </div>

      {/* Desktop action buttons: Theme, Lang, Notifications, User Profile */}
      <div className="hidden md:flex items-center gap-2">
        <ThemeToggle />
        <LangToggle />

        <button
          type="button"
          onClick={onOpenDataChecks}
          className="nr-btn nr-btn-icon relative"
          aria-label={t('ui.shell.dataChecksNeeded')}
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
              aria-label={t('ui.shell.userMenu')}
            >
              <span className="nr-avatar">{initials}</span>
              <span className="hidden xl:inline">{userName}</span>
              <ChevronDown className="nr-icon nr-icon-sm ml-1 hidden xl:inline" size={14} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="border-line shadow-pop">
            <DropdownMenuItem
              onClick={handleLogout}
              className="cursor-pointer text-danger focus:text-danger focus:bg-danger-soft hover:bg-danger-soft"
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
