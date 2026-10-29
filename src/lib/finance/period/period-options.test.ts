import { describe, expect, it } from 'vitest'
import { limitMonthOptions } from './period-options'

// newest first: 2026-12 … 2024-01 (36 months)
const months = Array.from({ length: 36 }, (_, i) => {
  const index = 2026 * 12 + 11 - i
  return { month: `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`, status: 'Closed' as const }
})

describe('limitMonthOptions', () => {
  it('lists only the newest 12 months', () => {
    const out = limitMonthOptions(months)
    expect(out).toHaveLength(12)
    expect(out[0]!.month).toBe('2026-12')
    expect(out[11]!.month).toBe('2026-01')
  })

  it('keeps an older month that is currently selected, in its place', () => {
    const out = limitMonthOptions(months, ['2025-03', '2026-02'])
    expect(out.map((m) => m.month)).toContain('2025-03')
    expect(out).toHaveLength(13)
    // still newest first
    expect(out.map((m) => m.month)).toEqual([...out.map((m) => m.month)].sort().reverse())
  })

  it('ignores a selected month that is not in the list, and empty values', () => {
    expect(limitMonthOptions(months, ['1999-01', undefined, ''])).toHaveLength(12)
  })

  it('returns everything when there are fewer months than the limit', () => {
    expect(limitMonthOptions(months.slice(0, 5))).toHaveLength(5)
  })

  it('takes a custom limit', () => {
    expect(limitMonthOptions(months, [], 3)).toHaveLength(3)
  })
})
