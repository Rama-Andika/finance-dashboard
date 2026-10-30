import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/server/env', () => ({ env: { APP_TODAY: '2026-10-15', APP_TIMEZONE: 'Asia/Jakarta' } }))
vi.mock('~/server/context', () => ({ getCachedCoaTree: async () => ({ tree: true }) }))
vi.mock('~/server/dash/snapshot', () => ({
  memoBySnapshot: (_name: string, _params: unknown, loader: () => Promise<unknown>) => loader(),
}))
let compareAvailable = true
vi.mock('~/server/services/shared/aging.helper', () => ({
  agingCompareIsAvailable: async () => compareAvailable,
  distinctIds: (...lists: Array<Array<string | null | undefined>>) =>
    Array.from(new Set(lists.flat().filter((id): id is string => Boolean(id)))),
}))

const { createAgingReader } = await import('./aging-reader')

type Open = { partyId: string; amount: string }
type Unallocated = { partyId: string; amount: string }

const openItems = vi.fn<(asOfPlusOne: string, loc: string[] | 'all') => Promise<Open[]>>()
const unallocatedItems = vi.fn<(asOfPlusOne: string, loc: string[] | 'all') => Promise<Unallocated[]>>()
const loadPartyNames = vi.fn<(ids: string[]) => Promise<Map<string, { code: string; name: string }>>>()
const compute = vi.fn()

const reader = createAgingReader({
  cacheName: 'testAgingCore',
  openItems: (d, l) => openItems(d, l),
  unallocatedItems: (d, l) => unallocatedItems(d, l),
  openPartyId: (item: Open) => item.partyId,
  unallocatedPartyId: (item: Unallocated) => item.partyId,
  loadPartyNames: (ids) => loadPartyNames(ids),
  compute: (input) => compute(input) as { total: string },
})

const filter = {
  locationIds: 'all' as const,
  asOf: '2026-10-15',
  compare: { d1: '2026-09-01', asOf: '2026-09-15', periodIds: [] as string[] },
} as never

describe('createAgingReader', () => {
  beforeEach(() => {
    for (const m of [openItems, unallocatedItems, loadPartyNames, compute]) m.mockReset()
    compareAvailable = true
    openItems.mockResolvedValue([{ partyId: 'a', amount: '10.00' }, { partyId: 'b', amount: '5.00' }])
    unallocatedItems.mockResolvedValue([{ partyId: 'b', amount: '2.00' }])
    loadPartyNames.mockResolvedValue(new Map([['a', { code: 'A', name: 'Party A' }]]))
    compute.mockReturnValue({ total: '13.00' })
  })

  it('reads both lists for the day after asOf and asks for each party name once', async () => {
    const { computed, names } = await reader.core(filter)
    expect(openItems).toHaveBeenCalledWith('2026-10-16', 'all')
    expect(unallocatedItems).toHaveBeenCalledWith('2026-10-16', 'all')
    expect(loadPartyNames).toHaveBeenCalledWith(['a', 'b'])
    expect(computed).toEqual({ total: '13.00' })
    expect(names.get('a')?.name).toBe('Party A')
    expect(compute).toHaveBeenCalledWith(expect.objectContaining({ asOf: '2026-10-15' }))
  })

  it('compareTotal computes the total at the comparison date', async () => {
    const names = new Map()
    compute.mockReturnValue({ total: '7.00' })
    expect(await reader.compareTotal(filter, names, {} as never)).toBe('7.00')
    expect(openItems).toHaveBeenCalledWith('2026-09-16', 'all')
    expect(compute).toHaveBeenCalledWith(expect.objectContaining({ asOf: '2026-09-15', names }))
  })

  it('compareTotal is null when the comparison date cannot be answered quickly, and reads nothing', async () => {
    compareAvailable = false
    expect(await reader.compareTotal(filter, new Map(), {} as never)).toBeNull()
    expect(openItems).not.toHaveBeenCalled()
  })

  it('compareTotal is null without a comparison period', async () => {
    const noCompare = { locationIds: 'all', asOf: '2026-10-15', compare: undefined } as never
    expect(await reader.compareTotal(noCompare, new Map(), {} as never)).toBeNull()
    expect(openItems).not.toHaveBeenCalled()
  })
})
