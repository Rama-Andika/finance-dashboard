import Decimal from 'decimal.js'

/** Geometry shared by every donut ring (SVG viewBox 160 × 160, ring radius 60). */
export const DONUT_RADIUS = 60
export const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS
/** Blank space after each drawn segment, in the same unit as the circumference. */
export const DONUT_GAP = 2

/**
 * Whole-number percentages of `values` that always add up to 100 (largest remainder method).
 * A negative value counts as 0. When every value is 0 the result is all zeros.
 */
export function largestRemainderPercentages(values: readonly Decimal[]): number[] {
  const nonNegative = values.map((v) => (v.isNegative() ? new Decimal(0) : v))
  const total = nonNegative.reduce((acc, v) => acc.plus(v), new Decimal(0))
  if (total.isZero()) return nonNegative.map(() => 0)

  const raw = nonNegative.map((v) => v.div(total).times(100))
  const result = raw.map((p) => p.floor().toNumber())
  const byRemainder = raw
    .map((p, index) => ({ index, remainder: p.minus(p.floor()) }))
    .sort((a, b) => b.remainder.cmp(a.remainder) || a.index - b.index)

  const deficit = 100 - result.reduce((acc, p) => acc + p, 0)
  for (let i = 0; i < deficit && i < byRemainder.length; i++) {
    const entry = byRemainder[i]
    if (entry) result[entry.index] = (result[entry.index] ?? 0) + 1
  }
  return result
}

export type DonutArc = { dashArray: string; dashOffset: string }

/**
 * Stroke settings (`stroke-dasharray` / `stroke-dashoffset`) of each segment of a donut drawn with
 * one <circle> per segment. `values` must be ≥ 0; a value of 0 is not drawn.
 * `gap` is left blank after every drawn segment when more than one segment is drawn.
 * Display only: these are drawing lengths, not money.
 */
export function buildDonutArcs(values: readonly Decimal[], circumference: number, gap: number): DonutArc[] {
  const total = values.reduce((acc, v) => acc.plus(v), new Decimal(0))
  const drawn = values.filter((v) => v.gt(0)).length
  const available = circumference - (drawn > 1 ? drawn * gap : 0)

  let offset = 0
  return values.map((v) => {
    if (total.isZero() || !v.gt(0)) {
      return { dashArray: `0 ${circumference.toFixed(1)}`, dashOffset: '0' }
    }
    const length = Math.max(0, v.div(total).toNumber() * available)
    const arc = {
      dashArray: `${length.toFixed(1)} ${(circumference - length).toFixed(1)}`,
      dashOffset: (-offset).toFixed(1),
    }
    offset += length + (drawn > 1 ? gap : 0)
    return arc
  })
}

/** One slice before drawing. */
export type DonutItem = { id: string; name: string; amount: string }

/** A slice with its absolute amount as a decimal, ready for percentages and arcs. */
export type DonutDisplayItem = DonutItem & { decAmount: Decimal }

/**
 * The slices to draw: largest absolute amount first; when there are more than `maxSegments`, the smallest ones
 * collapse into one extra slice called `otherName` (so at most `maxSegments` slices remain).
 */
export function buildDonutDisplayItems(items: readonly DonutItem[], otherName: string, maxSegments = 5): DonutDisplayItem[] {
  const sorted = items
    .map((item) => ({ ...item, decAmount: new Decimal(item.amount || '0').abs() }))
    .sort((a, b) => b.decAmount.cmp(a.decAmount))
  if (sorted.length <= maxSegments) return sorted

  const kept = sorted.slice(0, maxSegments - 1)
  const otherSum = sorted.slice(maxSegments - 1).reduce((sum, item) => sum.add(item.decAmount), new Decimal(0))
  return [...kept, { id: 'other', name: otherName, amount: otherSum.toFixed(0), decAmount: otherSum }]
}

/** A slice with the numbers its ring arc and legend row need. */
export type DonutSegment = DonutDisplayItem & { pct: number; dashArray: string; dashOffset: string }

/** Percentages that add up to 100 and the stroke settings of every arc of a ring. */
export function buildDonutSegments(items: readonly DonutDisplayItem[]): DonutSegment[] {
  const amounts = items.map((it) => it.decAmount)
  const percentages = largestRemainderPercentages(amounts)
  const arcs = buildDonutArcs(amounts, DONUT_CIRCUMFERENCE, DONUT_GAP)
  return items.map((item, idx) => ({
    ...item,
    pct: percentages[idx] ?? 0,
    dashArray: arcs[idx]?.dashArray ?? '0 0',
    dashOffset: arcs[idx]?.dashOffset ?? '0',
  }))
}
