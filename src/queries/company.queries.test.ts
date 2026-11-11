import { describe, expect, it, vi } from 'vitest'

vi.mock('~/functions/company.fn', () => ({ getCompanyInfoFn: vi.fn() }))

const { companyInfoOptions } = await import('./company.queries')
const { qk } = await import('./keys')

describe('companyInfoOptions', () => {
  it('reuses one answer for ten minutes', () => {
    expect(companyInfoOptions().staleTime).toBe(600_000)
  })

  it('has its own key, apart from the metric prefixes', () => {
    expect(companyInfoOptions().queryKey).toEqual(qk.companyInfo())
    expect(qk.companyInfo()[0]).not.toBe(qk.allMetrics()[0])
  })
})
