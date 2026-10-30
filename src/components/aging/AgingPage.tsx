import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { searchUpdater } from '~/lib/filters/search-update'
import type { MetricInput } from '~/lib/filters/search-schema'
import type { AgingBucket } from '~/lib/finance/ap-ar/aging'
import { sum } from '~/lib/core/money'
import type { Lang, MetricMeta, Money } from '~/lib/core/types'
import { formatMoneyFull, formatMoneyShort } from '~/lib/format/number'
import { getCompareLabel } from '~/lib/format/date'
import { Notice } from '~/components/neraca/Notice'
import { KpiCard } from '~/components/neraca/KpiCard'
import { AgingBar } from '~/components/neraca/AgingBar'
import { MetricPageHeader } from '~/components/layout/MetricPageHeader'
import { useLang } from '~/components/layout/use-lang'
import { AgingPartiesTable } from './AgingPartiesTable'
import { SIDES, type SideConfig } from './aging-sides'

/** The part of an AP or AR aging result that the page shows (both sides share it). */
export type AgingPageData = {
  meta: MetricMeta
  total: Money
  compareTotal: Money | null
  buckets: Record<AgingBucket, Money>
  overdueSubtotal: Money
  reconciliation: { gl: Money; subledger: Money; diff: Money; inSync: boolean }
}

export type AgingKpi = { label: string; value: Money; higherIsBetter: boolean }

/** Warns when the subledger total differs from the general ledger control accounts. */
function ReconciliationNotice({ data, cfg, lang }: { data: AgingPageData; cfg: SideConfig; lang: Lang }) {
  const { t } = useTranslation()
  if (data.reconciliation.inSync) return null
  return (
    <Notice
      tone="warning"
      title={t(cfg.keys.reconciliationDiff, { amount: formatMoneyShort(data.reconciliation.diff, lang) })}
      body={t(cfg.keys.reconciliationDetail, {
        gl: formatMoneyFull(data.reconciliation.gl, lang),
        cards: formatMoneyFull(data.reconciliation.subledger, lang),
      })}
    />
  )
}

/** The bar segments: everything not yet due as one, then the four overdue buckets. */
function agingSegments(data: AgingPageData, cfg: SideConfig, t: (key: string) => string) {
  // Not due = the four "due in the future" buckets together
  const notDueSum = sum([data.buckets.due90plus, data.buckets.due61_90, data.buckets.due31_60, data.buckets.due1_30])
  return [
    { key: 'notDue' as const, label: t(cfg.keys.notDue), amount: notDueSum },
    { key: 'd0_30' as const, label: t('agingBucket.d0_30'), amount: data.buckets.overdue0_30 },
    { key: 'd31_60' as const, label: t('agingBucket.d31_60'), amount: data.buckets.overdue31_60 },
    { key: 'd61_90' as const, label: t('agingBucket.d61_90'), amount: data.buckets.overdue61_90 },
    { key: 'd90plus' as const, label: t('agingBucket.d90plus'), amount: data.buckets.overdue90plus },
  ]
}

/** Payables (AP) and Receivables (AR) pages: same layout, different wording, KPIs and drill metric. */
export function AgingPage({
  side,
  data,
  deps,
  kpis,
}: {
  side: 'ap' | 'ar'
  data: AgingPageData
  deps: MetricInput
  /** Four KPI cards; the first one also shows the comparison with the previous period. */
  kpis: [AgingKpi, AgingKpi, AgingKpi, AgingKpi]
}) {
  const cfg = SIDES[side]
  const navigate = useNavigate()
  const { t } = useTranslation()
  const lang = useLang()

  const openDrill = (kind: 'bucket' | 'vendor' | 'customer', id: string, label: string) => {
    navigate({
      to: cfg.route,
      resetScroll: false,
      search: searchUpdater((prev) => ({
        ...prev,
        drill: { metric: cfg.drillMetric, steps: [{ kind, id, label }] },
      })),
    })
  }

  const compareLabel = getCompareLabel(deps.from && deps.to ? 'custom' : deps.preset, lang)

  return (
    <div className="space-y-6">
      <MetricPageHeader titleKey={cfg.navKey} filter={deps} meta={data.meta} lang={lang} />
      <ReconciliationNotice data={data} cfg={cfg} lang={lang} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <KpiCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            higherIsBetter={kpi.higherIsBetter}
            {...(i === 0 ? { compareValue: data.compareTotal, compareLabel } : {})}
          />
        ))}
      </div>

      <AgingBar
        title={t(cfg.keys.agingTitle)}
        asOf={data.meta.asOf}
        total={data.total}
        segments={agingSegments(data, cfg, t)}
        lang={lang}
        onSelect={(bucket) => openDrill('bucket', bucket, bucket)}
      />

      <AgingPartiesTable
        side={side}
        deps={deps}
        lang={lang}
        onOpenParty={(id, name) => openDrill(cfg.partyKind, id, name)}
      />
    </div>
  )
}
