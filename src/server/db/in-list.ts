import { sql, type SQL } from 'drizzle-orm'

export function inList(values: readonly string[]): SQL {
  if (values.length === 0) throw new Error('inList: empty list')
  return sql.join(values.map((v) => sql`${v}`), sql`, `)
}
