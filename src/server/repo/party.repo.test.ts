import { beforeEach, describe, expect, it, vi } from 'vitest'

const rowsMock = vi.fn()
vi.mock('~/server/db/query', () => ({ rows: (...args: unknown[]) => rowsMock(...args) }))

const { listVendors, listCustomers, clearPartyCache } = await import('./party.repo')

const vendorRow = (id: string, name: string) => ({ id, code: `C${id}`, name })

describe('party lookups', () => {
  beforeEach(() => {
    rowsMock.mockReset()
    clearPartyCache()
  })

  it('returns code and name per id', async () => {
    rowsMock.mockResolvedValueOnce([vendorRow('1', 'Vendor 1'), vendorRow('2', 'Vendor 2')])
    const found = await listVendors(['1', '2'])
    expect(found).toEqual([
      { vendorId: '1', code: 'C1', name: 'Vendor 1' },
      { vendorId: '2', code: 'C2', name: 'Vendor 2' },
    ])
  })

  it('does not query again for parties it already knows, and only asks for the new ones', async () => {
    rowsMock.mockResolvedValueOnce([vendorRow('1', 'Vendor 1'), vendorRow('2', 'Vendor 2')])
    await listVendors(['1', '2'])
    expect(rowsMock).toHaveBeenCalledTimes(1)

    await listVendors(['1', '2'])
    expect(rowsMock).toHaveBeenCalledTimes(1)

    rowsMock.mockResolvedValueOnce([vendorRow('3', 'Vendor 3')])
    const found = await listVendors(['2', '3'])
    expect(rowsMock).toHaveBeenCalledTimes(2)
    expect(found.map((v) => v.vendorId).sort()).toEqual(['2', '3'])
  })

  it('queries nothing for an empty or duplicated list', async () => {
    expect(await listVendors([])).toEqual([])
    expect(rowsMock).not.toHaveBeenCalled()

    rowsMock.mockResolvedValueOnce([vendorRow('1', 'Vendor 1')])
    expect(await listVendors(['1', '1', '1'])).toHaveLength(1)
  })

  it('reads the slices of a long list together, not one after another', async () => {
    const ids = Array.from({ length: 2500 }, (_, i) => String(i + 1))
    const gates: Array<() => void> = []
    rowsMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          gates.push(() => resolve([]))
        }),
    )
    const pending = listVendors(ids)
    await Promise.resolve()
    expect(rowsMock).toHaveBeenCalledTimes(3) // 2500 ids = 3 slices of at most 1000, all started at once
    gates.forEach((release) => release())
    await pending
  })

  it('keeps vendors and customers apart', async () => {
    rowsMock.mockResolvedValueOnce([vendorRow('1', 'Vendor 1')])
    await listVendors(['1'])
    rowsMock.mockResolvedValueOnce([vendorRow('1', 'Customer 1')])
    const customers = await listCustomers(['1'])
    expect(customers).toEqual([{ customerId: '1', code: 'C1', name: 'Customer 1' }])
    expect(rowsMock).toHaveBeenCalledTimes(2)
  })

  it('does not remember a party that was not found, so it is asked for again', async () => {
    rowsMock.mockResolvedValue([])
    await listVendors(['9'])
    await listVendors(['9'])
    expect(rowsMock).toHaveBeenCalledTimes(2)
  })
})
