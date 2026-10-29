import { DataFreshness } from '~/components/layout/DataFreshness'
import { APP_NAME } from '~/lib/brand'
import { useTranslation } from 'react-i18next'
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
} from 'lucide-react'
import { cn } from '~/lib/cn'

export interface NavItemDef {
  labelKey: string
  to: string
  icon: React.ComponentType<{ className?: string; size?: number; strokeWidth?: number }>
}

export const MAIN_NAV_ITEMS: NavItemDef[] = [
  { labelKey: 'nav.summary', to: '/summary', icon: LayoutDashboard },
  { labelKey: 'nav.revenue', to: '/revenue', icon: TrendingUp },
  { labelKey: 'nav.cashPosition', to: '/cash-position', icon: Wallet },
  { labelKey: 'nav.cashFlow', to: '/cash-flow', icon: ArrowLeftRight },
  { labelKey: 'nav.pnl', to: '/profit-loss', icon: ChartColumn },
  { labelKey: 'nav.payables', to: '/payables', icon: Receipt },
  { labelKey: 'nav.receivables', to: '/receivables', icon: HandCoins },
  { labelKey: 'nav.paymentPlan', to: '/payment-plan', icon: CalendarDays },
  { labelKey: 'nav.budget', to: '/budget', icon: Target },
]

export const SETTINGS_NAV_ITEMS: NavItemDef[] = [
  { labelKey: 'nav.accountMapping', to: '/settings/account-mapping', icon: ListTree },
]

export interface SidebarNavProps {
  onNavigate?: () => void
  className?: string
  isTabletCollapsed?: boolean
}

export function SidebarNav({
  onNavigate,
  className,
  isTabletCollapsed = false,
}: SidebarNavProps) {
  const { t } = useTranslation()
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  return (
    <nav
      className={cn('nr-sidebar min-h-full', isTabletCollapsed && 'md:w-16 lg:w-(--sidebar-width)', className)}
      aria-label={t('ui.shell.mainMenu')}
    >
      <div className="nr-brand">
        <Asterisk className="nr-icon" size={18} strokeWidth={1.75} aria-hidden="true" />
        <span className={cn(isTabletCollapsed && 'md:hidden lg:inline')}>Dashboard</span>
      </div>

      <div className="nr-nav flex-1">
        {MAIN_NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = currentPath === item.to || currentPath.startsWith(`${item.to}/`)
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              aria-current={isActive ? 'page' : undefined}
              aria-label={t(item.labelKey)}
              className={cn(
                'nr-nav-item',
                isTabletCollapsed && 'md:justify-center md:px-0 lg:justify-start lg:px-3',
              )}
            >
              <Icon className="nr-icon" size={18} strokeWidth={1.75} aria-hidden="true" />
              <span className={cn(isTabletCollapsed && 'md:hidden lg:inline')}>
                {t(item.labelKey)}
              </span>
            </Link>
          )
        })}

        <div className={cn('nr-nav-group', isTabletCollapsed && 'md:hidden lg:block')}>
          {t('nav.settingsGroup')}
        </div>

        {SETTINGS_NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = currentPath === item.to
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              aria-current={isActive ? 'page' : undefined}
              aria-label={t(item.labelKey)}
              className={cn(
                'nr-nav-item',
                isTabletCollapsed && 'md:justify-center md:px-0 lg:justify-start lg:px-3',
              )}
            >
              <Icon className="nr-icon" size={18} strokeWidth={1.75} aria-hidden="true" />
              <span className={cn(isTabletCollapsed && 'md:hidden lg:inline')}>
                {t(item.labelKey)}
              </span>
            </Link>
          )
        })}
      </div>

      <DataFreshness className={cn(isTabletCollapsed && 'md:hidden lg:flex')} />
    </nav>
  )
}
