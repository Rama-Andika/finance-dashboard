import { describe, expect, it } from 'vitest'
import { CF_FALLBACK, CF_FALLBACK_PREFIX, translateCfLabel } from './cashflow-labels'
import en from '~/i18n/locales/en.json'
import id from '~/i18n/locales/id.json'

const t = (key: string) => `T(${key})`

const lookup = (tree: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), tree)

describe('translateCfLabel', () => {
  it('translates fallback keys', () => {
    expect(translateCfLabel(t, CF_FALLBACK.bankLoan)).toBe(`T(${CF_FALLBACK.bankLoan})`)
  })

  it('shows labels from the ERP setup as they are', () => {
    expect(translateCfLabel(t, 'Customer receipts')).toBe('Customer receipts')
    expect(translateCfLabel(t, '')).toBe('')
  })
})

describe('CF_FALLBACK', () => {
  it('uses the shared prefix for every key', () => {
    for (const key of Object.values(CF_FALLBACK)) expect(key.startsWith(CF_FALLBACK_PREFIX)).toBe(true)
  })

  it('has a translation in both languages', () => {
    for (const key of Object.values(CF_FALLBACK)) {
      expect(lookup(en, key)).toEqual(expect.any(String))
      expect(lookup(id, key)).toEqual(expect.any(String))
    }
  })
})
