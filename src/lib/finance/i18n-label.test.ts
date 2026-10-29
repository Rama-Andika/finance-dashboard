import { describe, expect, it } from 'vitest'
import { i18nLabel, translateLabel } from './i18n-label'

const t = (key: string) => `T(${key})`

describe('i18n labels', () => {
  it('translates labels made with i18nLabel', () => {
    expect(translateLabel(t, i18nLabel('fixedCostRoot'))).toBe('T(fixedCostRoot)')
  })

  it('leaves account names from the ERP untouched', () => {
    expect(translateLabel(t, 'Rent expense')).toBe('Rent expense')
    expect(translateLabel(t, '')).toBe('')
  })
})
