import { Calendar, Eye, EyeOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '~/components/ui/Button'
import { BALANCE_COMPARE_MODES, type BalanceCompareMode } from '~/lib/finance/balance-sheet/targets'
import { formatDate } from '~/lib/format/date'
import { cn } from '~/lib/cn'
import type { BalanceSheetPeriodInfo } from '~/lib/finance/balance-sheet/result'
import type { Lang } from '~/lib/core/types'

/** What to compare with (tabs), the "hide zero accounts" switch and the date the balance sheet describes. */
export function BalanceSheetControls({
  compare,
  hideZero,
  period,
  includesPeriod13,
  lang,
  onCompareChange,
  onHideZeroChange,
}: {
  compare: BalanceCompareMode
  hideZero: boolean
  period: BalanceSheetPeriodInfo | null
  includesPeriod13: boolean
  lang: Lang
  onCompareChange: (mode: BalanceCompareMode) => void
  onHideZeroChange: (hideZero: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-1">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-xs font-medium text-ink-muted shrink-0 pb-1">{t('balanceSheet.compare.label')}</span>
        <div className="nr-tabs flex-nowrap shrink-0 max-w-full" role="tablist">
          {BALANCE_COMPARE_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              className={cn(
                'nr-tab whitespace-nowrap flex-none px-3.5 py-2 text-xs sm:text-sm transition-colors',
                compare === mode && 'font-semibold text-ink',
              )}
              role="tab"
              aria-selected={compare === mode}
              onClick={() => onCompareChange(mode)}
            >
              {t(`balanceSheet.compare.${mode}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 self-start md:self-center">
        {period && (
          <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-ink-muted nr-num bg-surface-sunken border border-line px-2.5 py-1 rounded-md">
            <Calendar className="w-3.5 h-3.5 text-ink-muted shrink-0" />
            <span>
              {t('balanceSheet.asOf', { date: formatDate(period.reportDate, lang) })}
              {includesPeriod13 ? ` · ${t('balanceSheet.period13')}` : ''}
            </span>
          </span>
        )}
        <Button
          variant={hideZero ? 'primary' : 'secondary'}
          icon={hideZero ? EyeOff : Eye}
          onClick={() => onHideZeroChange(!hideZero)}
          className="h-8 text-xs font-medium px-3"
        >
          {t('balanceSheet.hideZero')}
        </Button>
      </div>
    </div>
  )
}
