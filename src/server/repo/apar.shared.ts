import '@tanstack/react-start/server-only'
import { sql, type SQL } from 'drizzle-orm'
import { inList } from '~/server/db/in-list'
import type { Id, IsoDate } from '~/lib/finance/types'

export const toDay = (v: unknown): IsoDate => String(v).slice(0, 10)
export const idOrEmpty = (v: unknown): Id => (v ? String(v) : '')

/** `AND <alias>.location_id IN (...)` for one location slice, or nothing when the slice is "all". */
export function locationFilter(alias: 'i' | 'p', slice: string[] | undefined): SQL {
  return slice ? sql`AND ${sql.identifier(alias)}.location_id IN (${inList(slice)})` : sql``
}
