import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '~/components/ui/Button'
import { ErrorReference } from '~/components/layout/ErrorReference'
import { useSnapshotRefresh } from '~/components/layout/use-snapshot-refresh'

/** "Refresh now" for the snapshot tables, shown inside the "Data as of ..." card. */
export function SnapshotRefreshButton() {
  const { t } = useTranslation()
  const { canRefresh, busy, notice, press } = useSnapshotRefresh()
  if (!canRefresh) return null

  function noticeText(): string | null {
    if (!notice) return null
    if (notice.kind === 'cooldown') return t('ui.shell.refreshCooldown', { seconds: notice.seconds })
    if (notice.kind === 'unavailable') return t('ui.shell.refreshUnavailable')
    return t('ui.shell.refreshRequestFailed')
  }
  const message = noticeText()

  return (
    <>
      <Button variant="accent" icon={RefreshCw} disabled={busy} aria-busy={busy} onClick={press}>
        {busy ? t('ui.shell.refreshingNow') : t('ui.shell.refreshNow')}
      </Button>
      {message && <span role="status">{message}</span>}
      {notice?.kind === 'error' && <ErrorReference error={notice.error} />}
    </>
  )
}
