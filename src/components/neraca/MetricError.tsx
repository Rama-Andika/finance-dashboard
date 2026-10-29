import { useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { Notice } from '~/components/neraca/Notice'
import { Button } from '~/components/neraca/Button'
import { useTranslation } from 'react-i18next'

export function MetricError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const { t } = useTranslation()

  const errorMessage =
    error instanceof Error ? error.message : typeof error === 'string' ? error : undefined

  return (
    <div className="space-y-4">
      <Notice
        tone="danger"
        title={t('metric.errorTitle')}
        body={errorMessage || t('metric.errorBody')}
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
