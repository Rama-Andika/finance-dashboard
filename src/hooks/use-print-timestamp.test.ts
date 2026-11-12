import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { formatPrintTimestamp, usePrintTimestamp } from './use-print-timestamp'

function Probe({ locale }: { locale: string }) {
  return createElement('span', null, usePrintTimestamp(locale))
}

/** ICU versions differ in the kind of space before AM/PM, so spaces are compared as plain spaces. */
const plain = (text: string) => text.replace(/\s/g, ' ')

describe('formatPrintTimestamp', () => {
  const moment = new Date('2026-11-12T08:34:00Z')

  it('writes the medium date and short time in the given time zone', () => {
    expect(plain(formatPrintTimestamp(moment, 'en-US', 'UTC'))).toBe('Nov 12, 2026, 8:34 AM')
    expect(plain(formatPrintTimestamp(moment, 'en-US', 'Asia/Jakarta'))).toBe('Nov 12, 2026, 3:34 PM')
  })

  it('follows the time zone, so the same moment reads differently in another zone', () => {
    const jakarta = formatPrintTimestamp(moment, 'en-US', 'Asia/Jakarta')
    const makassar = formatPrintTimestamp(moment, 'en-US', 'Asia/Makassar')
    expect(jakarta).not.toBe(makassar)
  })
})

describe('usePrintTimestamp', () => {
  it('renders nothing on the server, so the server HTML cannot differ from the first client render', () => {
    expect(renderToString(createElement(Probe, { locale: 'en-US' }))).toBe('<span></span>')
    expect(renderToString(createElement(Probe, { locale: 'id-ID' }))).toBe('<span></span>')
  })
})
