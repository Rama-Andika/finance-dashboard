import { useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { Notice } from '~/components/neraca/Notice'
import { Button } from '~/components/neraca/Button'
import { useTranslation } from 'react-i18next'
import { errorMessageKey } from '~/lib/error-message'

export function MetricError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <Notice
        tone="danger"
        title={t('metric.errorTitle')}
        body={t(errorMessageKey(error, 'metric.errorBody'))}
      />
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
