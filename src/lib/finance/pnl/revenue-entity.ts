import Decimal from 'decimal.js'
import { D, sum } from '../../core/money'
import { largestRemainderPercentages } from '../../core/donut'
import type { Id, Money } from '../../core/types'

/** The ring shows at most this many entities; the rest merge into one "Other" segment. */
export const ENTITY_RING_MAX = 10
/** The legend lists this many segments; the remaining ones are summed in one extra row. */
export const ENTITY_LEGEND_SIZE = 5
export const OTHER_SEGMENT_ID = 'other'
export const UNASSIGNED_ROW_ID = 'unassigned'

export type EntityRevenue = { id: Id; name: string; amount: Money }

export type EntityShareSegment = {
  /** Entity id, or OTHER_SEGMENT_ID for the merged "Other" segment. */
  id: Id
  name: string
  /** Always > 0. */
  amount: Money
  /** Whole percent of the drawn total; all segments add up to 100. */
  pct: number
  isOther: boolean
}

export type EntityShare = {
  /** Ring order: largest first, the "Other" segment always last. */
  segments: EntityShareSegment[]
  /** The first ENTITY_LEGEND_SIZE segments. */
  legend: EntityShareSegment[]
  /** The segments after the legend, summed; null when there are none. */
  rest: { count: number; pct: number; amount: Money } | null
  /** Sum of the drawn segments (entities with revenue > 0, plus unassigned revenue when positive). */
  total: Money
  /** Entities with revenue > 0. */
  entityCount: number
  /** Entities with revenue ≤ 0: not drawn. */
  hiddenCount: number
}

export type EntityTableRow = {
  id: Id
  name: string
  amount: Money
  /** Share of the drawn total as a decimal ratio ("0.923077"); null for amounts ≤ 0. */
  share: string | null
  isUnassigned: boolean
}

type Ranked = EntityRevenue & { dec: Decimal }

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** Largest amount first; equal amounts by name, then by id, so the order never changes between renders. */
function rankByAmount(entities: readonly EntityRevenue[]): Ranked[] {
  return entities
    .map((e) => ({ ...e, dec: D(e.amount) }))
    .sort((a, b) => b.dec.cmp(a.dec) || compareText(a.name, b.name) || compareText(a.id, b.id))
}

const positiveOrZero = (value: Decimal): Decimal => (value.gt(0) ? value : new Decimal(0))

/**
 * Segments of the "Revenue by Entity" donut.
 * Only entities with revenue > 0 are drawn. Entities beyond ENTITY_RING_MAX and unassigned revenue
 * (when positive) merge into one "Other" segment, labelled with `otherLabel`.
 */
export function buildEntityShare(
  entities: readonly EntityRevenue[],
  unassigned: Money,
  otherLabel: string,
): EntityShare {
  const ranked = rankByAmount(entities)
  const positive = ranked.filter((e) => e.dec.gt(0))
  const named = positive.slice(0, ENTITY_RING_MAX)
  const otherDec = positive
    .slice(ENTITY_RING_MAX)
    .reduce((acc, e) => acc.plus(e.dec), new Decimal(0))
    .plus(positiveOrZero(D(unassigned)))

  const drawn = [
    ...named.map((e) => ({ id: e.id, name: e.name, dec: e.dec, isOther: false })),
    ...(otherDec.gt(0) ? [{ id: OTHER_SEGMENT_ID, name: otherLabel, dec: otherDec, isOther: true }] : []),
  ]
  const pcts = largestRemainderPercentages(drawn.map((s) => s.dec))
  const segments: EntityShareSegment[] = drawn.map((s, i) => ({
    id: s.id,
    name: s.name,
    amount: s.dec.toFixed(2),
    pct: pcts[i] ?? 0,
    isOther: s.isOther,
  }))

  const tail = segments.slice(ENTITY_LEGEND_SIZE)
  return {
    segments,
    legend: segments.slice(0, ENTITY_LEGEND_SIZE),
    rest:
      tail.length === 0
        ? null
        : { count: tail.length, pct: tail.reduce((acc, s) => acc + s.pct, 0), amount: sum(tail.map((s) => s.amount)) },
    total: sum(segments.map((s) => s.amount)),
    entityCount: positive.length,
    hiddenCount: ranked.length - positive.length,
  }
}

/**
 * Rows of the "Revenue by Entity" table: every entity (largest first), then a last row for
 * unassigned revenue when it is not zero. `share` uses the same base as the donut.
 */
export function buildEntityTableRows(
  entities: readonly EntityRevenue[],
  unassigned: Money,
  unassignedName: string,
): EntityTableRow[] {
  const ranked = rankByAmount(entities)
  const unassignedDec = D(unassigned)
  const base = ranked
    .reduce((acc, e) => acc.plus(positiveOrZero(e.dec)), new Decimal(0))
    .plus(positiveOrZero(unassignedDec))
  const shareOf = (dec: Decimal): string | null => (dec.gt(0) && base.gt(0) ? dec.div(base).toFixed(6) : null)

  const rows: EntityTableRow[] = ranked.map((e) => ({
    id: e.id,
    name: e.name,
    amount: e.dec.toFixed(2),
    share: shareOf(e.dec),
    isUnassigned: false,
  }))
  if (!unassignedDec.isZero()) {
    rows.push({
      id: UNASSIGNED_ROW_ID,
      name: unassignedName,
      amount: unassignedDec.toFixed(2),
      share: shareOf(unassignedDec),
      isUnassigned: true,
    })
  }
  return rows
}
