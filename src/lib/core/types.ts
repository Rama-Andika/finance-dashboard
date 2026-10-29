export type Id = string // every ID (G11)
export type Money = string // raw money value from the DB, e.g. "1234567.89" (G12)
export type IsoDate = string // "YYYY-MM-DD" (G13)

export type AccountGroup =
  | 'Liquid Assets'
  | 'Fixed Assets'
  | 'Other Assets'
  | 'Current Liabilities'
  | 'Long Term Liabilities'
  | 'Equity'
  | 'Revenue'
  | 'Other Revenue'
  | 'Cost Of Sales'
  | 'Expense'
  | 'Other Expense'

export type Lang = 'en' | 'id'

export type BasketKey = 'cash' | 'bank' | 'deposit' | 'inTransit' | 'fixedCost'

export type PeriodStatus = 'Open' | 'Pre Closed' | 'Closed'

export type Period = {
  periodeId: Id
  name: string
  startDate: IsoDate
  endDate: IsoDate
  status: PeriodStatus
  type: 0 | 1 | 2 | 3 // 0 regular · 1 period 13 · 2 pre-closed · 3 unknown
  tableName: string // 'gl' or 'gl_2015' … 'gl_2020'
}

export type Entity = {
  locationId: Id
  code: string
  name: string
  isActive: boolean
  segmentDetailIds: Id[] // gl_detail.<entity segment column> values that belong to this entity
}

/** Filter resolved by the server for one request. */
export type ResolvedFilter = {
  locationIds: Id[] | 'all' // 'all' = no location filter (consolidate all data)
  segmentDetailIds: Id[] | 'all'
  d1: IsoDate // range start
  asOf: IsoDate // range end, never after today (data-model §1.2)
  periodIds: Id[] // accounting periods in range (G14)
  compare: { d1: IsoDate; asOf: IsoDate; periodIds: Id[] } // comparison period (phase 7, step 7.2)
  today: IsoDate
}

export type MetricMeta = {
  readAt: string // server ISO time when data was read (sidebar freshness panel)
  d1: IsoDate
  asOf: IsoDate
  today: IsoDate
  entityCount: number // number of selected entities (all = total entity count)
  isAllEntities: boolean
  hasOpenPeriod: boolean // true -> show the "period not closed yet" Notice
  missingMonths: string[] // months without a period row -> Notice
}

export type Breakdown = {
  id: string
  label: string
  code?: string
  amount: Money
  children?: Breakdown[]
}
