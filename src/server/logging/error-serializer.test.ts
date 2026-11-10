import { describe, expect, it } from 'vitest'
import { serializeError } from './error-serializer'

/** Same shape as Drizzle's failed-query error: the message repeats the parameter values. */
class DrizzleQueryError extends Error {
  query: string
  params: unknown[]
  constructor(query: string, params: unknown[], cause: unknown) {
    super(`Failed query: ${query}\nparams: ${params.join(',')}`)
    this.query = query
    this.params = params
    this.cause = cause
  }
}

/** Same shape as a mysql2 error: the message repeats a data value. */
function mysqlError(): Error {
  const error = new Error("Duplicate entry 'secret-value' for key 'PRIMARY'") as Error & Record<string, unknown>
  error.code = 'ER_DUP_ENTRY'
  error.errno = 1062
  error.sqlState = '23000'
  error.sqlMessage = "Duplicate entry 'secret-value' for key 'PRIMARY'"
  error.sql = "INSERT INTO t VALUES ('secret-value')"
  return error
}

describe('serializeError', () => {
  it('keeps the type and message of a plain error and only the "at ..." lines of the stack', () => {
    const out = serializeError(new TypeError('bad input'))
    expect(out.type).toBe('TypeError')
    expect(out.message).toBe('bad input')
    expect(out.stack).toBeDefined()
    expect(out.stack).not.toContain('bad input')
    expect(out.stack?.split('\n').every((line) => /^\s+at /.test(line))).toBe(true)
  })

  it('never writes the parameter values of a failed query, in the message, the stack or the cause', () => {
    const error = new DrizzleQueryError('SELECT *\n  FROM gl WHERE period_id = ?', ['secret-value'], mysqlError())
    const text = JSON.stringify(serializeError(error))
    expect(text).not.toContain('secret-value')
    const out = serializeError(error)
    expect(out.type).toBe('DrizzleQueryError')
    expect(out.message).toBe('Failed query')
    expect(out.sql).toBe('SELECT * FROM gl WHERE period_id = ?')
    expect(out.cause).toMatchObject({ message: 'ER_DUP_ENTRY', code: 'ER_DUP_ENTRY', errno: 1062, sqlState: '23000' })
  })

  it('keeps only code, errno and sqlState of a database error', () => {
    const out = serializeError(mysqlError())
    expect(out.message).toBe('ER_DUP_ENTRY')
    expect(out.sql).toBeUndefined()
    expect(JSON.stringify(out)).not.toContain('secret-value')
  })

  it('keeps the message of a connection error (it has no data in it)', () => {
    const error = new Error('connect ECONNREFUSED 127.0.0.1:3306') as Error & { code: string }
    error.code = 'ECONNREFUSED'
    const out = serializeError(error)
    expect(out.message).toBe('connect ECONNREFUSED 127.0.0.1:3306')
    expect(out.code).toBe('ECONNREFUSED')
  })

  it('describes a value that is not an error', () => {
    expect(serializeError('boom')).toEqual({ type: 'NonError', message: 'boom' })
    expect(serializeError(42)).toEqual({ type: 'NonError', message: '42' })
    expect(serializeError({ secret: 'x' })).toEqual({ type: 'NonError', message: '[object]' })
    expect(serializeError(undefined)).toEqual({ type: 'NonError', message: '[undefined]' })
  })

  it('stops following causes after four levels', () => {
    let error: Error = new Error('level 6')
    for (let i = 5; i >= 1; i--) error = new Error(`level ${i}`, { cause: error })
    let depth = 0
    for (let current = serializeError(error).cause; current; current = current.cause) depth++
    expect(depth).toBe(4)
  })

  it('cuts a very long message', () => {
    expect(serializeError(new Error('x'.repeat(5000))).message.length).toBe(2001)
  })
})
