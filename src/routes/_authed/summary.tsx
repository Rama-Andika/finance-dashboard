import { translateLabel } from '~/lib/core/i18n-label'
import { searchUpdater } from '~/lib/filters/search-update'
import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { drillSearchSchema } from '~/lib/filters/search-schema'
import { summaryMetricOptions } from '~/queries/metrics.queries'
import { tableSearchSchema } from '~/lib/table/query'
import { PAYMENT_BILL_SORT_KEYS } from '~/lib/finance/ap-ar/payment-plan-bills'
import { MetricSkeleton } from '~/components/neraca/MetricSkeleton'
import { MetricError } from '~/components/neraca/MetricError'
import { Notice } from '~/components/neraca/Notice'
import { CashBalanceCard } from '~/components/neraca/CashBalanceCard'
import { KpiCard } from '~/components/neraca/KpiCard'
import { CashflowChart } from '~/components/neraca/CashflowChart'
import { DonutBreakdown } from '~/components/neraca/DonutBreakdown'
import { PrintHeader } from '~/components/export/PrintHeader'
import { BillsTable } from '~/components/summary/BillsTable'
import { MiniMetricsBar } from '~/components/summary/MiniMetricsBar'
import { formatPercent } from '~/lib/format/number'
import { formatMonthYear, getCompareLabel } from '~/lib/format/date'
import { D } from '~/lib/core/money'
import type { Lang } from '~/lib/core/types'

export const Route = createFileRoute('/_authed/summary')({
  validateSearch: drillSearchSchema.extend(tableSearchSchema(PAYMENT_BILL_SORT_KEYS).shape),
  loaderDeps: ({ search }) => ({
    entity: search.entity,
    preset: search.preset,
    from: search.from,
    to: search.to,
    p13: search.p13,
  }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(summaryMetricOptions(deps)),
  pendingComponent: MetricSkeleton,
  errorComponent: MetricError,
  component: SummaryPage,
})

function SummaryPage() {
  const deps = Route.useLoaderDeps()
  const navigate = useNavigate()
  const { data } = useQuery(summaryMetricOptions(deps))
  const { t, i18n } = useTranslation()
  const lang = (i18n.language?.startsWith('en') ? 'en' : 'id') as Lang

  const [donutTab, setDonutTab] = useState<'revenue' | 'expense'>('revenue')

  if (!data) return null

  const compareLabel = getCompareLabel(deps.from && deps.to ? 'custom' : deps.preset, lang)

  /** Opens another page with the same filters. */
  const goTo = (to: '/cash-position' | '/revenue' | '/profit-loss' | '/payables' | '/cash-flow' | '/payment-plan') =>
    navigate({ to, search: searchUpdater((prev) => prev) })

  const donutItems =
    donutTab === 'revenue'
      ? data.revenue.byFolder.map((f) => ({
          id: f.id,
          name: f.label,
          amount: f.amount,
        }))
      : data.expenseFolders.map((f) => ({
          id: f.id,
          name: translateLabel(t, f.label),
          amount: f.amount,
        }))

  // A ring with a single entity is one full circle and says nothing: the card needs at least two
  // selected entities and at least two of them with revenue above zero.
  const positiveEntities = data.revenue.byEntity.filter((e) => D(e.amount).gt(0)).length
  const showEntityCard = data.meta.entityCount >= 2 && positiveEntities >= 2

  const cashflowChart = (
    <CashflowChart
      title={t('nav.cashFlow')}
      data={data.cashFlow.monthly}
      net={data.cashFlow.netCashFlow}
      lang={lang}
      onSelectMonth={() => goTo('/cash-flow')}
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
      totalLabel={
        donutTab === 'revenue'
          ? t('ui.summary.totalRevenue')
          : t('ui.summary.totalExpense')
      }
      lang={lang}
      onSelect={() => goTo(donutTab === 'revenue' ? '/revenue' : '/profit-loss')}
    />
  )

  return (
    <div className="space-y-6">
      <PrintHeader
        title={t('nav.summary')}
        entity={deps.entity}
        preset={deps.from && deps.to ? `${deps.from} – ${deps.to}` : deps.preset}
        asOf={data.meta.asOf}
      />
      {data.meta.hasOpenPeriod && (
        <Notice
          tone="warning"
          title={t('metric.openPeriodWarning', {
            month: formatMonthYear(data.meta.asOf, lang),
          })}
        />
      )}
      {data.meta.missingMonths.length > 0 && (
        <Notice
          tone="warning"
          title={t('metric.missingMonthsWarning')}
          body={data.meta.missingMonths.join(', ')}
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <CashBalanceCard
          asOf={data.meta.asOf}
          entityCount={data.cashPosition.entityCount || 1}
          cash={data.cashPosition.cash}
          bank={data.cashPosition.bank}
          deposit={data.cashPosition.deposit}
          inTransit={data.cashPosition.inTransit}
          giroOutstanding={data.cashPosition.giroOutstanding}
          onOpen={() => goTo('/cash-position')}
        />

        <KpiCard
          label={t('nav.revenue')}
          value={data.revenue.total}
          compareValue={data.revenue.compare}
          compareLabel={compareLabel}
          higherIsBetter={true}
          onOpen={() => goTo('/revenue')}
        />

        <KpiCard
          label={t('nav.pnl')}
          value={data.pnl.netProfit}
          compareLabel={
            data.pnl.netMargin ? `${t('metric.netMargin')}: ${formatPercent(data.pnl.netMargin, lang, 1)}` : undefined
          }
          higherIsBetter={true}
          onOpen={() => goTo('/profit-loss')}
        />

        <KpiCard
          label={t('nav.payables')}
          value={data.apAging.total}
          compareValue={data.apAging.overdueBills}
          compareLabel={t('ui.summary.overdue')}
          higherIsBetter={false}
          onOpen={() => goTo('/payables')}
        />
      </div>

      {showEntityCard ? (
        <div className="space-y-6">
          {cashflowChart}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {compositionDonut}
            <DonutBreakdown
              variant="entity"
              title={t('ui.summary.revenueByEntity')}
              items={data.revenue.byEntity.map((e) => ({ id: e.id, name: e.name, amount: e.amount }))}
              unassigned={data.revenue.entityUnassigned}
              totalLabel={t('ui.summary.totalRevenue')}
              lang={lang}
              periodLabel={formatMonthYear(data.meta.asOf, lang)}
              detailsLabel={t('ui.summary.details')}
              onDetails={() => goTo('/revenue')}
              onSelect={() => goTo('/revenue')}
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">{cashflowChart}</div>
          <div className="lg:col-span-1">{compositionDonut}</div>
        </div>
      )}

      <BillsTable filters={deps} lang={lang} onRowClick={() => goTo('/payment-plan')} />

      <MiniMetricsBar
        metrics={{ runway: data.runway, grossMargin: data.pnl.grossMargin, netMargin: data.pnl.netMargin }}
        lang={lang}
      />
    </div>
  )
}
