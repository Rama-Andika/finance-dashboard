import { useTranslation } from 'react-i18next'
import { Button } from '~/components/ui/Button'
import { Notice } from '~/components/ui/Notice'
import { errorMessageKey } from '~/lib/error-message'

/** One part of a page failed to load: say so in place and offer a retry, without taking the rest of the page down. */
export function SummarySectionError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <Notice tone="danger" title={t('metric.errorTitle')} body={t(errorMessageKey(error, 'metric.errorBody'))} />
      <Button variant="primary" onClick={onRetry}>
        {t('metric.tryAgain')}
      </Button>
    </div>
  )
}
