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
  label: string
  to: string
  icon: React.ComponentType<{ className?: string; size?: number; strokeWidth?: number }>
}

export const MAIN_NAV_ITEMS: NavItemDef[] = [
  { label: 'Ringkasan', to: '/summary', icon: LayoutDashboard },
  { label: 'Pendapatan', to: '/revenue', icon: TrendingUp },
  { label: 'Posisi Kas', to: '/cash-position', icon: Wallet },
  { label: 'Arus Kas', to: '/cash-flow', icon: ArrowLeftRight },
  { label: 'Laba Rugi', to: '/profit-loss', icon: ChartColumn },
  { label: 'Utang', to: '/payables', icon: Receipt },
  { label: 'Piutang', to: '/receivables', icon: HandCoins },
  { label: 'Rencana Bayar', to: '/payment-plan', icon: CalendarDays },
  { label: 'Anggaran', to: '/budget', icon: Target },
]

export const SETTINGS_NAV_ITEMS: NavItemDef[] = [
  { label: 'Pemetaan Akun', to: '/settings/account-mapping', icon: ListTree },
]

export interface SidebarNavProps {
  onNavigate?: () => void
  freshnessDate?: string
  freshnessStatus?: string
  className?: string
  isTabletCollapsed?: boolean
}

export function SidebarNav({
  onNavigate,
  freshnessDate = 'Data per 28 Okt 2026, 08.00',
  freshnessStatus = 'Periode Okt 2026 masih terbuka. Angka bisa berubah.',
  className,
  isTabletCollapsed = false,
}: SidebarNavProps) {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  return (
    <nav
      className={cn('nr-sidebar min-h-full', className)}
      aria-label="Menu utama"
    >
      <div className="nr-brand">
        <Asterisk className="nr-icon" size={18} strokeWidth={1.75} aria-hidden="true" />
        <span className={cn(isTabletCollapsed && 'md:hidden lg:inline')}>Neraca</span>
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
              aria-label={item.label}
              className={cn(
                'nr-nav-item',
                isTabletCollapsed && 'md:justify-center md:px-0 lg:justify-start lg:px-3',
              )}
            >
              <Icon className="nr-icon" size={18} strokeWidth={1.75} aria-hidden="true" />
              <span className={cn(isTabletCollapsed && 'md:hidden lg:inline')}>
                {item.label}
              </span>
            </Link>
          )
        })}

        <div className={cn('nr-nav-group', isTabletCollapsed && 'md:hidden lg:block')}>
          Pengaturan
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
              aria-label={item.label}
              className={cn(
                'nr-nav-item',
                isTabletCollapsed && 'md:justify-center md:px-0 lg:justify-start lg:px-3',
              )}
            >
              <Icon className="nr-icon" size={18} strokeWidth={1.75} aria-hidden="true" />
              <span className={cn(isTabletCollapsed && 'md:hidden lg:inline')}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>

      <div className={cn('nr-freshness', isTabletCollapsed && 'md:hidden lg:flex')}>
        <strong>{freshnessDate}</strong>
        <span>{freshnessStatus}</span>
      </div>
    </nav>
  )
}
