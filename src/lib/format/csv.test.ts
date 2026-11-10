import { describe, expect, it } from 'vitest'
import { buildCsv, ratioForCsv, type CsvColumn } from './csv'

interface SampleRow {
  name: string
  amount: string
  date: string
}

const columns: CsvColumn<SampleRow>[] = [
  { header: 'Name', value: (r) => r.name, kind: 'text' },
  { header: 'Amount', value: (r) => r.amount, kind: 'money' },
  { header: 'Date', value: (r) => r.date, kind: 'date' },
]

describe('buildCsv', () => {
  it('starts with BOM character \\uFEFF', () => {
    const csv = buildCsv([], columns, 'comma-dot')
    expect(csv.startsWith('\uFEFF')).toBe(true)
  })

  it('formats money as 1234.50 with comma-dot and 1234,50 with semicolon-comma', () => {
    const rows: SampleRow[] = [{ name: 'Item', amount: '1234.5', date: '2026-10-28' }]
    const csvComma = buildCsv(rows, columns, 'comma-dot')
    const csvSemicolon = buildCsv(rows, columns, 'semicolon-comma')

    expect(csvComma).toContain('1234.50')
    expect(csvSemicolon).toContain('1234,50')
  })

  it('quotes text containing column delimiter', () => {
    const rows: SampleRow[] = [{ name: 'PT A, Tbk', amount: '100', date: '2026-10-28' }]
    const csvComma = buildCsv(rows, columns, 'comma-dot')
    expect(csvComma).toContain('"PT A, Tbk"')
  })

  it('formats negative money with plain minus sign', () => {
    const rows: SampleRow[] = [{ name: 'Expense', amount: '-10', date: '2026-10-28' }]
    const csvComma = buildCsv(rows, columns, 'comma-dot')
    expect(csvComma).toContain('-10.00')
  })
})

describe('ratioForCsv', () => {
  it('gives an empty cell for null and for an empty text', () => {
    expect(ratioForCsv(null)).toBe('')
    expect(ratioForCsv('')).toBe('')
  })

  it('keeps an ordinary ratio as it is', () => {
    expect(ratioForCsv('0.25')).toBe('0.25')
    expect(ratioForCsv('-0.5')).toBe('-0.5')
    expect(ratioForCsv('0')).toBe('0')
  })

  it('never writes an exponent and keeps 10 significant digits', () => {
    expect(ratioForCsv('3.82075683337e-7')).toBe('0.0000003820756833')
    expect(ratioForCsv('-2.28e-6')).toBe('-0.00000228')
    expect(ratioForCsv('0.12345678901234')).toBe('0.123456789')
  })
})
