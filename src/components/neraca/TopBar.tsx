import { useQuery } from '@tanstack/react-query'
import { Menu } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ThemeToggle, LangToggle } from '~/components/neraca/PrefsToggles'
import { filterOptionsQueryOptions } from '~/queries/filters.queries'
import { EntityPicker } from '~/components/neraca/EntityPicker'
import { PeriodSelect } from '~/components/neraca/PeriodSelect'
import { useTopBarFilters } from '~/components/neraca/useTopBarFilters'
import { DataChecksBell, UserMenu, initialsOf, useLogout, usePageTitle } from '~/components/neraca/TopBarParts'
import { cn } from '~/lib/cn'

export interface TopBarProps {
  user?: { userId: string; name: string } | null
  onOpenMobileMenu?: () => void
  onOpenDataChecks?: () => void
  dataChecksCount?: number
  className?: string
}

/** The global filters: entity picker and period selector (Payment Plan shows a forward horizon instead). */
function TopBarFilters() {
  const { data: filterOptions } = useQuery(filterOptionsQueryOptions())
  const filters = useTopBarFilters()
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto md:ml-auto">
      <EntityPicker
        entities={filterOptions?.entities || []}
        selectedToken={filters.currentEntity}
        onApply={filters.handleEntityApply}
      />

      <PeriodSelect
        preset={filters.currentPreset}
        from={filters.currentFrom}
        to={filters.currentTo}
        months={filterOptions?.months}
        onRangeChange={filters.handleRangeChange}
        onPresetChange={filters.handlePresetChange}
        presetHints={filterOptions?.presets}
        isForwardMode={filters.isPaymentPlan}
        horizon={filters.currentHorizon}
        onHorizonChange={filters.handleHorizonChange}
      />
    </div>
  )
}

export function TopBar({
  user,
  onOpenMobileMenu,
  onOpenDataChecks,
  dataChecksCount = 0,
  className,
}: TopBarProps) {
  const { t } = useTranslation()
  const pageTitle = usePageTitle()
  const logout = useLogout()

  const userName = user?.name || t('ui.topBar.user')
  const initials = initialsOf(userName)

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
          {onOpenDataChecks && <DataChecksBell onClick={onOpenDataChecks} count={dataChecksCount} />}
          <UserMenu variant="compact" initials={initials} userName={userName} onLogout={logout} />
        </div>
      </div>

      {/* Global filters: Entitas + Periode */}
      <TopBarFilters />

      {/* Desktop action buttons: Theme, Lang, Notifications, User Profile */}
      <div className="hidden md:flex items-center gap-2">
        <ThemeToggle />
        <LangToggle />
        <DataChecksBell onClick={onOpenDataChecks} count={dataChecksCount} />
        <UserMenu variant="full" initials={initials} userName={userName} onLogout={logout} />
      </div>
    </header>
  )
}
