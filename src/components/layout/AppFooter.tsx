import { useTranslation } from 'react-i18next'
import { cn } from '~/lib/cn'
import { MAKER_NAME, MAKER_URL } from '~/lib/brand'

export function AppFooter({ className }: { className?: string }) {
  const { t } = useTranslation()
  const year = new Date().getFullYear()

  return (
    <footer className={cn('no-print py-4 text-center text-xs text-ink-muted', className)}>
      <span>© {year} · {t('ui.shell.builtBy')}{' '}</span>
      <a
        href={MAKER_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-ink-muted underline underline-offset-2 hover:text-ink"
      >
        {MAKER_NAME} (www.oxysystem.com)
      </a>
    </footer>
  )
}
