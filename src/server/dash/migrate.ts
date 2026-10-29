import '@tanstack/react-start/server-only'
import fs from 'node:fs'
import path from 'node:path'
import { migrate } from 'drizzle-orm/mysql2/migrator'
import { db, pool } from '~/server/db/client'

/** Where `drizzle-kit generate --config drizzle.dash.config.ts` writes the SQL files. */
const MIGRATIONS_FOLDER = path.resolve(process.cwd(), 'drizzle-dash')
/** Tracking table (the name must start with dash_ like every table the dashboard owns). */
export const MIGRATIONS_TABLE = 'dash_migrations'
const LOCK_NAME = 'dash_migrate'

type JournalEntry = { tag: string; when: number }

function readJournal(): JournalEntry[] {
  const file = path.join(MIGRATIONS_FOLDER, 'meta', '_journal.json')
  if (!fs.existsSync(file)) return []
  return (JSON.parse(fs.readFileSync(file, 'utf8')) as { entries: JournalEntry[] }).entries
}

export type MigrationStatus = { total: number; applied: number; pending: string[] }

/** Which migration files have not been applied to this database yet (read only). */
export async function dashMigrationStatus(): Promise<MigrationStatus> {
  const entries = readJournal()
  let appliedWhen = new Set<string>()
  try {
    const [rows] = await pool.query(`SELECT created_at FROM \`${MIGRATIONS_TABLE}\``)
    appliedWhen = new Set((rows as Array<{ created_at: string | number }>).map((r) => String(r.created_at)))
  } catch {
    // the tracking table does not exist yet: nothing is applied
  }
  const pending = entries.filter((e) => !appliedWhen.has(String(e.when))).map((e) => e.tag)
  return { total: entries.length, applied: entries.length - pending.length, pending }
}

/** Applies pending migrations. One process at a time (advisory lock); safe to call repeatedly. */
export async function runDashMigrations(): Promise<MigrationStatus> {
  const conn = await pool.getConnection()
  try {
    const [lockRows] = await conn.query('SELECT GET_LOCK(?, 60) AS got', [LOCK_NAME])
    if (Number((lockRows as Array<{ got: number }>)[0]?.got) !== 1) {
      throw new Error('Another process is running the dash migrations (could not get the lock in 60 seconds)')
    }
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER, migrationsTable: MIGRATIONS_TABLE })
    return await dashMigrationStatus()
  } finally {
    await conn.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]).catch(() => {})
    conn.release()
  }
}
