import { useTranslation } from 'react-i18next'
import { Notice } from '~/components/neraca/Notice'
import type { CoaTree } from '~/lib/finance/coa/coa-tree'
import type { validateMapping } from '~/lib/settings/mapping-validate'
import type { BasketKey } from '~/lib/core/types'

/** Blocking conflicts (an account in two baskets), warnings, and the "saved" confirmation. */
export function MappingValidationNotices({
  validation,
  tree,
  saveSuccess,
}: {
  validation: ReturnType<typeof validateMapping>
  tree: CoaTree
  saveSuccess: boolean
}) {
  const { t } = useTranslation()

  const conflicts = validation.blocking
    .filter((b): b is Extract<typeof b, { kind: 'conflict' }> => b.kind === 'conflict')
    .map((b) => {
      const node = tree.byId.get(b.coaId)
      const name = node ? `${node.code} - ${node.name}` : b.coaId
      const baskets = b.baskets.map((k: BasketKey) => t(`settings.baskets.${k}`)).join(', ')
      return `• ${name} (${baskets})`
    })

  return (
    <div className="space-y-3 pt-2">
      {validation.blocking.length > 0 && (
        <Notice tone="danger" title={t('settings.conflictError')} body={conflicts.join('\n')} />
      )}

      {validation.warnings.map((w, idx) => {
        if (w.kind === 'cashBankEmpty') {
          return <Notice key={idx} tone="warning" title={t('settings.cashBankEmptyWarning')} />
        }
        if (w.kind === 'missing') {
          return <Notice key={idx} tone="warning" title={`${t('settings.missingAccountsWarning')} (${w.coaId})`} />
        }
        return null
      })}

      {saveSuccess && <Notice tone="success" title={t('settings.saveSuccess')} />}
    </div>
  )
}
