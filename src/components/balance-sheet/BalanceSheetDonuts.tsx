import { useTranslation } from 'react-i18next'
import { DonutBreakdown } from '~/components/charts/DonutBreakdown'
import {
  assetsComposition,
  liabilitiesEquityComposition,
  type CompositionItem,
} from '~/lib/finance/balance-sheet/labels'
import type { BalanceSheetStatement } from '~/lib/finance/balance-sheet/statement'
import type { Lang } from '~/lib/core/types'

/** Two donuts: what the assets are made of, and what the liabilities and equity side is made of. */
export function BalanceSheetDonuts({
  statement,
  periodLabel,
  lang,
}: {
  statement: BalanceSheetStatement
  periodLabel: string
  lang: Lang
}) {
  const { t } = useTranslation()
  const toItems = (list: CompositionItem[]) =>
    list.map((item) => ({ id: item.id, name: t(item.labelKey), amount: item.amount }))

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <DonutBreakdown
        title={t('balanceSheet.chart.assetsComposition')}
        items={toItems(assetsComposition(statement.groupTotals))}
        totalLabel={t('balanceSheet.chart.total')}
        lang={lang}
        periodLabel={periodLabel}
      />
      <DonutBreakdown
        title={t('balanceSheet.chart.liabilitiesEquityComposition')}
        items={toItems(liabilitiesEquityComposition(statement.groupTotals))}
        totalLabel={t('balanceSheet.chart.total')}
        lang={lang}
        periodLabel={periodLabel}
      />
    </div>
  )
}
