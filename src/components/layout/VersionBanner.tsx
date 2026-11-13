import { useQuery } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { Notice } from '~/components/ui/Notice'
import { appVersionStore } from '~/lib/app-version/store'
import { appVersionOptions } from '~/queries/app-version.queries'

/**
 * Tells the person when the server runs another version than this page was built with, for example after an install or a
 * rollback. The version comes from the X-App-Version header of every server function response (src/start.ts); the query
 * below only makes sure there is a round trip when the tab becomes visible again.
 */
export function VersionBanner() {
  const { t } = useTranslation()
  useQuery(appVersionOptions())
  const mismatch = useSyncExternalStore(appVersionStore.subscribe, appVersionStore.getSnapshot, () => false)
  if (!mismatch) return null
  return (
    <div className="no-print">
      <Notice
        tone="info"
        title={t('ui.shell.newVersionTitle')}
        body={t('ui.shell.newVersionBody')}
        action={{ label: t('ui.shell.newVersionReload'), onClick: () => window.location.reload() }}
      />
    </div>
  )
}
