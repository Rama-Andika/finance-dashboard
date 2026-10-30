import '@tanstack/react-start/server-only'
import { memoMetric } from '~/server/cache'
import type { Id, MetricMeta, Money } from '~/lib/core/types'
import { type AppContextFilter, buildMetricMeta } from '~/server/context'
import { controlAccountsGlTotal } from '~/server/services/shared/aging.helper'
import { createAgingReader, type AgingSource } from '~/server/services/shared/aging-reader'
import { reconcileAging, type AgingReconciliation } from '~/lib/finance/ap-ar/aging-reconciliation'

/** The parts every aging result is built from; each side only decides how to name them. */
export type AgingResultParts<Computed> = {
  meta: MetricMeta
  computed: Computed
  compareTotal: Money | null
  reconciliation: AgingReconciliation
}

type Computed = { total: Money; controlAccounts: Array<{ coaId: Id; code: string; name: string }> }

/**
 * One aging metric (payables or receivables): the shared reader, the comparison total, the GL reconciliation and
 * the memo. `ap-aging` and `ar-aging` only describe their source and how their result is shaped.
 */
export function createAgingMetric<Open, Unallocated, C extends Computed, Result>(config: {
  /** Memo name of the whole metric. */
  metricName: string
  source: AgingSource<Open, Unallocated, C>
  toResult: (parts: AgingResultParts<C>) => Result
}) {
  const reader = createAgingReader(config.source)

  async function computeUncached(filter: AppContextFilter): Promise<Result> {
    const meta = buildMetricMeta(filter)
    const { computed, names, tree } = await reader.core(filter)

    // The comparison total and the GL reconciliation do not depend on each other
    const controlCoaIds = computed.controlAccounts.map((a) => a.coaId)
    const [compareTotal, glTotal] = await Promise.all([
      reader.compareTotal(filter, names, tree),
      controlAccountsGlTotal(filter, controlCoaIds),
    ])

    return config.toResult({ meta, computed, compareTotal, reconciliation: reconcileAging(glTotal, computed.total) })
  }

  return {
    compute: (filter: AppContextFilter): Promise<Result> =>
      memoMetric(config.metricName, filter, () => computeUncached(filter)),
    /** The heavy, snapshot-derived part alone (the party tables need no GL read and no reconciliation). */
    core: reader.core,
  }
}
