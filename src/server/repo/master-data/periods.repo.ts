import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import type { Period, PeriodStatus } from '~/lib/core/types'

type PeriodRow = {
  periodeId: string
  name: string
  startDate: string
  endDate: string
  status: string
  type: number
  tableName: string
}

export async function listPeriods(): Promise<Period[]> {
  const result = await rows<PeriodRow>(sql`
    SELECT periode_id AS periodeId, name AS name, start_date AS startDate, end_date AS endDate,
           status AS status, type AS type, table_name AS tableName
    FROM periode
    ORDER BY start_date, type
  `)

  return result.map((r) => ({
    periodeId: r.periodeId,
    name: r.name,
    startDate: r.startDate,
    endDate: r.endDate,
    status: r.status as PeriodStatus,
    type: r.type as 0 | 1 | 2 | 3,
    tableName: r.tableName || 'gl',
  }))
}
