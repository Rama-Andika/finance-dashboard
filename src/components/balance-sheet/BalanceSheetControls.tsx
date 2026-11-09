import { useTranslation } from 'react-i18next'
import { Button } from '~/components/ui/Button'
import { BALANCE_COMPARE_MODES, type BalanceCompareMode } from '~/lib/finance/balance-sheet/targets'
import { formatDate } from '~/lib/format/date'
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
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink-muted font-medium">{t('balanceSheet.compare.label')}</span>
        <div className="nr-tabs" role="tablist">
          {BALANCE_COMPARE_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              className="nr-tab"
              role="tab"
              aria-selected={compare === mode}
              onClick={() => onCompareChange(mode)}
            >
              {t(`balanceSheet.compare.${mode}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {period && (
          <span className="text-sm text-ink-muted nr-num">
            {t('balanceSheet.asOf', { date: formatDate(period.reportDate, lang) })}
            {includesPeriod13 ? ` · ${t('balanceSheet.period13')}` : ''}
          </span>
        )}
        <Button variant={hideZero ? 'primary' : 'secondary'} onClick={() => onHideZeroChange(!hideZero)}>
          {t('balanceSheet.hideZero')}
        </Button>
      </div>
    </div>
  )
}
