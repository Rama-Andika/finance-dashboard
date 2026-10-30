import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CashflowChart } from '~/components/neraca/CashflowChart'
import { DonutBreakdown } from '~/components/neraca/DonutBreakdown'
import { translateLabel } from '~/lib/core/i18n-label'
import { countEntitiesWithRevenue } from '~/lib/finance/pnl/revenue-entity'
import { formatMonthYear } from '~/lib/format/date'
import type { Breakdown, IsoDate, Lang, Money } from '~/lib/core/types'

/** The pages a chart of this section opens. */
export type SummaryChartTarget = '/cash-flow' | '/revenue' | '/profit-loss'

export interface SummaryChartsProps {
  asOf: IsoDate
  lang: Lang
  /** Number of entities in the global filter. */
  entityCount: number
  cashFlow: { monthly: Array<{ month: string; cashIn: Money; cashOut: Money }>; netCashFlow: Money }
  revenueByFolder: Breakdown[]
  expenseFolders: Breakdown[]
  revenueByEntity: Array<{ id: string; name: string; amount: Money }>
  /** Revenue that belongs to no entity. */
  entityUnassigned: Money
  onOpen: (to: SummaryChartTarget) => void
}

/**
 * Cash flow, the Composition donut (revenue / expense by folder) and, when it says something, the
 * Revenue by Entity donut. With the entity donut the cash flow chart is full width and the two donuts
 * share the row below; without it the original layout (cash flow 2/3, Composition 1/3) is used.
 */
export function SummaryCharts({
  asOf,
  lang,
  entityCount,
  cashFlow,
  revenueByFolder,
  expenseFolders,
  revenueByEntity,
  entityUnassigned,
  onOpen,
}: SummaryChartsProps) {
  const { t } = useTranslation()
  const [donutTab, setDonutTab] = useState<'revenue' | 'expense'>('revenue')

  const donutItems =
    donutTab === 'revenue'
      ? revenueByFolder.map((f) => ({ id: f.id, name: f.label, amount: f.amount }))
      : expenseFolders.map((f) => ({ id: f.id, name: translateLabel(t, f.label), amount: f.amount }))

  // A ring with a single entity is one full circle and says nothing: the card needs at least two
  // selected entities and at least two of them with revenue above zero.
  const positiveEntities = countEntitiesWithRevenue(revenueByEntity)
  const showEntityCard = entityCount >= 2 && positiveEntities >= 2

  const cashflowChart = (
    <CashflowChart
      title={t('nav.cashFlow')}
      data={cashFlow.monthly}
      net={cashFlow.netCashFlow}
      lang={lang}
      onSelectMonth={() => onOpen('/cash-flow')}
    />
  )

  const compositionDonut = (
    <DonutBreakdown
      title={t('ui.summary.composition')}
      tabs={[
        { id: 'revenue', label: t('metric.tabs.revenue') },
        { id: 'expense', label: t('metric.tabs.expense') },
      ]}
      activeTab={donutTab}
      onTabChange={(tab) => setDonutTab(tab as 'revenue' | 'expense')}
      items={donutItems}
      totalLabel={donutTab === 'revenue' ? t('ui.summary.totalRevenue') : t('ui.summary.totalExpense')}
      lang={lang}
      onSelect={() => onOpen(donutTab === 'revenue' ? '/revenue' : '/profit-loss')}
    />
  )

  if (!showEntityCard) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">{cashflowChart}</div>
        <div className="lg:col-span-1">{compositionDonut}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {cashflowChart}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {compositionDonut}
        <DonutBreakdown
          variant="entity"
          title={t('ui.summary.revenueByEntity')}
          items={revenueByEntity}
          unassigned={entityUnassigned}
          totalLabel={t('ui.summary.totalRevenue')}
          lang={lang}
          periodLabel={formatMonthYear(asOf, lang)}
          detailsLabel={t('ui.summary.details')}
          onDetails={() => onOpen('/revenue')}
          onSelect={() => onOpen('/revenue')}
        />
      </div>
    </div>
  )
}
