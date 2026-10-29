import { describe, expect, it } from 'vitest'
import en from './locales/en.json'
import id from './locales/id.json'

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...flattenKeys(value as Record<string, unknown>, fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys.sort()
}

describe('i18n keys', () => {
  it('has identical keys in en.json and id.json', () => {
    const enKeys = flattenKeys(en)
    const idKeys = flattenKeys(id)
    expect(enKeys).toEqual(idKeys)
  })
})
