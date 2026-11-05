/**
 * npm run dash:refresh-gl                 build the GL snapshot of every closed period that is not in it yet (newest first)
 * npm run dash:refresh-gl -- --rebuild 12 drop the snapshot of period 12, then build it again
 */
import { refreshGlMonthlySnapshot } from '../src/server/dash/gl-snapshot'
import { pool } from '../src/server/db/client'
import { refreshPool } from '../src/server/db/refresh-pool'
import { DASH_TABLES, dashTable } from '../src/server/dash/tables'

const rebuildIndex = process.argv.indexOf('--rebuild')
const rebuildId = rebuildIndex >= 0 ? (process.argv[rebuildIndex + 1] ?? '') : ''

try {
  if (rebuildIndex >= 0) {
    if (!/^\d+$/.test(rebuildId)) throw new Error('Usage: npm run dash:refresh-gl -- --rebuild <period id>')
    console.log(`Dropping the snapshot of period ${rebuildId} ...`)
    await pool.query('DELETE FROM ?? WHERE period_id = ?', [dashTable(DASH_TABLES.glMonthly), rebuildId])
    await pool.query('DELETE FROM ?? WHERE period_id = ?', [dashTable(DASH_TABLES.glPeriods), rebuildId])
  }
  console.log('Building the GL snapshot of closed periods ...')
  const result = await refreshGlMonthlySnapshot()
  console.log(
    result.ran
      ? `Built ${result.built} period(s) (${result.rebuilt} rebuilt), removed ${result.removed}, in ${Math.round(result.durationMs / 1000)}s`
      : `Nothing to do (${result.reason}).`,
  )
  await Promise.all([pool.end(), refreshPool.end()])
} catch (error) {
  console.error('GL snapshot failed:', error instanceof Error ? error.message : error)
  await Promise.all([pool.end(), refreshPool.end()]).catch(() => {})
  process.exit(1)
}
