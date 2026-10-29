import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { cn } from '~/lib/cn'
import { snapshotInfoOptions } from '~/queries/snapshot.queries'

/** "Data as of <time>" for the numbers served from the snapshot tables, with the state of the latest refresh. */
export function DataFreshness({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { data } = useQuery(snapshotInfoOptions())
  if (!data) return null

  // No snapshot: the numbers come from the slow live queries; say why instead of staying silent.
  if (!data.info) {
    return (
      <div className={cn('nr-freshness', className)} role="status">
        <strong>{t('ui.shell.noSnapshot')}</strong>
        {data.problem && <span>{t(`ui.shell.snapshotProblem.${data.problem}`)}</span>}
      </div>
    )
  }

  const when = new Date(data.info.checkedAt).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className={cn('nr-freshness', className)}>
      <strong>{t('ui.shell.dataAsOf', { when })}</strong>
      {data.stale && <span role="alert">{t('ui.shell.snapshotStale')}</span>}
      {data.info.status === 'running' && <span>{t('ui.shell.refreshing')}</span>}
      {data.info.status === 'failed' && <span>{t('ui.shell.refreshFailed')}</span>}
    </div>
  )
}
