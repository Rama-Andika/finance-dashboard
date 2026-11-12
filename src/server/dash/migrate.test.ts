import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('~/server/db/client', () => ({ db: {}, pool: { query: mocks.query, getConnection: vi.fn() } }))
vi.mock('drizzle-orm/mysql2/migrator', () => ({ migrate: vi.fn() }))

import { dashMigrationStatus } from './migrate'

const journal = (
  JSON.parse(readFileSync(join(process.cwd(), 'drizzle-dash', 'meta', '_journal.json'), 'utf8')) as {
    entries: { tag: string; when: number }[]
  }
).entries

describe('dashMigrationStatus', () => {
  beforeEach(() => {
    // A braces body on purpose: an arrow that returns the mock would be run by Vitest as a cleanup function.
    mocks.query.mockReset()
  })

  it('reports every migration as pending when the tracking table does not exist yet', async () => {
    mocks.query.mockRejectedValue(
      Object.assign(new Error("Table 'x.dash_migrations' doesn't exist"), { code: 'ER_NO_SUCH_TABLE', errno: 1146 }),
    )
    expect(await dashMigrationStatus()).toEqual({
      total: journal.length,
      applied: 0,
      pending: journal.map((entry) => entry.tag),
    })
  })

  it('does not take an unreachable database for "nothing applied"', async () => {
    mocks.query.mockRejectedValue(
      Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:3306'), { code: 'ECONNREFUSED' }),
    )
    await expect(dashMigrationStatus()).rejects.toThrow('ECONNREFUSED')
  })

  it('counts the migrations the tracking table holds', async () => {
    mocks.query.mockResolvedValue([journal.slice(0, 2).map((entry) => ({ created_at: String(entry.when) })), []])
    const status = await dashMigrationStatus()
    expect(status.applied).toBe(2)
    expect(status.pending).toEqual(journal.slice(2).map((entry) => entry.tag))
  })
})
