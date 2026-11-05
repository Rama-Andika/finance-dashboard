/** npm run dash:refresh-cash   build the cash-lines snapshot of every closed period that is missing or outdated (newest first). */
import { refreshCashLinesSnapshot } from '../src/server/dash/cash-lines-build'
import { currentCashAccountIds } from '../src/server/services/shared/cash-accounts'
import { pool } from '../src/server/db/client'
import { refreshPool } from '../src/server/db/refresh-pool'

try {
  console.log('Building the cash-lines snapshot of closed periods ...')
  const result = await refreshCashLinesSnapshot(await currentCashAccountIds())
  console.log(
    result.ran
      ? `Built ${result.built} period(s) (${result.rebuilt} rebuilt), removed ${result.removed}, in ${Math.round(result.durationMs / 1000)}s`
      : `Nothing to do (${result.reason}).`,
  )
  await Promise.all([pool.end(), refreshPool.end()])
} catch (error) {
  console.error('Cash-lines snapshot failed:', error instanceof Error ? error.message : error)
  await Promise.all([pool.end(), refreshPool.end()]).catch(() => {})
  process.exit(1)
}
