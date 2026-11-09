import type { Period, PeriodStatus } from '~/lib/core/types'
import type { CoaRow } from '~/lib/finance/coa/coa-tree'

/** A regular period for tests: `month` is 'YYYY-MM'; the id is `r<month>` so tests stay readable. */
export function regularPeriod(month: string, status: PeriodStatus = 'Closed'): Period {
  const [year, mon] = month.split('-').map(Number) as [number, number]
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate()
  return {
    periodeId: `r${month}`,
    name: month,
    startDate: `${month}-01`,
    endDate: `${month}-${String(lastDay).padStart(2, '0')}`,
    status,
    type: 0,
    tableName: 'gl',
  }
}

/** The period 13 of a year: it starts on 30 December and ends on 31 December, like the ERP creates it. */
export function period13Of(year: number, status: PeriodStatus = 'Closed'): Period {
  return {
    periodeId: `p13-${year}`,
    name: `P13 ${year}`,
    startDate: `${year}-12-30`,
    endDate: `${year}-12-31`,
    status,
    type: 1,
    tableName: 'gl',
  }
}

/** Regular periods for every month from `from` to `to` ('YYYY-MM'), in order. */
export function monthsBetween(from: string, to: string, status: PeriodStatus = 'Closed'): Period[] {
  const result: Period[] = []
  let [year, month] = from.split('-').map(Number) as [number, number]
  const [endYear, endMonth] = to.split('-').map(Number) as [number, number]
  while (year < endYear || (year === endYear && month <= endMonth)) {
    result.push(regularPeriod(`${year}-${String(month).padStart(2, '0')}`, status))
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return result
}

function row(
  coaId: string,
  parentId: string,
  code: string,
  name: string,
  status: CoaRow['status'],
  level: number,
  accountGroup: CoaRow['accountGroup'],
): CoaRow {
  return {
    coaId,
    parentId,
    code,
    name,
    status,
    level,
    accountGroup,
    subAccountGroup: '',
    saldoNormal:
      accountGroup.includes('Asset') || accountGroup.includes('Expense') || accountGroup === 'Cost Of Sales'
        ? 'DEBET'
        : 'CREDIT',
  }
}

/** A small chart of accounts with every group the balance sheet needs, the two earnings accounts and the P&L groups. */
export const balanceSheetCoaRows: CoaRow[] = [
  row('A', '0', '1', 'Assets', 'HEADER', 1, 'Liquid Assets'),
  row('A1', 'A', '11', 'Cash and bank', 'HEADER', 2, 'Liquid Assets'),
  row('cash', 'A1', '111', 'Cash', 'POSTABLE', 3, 'Liquid Assets'),
  row('bank', 'A1', '112', 'Bank', 'POSTABLE', 3, 'Liquid Assets'),
  row('ar', 'A', '12', 'Receivables', 'POSTABLE', 2, 'Liquid Assets'),
  row('FA', 'A', '13', 'Fixed assets', 'HEADER', 2, 'Fixed Assets'),
  row('equip', 'FA', '131', 'Equipment', 'POSTABLE', 3, 'Fixed Assets'),
  row('accdep', 'FA', '132', 'Accumulated depreciation', 'POSTABLE', 3, 'Fixed Assets'),
  row('L', '0', '2', 'Liabilities', 'HEADER', 1, 'Current Liabilities'),
  row('ap', 'L', '21', 'Accounts payable', 'POSTABLE', 2, 'Current Liabilities'),
  row('loan', 'L', '22', 'Bank loan', 'POSTABLE', 2, 'Long Term Liabilities'),
  row('E', '0', '3', 'Equity', 'HEADER', 1, 'Equity'),
  row('capital', 'E', '31', 'Paid-in capital', 'POSTABLE', 2, 'Equity'),
  row('prior', 'E', '32', 'Prior years earnings', 'POSTABLE', 2, 'Equity'),
  row('current', 'E', '33', 'Current year earnings', 'POSTABLE', 2, 'Equity'),
  row('R', '0', '4', 'Revenue', 'HEADER', 1, 'Revenue'),
  row('sales', 'R', '41', 'Sales', 'POSTABLE', 2, 'Revenue'),
  row('X', '0', '5', 'Expenses', 'HEADER', 1, 'Expense'),
  row('rent', 'X', '51', 'Rent', 'POSTABLE', 2, 'Expense'),
  row('cogs', 'X', '52', 'Cost of goods', 'POSTABLE', 2, 'Cost Of Sales'),
  row('interest', 'R', '42', 'Interest income', 'POSTABLE', 2, 'Other Revenue'),
  row('fee', 'X', '53', 'Bank fee', 'POSTABLE', 2, 'Other Expense'),
]
