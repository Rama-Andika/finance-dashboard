import { describe, expect, it } from 'vitest'
import { balanceSheetCoaRows } from 'tests/fixtures/balance-sheet.fixture'
import { buildCsv, type CsvFormat } from '~/lib/format/csv'
import { buildCoaTree } from '../coa/coa-tree'
import { balanceSheetCsvColumns, csvLines, indentLabel, type BalanceSheetCsvLabels } from './csv-export'
import { buildBalanceSheet, emptyStatement, type BalanceSheetStatement, type ExtraLine } from './statement'
import { tableRows } from './tree-view'
import type { Id, Money } from '../../core/types'

const tree = buildCoaTree(balanceSheetCoaRows)

const balances = new Map<Id, Money>([
  ['cash', '100.00'],
  ['bank', '0.00'],
  ['ar', '200.00'],
  ['ap', '300.00'],
  ['capital', '0.00'],
])

const LINE_NAMES: Record<string, string> = {
  sectionAssets: 'Aktiva',
  sectionLiabilitiesEquity: 'Pasiva',
  difference: 'Selisih',
  currentYearEarnings: 'Laba Tahun Berjalan',
}

const labels: BalanceSheetCsvLabels = {
  accountCode: 'Kode',
  account: 'Akun',
  amountHeader: 'Per 30 Sep 2026',
  compareHeader: 'Per 31 Des 2025',
  change: 'Perubahan (IDR)',
  changePct: 'Perubahan (%)',
  nameOf: (node) => (node.labelKey ? (LINE_NAMES[node.labelKey] ?? node.labelKey) : node.name),
  totalOf: (name) => `Total ${name}`,
}

type Options = { hideZero?: boolean; format?: CsvFormat }

/** The lines of the CSV text of a statement, without the BOM at the start. */
function csvOf(statement: BalanceSheetStatement, { hideZero = true, format = 'comma-dot' }: Options = {}): string[] {
  const lines = csvLines(tableRows(statement, { hideZero }))
  const columns = balanceSheetCsvColumns(labels, statement.compareTotals !== null)
  return buildCsv(lines, columns, format).slice(1).split('\r\n')
}

const statementOf = (
  amounts: ReadonlyMap<Id, Money>,
  compare: ReadonlyMap<Id, Money> | null = null,
  extraLines: ExtraLine[] = [],
) => buildBalanceSheet({ tree, balances: amounts, compareBalances: compare, extraLines })

describe('indentLabel', () => {
  it('puts two spaces in front of the text for each level', () => {
    expect(indentLabel(0, 'Assets')).toBe('Assets')
    expect(indentLabel(1, 'Assets')).toBe('  Assets')
    expect(indentLabel(3, 'Cash')).toBe('      Cash')
  })

  it('does not indent a negative level', () => {
    expect(indentLabel(-1, 'Assets')).toBe('Assets')
  })
})

describe('csvLines', () => {
  it('writes a title, the lines below it and its total, for every row with accounts below it', () => {
    const rows = tableRows(statementOf(balances), { hideZero: true })
    expect(csvLines(rows).map((line) => `${line.kind} ${line.node.id}`)).toEqual([
      'title section:assets',
      'title A',
      'title A1',
      'detail cash',
      'total A1',
      'detail ar',
      'total A',
      'total section:assets',
      'title section:liabilitiesEquity',
      'title L',
      'detail ap',
      'total L',
      'total section:liabilitiesEquity',
    ])
  })

  it('gives a section a title and a total even when it has no accounts', () => {
    const rows = tableRows(emptyStatement(), { hideZero: false })
    expect(csvLines(rows).map((line) => `${line.kind} ${line.node.id}`)).toEqual([
      'title section:assets',
      'total section:assets',
      'title section:liabilitiesEquity',
      'total section:liabilitiesEquity',
    ])
  })
})

