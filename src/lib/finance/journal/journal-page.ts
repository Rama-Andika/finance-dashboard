export type JournalPageRow = {
  glId: string
  transDate: string
  coaId: string
}

function compareIds(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length
  return a < b ? -1 : a > b ? 1 : 0
}

/** Newest first: trans_date DESC, gl_id DESC, then coa_id ASC (a stable total order). */
export function compareJournalRows(a: JournalPageRow, b: JournalPageRow): number {
  if (a.transDate !== b.transDate) return a.transDate < b.transDate ? 1 : -1
  const byGl = compareIds(b.glId, a.glId)
  if (byGl !== 0) return byGl
  return compareIds(a.coaId, b.coaId)
}

/**
 * Merges per-table result sets (each fetched with `limit = offset + pageSize`, offset 0)
 * into one globally ordered page.
 */
export function mergeJournalPages<T extends JournalPageRow>(
  perTable: readonly (readonly T[])[],
  offset: number,
  limit: number,
): T[] {
  return perTable.flat().sort(compareJournalRows).slice(offset, offset + limit)
}
