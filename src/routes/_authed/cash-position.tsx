import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { drillSearchSchema } from '~/lib/filters/search-schema'
import {
  cashPositionMetricOptions,
  runwayMetricOptions,
} from '~/queries/metrics.queries'
import { MetricSkeleton } from '~/components/neraca/MetricSkeleton'
import { MetricError } from '~/components/neraca/MetricError'
import { Notice } from '~/components/neraca/Notice'
import { CashBalanceCard } from '~/components/neraca/CashBalanceCard'
import { KpiCard } from '~/components/neraca/KpiCard'
import { MetricPageHeader } from '~/components/layout/MetricPageHeader'
import { useLang } from '~/components/layout/use-lang'
import { CashBankTable } from '~/components/cash-position/CashBankTable'
import { InTransitTable } from '~/components/cash-position/InTransitTable'
import { EntityBalanceTable } from '~/components/cash-position/EntityBalanceTable'
import { formatMoneyShort } from '~/lib/format/number'
import { runwayLabel } from '~/lib/finance/cash/runway-label'

export const Route = createFileRoute('/_authed/cash-position')({
  validateSearch: drillSearchSchema,
  loaderDeps: ({ search }) => ({
    entity: search.entity,
    preset: search.preset,
    from: search.from,
    to: search.to,
    p13: search.p13,
  }),
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(cashPositionMetricOptions(deps)),
      context.queryClient.ensureQueryData(runwayMetricOptions(deps)),
    ]),
  pendingComponent: MetricSkeleton,
  errorComponent: MetricError,
  component: CashPositionPage,
})

function CashPositionPage() {
  const deps = Route.useLoaderDeps()
  const { data } = useQuery(cashPositionMetricOptions(deps))
  const { data: runwayData } = useQuery(runwayMetricOptions(deps))
  const { t } = useTranslation()
  const lang = useLang()

  if (!data) return null

  return (
    <div className="space-y-6">
      <MetricPageHeader titleKey="nav.cashPosition" filter={deps} meta={data.meta} lang={lang} />

      {!data.reconciliation.inSync && (
        <Notice
          tone="danger"
          title={t('ui.cashPosition.registerDiff', { amount: formatMoneyShort(data.reconciliation.diff, lang) })}
          body={t('ui.cashPosition.likelySomeSettlementJournalsHave')}
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <CashBalanceCard
          asOf={data.meta.asOf}
          entityCount={data.byEntity.length}
          cash={data.cash}
          bank={data.bank}
          deposit={data.deposit}
          inTransit={data.inTransit}
          giroOutstanding={data.giroOutstanding}
        />

        <KpiCard
          label={t('ui.cashPosition.inTransit')}
          value={data.inTransit}
          compareLabel={t('ui.cashPosition.channelCount', { count: data.inTransitDetail.length })}
          higherIsBetter={false}
        />

        <KpiCard
          label={t('metric.runway')}
          value={runwayLabel(t, runwayData)}
          compareLabel={
            runwayData?.avgBurn
              ? `${t('metric.avgBurn')}: ${formatMoneyShort(runwayData.avgBurn, lang)}`
              : undefined
          }
          higherIsBetter={true}
        />
      </div>

      <CashBankTable rows={data.byFolder} lang={lang} scope={deps} />
      <InTransitTable rows={data.inTransitDetail} lang={lang} />
      <EntityBalanceTable rows={data.byEntity} lang={lang} />
    </div>
  )
}
