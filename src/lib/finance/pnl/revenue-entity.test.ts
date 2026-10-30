import { describe, expect, it } from 'vitest'
import {
  OTHER_SEGMENT_ID,
  UNASSIGNED_ROW_ID,
  buildEntityShare,
  buildEntityTableRows,
  type EntityRevenue,
} from './revenue-entity'

const entity = (id: string, name: string, amount: string): EntityRevenue => ({ id, name, amount })

describe('buildEntityShare', () => {
  it('draws every entity when there are few, largest first', () => {
    const share = buildEntityShare(
      [entity('b', 'Entity B', '300.00'), entity('a', 'Entity A', '600.00'), entity('c', 'Entity C', '100.00')],
      '0.00',
      'Other',
    )
    expect(share.segments.map((s) => [s.id, s.amount, s.pct, s.isOther])).toEqual([
      ['a', '600.00', 60, false],
      ['b', '300.00', 30, false],
      ['c', '100.00', 10, false],
    ])
    expect(share.legend).toHaveLength(3)
    expect(share.rest).toBeNull()
    expect(share.total).toBe('1000.00')
    expect(share.entityCount).toBe(3)
    expect(share.hiddenCount).toBe(0)
  })

  it('does not draw entities with zero or negative revenue, and counts them as hidden', () => {
    const share = buildEntityShare(
      [entity('a', 'Entity A', '500.00'), entity('b', 'Entity B', '-50.00'), entity('c', 'Entity C', '0.00'), entity('d', 'Entity D', '100.00')],
      '0.00',
      'Other',
    )
    expect(share.segments.map((s) => [s.id, s.pct])).toEqual([['a', 83], ['d', 17]])
    expect(share.total).toBe('600.00')
    expect(share.entityCount).toBe(2)
    expect(share.hiddenCount).toBe(2)
  })

  it('adds positive unassigned revenue to the "Other" segment, which comes last', () => {
    const share = buildEntityShare(
      [entity('a', 'Entity A', '600.00'), entity('b', 'Entity B', '300.00')],
      '100.00',
      'Other',
    )
    expect(share.segments.map((s) => [s.id, s.name, s.amount, s.pct, s.isOther])).toEqual([
      ['a', 'Entity A', '600.00', 60, false],
      ['b', 'Entity B', '300.00', 30, false],
      [OTHER_SEGMENT_ID, 'Other', '100.00', 10, true],
    ])
  })

  it('ignores zero or negative unassigned revenue', () => {
    const negative = buildEntityShare([entity('a', 'Entity A', '100.00')], '-20.00', 'Other')
    expect(negative.segments.map((s) => s.id)).toEqual(['a'])
    expect(negative.total).toBe('100.00')
    const zero = buildEntityShare([entity('a', 'Entity A', '100.00')], '0.00', 'Other')
    expect(zero.segments.map((s) => s.id)).toEqual(['a'])
  })

  it('merges entities beyond the 10th and unassigned revenue into "Other", and sums the legend rest', () => {
    // Entity n has n × 10: Entity 12 = 120 … Entity 1 = 10
    const entities = Array.from({ length: 12 }, (_, i) => entity(`e${i + 1}`, `Entity ${i + 1}`, `${(i + 1) * 10}.00`))
    const share = buildEntityShare(entities, '5.00', 'Other')

    expect(share.segments).toHaveLength(11)
    expect(share.segments.slice(0, 10).map((s) => s.id)).toEqual(['e12', 'e11', 'e10', 'e9', 'e8', 'e7', 'e6', 'e5', 'e4', 'e3'])
    const last = share.segments[10]
    expect(last).toMatchObject({ id: OTHER_SEGMENT_ID, amount: '35.00', isOther: true }) // 20 + 10 + 5
    expect(share.total).toBe('785.00')
    expect(share.segments.map((s) => s.pct)).toEqual([15, 14, 13, 12, 10, 9, 8, 6, 5, 4, 4])

    expect(share.legend.map((s) => s.id)).toEqual(['e12', 'e11', 'e10', 'e9', 'e8'])
    expect(share.rest).toEqual({ count: 6, pct: 36, amount: '285.00' })
    const legendPct = share.legend.reduce((acc, s) => acc + s.pct, 0)
    expect(legendPct + (share.rest?.pct ?? 0)).toBe(100)
    expect(share.entityCount).toBe(12)
  })

  it('orders equal amounts by name so the order is stable', () => {
    const share = buildEntityShare([entity('z', 'Zeta', '100.00'), entity('a', 'Alpha', '100.00')], '0.00', 'Other')
    expect(share.segments.map((s) => s.name)).toEqual(['Alpha', 'Zeta'])
  })

  it('returns an empty share when nothing is positive', () => {
    const share = buildEntityShare([entity('a', 'Entity A', '0.00'), entity('b', 'Entity B', '-5.00')], '0.00', 'Other')
    expect(share.segments).toEqual([])
    expect(share.legend).toEqual([])
    expect(share.rest).toBeNull()
    expect(share.total).toBe('0.00')
    expect(share.entityCount).toBe(0)
    expect(share.hiddenCount).toBe(2)
  })
})

describe('buildEntityTableRows', () => {
  it('lists every entity largest first and puts unassigned revenue last', () => {
    const rows = buildEntityTableRows(
      [entity('c', 'Entity C', '-50.00'), entity('a', 'Entity A', '600.00'), entity('b', 'Entity B', '0.00')],
      '50.00',
      'No entity',
    )
    expect(rows.map((r) => [r.id, r.name, r.amount, r.share, r.isUnassigned])).toEqual([
      ['a', 'Entity A', '600.00', '0.923077', false],
      ['b', 'Entity B', '0.00', null, false],
      ['c', 'Entity C', '-50.00', null, false],
      [UNASSIGNED_ROW_ID, 'No entity', '50.00', '0.076923', true],
    ])
  })

  it('leaves out the unassigned row when it is zero', () => {
    const rows = buildEntityTableRows([entity('a', 'Entity A', '100.00')], '0.00', 'No entity')
    expect(rows.map((r) => r.id)).toEqual(['a'])
    expect(rows[0]?.share).toBe('1.000000')
  })

  it('shows a negative unassigned row without a share', () => {
    const rows = buildEntityTableRows([entity('a', 'Entity A', '100.00')], '-20.00', 'No entity')
    expect(rows[1]).toMatchObject({ id: UNASSIGNED_ROW_ID, amount: '-20.00', share: null, isUnassigned: true })
    expect(rows[0]?.share).toBe('1.000000')
  })

  it('returns no rows for no entities and no unassigned revenue', () => {
    expect(buildEntityTableRows([], '0.00', 'No entity')).toEqual([])
  })
})
