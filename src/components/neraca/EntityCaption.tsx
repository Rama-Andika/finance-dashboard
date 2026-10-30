import { useTranslation } from 'react-i18next'

/**
 * One small line naming the entity that owns a row. Shown only when several entities are in scope
 * (the server decides: `showEntity`). A row without a known entity reads "No entity".
 */
export function EntityCaption({ name, className = 'nr-entity' }: { name: string | null; className?: string }) {
  const { t } = useTranslation()
  const text = name || t('common.noEntity')
  return (
    <span className={className} title={text}>
      {text}
    </span>
  )
}
