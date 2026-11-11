import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCoaTree } from '~/lib/finance/coa/coa-tree'
import type { Period } from '~/lib/core/types'

const tree = buildCoaTree([
  {
    coaId: '1',
    parentId: '0',
    code: '1-1000',
    name: 'Cash',
    status: 'POSTABLE',
    level: 1,
    accountGroup: 'Liquid Assets',
    subAccountGroup: 'Cash',
    saldoNormal: 'DEBET',
  },
  {
    coaId: '2',
    parentId: '0',
    code: '1-2000',
    name: 'Bank',
    status: 'POSTABLE',
    level: 1,
    accountGroup: 'Liquid Assets',
    subAccountGroup: 'Bank',
    saldoNormal: 'DEBET',
  },
])

let periods: Period[] = []

vi.mock('~/server/env', () => ({ env: { APP_TODAY: '2026-10-15', APP_TIMEZONE: 'Asia/Jakarta' } }))
vi.mock('~/server/context', () => ({
  getCachedCoaTree: async () => tree,
  getCachedPeriods: async () => periods,
}))

const movementsByDate = vi.fn()
const openingBalances = vi.fn()
const countOpeningRows = vi.fn()
vi.mock('~/server/repo/gl/gl.repo', () => ({
  openingBalances: (...a: unknown[]) => openingBalances(...a),
  countOpeningRows: (...a: unknown[]) => countOpeningRows(...a),
  movementsByDate: (...a: unknown[]) => movementsByDate(...a),
}))

const { balancesAt, balancesBySegmentAt } = await import('./balance.service')
const { clearCache } = await import('~/server/cache')

const filter = {
  locationIds: 'all' as const,
  segmentDetailIds: 'all' as const,
  d1: '2026-10-01',
  asOf: '2026-10-15',
  periodIds: [],
  compare: { d1: '', asOf: '', periodIds: [] as string[] },
  today: '2026-10-15',
  entitySegmentColumn: 'segment1_id',
}

const period = (periodeId: string, startDate: string, endDate: string, status: 'Open' | 'Closed'): Period => ({
  periodeId,
  name: periodeId,
  startDate,
  endDate,
  status,
  type: 0,
  tableName: 'gl',
})

beforeEach(() => {
  clearCache()
  periods = []
  movementsByDate.mockReset()
  openingBalances.mockReset()
  countOpeningRows.mockReset()
  movementsByDate.mockResolvedValue([{ coaId: '1', debet: '100.00', credit: '40.00' }])
  openingBalances.mockResolvedValue([])
  countOpeningRows.mockResolvedValue(0)
})

describe('balance reads', () => {
  it('Cash Position, Runway and the reconciliations share one read of the same balances', async () => {
    const input = { asOf: '2026-10-15', coaIds: ['1'], filter }
    const [a, b] = await Promise.all([balancesAt(input), balancesAt({ ...input, coaIds: ['1'] })])
    await balancesAt(input)
    expect(movementsByDate).toHaveBeenCalledTimes(1)
    expect(a.byCoa.get('1')).toBe('60.00')
    expect(b.byCoa.get('1')).toBe('60.00')
  })

  it('reads again for another date or another account list', async () => {
    await balancesAt({ asOf: '2026-10-15', coaIds: ['1'], filter })
    await balancesAt({ asOf: '2026-10-14', coaIds: ['1'], filter })
    await balancesAt({ asOf: '2026-10-15', coaIds: ['1', '2'], filter })
    expect(movementsByDate).toHaveBeenCalledTimes(3)
  })

  it('the per-entity split is cached separately from the total', async () => {
    const input = { asOf: '2026-10-15', coaIds: ['1'], filter }
    await balancesAt(input)
    await balancesBySegmentAt(input)
    await balancesBySegmentAt(input)
    expect(movementsByDate).toHaveBeenCalledTimes(2)
  })

  it('an empty account list reads nothing', async () => {
    const res = await balancesAt({ asOf: '2026-10-15', coaIds: [], filter })
    expect(res.byCoa.size).toBe(0)
    expect(movementsByDate).not.toHaveBeenCalled()
  })
})

describe('one read of the whole window for every account list', () => {
  // September is closed and has saved opening balances; the window is 1 to 15 October (15 days).
  const shortWindow = () => {
    periods = [period('9', '2026-09-01', '2026-09-30', 'Closed'), period('10', '2026-10-01', '2026-10-31', 'Open')]
    countOpeningRows.mockResolvedValue(3)
    openingBalances.mockResolvedValue([
      { coaId: '1', opening: '5.00' },
      { coaId: '2', opening: '1.00' },
    ])
    movementsByDate.mockResolvedValue([
      { coaId: '1', debet: '100.00', credit: '40.00' },
      { coaId: '2', debet: '10.00', credit: '0.00' },
    ])
  }

  it('reads the openings and the movements once for different account lists, and each list gets only its accounts', async () => {
    shortWindow()

    const [cash, bank] = await Promise.all([
      balancesAt({ asOf: '2026-10-15', coaIds: ['1'], filter }),
      balancesAt({ asOf: '2026-10-15', coaIds: ['2'], filter }),
    ])

    expect(movementsByDate).toHaveBeenCalledTimes(1)
    expect(openingBalances).toHaveBeenCalledTimes(1)
    expect(Array.from(cash.byCoa)).toEqual([['1', '65.00']]) // 5 opening + 100 - 40
    expect(Array.from(bank.byCoa)).toEqual([['2', '11.00']]) // 1 opening + 10 - 0
    expect(cash.method).toBe('opening-table')

    const movementCall = movementsByDate.mock.calls[0]![0] as {
      from: string
      to: string
      coaIds?: string[]
      bySegment: boolean
    }
    expect(movementCall).toMatchObject({ from: '2026-10-01', to: '2026-10-15', bySegment: false })
    expect(movementCall.coaIds).toBeUndefined() // no account filter: every account is read
    const openingCall = openingBalances.mock.calls[0]![0] as { coaIds: string[] }
    expect([...openingCall.coaIds].sort()).toEqual(['1', '2'])
  })

  it('still reads again for another date or another entity filter', async () => {
    shortWindow()
    await balancesAt({ asOf: '2026-10-15', coaIds: ['1'], filter })
    await balancesAt({ asOf: '2026-10-14', coaIds: ['1'], filter })
    await balancesAt({ asOf: '2026-10-15', coaIds: ['1'], filter: { ...filter, segmentDetailIds: ['5'] } })
    expect(movementsByDate).toHaveBeenCalledTimes(3)
  })

  it('keeps the narrow read of the asked accounts when the window is longer than 62 days', async () => {
    // June is closed, the window is 1 July to 15 October (106 days).
    periods = [period('6', '2026-06-01', '2026-06-30', 'Closed'), period('7', '2026-07-01', '2026-07-31', 'Open')]
    countOpeningRows.mockResolvedValue(3)

    await Promise.all([
      balancesAt({ asOf: '2026-10-15', coaIds: ['1'], filter }),
      balancesAt({ asOf: '2026-10-15', coaIds: ['2'], filter }),
    ])

    expect(movementsByDate).toHaveBeenCalledTimes(2)
    const askedLists = movementsByDate.mock.calls.map((call) => (call[0] as { coaIds?: string[] }).coaIds)
    expect(askedLists).toEqual(expect.arrayContaining([['1'], ['2']]))
  })
})
