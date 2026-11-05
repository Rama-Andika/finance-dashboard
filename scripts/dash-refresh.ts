/** npm run dash:refresh   rebuild the AP/AR snapshot once, now (also what the background job does). */
import { env } from '../src/server/env'
import { todayIn } from '../src/lib/format/date'
import { refreshApArSnapshot } from '../src/server/dash/refresh-ap-ar'
import { formatDuration } from '../src/server/dash/step-timer'
import { pool } from '../src/server/db/client'
import { refreshPool } from '../src/server/db/refresh-pool'

try {
  const today = env.APP_TODAY ?? todayIn(env.APP_TIMEZONE)
  console.log(`Refreshing the AP/AR snapshot as of ${today} ...`)
  const result = await refreshApArSnapshot(today, { force: process.argv.includes('--force') })
  if (result.ran) {
    console.log(
      `Done in ${formatDuration(result.durationMs)}: ${result.openRows} open invoices, ${result.unallocatedRows} unallocated`,
    )
    for (const step of result.steps) console.log(`  ${step.name}: ${formatDuration(step.ms)}`)
  } else if (result.reason === 'unchanged') {
    console.log('The ERP data has not changed since the last refresh (use --force to rebuild anyway).')
  } else {
    console.log('Another refresh is already running.')
  }
  await Promise.all([pool.end(), refreshPool.end()])
} catch (error) {
  console.error('Refresh failed:', error instanceof Error ? error.message : error)
  await Promise.all([pool.end(), refreshPool.end()]).catch(() => {})
  process.exit(1)
}
