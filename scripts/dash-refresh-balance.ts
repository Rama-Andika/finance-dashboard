/**
 * npm run dash:refresh-balance                 build the balance snapshot of every closed period that is not in it yet (newest first)
 * npm run dash:refresh-balance -- --rebuild 12 drop the snapshot of period 12, then build it again
 * Run `npm run dash:refresh-gl` first: the balance snapshot is built from the GL snapshot.
 */
import { refreshBalanceSnapshot } from '../src/server/dash/balance-snapshot'
import { pool } from '../src/server/db/client'
import { refreshPool } from '../src/server/db/refresh-pool'
import { DASH_TABLES, dashTable } from '../src/server/dash/tables'

const rebuildIndex = process.argv.indexOf('--rebuild')
const rebuildId = rebuildIndex >= 0 ? (process.argv[rebuildIndex + 1] ?? '') : ''

try {
  if (rebuildIndex >= 0) {
    if (!/^\d+$/.test(rebuildId)) throw new Error('Usage: npm run dash:refresh-balance -- --rebuild <period id>')
    console.log(`Dropping the balance snapshot of period ${rebuildId} ...`)
    await pool.query('DELETE FROM ?? WHERE period_id = ?', [dashTable(DASH_TABLES.balanceMonthly), rebuildId])
    await pool.query('DELETE FROM ?? WHERE period_id = ?', [dashTable(DASH_TABLES.balancePeriods), rebuildId])
  }
  console.log('Building the balance snapshot of closed periods ...')
  const result = await refreshBalanceSnapshot()
  console.log(
    result.ran
      ? `Built ${result.built} period(s) (${result.rebuilt} rebuilt), removed ${result.removed}, in ${Math.round(result.durationMs / 1000)}s`
      : `Nothing to do (${result.reason}).`,
  )
  await Promise.all([pool.end(), refreshPool.end()])
} catch (error) {
  console.error('Balance snapshot failed:', error instanceof Error ? error.message : error)
  await Promise.all([pool.end(), refreshPool.end()]).catch(() => {})
  process.exit(1)
}
