import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useLang } from '~/hooks/use-lang'
import { cn } from '~/lib/cn'
import { formatDateTime } from '~/lib/format/date'
import { isSnapshotRefreshing } from '~/lib/finance/ap-ar/snapshot-state'
import { SnapshotRefreshButton } from '~/components/layout/SnapshotRefreshButton'
import { snapshotInfoOptions } from '~/queries/snapshot.queries'

/** "Data as of <time>" for the numbers served from the snapshot tables, with the state of the latest refresh. */
export function DataFreshness({ className }: { className?: string }) {
  const { t } = useTranslation()
  const lang = useLang()
  const { data } = useQuery(snapshotInfoOptions())
  if (!data) return null

  const refreshing = isSnapshotRefreshing(data)

  // No snapshot: the numbers come from the slow live queries; say why instead of staying silent.
  if (!data.info) {
    return (
      <div className={cn('nr-freshness', className)} role="status">
        <strong>{t('ui.shell.noSnapshot')}</strong>
        {data.problem && <span>{t(`ui.shell.snapshotProblem.${data.problem}`)}</span>}
        {refreshing && <span>{t('ui.shell.refreshing')}</span>}
        <SnapshotRefreshButton />
      </div>
    )
  }

  const when = formatDateTime(data.info.checkedAt, lang)
  const failed = !refreshing && (data.info.status === 'failed' || data.job.lastOk === false)

  return (
    <div className={cn('nr-freshness', className)}>
      <strong>{t('ui.shell.dataAsOf', { when })}</strong>
      {data.stale && <span role="alert">{t('ui.shell.snapshotStale')}</span>}
      {refreshing && <span>{t('ui.shell.refreshing')}</span>}
      {failed && <span>{t('ui.shell.refreshFailed')}</span>}
      <SnapshotRefreshButton />
    </div>
  )
}
