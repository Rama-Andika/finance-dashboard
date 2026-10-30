import { useTranslation } from 'react-i18next'
import { CashBalanceCard } from '~/components/neraca/CashBalanceCard'
import { KpiCard } from '~/components/neraca/KpiCard'
import { formatPercent } from '~/lib/format/number'
import type { IsoDate, Lang, Money } from '~/lib/core/types'

/** The pages a card of this row opens. */
export type SummaryKpiTarget = '/cash-position' | '/revenue' | '/profit-loss' | '/payables'

export interface SummaryKpiRowProps {
  asOf: IsoDate
  lang: Lang
  /** Text next to the Revenue change ("vs last month"). */
  compareLabel: string
  cashPosition: {
    entityCount?: number | undefined
    cash: Money
    bank: Money
    deposit: Money
    inTransit: Money
    giroOutstanding: Money
  }
  revenue: { total: Money; compare: Money | null }
  pnl: { netProfit: Money; netMargin: string | null }
  apAging: { total: Money; overdueBills: Money }
  onOpen: (to: SummaryKpiTarget) => void
}

/** The four top cards of the Summary: cash position, revenue, net profit and payables. */
export function SummaryKpiRow({
  asOf,
  lang,
  compareLabel,
  cashPosition,
  revenue,
  pnl,
  apAging,
  onOpen,
}: SummaryKpiRowProps) {
  const { t } = useTranslation()

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <CashBalanceCard
        asOf={asOf}
        entityCount={cashPosition.entityCount || 1}
        cash={cashPosition.cash}
        bank={cashPosition.bank}
        deposit={cashPosition.deposit}
        inTransit={cashPosition.inTransit}
        giroOutstanding={cashPosition.giroOutstanding}
        onOpen={() => onOpen('/cash-position')}
      />

      <KpiCard
        label={t('nav.revenue')}
        value={revenue.total}
        compareValue={revenue.compare}
        compareLabel={compareLabel}
        higherIsBetter={true}
        onOpen={() => onOpen('/revenue')}
      />

      <KpiCard
        label={t('nav.pnl')}
        value={pnl.netProfit}
        compareLabel={
          pnl.netMargin ? `${t('metric.netMargin')}: ${formatPercent(pnl.netMargin, lang, 1)}` : undefined
        }
        higherIsBetter={true}
        onOpen={() => onOpen('/profit-loss')}
      />

      <KpiCard
        label={t('nav.payables')}
        value={apAging.total}
        compareValue={apAging.overdueBills}
        compareLabel={t('ui.summary.overdue')}
        higherIsBetter={false}
        onOpen={() => onOpen('/payables')}
      />
    </div>
  )
}
