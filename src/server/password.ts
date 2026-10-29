import { createHash, timingSafeEqual } from 'node:crypto'

/** Compare two strings in constant time (G26). Different lengths are safe because the hashes are compared. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest()
  const hb = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(ha, hb)
}
