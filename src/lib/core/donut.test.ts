import Decimal from 'decimal.js'
import { describe, expect, it } from 'vitest'
import { buildDonutArcs, buildDonutDisplayItems, buildDonutSegments, largestRemainderPercentages } from './donut'

const decs = (values: number[]) => values.map((v) => new Decimal(v))

describe('largestRemainderPercentages', () => {
  it('returns exact percentages when they divide evenly', () => {
    expect(largestRemainderPercentages(decs([50, 30, 20]))).toEqual([50, 30, 20])
  })

  it('hands the missing point to the largest remainder, the first one on a tie', () => {
    expect(largestRemainderPercentages(decs([1, 1, 1]))).toEqual([34, 33, 33])
    expect(largestRemainderPercentages(decs([500, 100]))).toEqual([83, 17])
  })

  it('always adds up to 100', () => {
    const result = largestRemainderPercentages(decs([1, 2, 3, 4, 5, 6, 7]))
    expect(result).toEqual([4, 7, 11, 14, 18, 21, 25])
    expect(result.reduce((a, b) => a + b, 0)).toBe(100)
  })

  it('returns zeros for an empty list or when everything is zero', () => {
    expect(largestRemainderPercentages([])).toEqual([])
    expect(largestRemainderPercentages(decs([0, 0]))).toEqual([0, 0])
  })

  it('treats a negative value as zero', () => {
    expect(largestRemainderPercentages(decs([-5, 10]))).toEqual([0, 100])
  })
})

describe('buildDonutArcs', () => {
  it('splits the circumference minus the gaps in proportion to the values', () => {
    // 2 segments, gap 2 → 100 − 4 = 96 to share: 75% = 72, 25% = 24
    expect(buildDonutArcs(decs([75, 25]), 100, 2)).toEqual([
      { dashArray: '72.0 28.0', dashOffset: '0.0' },
      { dashArray: '24.0 76.0', dashOffset: '-74.0' },
    ])
  })

  it('draws no gap when only one segment is drawn, and skips zero values', () => {
    expect(buildDonutArcs(decs([100, 0]), 100, 2)).toEqual([
      { dashArray: '100.0 0.0', dashOffset: '0.0' },
      { dashArray: '0 100.0', dashOffset: '0' },
    ])
  })

  it('draws nothing when every value is zero', () => {
    expect(buildDonutArcs(decs([0, 0]), 100, 2)).toEqual([
      { dashArray: '0 100.0', dashOffset: '0' },
      { dashArray: '0 100.0', dashOffset: '0' },
    ])
  })
})

describe('buildDonutDisplayItems', () => {
  const item = (id: string, amount: string) => ({ id, name: `Item ${id}`, amount })

  it('puts the largest absolute amount first and keeps up to five slices as they are', () => {
    const shown = buildDonutDisplayItems([item('a', '10'), item('b', '-50'), item('c', '30')], 'Other')
    expect(shown.map((s) => s.id)).toEqual(['b', 'c', 'a'])
    expect(shown.map((s) => s.decAmount.toString())).toEqual(['50', '30', '10'])
  })

  it('collapses the smallest slices into one "other" slice when there are more than five', () => {
    const many = ['1', '2', '3', '4', '5', '6', '7'].map((n) => item(n, n))
    const shown = buildDonutDisplayItems(many, 'Other')
    expect(shown.map((s) => s.id)).toEqual(['7', '6', '5', '4', 'other'])
    expect(shown[4]).toMatchObject({ name: 'Other', amount: '6' })
    expect(shown[4]?.decAmount.toString()).toBe('6')
  })

  it('treats a missing amount as zero', () => {
    expect(buildDonutDisplayItems([item('a', '')], 'Other')[0]?.decAmount.toString()).toBe('0')
  })
})

describe('buildDonutSegments', () => {
  it('gives every slice a percentage (adding up to 100) and its arc', () => {
    const shown = buildDonutDisplayItems(
      [
        { id: 'a', name: 'A', amount: '50' },
        { id: 'b', name: 'B', amount: '30' },
        { id: 'c', name: 'C', amount: '20' },
      ],
      'Other',
    )
    const segments = buildDonutSegments(shown)
    expect(segments.map((s) => s.pct)).toEqual([50, 30, 20])
    expect(segments.every((s) => s.dashArray.includes(' '))).toBe(true)
    expect(segments[0]?.id).toBe('a')
  })

  it('returns nothing for no slices', () => {
    expect(buildDonutSegments([])).toEqual([])
  })
})
