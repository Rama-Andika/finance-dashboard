import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MySqlDialect } from 'drizzle-orm/mysql-core'
import type { SQL } from 'drizzle-orm'

const rowsMock = vi.fn()
vi.mock('~/server/db/query', () => ({ rows: (...args: unknown[]) => rowsMock(...args) }))

const { glTableHasCanceledDate, notCanceledClause, prefetchCanceledDateColumns } = await import('./gl-columns')
const { clearCache } = await import('~/server/cache')

const render = (clause: SQL): string => new MySqlDialect().sqlToQuery(clause).sql

describe('glTableHasCanceledDate', () => {
  beforeEach(() => {
    rowsMock.mockReset()
    clearCache()
  })

  it('is true when information_schema lists the column', async () => {
    rowsMock.mockResolvedValue([{ n: '1' }])
    expect(await glTableHasCanceledDate('gl')).toBe(true)
  })

  it('is false when the column is missing', async () => {
    rowsMock.mockResolvedValue([{ n: 0 }])
    expect(await glTableHasCanceledDate('gl')).toBe(false)
  })

  it('asks once per table and remembers the answer', async () => {
    rowsMock.mockResolvedValue([{ n: 1 }])
    await glTableHasCanceledDate('gl')
    await glTableHasCanceledDate('gl')
    expect(rowsMock).toHaveBeenCalledTimes(1)
    await glTableHasCanceledDate('gl_2024')
    expect(rowsMock).toHaveBeenCalledTimes(2)
  })
})

describe('notCanceledClause', () => {
  beforeEach(() => {
    rowsMock.mockReset()
    clearCache()
  })

  it('filters on the given alias when the column exists', async () => {
    rowsMock.mockResolvedValue([{ n: 1 }])
    const text = render(await notCanceledClause('gl', 'g2'))
    expect(text).toContain('canceled_date IS NULL')
    expect(text).toContain('g2')
  })

  it('is an empty fragment when the column is missing', async () => {
    rowsMock.mockResolvedValue([{ n: 0 }])
    expect(render(await notCanceledClause('gl', 'g')).trim()).toBe('')
  })
})

describe('prefetchCanceledDateColumns', () => {
  beforeEach(() => {
    rowsMock.mockReset()
    clearCache()
  })

  it('asks each distinct table once and lets later checks use the cache', async () => {
    rowsMock.mockResolvedValue([{ n: 1 }])
    await prefetchCanceledDateColumns(['gl', 'gl_2024', 'gl'])
    expect(rowsMock).toHaveBeenCalledTimes(2)
    await notCanceledClause('gl', 'g')
    await notCanceledClause('gl_2024', 'g')
    expect(rowsMock).toHaveBeenCalledTimes(2)
  })
})