describe('balanceSheetCsvColumns', () => {
  it('writes the account tree with indented names, titles without amounts and totals without a code', () => {
    expect(csvOf(statementOf(balances))).toEqual([
      'Kode,Akun,Per 30 Sep 2026',
      ',Aktiva,',
      '1,"  Assets",',
      '11,"    Cash and bank",',
      '111,"      Cash",100.00',
      ',"    Total Cash and bank",100.00',
      '12,"    Receivables",200.00',
      ',"  Total Assets",300.00',
      ',Total Aktiva,300.00',
      ',Pasiva,',
      '2,"  Liabilities",',
      '21,"    Accounts payable",300.00',
      ',"  Total Liabilities",300.00',
      ',Total Pasiva,300.00',
    ])
  })

  it('uses a semicolon and a decimal comma in the other format', () => {
    const lines = csvOf(statementOf(balances), { format: 'semicolon-comma' })
    expect(lines[0]).toBe('Kode;Akun;Per 30 Sep 2026')
    expect(lines).toContain('111;"      Cash";100,00')
  })

  it('lists the accounts without an amount when the zero accounts are not hidden', () => {
    const lines = csvOf(statementOf(balances), { hideZero: false })
    expect(lines).toContain('112,"      Bank",0.00')
    expect(lines).toContain('13,"    Fixed assets",')
    expect(lines).toContain(',"    Total Fixed assets",0.00')
  })

  it('adds the comparison amount, the change and the change as a plain ratio', () => {
    const compare = new Map<Id, Money>([
      ['cash', '40.00'],
      ['ar', '200.00'],
    ])
    expect(csvOf(statementOf(balances, compare))).toEqual([
      'Kode,Akun,Per 30 Sep 2026,Per 31 Des 2025,Perubahan (IDR),Perubahan (%)',
      ',Aktiva,,,,',
      '1,"  Assets",,,,',
      '11,"    Cash and bank",,,,',
      '111,"      Cash",100.00,40.00,60.00,1.5',
      ',"    Total Cash and bank",100.00,40.00,60.00,1.5',
      '12,"    Receivables",200.00,200.00,0.00,0',
      ',"  Total Assets",300.00,240.00,60.00,0.25',
      ',Total Aktiva,300.00,240.00,60.00,0.25',
      ',Pasiva,,,,',
      '2,"  Liabilities",,,,',
      '21,"    Accounts payable",300.00,0.00,300.00,',
      ',"  Total Liabilities",300.00,0.00,300.00,',
      ',Total Pasiva,300.00,0.00,300.00,',
      ',Selisih,0.00,240.00,-240.00,-1',
    ])
  })

  it('writes the ratio with a decimal comma in the other format', () => {
    const compare = new Map<Id, Money>([['cash', '40.00']])
    const lines = csvOf(statementOf(balances, compare), { format: 'semicolon-comma' })
    expect(lines).toContain('111;"      Cash";100,00;40,00;60,00;1,5')
  })

  it('writes a tiny change as a plain number, not with an exponent', () => {
    const big = new Map<Id, Money>([['cash', '360000150000.00']])
    const compare = new Map<Id, Money>([['cash', '360000000000.00']])
    const lines = csvOf(statementOf(big, compare))
    expect(lines).toContain('111,"      Cash",360000150000.00,360000000000.00,150000.00,0.0000004166666667')
  })

  it('writes the difference line as a line with amounts when the two sides differ', () => {
    const lines = csvOf(statementOf(new Map<Id, Money>([['cash', '100.00']])))
    expect(lines.slice(-4)).toEqual([',Total Aktiva,100.00', ',Pasiva,', ',Total Pasiva,0.00', ',Selisih,100.00'])
  })

  it('writes a line the report adds itself like an account of its section', () => {
    const earnings: ExtraLine = {
      id: '__current_year_earnings__',
      labelKey: 'currentYearEarnings',
      amount: '50.00',
      compare: null,
    }
    const lines = csvOf(statementOf(balances, null, [earnings]))
    expect(lines).toContain(',"  Laba Tahun Berjalan",50.00')
  })
})
