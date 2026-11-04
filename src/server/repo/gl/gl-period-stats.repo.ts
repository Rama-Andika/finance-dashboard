import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { glTablesOf } from '~/server/db/gl-tables'
import { glTableHasCanceledDate } from '~/server/db/gl-columns'
import type { PeriodHeaderStats } from '~/lib/finance/period/period-fingerprint'
import type { Period } from '~/lib/core/types'

type StatsDbRow = {
  journals: string | number
  maxGlId: string | number | null
  posted: string | number | null
  canceled: string | number | null
}

/**
 * A cheap summary of the journal headers of one period: one index range on period_id, the detail lines are not read.
 * A journal added, removed, posted, un-posted or canceled changes it; an edit of an amount inside an existing
 * journal does not (the snapshot job rebuilds the newest periods daily for that reason).
 */
export async function glPeriodStats(period: Pick<Period, 'periodeId' | 'tableName'>): Promise<PeriodHeaderStats> {
  const { gl } = glTablesOf(period.tableName)
  // Older ERP versions have no canceled_date column on the GL header.
  const canceledColumn = (await glTableHasCanceledDate(gl))
    ? sql`COALESCE(SUM(g.canceled_date IS NOT NULL), 0)`
    : sql`0`
  const res = await rows<StatsDbRow>(sql`
    SELECT COUNT(*) AS journals,
           COALESCE(MAX(g.gl_id), 0) AS maxGlId,
           COALESCE(SUM(g.posted_status = 1), 0) AS posted,
           ${canceledColumn} AS canceled
    FROM ${sql.identifier(gl)} g
    WHERE g.period_id = ${period.periodeId}
  `)
  const r = res[0]
  return {
    journals: String(r?.journals ?? 0),
    maxGlId: String(r?.maxGlId ?? 0),
    posted: String(r?.posted ?? 0),
    canceled: String(r?.canceled ?? 0),
  }
}
