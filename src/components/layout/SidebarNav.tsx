import { DataFreshness } from '~/components/layout/DataFreshness'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  Asterisk,
  LayoutDashboard,
  TrendingUp,
  Wallet,
  ArrowLeftRight,
  ChartColumn,
  Receipt,
  HandCoins,
  CalendarDays,
  Target,
  ListTree,
  Scale,
} from 'lucide-react'
import { cn } from '~/lib/cn'
import { keepEnabled } from '~/lib/feature-flags/filter'
import { allFlagsOff, type FeatureFlagName } from '~/lib/feature-flags/registry'
import { companyInfoOptions } from '~/queries/company.queries'
import { featureFlagsOptions } from '~/queries/feature-flags.queries'

export interface NavItemDef {
  labelKey: string
  to: string
  icon: React.ComponentType<{ className?: string; size?: number; strokeWidth?: number }>
  /** The flag that must be on for this item to show; no flag means always. */
  flag?: FeatureFlagName
}

const MAIN_NAV_ITEMS: NavItemDef[] = [
  { labelKey: 'nav.summary', to: '/summary', icon: LayoutDashboard },
  { labelKey: 'nav.revenue', to: '/revenue', icon: TrendingUp },
  { labelKey: 'nav.cashPosition', to: '/cash-position', icon: Wallet },
  { labelKey: 'nav.cashFlow', to: '/cash-flow', icon: ArrowLeftRight },
  { labelKey: 'nav.pnl', to: '/profit-loss', icon: ChartColumn },
  { labelKey: 'nav.balanceSheet', to: '/balance-sheet', icon: Scale },
  { labelKey: 'nav.payables', to: '/payables', icon: Receipt },
  { labelKey: 'nav.receivables', to: '/receivables', icon: HandCoins },
  { labelKey: 'nav.paymentPlan', to: '/payment-plan', icon: CalendarDays },
  { labelKey: 'nav.budget', to: '/budget', icon: Target },
]

const SETTINGS_NAV_ITEMS: NavItemDef[] = [
  { labelKey: 'nav.accountMapping', to: '/settings/account-mapping', icon: ListTree },
]

export interface SidebarNavProps {
  onNavigate?: () => void
  className?: string
  isTabletCollapsed?: boolean
}

export function SidebarNav({ onNavigate, className, isTabletCollapsed = false }: SidebarNavProps) {
  const { t } = useTranslation()
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname
  const companyName = useQuery(companyInfoOptions()).data?.name ?? null
  // While the flags load, or when they cannot be read, every flagged item is hidden (fail closed).
  const flags = useQuery(featureFlagsOptions()).data ?? allFlagsOff()

  return (
    <nav
      className={cn(
        'nr-sidebar h-full min-h-0 flex flex-col',
        isTabletCollapsed && 'md:w-16 lg:w-(--sidebar-width)',
        className,
      )}
      aria-label={t('ui.shell.mainMenu')}
    >
      <div className="flex-none flex flex-col gap-1">
        <div className="nr-brand">
          <Asterisk className="nr-icon" size={18} strokeWidth={1.75} aria-hidden="true" />
          <span className={cn(isTabletCollapsed && 'md:hidden lg:inline')}>Dashboard</span>
        </div>
        {companyName && (
          <div
            className={cn('px-2 text-xs leading-4 text-ink-muted truncate', isTabletCollapsed && 'md:hidden lg:block')}
            title={companyName}
          >
            {companyName}
          </div>
        )}
      </div>

      <div className="nr-nav flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {keepEnabled(MAIN_NAV_ITEMS, flags).map((item) => {
          const Icon = item.icon
          const isActive = currentPath === item.to || currentPath.startsWith(`${item.to}/`)
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              aria-current={isActive ? 'page' : undefined}
              aria-label={t(item.labelKey)}
              className={cn('nr-nav-item', isTabletCollapsed && 'md:justify-center md:px-0 lg:justify-start lg:px-3')}
            >
              <Icon className="nr-icon" size={18} strokeWidth={1.75} aria-hidden="true" />
              <span className={cn(isTabletCollapsed && 'md:hidden lg:inline')}>{t(item.labelKey)}</span>
            </Link>
          )
        })}

        <div className={cn('nr-nav-group', isTabletCollapsed && 'md:hidden lg:block')}>{t('nav.settingsGroup')}</div>

        {keepEnabled(SETTINGS_NAV_ITEMS, flags).map((item) => {
          const Icon = item.icon
          const isActive = currentPath === item.to
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              aria-current={isActive ? 'page' : undefined}
              aria-label={t(item.labelKey)}
              className={cn('nr-nav-item', isTabletCollapsed && 'md:justify-center md:px-0 lg:justify-start lg:px-3')}
            >
              <Icon className="nr-icon" size={18} strokeWidth={1.75} aria-hidden="true" />
              <span className={cn(isTabletCollapsed && 'md:hidden lg:inline')}>{t(item.labelKey)}</span>
            </Link>
          )
        })}
      </div>

      <DataFreshness className={cn('flex-none', isTabletCollapsed && 'md:hidden lg:flex')} />
    </nav>
  )
}
