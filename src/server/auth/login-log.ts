import { createHash } from 'node:crypto'

/**
 * What a failed login may leave in the log about the typed name. People sometimes type the password into the name field,
 * so the name itself is never written: only a short hash (to see that the same name was tried again and again) and its
 * length. No server-only marker: it only hashes, and it is unit tested.
 */
export function describeLoginId(loginId: string): { usernameHash: string; usernameLength: number } {
  const normalized = loginId.trim().toLowerCase()
  return {
    usernameHash: createHash('sha256').update(normalized).digest('hex').slice(0, 8),
    usernameLength: normalized.length,
  }
}
