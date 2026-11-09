import type { Earnings } from './earnings'
import type { BalanceMethod } from './sources'
import type { BalanceSheetStatement } from './statement'
import type { BalanceCompareMode } from './targets'
import type { Id, IsoDate, MetricMeta, PeriodStatus } from '../../core/types'

/** One period of the report, as the page shows it. `reportDate` is the end of the period, but never after today. */
export type BalanceSheetPeriodInfo = {
  id: Id
  name: string
  startDate: IsoDate
  endDate: IsoDate
  status: PeriodStatus
  reportDate: IsoDate
}

/** What the Balance Sheet server function answers: plain data only (strings, numbers, arrays, objects). */
export type BalanceSheetResult = {
  /** `hasOpenPeriod` is true when the report period is not Closed (the header then shows the "figures may change" notice). */
  meta: MetricMeta
  /** 'no-period': the end month of the filter has no period, so there is nothing to report. */
  status: 'ok' | 'no-period'
  period: BalanceSheetPeriodInfo | null
  includesPeriod13: boolean
  method: BalanceMethod | null
  /** Name of the period whose saved opening balances start the sum; null for full-history. */
  openingPeriodName: string | null
  /** Regular periods up to the report period that are not Closed. */
  unclosedCount: number
  provisional: boolean
  statement: BalanceSheetStatement
  /** null when no comparison was asked for; `period` is null when the comparison period does not exist. */
  compare: { mode: BalanceCompareMode; period: BalanceSheetPeriodInfo | null; method: BalanceMethod | null } | null
  /** null without a report period. */
  earnings: (Earnings & { currentAccountFound: boolean; priorAccountFound: boolean }) | null
  /** `endMonth` 1–12; `assumed` is true when the ERP value was missing and December was taken. */
  fiscal: { endMonth: number; assumed: boolean; yearStart: IsoDate }
}
