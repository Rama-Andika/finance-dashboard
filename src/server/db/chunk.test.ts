import { describe, expect, it } from 'vitest'
import { chunk, chunkOrAll, mapLimit, sliceCombos } from './chunk'
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

describe('sliceCombos', () => {
  it('pairs every slice of the first list with every slice of the second', () => {
    expect(sliceCombos([[1], [2]], [['a'], ['b']])).toEqual([
      [[1], ['a']],
      [[1], ['b']],
      [[2], ['a']],
      [[2], ['b']],
    ])
  })

  it('works for three lists, with an unfiltered (undefined) slice', () => {
    const combos = sliceCombos(chunk([1, 2], 1), chunkOrAll('all'), chunkOrAll(['x']))
    expect(combos).toEqual([
      [[1], undefined, ['x']],
      [[2], undefined, ['x']],
    ])
  })

  it('has no combinations when a list has no slices', () => {
    expect(sliceCombos(chunk([]), chunkOrAll('all'))).toEqual([])
  })
})

describe('mapLimit', () => {
  it('keeps the order of the items whichever finishes first', async () => {
    const result = await mapLimit([30, 5, 15], 3, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms))
      return i
    })
    expect(result).toEqual([0, 1, 2])
  })

  it('never runs more than the limit at once', async () => {
    let running = 0
    let peak = 0
    await mapLimit(
      Array.from({ length: 10 }, (_, i) => i),
      3,
      async () => {
        running += 1
        peak = Math.max(peak, running)
        await new Promise((r) => setTimeout(r, 2))
        running -= 1
      },
    )
    expect(peak).toBe(3)
  })

  it('handles no items and a limit below 1', async () => {
    expect(await mapLimit([], 3, async () => 1)).toEqual([])
    expect(await mapLimit([1, 2], 0, async (x) => x * 2)).toEqual([2, 4])
  })

  it('rejects when one item fails', async () => {
    await expect(
      mapLimit([1, 2, 3], 2, async (x) => {
        if (x === 2) throw new Error('boom')
        return x
      }),
    ).rejects.toThrow('boom')
  })

  it('starts no further item once one has failed', async () => {
    const started: number[] = []
    await expect(
      mapLimit([1, 2, 3, 4, 5, 6], 2, async (x) => {
        started.push(x)
        // item 1 is slow, item 2 fails at once: the worker of item 1 must stop after it finishes
        await new Promise((r) => setTimeout(r, x === 1 ? 30 : 1))
        if (x === 2) throw new Error('boom')
        return x
      }),
    ).rejects.toThrow('boom')
    await new Promise((r) => setTimeout(r, 60))
    expect(started).toEqual([1, 2])
  })
})
