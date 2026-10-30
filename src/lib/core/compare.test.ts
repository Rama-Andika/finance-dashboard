import { describe, expect, it } from 'vitest'
import { compareAsc } from './compare'

describe('compareAsc', () => {
  it('orders numbers and strings ascending', () => {
    expect(compareAsc(1, 2)).toBe(-1)
    expect(compareAsc(2, 1)).toBe(1)
    expect(compareAsc(2, 2)).toBe(0)
    expect(['b', 'a', 'c'].sort(compareAsc)).toEqual(['a', 'b', 'c'])
    expect([10, 9, 100].sort(compareAsc)).toEqual([9, 10, 100])
  })
})
