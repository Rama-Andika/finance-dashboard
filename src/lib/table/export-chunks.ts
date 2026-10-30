import { tableQuerySchema, type Page } from '~/lib/table/query'

/**
 * Rows per request while a whole table is exported. A bill row is about 230 bytes, so 5,000 rows stay near
 * 1 MB, far below the 32 MB response limit of a server function.
 */
export const EXPORT_CHUNK_SIZE = 5000

/** Safety stop for the client loop: 400 chunks of 5,000 rows = 2,000,000 rows. */
export const MAX_EXPORT_CHUNKS = 400

/**
 * The fields a chunk request needs besides the metric filter. `pageSize` is left out on purpose:
 * the server always uses EXPORT_CHUNK_SIZE.
 */
export function exportChunkShape<K extends readonly [string, ...string[]]>(sortKeys: K) {
  const { page, sortBy, sortDir } = tableQuerySchema(sortKeys).shape
  return { page, sortBy, sortDir }
}

/**
 * Loads every row of a table by asking for chunk 1, 2, 3, ... one after another.
 * `fetchChunk` must return the sorted chunk for the given 1-based page number.
 * Fails (instead of returning a partial or duplicated list) when the table is too large or changes while loading.
 */
export async function fetchAllChunks<T>(fetchChunk: (page: number) => Promise<Page<T>>): Promise<T[]> {
  const first = await fetchChunk(1)
  const totalChunks = Math.ceil(first.total / Math.max(1, first.pageSize))
  if (totalChunks > MAX_EXPORT_CHUNKS) {
    throw new Error(`Export too large: ${first.total} rows`)
  }

  const rows: T[] = [...first.rows]
  for (let page = 2; page <= totalChunks; page += 1) {
    const chunk = await fetchChunk(page)
    if (chunk.total !== first.total) {
      throw new Error('The data changed while the export was loading')
    }
    rows.push(...chunk.rows)
  }
  return rows
}
