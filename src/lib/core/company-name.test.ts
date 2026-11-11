import { describe, expect, it } from 'vitest'
import { companyDisplayName, documentTitle } from './company-name'

describe('companyDisplayName', () => {
  it('keeps a normal name', () => {
    expect(companyDisplayName('Example Company Ltd')).toBe('Example Company Ltd')
  })

  it('trims the name and collapses runs of spaces, tabs and line breaks', () => {
    expect(companyDisplayName('  Example \t Company\r\n Ltd  ')).toBe('Example Company Ltd')
  })

  it('gives null when the ERP holds nothing usable', () => {
    expect(companyDisplayName(null)).toBeNull()
    expect(companyDisplayName(undefined)).toBeNull()
    expect(companyDisplayName('')).toBeNull()
    expect(companyDisplayName(' \t\n ')).toBeNull()
  })
})

describe('documentTitle', () => {
  it('puts the company name before the app name', () => {
    expect(documentTitle('Example Company Ltd', 'Oxy Finance Dashboard')).toBe(
      'Example Company Ltd | Oxy Finance Dashboard',
    )
  })

  it('uses the app name alone when the company name is not known', () => {
    expect(documentTitle(null, 'Oxy Finance Dashboard')).toBe('Oxy Finance Dashboard')
    expect(documentTitle(undefined, 'Oxy Finance Dashboard')).toBe('Oxy Finance Dashboard')
    expect(documentTitle('', 'Oxy Finance Dashboard')).toBe('Oxy Finance Dashboard')
  })
})
