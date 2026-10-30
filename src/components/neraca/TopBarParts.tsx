import { useRouter, useRouterState } from '@tanstack/react-router'
import { Bell, ChevronDown, LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { logoutFn } from '~/functions/auth.fn'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'

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

/** Title of the page the router is on ("Dashboard" for a page without a title). */
export function usePageTitle(): string {
  const { t } = useTranslation()
  const pathname = useRouterState().location.pathname
  const titleKey = PAGE_TITLE_KEYS[pathname]
  return titleKey ? t(titleKey) : 'Dashboard'
}

/** The first letters of the first two words of a name, upper case ("U" when there is none). */
export function initialsOf(name: string): string {
  const letters = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
  return letters || 'U'
}

/** Signs out and returns to the login page, which sends the user back here afterwards. */
export function useLogout(): () => Promise<void> {
  const router = useRouter()
  return async () => {
    // Read the page BEFORE logging out: invalidate() makes the auth guard bounce to /login at once.
    const here = router.state.location.href
    await logoutFn()
    await router.invalidate()
    router.navigate({ to: '/login', search: { redirect: here } })
  }
}

/** The bell that opens the data checks, with the number of open checks as a badge. */
export function DataChecksBell({ onClick, count }: { onClick?: () => void; count: number }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onClick}
      className="nr-btn nr-btn-icon relative"
      aria-label={t('ui.shell.dataChecksNeeded')}
    >
      <Bell className="nr-icon" size={18} strokeWidth={1.75} />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 bg-danger text-on-danger text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
          {count}
        </span>
      )}
    </button>
  )
}

/** The user's avatar menu; "compact" is the phone layout (avatar only), "full" shows the name on wide screens. */
export function UserMenu({
  variant,
  initials,
  userName,
  onLogout,
}: {
  variant: 'compact' | 'full'
  initials: string
  userName: string
  onLogout: () => void
}) {
  const { t } = useTranslation()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === 'compact' ? (
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 focus:outline-none ml-1"
            aria-label={t('ui.shell.userMenu')}
          >
            <span className="nr-avatar w-8 h-8 text-xs">{initials}</span>
          </button>
        ) : (
          <button
            type="button"
            className="nr-user ml-2 cursor-pointer border-0 bg-transparent text-left focus:outline-none"
            aria-label={t('ui.shell.userMenu')}
          >
            <span className="nr-avatar">{initials}</span>
            <span className="hidden xl:inline">{userName}</span>
            <ChevronDown className="nr-icon nr-icon-sm ml-1 hidden xl:inline" size={14} />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="border-line shadow-pop">
        <DropdownMenuItem
          onClick={onLogout}
          className="cursor-pointer text-danger focus:text-danger focus:bg-danger-soft hover:bg-danger-soft"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>{t('auth.logout')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
