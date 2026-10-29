import { useTranslation } from 'react-i18next'

/** Router-wide 404 page; rendered inside the root document, so i18n and the theme are available. */
export function NotFound() {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold tracking-tight">{t('common.notFoundTitle')}</h1>
        <p className="text-sm text-ink-muted mt-2">{t('common.notFoundBody')}</p>
        {/* A plain anchor: each page has its own search schema, so a typed <Link> would need per-route params. */}
        <a href="/summary" className="nr-btn nr-btn-primary mt-6 inline-flex">
          {t('common.backToDashboard')}
        </a>
      </div>
    </div>
  )
}
