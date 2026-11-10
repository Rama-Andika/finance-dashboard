import { useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '~/components/ui/Button'
import { ErrorReference } from '~/components/layout/ErrorReference'
import { errorMessageKey } from '~/lib/error-message'

/** Router-wide error page for a route that has no error component of its own (sign-in, the layout around the pages). */
export function GlobalError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const { t } = useTranslation()

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-bold tracking-tight">{t('common.errorTitle')}</h1>
        <p className="text-sm text-ink-muted">{t(errorMessageKey(error, 'common.errorBody'))}</p>
        <div className="flex justify-center">
          <ErrorReference error={error} />
        </div>
        <div className="flex justify-center gap-2">
          <Button
            variant="primary"
            onClick={() => {
              if (reset) {
                reset()
              } else {
                void router.invalidate()
              }
            }}
          >
            {t('metric.tryAgain')}
          </Button>
          {/* A plain anchor, like the not-found page: each page has its own search schema. */}
          <a href="/summary" className="nr-btn">
            {t('common.backToDashboard')}
          </a>
        </div>
      </div>
    </div>
  )
}
