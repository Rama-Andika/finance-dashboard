import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CashflowChart } from '~/components/neraca/CashflowChart'
import { DonutBreakdown } from '~/components/neraca/DonutBreakdown'
import { translateLabel } from '~/lib/core/i18n-label'
import { nameOperatingExpenseFolders, type OperatingExpenseFolder } from '~/lib/finance/pnl/operating-expense'
import { countEntitiesWithRevenue } from '~/lib/finance/pnl/revenue-entity'
import { formatMonthYear } from '~/lib/format/date'
import type { Breakdown, IsoDate, Lang, Money } from '~/lib/core/types'

/** The pages a chart of this section opens. */
export type SummaryChartTarget = '/cash-flow' | '/revenue' | '/profit-loss'

/** The tabs of the Composition donut. */
type CompositionTab = 'revenue' | 'expense' | 'fixedCost'

export interface SummaryChartsProps {
  asOf: IsoDate
  lang: Lang
  /** Number of entities in the global filter. */
  entityCount: number
  cashFlow: { monthly: Array<{ month: string; cashIn: Money; cashOut: Money }>; netCashFlow: Money }
  revenueByFolder: Breakdown[]
  /** Cost Of Sales and Expense folders: the slices of the Expense tab (Other Expense is not included). */
  expenseFolders: OperatingExpenseFolder[]
  /** Folders of the Fixed Cost basket: the slices of the Fixed Cost tab. */
  fixedCostFolders: Breakdown[]
  /** The Fixed Cost basket is empty in Settings: the Fixed Cost tab is not shown. */
  fixedCostBasketEmpty: boolean
  revenueByEntity: Array<{ id: string; name: string; amount: Money }>
  /** Revenue that belongs to no entity. */
  entityUnassigned: Money
  onOpen: (to: SummaryChartTarget) => void
}

/**
 * Cash flow, the Composition donut (revenue / operating expense / fixed cost by folder) and, when it says
 * something, the Revenue by Entity donut. With the entity donut the cash flow chart is full width and the two
 * donuts share the row below; without it the original layout (cash flow 2/3, Composition 1/3) is used.
 */
export function SummaryCharts({
  asOf,
  lang,
  entityCount,
  cashFlow,
  revenueByFolder,
  expenseFolders,
  fixedCostFolders,
  fixedCostBasketEmpty,
  revenueByEntity,
  entityUnassigned,
  onOpen,
}: SummaryChartsProps) {
  const { t } = useTranslation()
  const [donutTab, setDonutTab] = useState<CompositionTab>('revenue')
  // The Fixed Cost tab only exists when the basket is filled in Settings; if it disappears while selected, show Revenue.
  const activeTab: CompositionTab = donutTab === 'fixedCost' && fixedCostBasketEmpty ? 'revenue' : donutTab

  const tabs = [
    { id: 'revenue', label: t('metric.tabs.revenue') },
    { id: 'expense', label: t('metric.tabs.expense') },
    ...(fixedCostBasketEmpty ? [] : [{ id: 'fixedCost', label: t('metric.tabs.fixedCost') }]),
  ]

  const composition =
    activeTab === 'revenue'
      ? {
          items: revenueByFolder.map((f) => ({ id: f.id, name: f.label, amount: f.amount })),
          totalLabel: t('ui.summary.totalRevenue'),
        }
      : activeTab === 'expense'
        ? {
            items: nameOperatingExpenseFolders(expenseFolders, { cogs: t('pnlLine.cogs'), opex: t('pnlLine.opex') }),
            totalLabel: t('ui.summary.totalOperatingExpense'),
          }
        : {
            items: fixedCostFolders.map((f) => ({ id: f.id, name: translateLabel(t, f.label), amount: f.amount })),
            totalLabel: t('ui.summary.totalFixedCost'),
          }

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
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(tab) => setDonutTab(tab as CompositionTab)}
      items={composition.items}
      totalLabel={composition.totalLabel}
      lang={lang}
      onSelect={() => onOpen(activeTab === 'revenue' ? '/revenue' : '/profit-loss')}
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
