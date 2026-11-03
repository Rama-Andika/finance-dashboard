import { describe, expect, it } from 'vitest'
import { D, sum } from '../../core/money'
import { buildCoaTree, type CoaRow } from '../coa/coa-tree'
import { buildPnl, type PnlMovement } from './pnl'
import {
  buildOperatingExpenseFolders,
  nameOperatingExpenseFolders,
  type OperatingExpenseFolder,
} from './operating-expense'

const row = (
  coaId: string,
  parentId: string,
  code: string,
  name: string,
  status: CoaRow['status'],
  accountGroup: CoaRow['accountGroup'],
): CoaRow => ({
  coaId,
  parentId,
  code,
  name,
  status,
  level: 1,
  accountGroup,
  subAccountGroup: '',
  saldoNormal: accountGroup === 'Revenue' || accountGroup === 'Other Revenue' ? 'CREDIT' : 'DEBET',
})

const rows: CoaRow[] = [
  row('4100', '0', '4-1000', 'Penjualan', 'POSTABLE', 'Revenue'),
  row('5000', '0', '5-0000', 'Harga Pokok', 'HEADER', 'Cost Of Sales'),
  row('5100', '5000', '5-1000', 'HPP Barang', 'POSTABLE', 'Cost Of Sales'),
  row('5200', '5000', '5-2000', 'Ongkos Kirim Pembelian', 'POSTABLE', 'Cost Of Sales'),
  row('6000', '0', '6-0000', 'Beban Usaha', 'HEADER', 'Expense'),
  row('6100', '6000', '6-1000', 'Beban Gaji', 'HEADER', 'Expense'),
  row('6110', '6100', '6-1100', 'Gaji Pokok', 'POSTABLE', 'Expense'),
  row('6120', '6100', '6-1200', 'Tunjangan', 'POSTABLE', 'Expense'),
  row('6200', '6000', '6-2000', 'Beban Sewa', 'HEADER', 'Expense'),
  row('6210', '6200', '6-2100', 'Sewa Gedung', 'POSTABLE', 'Expense'),
  row('8100', '0', '8-1000', 'Beban Bunga', 'POSTABLE', 'Other Expense'),
]

const movements: PnlMovement[] = [
  { coaId: '4100', periodId: 'p1', debet: '0.00', credit: '1000.00' },
  { coaId: '5100', periodId: 'p1', debet: '400.00', credit: '0.00' },
  { coaId: '5200', periodId: 'p1', debet: '100.00', credit: '0.00' },
  { coaId: '6110', periodId: 'p1', debet: '150.00', credit: '0.00' },
  { coaId: '6120', periodId: 'p1', debet: '50.00', credit: '0.00' },
  { coaId: '6210', periodId: 'p1', debet: '120.00', credit: '0.00' },
  { coaId: '8100', periodId: 'p1', debet: '30.00', credit: '0.00' },
]

const { lines } = buildPnl({ tree: buildCoaTree(rows), movements })
const amountOf = (key: string) => lines.find((l) => l.key === key)?.amount

describe('buildOperatingExpenseFolders', () => {
  it('lists the Cost Of Sales folders first, then the Expense folders, with their group', () => {
    expect(buildOperatingExpenseFolders(lines)).toEqual([
      { id: '5100', label: 'HPP Barang', amount: '400.00', group: 'cogs' },
      { id: '5200', label: 'Ongkos Kirim Pembelian', amount: '100.00', group: 'cogs' },
      { id: '6100', label: 'Beban Gaji', amount: '200.00', group: 'opex' },
      { id: '6200', label: 'Beban Sewa', amount: '120.00', group: 'opex' },
    ])
  })

  it('leaves Other Expense out', () => {
    expect(amountOf('otherExpense')).toBe('30.00')
    expect(buildOperatingExpenseFolders(lines).map((f) => f.id)).not.toContain('8100')
  })

  it('gives no folders for a line that is missing', () => {
    expect(buildOperatingExpenseFolders([])).toEqual([])
    const onlyOpex = buildOperatingExpenseFolders(lines.filter((l) => l.key === 'opex'))
    expect(onlyOpex.map((f) => [f.id, f.group])).toEqual([
      ['6100', 'opex'],
      ['6200', 'opex'],
    ])
  })

  it('adds up to the cogs and opex lines, so revenue minus the folders is the operating profit', () => {
    const folders = buildOperatingExpenseFolders(lines)
    expect(sum(folders.filter((f) => f.group === 'cogs').map((f) => f.amount))).toBe(amountOf('cogs'))
    expect(sum(folders.filter((f) => f.group === 'opex').map((f) => f.amount))).toBe(amountOf('opex'))
    const revenueMinusFolders = D(amountOf('revenue')).minus(sum(folders.map((f) => f.amount)))
    expect(revenueMinusFolders.toFixed(2)).toBe(amountOf('operatingProfit'))
    expect(amountOf('operatingProfit')).toBe('180.00')
  })
})

describe('nameOperatingExpenseFolders', () => {
  const groupNames = { cogs: 'Cost of Goods Sold', opex: 'Operating Expenses' }
  const folder = (id: string, label: string, group: OperatingExpenseFolder['group']): OperatingExpenseFolder => ({
    id,
    label,
    amount: '10.00',
    group,
  })

  it('keeps names that are not shared', () => {
    const named = nameOperatingExpenseFolders([folder('1', 'Rent', 'opex'), folder('2', 'Freight', 'cogs')], groupNames)
    expect(named.map((n) => n.name)).toEqual(['Rent', 'Freight'])
  })

  it('adds the group name to names that two folders share, ignoring case and spaces at the ends', () => {
    const named = nameOperatingExpenseFolders(
      [folder('1', 'Freight', 'cogs'), folder('2', ' freight ', 'opex'), folder('3', 'Rent', 'opex')],
      groupNames,
    )
    expect(named).toEqual([
      { id: '1', name: 'Freight (Cost of Goods Sold)', amount: '10.00' },
      { id: '2', name: 'freight (Operating Expenses)', amount: '10.00' },
      { id: '3', name: 'Rent', amount: '10.00' },
    ])
  })

  it('returns nothing for no folders', () => {
    expect(nameOperatingExpenseFolders([], groupNames)).toEqual([])
  })
})
