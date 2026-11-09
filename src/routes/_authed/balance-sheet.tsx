import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  balanceSheetSearchSchema,
  drillSearchSchema,
  metricLoaderDeps,
  type MetricInput,
} from '~/lib/filters/search-schema'
import { searchUpdater } from '~/lib/filters/search-update'
import { balanceSheetMetricOptions } from '~/queries/metrics.queries'
import { MetricSkeleton } from '~/components/layout/MetricSkeleton'
import { MetricError } from '~/components/layout/MetricError'
import { MetricPageHeader } from '~/components/layout/MetricPageHeader'
import { BalanceSheetControls } from '~/components/balance-sheet/BalanceSheetControls'
import { BalanceSheetDonuts } from '~/components/balance-sheet/BalanceSheetDonuts'
import { BalanceSheetKpiRow } from '~/components/balance-sheet/BalanceSheetKpiRow'
import { BalanceSheetNotices } from '~/components/balance-sheet/BalanceSheetNotices'
import { BalanceSheetTable } from '~/components/balance-sheet/BalanceSheetTable'
import { BalanceTrendSection } from '~/components/balance-sheet/BalanceTrendSection'
import { useLang } from '~/hooks/use-lang'
import { formatDate } from '~/lib/format/date'

export const Route = createFileRoute('/_authed/balance-sheet')({
  validateSearch: balanceSheetSearchSchema.extend(drillSearchSchema.shape),
  loaderDeps: ({ search }) => ({ ...metricLoaderDeps(search), compare: search.compare }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(balanceSheetMetricOptions(deps)),
  pendingComponent: MetricSkeleton,
  errorComponent: MetricError,
  component: BalanceSheetPage,
})

function BalanceSheetPage() {
  const deps = Route.useLoaderDeps()
  const navigate = useNavigate()
  const { data } = useQuery(balanceSheetMetricOptions(deps))
  const { t } = useTranslation()
  const lang = useLang()
  const [hideZero, setHideZero] = useState(true)

  if (!data) return null

  // The trend does not depend on what the table is compared with, so a change of comparison does not reload it.
  const trendInput: MetricInput = {
    entity: deps.entity,
    preset: deps.preset,
    p13: deps.p13,
    from: deps.from,
    to: deps.to,
  }

  return (
    <div className="space-y-6">
      <MetricPageHeader
        titleKey="nav.balanceSheet"
        filter={deps}
        meta={data.meta}
        lang={lang}
        showMissingMonths={false}
      />

      <BalanceSheetControls
        compare={deps.compare}
        hideZero={hideZero}
        period={data.period}
        includesPeriod13={data.includesPeriod13}
        lang={lang}
        onCompareChange={(compare) =>
          navigate({
            to: '/balance-sheet',
            resetScroll: false,
            search: searchUpdater((prev) => ({ ...prev, compare })),
          })
        }
        onHideZeroChange={setHideZero}
      />

      <BalanceSheetNotices data={data} lang={lang} />

      {data.status === 'ok' && data.period && (
        <>
          <BalanceSheetKpiRow
            statement={data.statement}
            compareLabel={data.compare?.period ? t(`balanceSheet.compare.${data.compare.mode}`) : undefined}
          />
          <BalanceSheetDonuts
            statement={data.statement}
            periodLabel={formatDate(data.period.reportDate, lang)}
            lang={lang}
          />
          <BalanceTrendSection input={trendInput} lang={lang} />
          <BalanceSheetTable data={data} hideZero={hideZero} lang={lang} scope={deps} />
        </>
      )}
    </div>
  )
}
