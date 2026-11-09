import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/server/env', () => ({ env: { APP_TODAY: '2026-10-15', APP_TIMEZONE: 'Asia/Jakarta' } }))

const toPartyRowCalls = vi.fn()
vi.mock('~/lib/finance/ap-ar/aging-parties', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/finance/ap-ar/aging-parties')>()
  return {
    ...actual,
    toPartyRow: (...args: Parameters<typeof actual.toPartyRow>) => {
      toPartyRowCalls()
      return actual.toPartyRow(...args)
    },
  }
})

const computeApAgingParties = vi.fn()
const computeArAgingParties = vi.fn()
vi.mock('~/server/services/ap-ar/ap-aging.service', () => ({
  computeApAgingParties: (...a: unknown[]) => computeApAgingParties(...a),
}))
vi.mock('~/server/services/ap-ar/ar-aging.service', () => ({
  computeArAgingParties: (...a: unknown[]) => computeArAgingParties(...a),
}))

const { listAgingParties } = await import('./aging-parties.service')

const zeroBuckets = {
  overdue0_30: '0.00',
  overdue31_60: '0.00',
  overdue61_90: '0.00',
  overdue90plus: '0.00',
  due1_30: '0.00',
  due31_60: '0.00',
  due61_90: '0.00',
  due90plus: '0.00',
}
const vendors = () =>
  Array.from({ length: 60 }, (_, n) => ({
    vendorId: `v${n}`,
    code: `V${n}`,
    name: `Vendor ${n}`,
    total: String(n + 1),
    buckets: zeroBuckets,
  }))
const filter = {} as never
const byTotal = (page: number) => ({ page, pageSize: 25, sortBy: 'total', sortDir: 'desc' as const })

describe('listAgingParties: rows and sorted copies are built once per list', () => {
  beforeEach(() => {
    toPartyRowCalls.mockReset()
    computeApAgingParties.mockReset()
    computeArAgingParties.mockReset()
  })

  it('maps the parties once however many pages and sorts are asked for', async () => {
    computeApAgingParties.mockResolvedValue(vendors())

    const first = await listAgingParties('ap', filter, byTotal(1))
    const last = await listAgingParties('ap', filter, byTotal(3))
    const byName = await listAgingParties('ap', filter, { page: 1, pageSize: 25, sortBy: 'name', sortDir: 'asc' })
    const unsorted = await listAgingParties('ap', filter, { page: 1, pageSize: 25, sortDir: 'asc' })

    expect(toPartyRowCalls).toHaveBeenCalledTimes(60)
    expect(first.total).toBe(60)
    expect(first.rows[0]?.id).toBe('v59') // largest total first
    expect(last.rows).toHaveLength(10)
    expect(last.rows.at(-1)?.id).toBe('v0')
    expect(byName.rows[0]?.name).toBe('Vendor 0')
    expect(unsorted.rows[0]?.id).toBe('v0') // no sort key: the order of the list
  })

  it('builds the rows again when the aging core hands out a new list (after a snapshot refresh)', async () => {
    computeApAgingParties.mockResolvedValue(vendors())
    await listAgingParties('ap', filter, byTotal(1))
    computeApAgingParties.mockResolvedValue(vendors())
    await listAgingParties('ap', filter, byTotal(1))
    expect(toPartyRowCalls).toHaveBeenCalledTimes(120)
  })

  it('serves the receivables side from its own list', async () => {
    computeArAgingParties.mockResolvedValue([
      { customerId: 'c1', code: 'C1', name: 'Customer 1', total: '5.00', buckets: zeroBuckets },
      { customerId: 'c2', code: 'C2', name: 'Customer 2', total: '9.00', buckets: zeroBuckets },
    ])
    const page = await listAgingParties('ar', filter, byTotal(1))
    expect(page.rows.map((r) => r.id)).toEqual(['c2', 'c1'])
    expect(computeApAgingParties).not.toHaveBeenCalled()
  })
})
