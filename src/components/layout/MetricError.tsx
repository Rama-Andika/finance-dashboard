import { useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { Notice } from '~/components/ui/Notice'
import { Button } from '~/components/ui/Button'
import { useTranslation } from 'react-i18next'
import { errorMessageKey } from '~/lib/error-message'
import { ErrorReference } from '~/components/layout/ErrorReference'

export function MetricError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <Notice tone="danger" title={t('metric.errorTitle')} body={t(errorMessageKey(error, 'metric.errorBody'))} />
      <ErrorReference error={error} />
      <div>
        <Button
          variant="primary"
          onClick={() => {
            if (reset) {
              reset()
            } else {
              router.invalidate()
            }
          }}
        >
          {t('metric.tryAgain')}
        </Button>
      </div>
    </div>
  )
}
