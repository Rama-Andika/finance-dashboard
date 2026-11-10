import { ratioForCsv, type CsvColumn } from '~/lib/format/csv'
import { changeOf, changeRatioOf, type BalanceSheetNode } from './statement'

/** Spaces in front of a name for each level of the account tree. */
const INDENT_PER_LEVEL = 2

/**
 * What one line of the exported file is:
 * - title: a section or an account group (a row with accounts below it): its name only, with no amounts;
 * - detail: an account, or a line the report adds itself (earnings, difference), with its amounts;
 * - total: the sum of a title line, written after the last line below it.
 * Adding up the whole amount column counts every account twice (once on its own line, once inside a total line), so a
 * reader who adds up the column leaves out the lines whose name starts with "Total".
 */
export type CsvLineKind = 'title' | 'detail' | 'total'

export type CsvLine = { kind: CsvLineKind; node: BalanceSheetNode }

/** The lines of the file for the table rows, in display order: a title, the lines below it, then its total. */
export function csvLines(rows: readonly BalanceSheetNode[]): CsvLine[] {
  return rows.flatMap((node): CsvLine[] => {
    // A section always has a title and a total, even when every account below it is hidden.
    if (node.kind !== 'section' && node.children.length === 0) return [{ kind: 'detail', node }]
    return [{ kind: 'title', node }, ...csvLines(node.children), { kind: 'total', node }]
  })
}

/** The text with two spaces in front of it for each level of the tree (level 0 stays as it is). */
export function indentLabel(level: number, text: string): string {
  return ' '.repeat(Math.max(0, level) * INDENT_PER_LEVEL) + text
}

/** The texts of the file, already translated by the caller. */
export type BalanceSheetCsvLabels = {
  accountCode: string
  account: string
  /** Header of the amount at the report date, for example "As of 30 Sep 2026". */
  amountHeader: string
  /** Header of the amount at the comparison date; only used when there is a comparison. */
  compareHeader: string
  change: string
  changePct: string
  /** The name of a row: the account name, or the translated name of a line the report adds itself. */
  nameOf: (node: BalanceSheetNode) => string
  /** The name of a total line made from a name, for example "Total Cash" from "Cash". */
  totalOf: (name: string) => string
}

/**
 * The columns of the exported balance sheet: account code, account name (indented by tree level), the amount and, with a
 * comparison, the comparison amount, the change and the change as a plain ratio (the spreadsheet formats it as a percent).
 * A title line has no amounts and a total line has no account code.
 */
export function balanceSheetCsvColumns(labels: BalanceSheetCsvLabels, hasCompare: boolean): CsvColumn<CsvLine>[] {
  const amountOf = (line: CsvLine, pick: (node: BalanceSheetNode) => string | null): string | null =>
    line.kind === 'title' ? null : pick(line.node)

  const columns: CsvColumn<CsvLine>[] = [
    { header: labels.accountCode, value: (line) => (line.kind === 'total' ? '' : line.node.code), kind: 'text' },
    {
      header: labels.account,
      value: (line) => {
        const name = labels.nameOf(line.node)
        return indentLabel(line.node.level, line.kind === 'total' ? labels.totalOf(name) : name)
      },
      kind: 'text',
    },
    { header: labels.amountHeader, value: (line) => amountOf(line, (node) => node.amount), kind: 'money' },
  ]
  if (!hasCompare) return columns

  return [
    ...columns,
    { header: labels.compareHeader, value: (line) => amountOf(line, (node) => node.compare), kind: 'money' },
    {
      header: labels.change,
      value: (line) => amountOf(line, (node) => changeOf(node.amount, node.compare)),
      kind: 'money',
    },
    {
      header: labels.changePct,
      value: (line) => amountOf(line, (node) => ratioForCsv(changeRatioOf(node.amount, node.compare))),
      kind: 'number',
    },
  ]
}
