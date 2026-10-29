import { describe, expect, it } from 'vitest'
import { getJournalGroupKey, JOURNAL_GROUP_KEYS } from './journal-type'
import en from '~/i18n/locales/en.json'
import id from '~/i18n/locales/id.json'

describe('journal-type classification', () => {
  it('maps cash in types correctly', () => {
    expect(getJournalGroupKey(0)).toBe('cashIn')
    expect(getJournalGroupKey(3)).toBe('cashIn')
    expect(getJournalGroupKey(41)).toBe('cashIn')
  })

  it('maps cash out types correctly', () => {
    expect(getJournalGroupKey(1)).toBe('cashOut')
    expect(getJournalGroupKey(4)).toBe('cashOut')
    expect(getJournalGroupKey(22)).toBe('cashOut')
  })

  it('maps sales types correctly', () => {
    expect(getJournalGroupKey(8)).toBe('sales')
    expect(getJournalGroupKey(9)).toBe('sales')
  })

  it('maps purchase types correctly', () => {
    expect(getJournalGroupKey(6)).toBe('purchase')
    expect(getJournalGroupKey(21)).toBe('purchase')
  })

  it('maps loans and assets correctly', () => {
    expect(getJournalGroupKey(11)).toBe('loan')
    expect(getJournalGroupKey(44)).toBe('fixedAsset')
    expect(getJournalGroupKey(52)).toBe('wasteBank')
  })

  it('defaults unknown or adjustment types to adjustment', () => {
    expect(getJournalGroupKey(7)).toBe('adjustment')
    expect(getJournalGroupKey(20)).toBe('adjustment')
    expect(getJournalGroupKey(999)).toBe('adjustment')
  })

  it('has an EN and ID label for every group', () => {
    for (const g of JOURNAL_GROUP_KEYS) {
      expect((en.journalType as Record<string, string>)[g]).toBeTruthy()
      expect((id.journalType as Record<string, string>)[g]).toBeTruthy()
    }
  })
})
