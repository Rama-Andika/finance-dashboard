import { describe, expect, it } from 'vitest'
import { validateSeedTarget } from './guard'

describe('Seed Guard Target Validation (Phase 15)', () => {
  it('rejects remote or non-localhost hosts', () => {
    const res = validateSeedTarget('mysql://user:pass@10.0.0.5:3306/finance_dashboard_dev')
    expect(res.ok).toBe(false)
    expect(res.error).toBe('Seed may only run against a local database')
  })

  it('rejects database other than finance_dashboard_dev to prevent overwriting demo or production', () => {
    const res = validateSeedTarget('mysql://user:pass@127.0.0.1:3306/demo')
    expect(res.ok).toBe(false)
    expect(res.error).toContain("must be 'finance_dashboard_dev'")
  })

  it('accepts 127.0.0.1 with finance_dashboard_dev', () => {
    const res = validateSeedTarget('mysql://root:secret@127.0.0.1:3306/finance_dashboard_dev')
    expect(res.ok).toBe(true)
    expect(res.error).toBeUndefined()
  })

  it('accepts localhost with finance_dashboard_dev', () => {
    const res = validateSeedTarget('mysql://root:secret@localhost:3306/finance_dashboard_dev')
    expect(res.ok).toBe(true)
    expect(res.error).toBeUndefined()
  })
})
