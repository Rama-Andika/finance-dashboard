import { useTranslation } from 'react-i18next'
import { KpiCard } from '~/components/ui/KpiCard'
import type { BalanceSheetStatement } from '~/lib/finance/balance-sheet/statement'

/** Total assets, total liabilities, total equity and the difference between the two sides, each against the comparison. */
export function BalanceSheetKpiRow({
  statement,
  compareLabel,
}: {
  statement: BalanceSheetStatement
  /** What the comparison amounts are of (for example "End of last fiscal year"); left out without a comparison. */
  compareLabel?: string
}) {
  const { t } = useTranslation()
  const { totals, compareTotals } = statement
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        label={t('balanceSheet.kpi.assets')}
        value={totals.assets}
        compareValue={compareTotals?.assets}
        compareLabel={compareLabel}
        higherIsBetter={true}
      />
      <KpiCard
        label={t('balanceSheet.kpi.liabilities')}
        value={totals.liabilities}
        compareValue={compareTotals?.liabilities}
        compareLabel={compareLabel}
        higherIsBetter={false}
      />
      <KpiCard
        label={t('balanceSheet.kpi.equity')}
        value={totals.equity}
        compareValue={compareTotals?.equity}
        compareLabel={compareLabel}
        higherIsBetter={true}
      />
      <KpiCard label={t('balanceSheet.kpi.difference')} value={totals.difference} higherIsBetter={false} />
    </div>
  )
}
