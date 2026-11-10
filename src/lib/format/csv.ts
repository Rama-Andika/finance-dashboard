import Papa from 'papaparse'
import Decimal from 'decimal.js'

export type CsvFormat = 'comma-dot' | 'semicolon-comma' // U5

export type CsvColumn<T> = {
  header: string
  value: (row: T) => string | number | null
  kind: 'text' | 'money' | 'date' | 'number'
}

/**
 * A ratio (for example a change divided by the comparison amount) as a plain decimal number for a CSV cell: kept to 10
 * significant digits and never written with an exponent (a spreadsheet may not read "3.8e-7"). Null or empty gives an
 * empty cell.
 */
export function ratioForCsv(ratio: string | null): string {
  if (ratio === null || ratio === '') return ''
  const value = new Decimal(ratio)
  return value.isZero() ? '0' : value.toSignificantDigits(10).toFixed()
}

export function buildCsv<T>(rows: T[], columns: CsvColumn<T>[], format: CsvFormat): string {
  const delimiter = format === 'comma-dot' ? ',' : ';'
  const fields = columns.map((col) => col.header)

  const data = rows.map((row) =>
    columns.map((col) => {
      const val = col.value(row)
      if (val === null || val === undefined || val === '') return ''

      if (col.kind === 'money') {
        const d = new Decimal(val)
        const formatted = d.toFixed(2, Decimal.ROUND_HALF_UP)
        return format === 'semicolon-comma' ? formatted.replace('.', ',') : formatted
      }

      if (col.kind === 'number') {
        const str = String(val)
        return format === 'semicolon-comma' ? str.replace('.', ',') : str
      }

      return String(val)
    }),
  )

  const csv = Papa.unparse({ fields, data }, { delimiter, newline: '\r\n', quotes: false })

  return `\uFEFF${csv}`
}
