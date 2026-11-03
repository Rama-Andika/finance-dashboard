import '@tanstack/react-start/server-only'
import { sql, type SQL } from 'drizzle-orm'
import { glTablesOf } from '~/server/db/gl-tables'
import { notCanceledClause } from '~/server/db/gl-columns'
import { D } from '~/lib/core/money'
import type { Money } from '~/lib/core/types'

export type SqlIdentifier = ReturnType<typeof sql.identifier>

/** The names and fixed clause one GL table needs in every query slice. */
export type GlTableSql = {
  glIdent: SqlIdentifier
  glDetailIdent: SqlIdentifier
  segIdent: SqlIdentifier
  notCanceled: SQL
}

export async function glTableSql(tableName: string, segCol: string): Promise<GlTableSql> {
  const { gl, glDetail } = glTablesOf(tableName)
  return {
    glIdent: sql.identifier(gl),
    glDetailIdent: sql.identifier(glDetail),
    segIdent: sql.identifier(segCol),
    notCanceled: await notCanceledClause(tableName, 'g'),
  }
}

/**
 * Adds `amounts` to the row stored under `key`, or stores a new row (made by `create`) when there is none.
 * Debit and credit are summed as exact decimals.
 */
export function accumulate<T extends { debet: Money; credit: Money }>(
  map: Map<string, T>,
  key: string,
  amounts: { debet: Money; credit: Money },
  create: () => T,
): void {
  const existing = map.get(key)
  if (!existing) {
    map.set(key, create())
    return
  }
  existing.debet = D(existing.debet).plus(D(amounts.debet)).toFixed(2)
  existing.credit = D(existing.credit).plus(D(amounts.credit)).toFixed(2)
}
