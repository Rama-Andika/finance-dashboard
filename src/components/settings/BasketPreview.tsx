import { useTranslation } from 'react-i18next'
import { ScrollArea } from '~/components/ui/scroll-area'
import { formatMoneyShort } from '~/lib/format/number'
import type { CoaTree } from '~/lib/finance/coa-tree'
import type { Id, Money } from '~/lib/finance/types'

export interface BasketPreviewProps {
  tree: CoaTree
  accountIds: Id[]
  balances?: Record<Id, Money>
  className?: string
}

export function BasketPreview({ tree, accountIds, balances = {}, className }: BasketPreviewProps) {
  const { t } = useTranslation()

  const resolvedNodes = accountIds
    .map((id) => tree.byId.get(id))
    .filter((n): n is NonNullable<typeof n> => Boolean(n))
    .sort((a, b) => a.code.localeCompare(b.code))

  return (
    <div className={`flex flex-col border border-border rounded-lg bg-surface overflow-hidden ${className || ''}`}>
      <div className="p-3 border-b border-border bg-canvas flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">
          {t('settings.previewTitle')} ({resolvedNodes.length})
        </h3>
        <span className="text-xs text-ink-muted">
          {t('settings.balanceAsOfToday')}
        </span>
      </div>

      <ScrollArea className="flex-1 max-h-[580px] overflow-y-auto p-2">
        {resolvedNodes.length === 0 ? (
          <div className="py-12 text-center text-xs text-ink-muted">
            {t('settings.noAccounts')}
          </div>
        ) : (
          <div className="space-y-1">
            {resolvedNodes.map((node) => (
              <div
                key={node.coaId}
                className="flex items-center justify-between px-3 py-1.5 rounded hover:bg-canvas text-sm transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <span className="font-mono text-xs font-semibold text-ink-muted shrink-0">
                    {node.code}
                  </span>
                  <span className="truncate text-ink">{node.name}</span>
                </div>
                <span className="text-xs font-mono text-ink-muted shrink-0">—</span>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
