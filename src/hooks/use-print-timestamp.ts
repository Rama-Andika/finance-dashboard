import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'

/** The "printed on" text: medium date and short time of `date` in `locale` (and `timeZone`, or the browser's own). */
export function formatPrintTimestamp(date: Date, locale: string, timeZone?: string): string {
  return date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone })
}

/**
 * Text for the "Printed on" line of a printout. It is empty on the server and on the first client render, so both
 * produce the same HTML (writing the current time during render gave a different text on the server and in the browser
 * and made React fail hydration with error #418). It is filled in right after mount and again just before the browser
 * prints, so the printed time is the time of printing, not of the page load.
 */
export function usePrintTimestamp(locale: string): string {
  const [text, setText] = useState('')

  useEffect(() => {
    const update = () => setText(formatPrintTimestamp(new Date(), locale))
    update()
    // The print dialog does not wait for a normal React update, so this one is applied at once.
    const beforePrint = () => flushSync(update)
    window.addEventListener('beforeprint', beforePrint)
    return () => window.removeEventListener('beforeprint', beforePrint)
  }, [locale])

  return text
}
