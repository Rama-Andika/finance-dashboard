import { searchUpdater } from '~/lib/filters/search-update'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { drillSearchSchema } from '~/lib/filters/search-schema'
import { summaryMetricOptions } from '~/queries/metrics.queries'
import { tableSearchSchema } from '~/lib/table/query'
import { PAYMENT_BILL_SORT_KEYS } from '~/lib/finance/ap-ar/payment-plan-bills'
import { MetricSkeleton } from '~/components/neraca/MetricSkeleton'
import { MetricError } from '~/components/neraca/MetricError'
import { MetricPageHeader } from '~/components/layout/MetricPageHeader'
import { useLang } from '~/components/layout/use-lang'
import { BillsTable } from '~/components/summary/BillsTable'
import { MiniMetricsBar } from '~/components/summary/MiniMetricsBar'
import { SummaryCharts } from '~/components/summary/SummaryCharts'
import { SummaryKpiRow } from '~/components/summary/SummaryKpiRow'
import { getCompareLabel } from '~/lib/format/date'

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
  const lang = useLang()

  if (!data) return null

  const compareLabel = getCompareLabel(deps.from && deps.to ? 'custom' : deps.preset, lang)

  /** Opens another page with the same filters. */
  const goTo = (to: '/cash-position' | '/revenue' | '/profit-loss' | '/payables' | '/cash-flow' | '/payment-plan') =>
    navigate({ to, search: searchUpdater((prev) => prev) })

  return (
    <div className="space-y-6">
      <MetricPageHeader titleKey="nav.summary" filter={deps} meta={data.meta} lang={lang} />

      <SummaryKpiRow
        asOf={data.meta.asOf}
        lang={lang}
        compareLabel={compareLabel}
        cashPosition={data.cashPosition}
        revenue={data.revenue}
        pnl={data.pnl}
        apAging={data.apAging}
        onOpen={goTo}
      />

      <SummaryCharts
        asOf={data.meta.asOf}
        lang={lang}
        entityCount={data.meta.entityCount}
        cashFlow={data.cashFlow}
        revenueByFolder={data.revenue.byFolder}
        expenseFolders={data.expenseFolders}
        revenueByEntity={data.revenue.byEntity}
        entityUnassigned={data.revenue.entityUnassigned}
        onOpen={goTo}
      />

      <BillsTable filters={deps} lang={lang} onRowClick={() => goTo('/payment-plan')} />

      <MiniMetricsBar
        metrics={{ runway: data.runway, grossMargin: data.pnl.grossMargin, netMargin: data.pnl.netMargin }}
        lang={lang}
      />
    </div>
  )
}
