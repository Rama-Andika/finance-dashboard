import { describe, expect, it } from 'vitest'
import { mergeJournalPages } from './journal-page'

const row = (glId: string, transDate: string, coaId = '1') => ({ glId, transDate, coaId })

describe('mergeJournalPages', () => {
  it('orders lines of several GL tables newest first and slices one global page', () => {
    const tableA = [row('9', '2024-03-01'), row('4', '2024-01-15')]
    const tableB = [row('20', '2024-02-10'), row('3', '2023-12-31')]

    expect(mergeJournalPages([tableA, tableB], 0, 3).map((r) => r.glId)).toEqual(['9', '20', '4'])
    expect(mergeJournalPages([tableA, tableB], 3, 3).map((r) => r.glId)).toEqual(['3'])
  })

  it('compares long numeric ids by value, not as text', () => {
    const merged = mergeJournalPages([[row('99', '2024-01-01')], [row('100', '2024-01-01')]], 0, 2)
    expect(merged.map((r) => r.glId)).toEqual(['100', '99'])
  })

  it('keeps lines of one journal ordered by account id', () => {
    const merged = mergeJournalPages([[row('5', '2024-01-01', '2'), row('5', '2024-01-01', '1')]], 0, 5)
    expect(merged.map((r) => r.coaId)).toEqual(['1', '2'])
  })
})
