/**
 * npm run dash:refresh-hist              build every missing month-end of AP/AR history now
 * npm run dash:refresh-hist -- --max 2   build at most 2 months
 */
import { env } from '../src/server/env'
import { todayIn } from '../src/lib/format/date'
import { refreshApArHistSnapshots } from '../src/server/dash/hist-ap-ar'
import { pool } from '../src/server/db/client'

try {
  const today = env.APP_TODAY ?? todayIn(env.APP_TIMEZONE)
  const maxIndex = process.argv.indexOf('--max')
  const maxBuilds = maxIndex >= 0 ? Number(process.argv[maxIndex + 1]) : Number.POSITIVE_INFINITY
  if (!(maxBuilds >= 1)) throw new Error('--max needs a number of 1 or more')

  console.log(`Building the AP/AR month-end history as of ${today} (${env.DASH_AP_AR_HIST_MONTHS} months kept) ...`)
  const result = await refreshApArHistSnapshots(today, { maxBuilds })
  console.log(
    result.ran
      ? `Done in ${Math.round(result.durationMs / 1000)}s: built ${result.built.length} month(s) (${result.built.join(', ') || 'none'}), removed ${result.pruned}`
      : `Nothing to do (${result.reason}).`,
  )
  await pool.end()
} catch (error) {
  console.error('AP/AR history failed:', error instanceof Error ? error.message : error)
  await pool.end().catch(() => {})
  process.exit(1)
}
