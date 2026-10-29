import type { Id, IsoDate, Money } from '~/lib/core/types'

export type AgingSide = 'ap' | 'ar'

export type AgingInvoice = {
  invoiceId: Id
  invoiceNumber: string
  partyId: Id
  locationId: Id
  coaId: Id
  txDate: IsoDate
  dueDate: IsoDate | null
  itemType: number
  originalAmount: Money
  balance: Money
}

export type AgingUnallocated = {
  cardId: Id
  partyId: Id
  locationId: Id
  coaId: Id
  txDate: IsoDate
  balance: Money
}
