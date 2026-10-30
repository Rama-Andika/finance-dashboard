import { summarizePlan } from '~/lib/finance/ap-ar/payment-plan'
import { searchUpdater } from '~/lib/filters/search-update'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  paymentPlanSearchSchema,
  drillSearchSchema,
} from '~/lib/filters/search-schema'
import { paymentPlanMetricOptions } from '~/queries/metrics.queries'
import { MetricSkeleton } from '~/components/neraca/MetricSkeleton'
import { MetricError } from '~/components/neraca/MetricError'
import { Notice } from '~/components/neraca/Notice'
import { KpiCard } from '~/components/neraca/KpiCard'
import { MetricPageHeader } from '~/components/layout/MetricPageHeader'
import { useLang } from '~/components/layout/use-lang'
import { PaymentPlanControls } from '~/components/payment-plan/PaymentPlanControls'
import { ProjectedBalanceChart } from '~/components/payment-plan/ProjectedBalanceChart'
import { DailyScheduleTable } from '~/components/payment-plan/DailyScheduleTable'
import { formatMoneyShort } from '~/lib/format/number'

export const Route = createFileRoute('/_authed/payment-plan')({
  validateSearch: paymentPlanSearchSchema.extend(drillSearchSchema.shape),
  loaderDeps: ({ search }) => ({
    entity: search.entity,
    preset: search.preset,
    from: search.from,
    to: search.to,
    p13: search.p13,
    horizon: search.horizon,
    inflow: search.inflow,
  }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(paymentPlanMetricOptions(deps)),
  pendingComponent: MetricSkeleton,
  errorComponent: MetricError,
  component: PaymentPlanPage,
})

function PaymentPlanPage() {
  const deps = Route.useLoaderDeps()
  const navigate = useNavigate()
  const { data } = useQuery(paymentPlanMetricOptions(deps))
  const { t } = useTranslation()
  const lang = useLang()

  if (!data) return null

  /** Changes part of the search params on this page without scrolling back to the top. */
  const updateSearch = (patch: Record<string, unknown>) =>
    navigate({
      to: '/payment-plan',
      resetScroll: false,
      search: searchUpdater((prev) => ({ ...prev, ...patch })),
    })

  const { totalOutflow, minClosing } = summarizePlan(data)

  return (
    <div className="space-y-6">
      <MetricPageHeader titleKey="nav.paymentPlan" filter={deps} meta={data.meta} lang={lang} showMissingMonths={false} />

      <PaymentPlanControls
        horizon={deps.horizon}
        inflow={deps.inflow}
        onHorizonChange={(horizon) => updateSearch({ horizon })}
        onToggleInflow={() => updateSearch({ inflow: !deps.inflow })}
      />

      {Number(data.overdue) > 0 && (
        <Notice
          tone="warning"
          title={t('ui.paymentPlan.overdueNotice', { amount: formatMoneyShort(data.overdue, lang) })}
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label={t('ui.paymentPlan.openingCash')} value={data.openingBalance} higherIsBetter={true} />
        <KpiCard label={t('ui.paymentPlan.totalPlannedOutflows')} value={totalOutflow} higherIsBetter={false} />
        <KpiCard label={t('ui.paymentPlan.lowestProjectedBalance')} value={minClosing} higherIsBetter={true} />
      </div>

      <ProjectedBalanceChart days={data.days} horizon={deps.horizon} lang={lang} />

      <DailyScheduleTable
        days={data.days}
        lang={lang}
        scope={deps}
        onSelectDay={(date) =>
          updateSearch({ drill: { metric: 'paymentPlan', steps: [{ kind: 'day', id: date, label: date }] } })
        }
      />
    </div>
  )
}
