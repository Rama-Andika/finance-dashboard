/**
 * npm run db:dash:migrate   apply pending dash_* migrations
 * npm run db:dash:status    list what is pending (changes nothing)
 */
import { dashMigrationStatus, runDashMigrations } from '../src/server/dash/migrate'
import { pool } from '../src/server/db/client'

const statusOnly = process.argv.includes('--status')

try {
  const before = await dashMigrationStatus()
  console.log(`Migrations: ${before.applied}/${before.total} applied${before.pending.length ? `, pending: ${before.pending.join(', ')}` : ''}`)
  if (!statusOnly && before.pending.length > 0) {
    const after = await runDashMigrations()
    console.log(`Done: ${after.applied}/${after.total} applied`)
  }
  await pool.end()
} catch (error) {
  console.error('dash migration failed:', error instanceof Error ? error.message : error)
  await pool.end().catch(() => {})
  process.exit(1)
}
