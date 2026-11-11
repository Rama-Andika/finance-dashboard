import '@tanstack/react-start/server-only'
import type { Id, Money } from '~/lib/core/types'

/** One line of a posted journal that touches a cash account; the live query and the snapshot give the same shape. */
export type CashJournalLineRow = {
  glId: Id
  journalType: number
  periodId: Id
  coaId: Id
  segmentDetailId: Id | null
  debet: Money
  credit: Money
}
