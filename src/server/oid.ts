import '@tanstack/react-start/server-only'

/** ERP OID = (epochMs + 0x0100000000000000 × appIdx) followed by one random digit 0–8. */
export function generateErpOid(appIdx: number, nowMs: number, randomDigit: number): string {
  const base = BigInt(nowMs) + 0x0100000000000000n * BigInt(appIdx)
  return `${base.toString()}${randomDigit}`
}
