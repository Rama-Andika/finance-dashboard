/** npm run dash:refresh-gl   build the GL snapshot of every closed period that is not in it yet (newest first). */
import { refreshGlMonthlySnapshot } from '../src/server/dash/gl-snapshot'
import { pool } from '../src/server/db/client'

try {
  console.log('Building the GL snapshot of closed periods ...')
  const result = await refreshGlMonthlySnapshot()
  console.log(result.ran ? `Built ${result.built} period(s), removed ${result.removed}, in ${Math.round(result.durationMs / 1000)}s` : `Nothing to do (${result.reason}).`)
  await pool.end()
} catch (error) {
  console.error('GL snapshot failed:', error instanceof Error ? error.message : error)
  await pool.end().catch(() => {})
  process.exit(1)
}
