import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { exportChunkShape, fetchAllChunks, MAX_EXPORT_CHUNKS } from './export-chunks'
import type { Page } from './query'

/** A fake server: `all` is cut into pages of `pageSize` rows, like `paginate` does. */
function fakeServer(all: number[], pageSize: number) {
  return vi.fn(
    async (page: number): Promise<Page<number>> => ({
      rows: all.slice((page - 1) * pageSize, page * pageSize),
      total: all.length,
      page,
      pageSize,
    }),
  )
}

describe('fetchAllChunks', () => {
  it('joins all chunks in order', async () => {
    const server = fakeServer([1, 2, 3, 4, 5, 6, 7], 3)
    const rows = await fetchAllChunks(server)
    expect(rows).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(server).toHaveBeenCalledTimes(3)
    expect(server.mock.calls.map((call) => call[0])).toEqual([1, 2, 3])
  })

  it('asks for one chunk only when everything fits in it', async () => {
    const server = fakeServer([1, 2], 5)
    expect(await fetchAllChunks(server)).toEqual([1, 2])
    expect(server).toHaveBeenCalledTimes(1)
  })

  it('returns an empty list without further requests when the table is empty', async () => {
    const server = fakeServer([], 5)
    expect(await fetchAllChunks(server)).toEqual([])
    expect(server).toHaveBeenCalledTimes(1)
  })

  it('fails when the total changes between chunks', async () => {
    const server = vi.fn(
      async (page: number): Promise<Page<number>> => ({
        rows: [page],
        total: page === 1 ? 4 : 5,
        page,
        pageSize: 2,
      }),
    )
    await expect(fetchAllChunks(server)).rejects.toThrow('The data changed while the export was loading')
  })

  it('refuses a table that needs more chunks than the safety limit, after one request', async () => {
    const server = vi.fn(
      async (page: number): Promise<Page<number>> => ({
        rows: [],
        total: (MAX_EXPORT_CHUNKS + 1) * 2,
        page,
        pageSize: 2,
      }),
    )
    await expect(fetchAllChunks(server)).rejects.toThrow('Export too large')
    expect(server).toHaveBeenCalledTimes(1)
  })
})
describe('exportChunkShape', () => {
  const shape = exportChunkShape(['name', 'amount'] as const)
  const schema = z.object(shape)

  it('has only page, sortBy and sortDir', () => {
    expect(Object.keys(shape).sort()).toEqual(['page', 'sortBy', 'sortDir'])
  })

  it('keeps valid input', () => {
    expect(schema.parse({ page: '3', sortBy: 'amount', sortDir: 'desc' })).toEqual({
      page: 3,
      sortBy: 'amount',
      sortDir: 'desc',
    })
  })

  it('falls back to page 1, no sort column and ascending order for bad input', () => {
    expect(schema.parse({ page: 'x', sortBy: 'other', sortDir: 'up' })).toEqual({
      page: 1,
      sortBy: undefined,
      sortDir: 'asc',
    })
  })
})
