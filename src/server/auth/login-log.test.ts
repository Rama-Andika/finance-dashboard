import { describe, expect, it } from 'vitest'
import { describeLoginId } from './login-log'

describe('describeLoginId', () => {
  it('gives eight hex characters and the length', () => {
    const out = describeLoginId('Budi.Santoso')
    expect(out.usernameHash).toMatch(/^[0-9a-f]{8}$/)
    expect(out.usernameLength).toBe(12)
  })

  it('gives the same hash for the same name in any case and with spaces around it', () => {
    expect(describeLoginId(' Budi.Santoso ')).toEqual(describeLoginId('budi.santoso'))
  })

  it('gives another hash for another name', () => {
    expect(describeLoginId('a').usernameHash).not.toBe(describeLoginId('b').usernameHash)
  })

  it('never contains the typed text', () => {
    const typed = 'my-secret-password'
    expect(JSON.stringify(describeLoginId(typed))).not.toContain(typed)
  })
})
