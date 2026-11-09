import { metricLoaderDeps, drillSearchSchema } from '~/lib/filters/search-schema'
import { searchUpdater } from '~/lib/filters/search-update'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { summaryChartsOptions, summaryHeadOptions, summaryMiniOptions } from '~/queries/metrics.queries'
import { tableSearchSchema } from '~/lib/table/query'
import { PAYMENT_BILL_SORT_KEYS } from '~/lib/finance/ap-ar/payment-plan-bills'
import { MetricSkeleton } from '~/components/layout/MetricSkeleton'
import { MetricError } from '~/components/layout/MetricError'
import { MetricPageHeader } from '~/components/layout/MetricPageHeader'
import { useLang } from '~/hooks/use-lang'
import { BillsTable } from '~/components/summary/BillsTable'
import { SummaryChartsSection } from '~/components/summary/SummaryChartsSection'
import { SummaryKpiRow } from '~/components/summary/SummaryKpiRow'
import { SummaryMiniSection } from '~/components/summary/SummaryMiniSection'
import { compareLabelKey } from '~/lib/format/date'

export const Route = createFileRoute('/_authed/summary')({
  validateSearch: drillSearchSchema.extend(tableSearchSchema(PAYMENT_BILL_SORT_KEYS).shape),
  loaderDeps: ({ search }) => metricLoaderDeps(search),
  loader: ({ context, deps }) => {
    // The charts and the small figures start loading now but are not awaited: the page shows as soon as the top row is ready.
    void context.queryClient.prefetchQuery(summaryChartsOptions(deps))
    void context.queryClient.prefetchQuery(summaryMiniOptions(deps))
    return context.queryClient.ensureQueryData(summaryHeadOptions(deps))
  },
  pendingComponent: MetricSkeleton,
  errorComponent: MetricError,
  component: SummaryPage,
})

function SummaryPage() {
  const deps = Route.useLoaderDeps()
  const navigate = useNavigate()
  const { data } = useQuery(summaryHeadOptions(deps))
  const lang = useLang()
  const { t } = useTranslation()

  if (!data) return null

  const compareLabel = t(compareLabelKey(deps))

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

      <SummaryChartsSection
        filters={deps}
        asOf={data.meta.asOf}
        lang={lang}
        entityCount={data.meta.entityCount}
        onOpen={goTo}
      />

      <BillsTable filters={deps} lang={lang} onRowClick={() => goTo('/payment-plan')} />

      <SummaryMiniSection filters={deps} lang={lang} />
    </div>
  )
}
