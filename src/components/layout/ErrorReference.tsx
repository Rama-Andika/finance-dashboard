import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '~/components/ui/Button'
import { useErrorReference } from '~/components/layout/use-error-reference'

/** "Reference code: 20261110-143551-k7q2m [Copy]" under an error message; nothing when the error has no code. */
export function ErrorReference({ error }: { error: unknown }) {
  const { t } = useTranslation()
  const reference = useErrorReference(error)
  const [copied, setCopied] = useState(false)
  if (!reference) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reference)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* the code stays on screen and can be selected by hand */
    }
  }

  return (
    <p className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
      <span>{t('common.errorReference')}</span>
      <code className="nr-code select-all">{reference}</code>
      <Button variant="ghost" icon={copied ? Check : Copy} onClick={() => void copy()}>
        {copied ? t('common.copied') : t('common.copy')}
      </Button>
    </p>
  )
}
