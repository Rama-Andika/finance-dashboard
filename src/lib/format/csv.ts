import Papa from 'papaparse'
import Decimal from 'decimal.js'

export type CsvFormat = 'comma-dot' | 'semicolon-comma' // U5

export type CsvColumn<T> = {
  header: string
  value: (row: T) => string | number | null
  kind: 'text' | 'money' | 'date' | 'number'
}

export function buildCsv<T>(
  rows: T[],
  columns: CsvColumn<T>[],
  format: CsvFormat,
): string {
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

  const csv = Papa.unparse(
    { fields, data },
    { delimiter, newline: '\r\n', quotes: false },
  )

  return `\uFEFF${csv}`
}
