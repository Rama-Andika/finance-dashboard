import { describe, expect, it } from 'vitest'
import { clearCache } from '~/server/cache'
import { resolveFilter } from '~/server/context'
import {
  computeSummary,
  computeSummaryCharts,
  computeSummaryHead,
  computeSummaryMini,
} from '~/server/services/summary.service'

const TIMEOUT = 600_000

describe('Summary sections equal the full Summary', () => {
  it(
    'head, charts and mini carry the same figures as computeSummary',
    async () => {
      clearCache()
      const filter = await resolveFilter({ entity: 'all', preset: 'last-month', p13: false })
      const [full, head, charts, mini] = await Promise.all([
        computeSummary(filter),
        computeSummaryHead(filter),
        computeSummaryCharts(filter),
        computeSummaryMini(filter),
      ])

      expect(head.cashPosition).toEqual(full.cashPosition)
      expect(head.revenue).toEqual({ total: full.revenue.total, compare: full.revenue.compare })
      expect(head.pnl).toEqual({ netProfit: full.pnl.netProfit, netMargin: full.pnl.netMargin })
      expect(head.apAging).toEqual(full.apAging)

      expect(charts.cashFlow).toEqual(full.cashFlow)
      expect(charts.revenueByFolder).toEqual(full.revenue.byFolder)
      expect(charts.revenueByEntity).toEqual(full.revenue.byEntity)
      expect(charts.entityUnassigned).toEqual(full.revenue.entityUnassigned)
      expect(charts.expenseFolders).toEqual(full.expenseFolders)
      expect(charts.fixedCostFolders).toEqual(full.fixedCostFolders)
      expect(charts.fixedCostBasketEmpty).toBe(full.fixedCostBasketEmpty)

      expect(mini.runway).toEqual(full.runway)
      expect(mini.grossMargin).toEqual(full.pnl.grossMargin)
      expect(mini.netMargin).toEqual(full.pnl.netMargin)
    },
    TIMEOUT,
  )
})
