import { describe, expect, it } from 'vitest'
import { chunk, chunkOrAll } from './chunk'
import { assertSegmentColumn, isSegmentColumn } from './segment-column'
import { intList } from './erp-codes'

describe('chunk helpers', () => {
  it('splits a list into slices of at most the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 2)).toEqual([])
  })

  it('never drops items when the list is longer than the default slice size', () => {
    const ids = Array.from({ length: 2500 }, (_, i) => String(i))
    const slices = chunk(ids)
    expect(slices.map((s) => s.length)).toEqual([1000, 1000, 500])
    expect(slices.flat()).toEqual(ids)
  })

  it('treats "all" and undefined as a single unfiltered slice, and an empty list as no slice', () => {
    expect(chunkOrAll('all')).toEqual([undefined])
    expect(chunkOrAll(undefined)).toEqual([undefined])
    expect(chunkOrAll(['a', 'b'])).toEqual([['a', 'b']])
    expect(chunkOrAll([])).toEqual([])
  })
})

describe('segment column guard', () => {
  it('accepts segment1_id … segment15_id only', () => {
    expect(isSegmentColumn('segment1_id')).toBe(true)
    expect(isSegmentColumn('segment15_id')).toBe(true)
    expect(isSegmentColumn('segment16_id')).toBe(false)
    expect(isSegmentColumn('segment1_id; DROP TABLE gl')).toBe(false)
    expect(() => assertSegmentColumn('coa_id')).toThrow('Invalid segment column')
  })
})

describe('intList', () => {
  it('rejects empty and non-integer lists so nothing unsafe is inlined into SQL', () => {
    expect(() => intList([])).toThrow()
    expect(() => intList([1.5])).toThrow()
    expect(() => intList([1, 2])).not.toThrow()
  })
})
