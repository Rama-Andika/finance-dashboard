import '@tanstack/react-start/server-only'
import type { Period } from '~/lib/core/types'

const GL_TABLE_RE = /^gl(_20\d{2})?$/ // 'gl', 'gl_2015', ..., 'gl_2099'

export function glTablesOf(tableName: string): { gl: string; glDetail: string } {
  if (!GL_TABLE_RE.test(tableName)) {
    throw new Error(`Unknown GL table name: ${tableName}`)
  }
  const suffix = tableName.slice(2) // '' or '_2015'
  return { gl: tableName, glDetail: `gl_detail${suffix}` }
}

/** Group periods by their GL table. */
export function groupPeriodsByTable(periods: Period[]): Map<string, Period[]> {
  const map = new Map<string, Period[]>()
  for (const period of periods) {
    const table = period.tableName
    glTablesOf(table)
    const list = map.get(table)
    if (list) {
      list.push(period)
    } else {
      map.set(table, [period])
    }
  }
  return map
}

/** Tables that may hold journals between `from` and `to` (data-model §2.2, periode.table_name). */
export function tablesBetween(periods: Period[], from: string, to: string, fallback: string): string[] {
  const tables = Array.from(
    new Set(periods.filter((p) => p.endDate >= from && p.startDate <= to).map((p) => p.tableName)),
  )
  return tables.length > 0 ? tables : [fallback]
}
