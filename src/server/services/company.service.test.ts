import { beforeEach, describe, expect, it, vi } from 'vitest'

const readCompanyNameRaw = vi.fn()
vi.mock('~/server/repo/master-data/company.repo', () => ({
  readCompanyNameRaw: (...args: unknown[]) => readCompanyNameRaw(...args),
}))

const { getCompanyInfo } = await import('./company.service')
const { clearCache } = await import('~/server/cache')

describe('getCompanyInfo', () => {
  beforeEach(() => {
    clearCache()
    readCompanyNameRaw.mockReset()
  })

  it('returns the tidied company name', async () => {
    readCompanyNameRaw.mockResolvedValue('  Example   Company Ltd ')
    await expect(getCompanyInfo()).resolves.toEqual({ name: 'Example Company Ltd' })
  })

  it('returns a null name when the ERP has no usable name', async () => {
    readCompanyNameRaw.mockResolvedValue('   ')
    await expect(getCompanyInfo()).resolves.toEqual({ name: null })
    clearCache()
    readCompanyNameRaw.mockResolvedValue(null)
    await expect(getCompanyInfo()).resolves.toEqual({ name: null })
  })

  it('reads the database once for repeated calls', async () => {
    readCompanyNameRaw.mockResolvedValue('Example Company Ltd')
    await getCompanyInfo()
    await getCompanyInfo()
    expect(readCompanyNameRaw).toHaveBeenCalledTimes(1)
  })

  it('does not remember a failed read', async () => {
    readCompanyNameRaw.mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
    await expect(getCompanyInfo()).rejects.toThrow('ECONNREFUSED')
    readCompanyNameRaw.mockResolvedValue('Example Company Ltd')
    await expect(getCompanyInfo()).resolves.toEqual({ name: 'Example Company Ltd' })
  })
})
