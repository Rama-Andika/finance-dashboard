import { useState, useMemo, useEffect } from 'react'
import { qk } from '~/queries/keys'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Notice } from '~/components/neraca/Notice'
import { Button } from '~/components/neraca/Button'
import { Tabs } from '~/components/neraca/Tabs'
import { CoaTreePicker } from '~/components/settings/CoaTreePicker'
import { BasketPreview } from '~/components/settings/BasketPreview'
import { accountMappingQueryOptions, coaTreeQueryOptions } from '~/queries/settings.queries'
import { saveAccountMappingFn } from '~/functions/settings.fn'
import { buildCoaTree } from '~/lib/finance/coa/coa-tree'
import { toggleNode, resolveBaskets, type AccountMapping } from '~/lib/finance/coa/basket-resolver'
import { validateMapping } from '~/lib/settings/mapping-validate'
import type { BasketKey, Id } from '~/lib/core/types'

export const Route = createFileRoute('/_authed/settings/account-mapping')({
  component: AccountMappingPage,
})

const BASKET_TABS: Array<{ id: BasketKey; labelKey: string }> = [
  { id: 'cash', labelKey: 'settings.baskets.cash' },
  { id: 'bank', labelKey: 'settings.baskets.bank' },
  { id: 'deposit', labelKey: 'settings.baskets.deposit' },
  { id: 'inTransit', labelKey: 'settings.baskets.inTransit' },
  { id: 'fixedCost', labelKey: 'settings.baskets.fixedCost' },
]

function AccountMappingPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const search = Route.useSearch()

  // Queries
  const mappingQuery = useQuery(accountMappingQueryOptions())
  const coaQuery = useQuery(coaTreeQueryOptions(search))

  const [activeBasket, setActiveBasket] = useState<BasketKey>('cash')
  const [currentMapping, setCurrentMapping] = useState<AccountMapping | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Initialize mapping when query data loads
  useEffect(() => {
    if (mappingQuery.data?.mapping && !currentMapping) {
      setCurrentMapping(mappingQuery.data.mapping)
    }
  }, [mappingQuery.data?.mapping, currentMapping])

  // Build CoA tree from nodes
  const tree = useMemo(() => {
    if (!coaQuery.data?.nodes) return null
    return buildCoaTree(
      coaQuery.data.nodes.map((n) => ({
        coaId: n.coaId,
        parentId: n.parentId ?? '0',
        code: n.code,
        name: n.name,
        status: n.status,
        level: n.level,
        accountGroup: n.accountGroup,
        subAccountGroup: n.subAccountGroup,
        saldoNormal: n.saldoNormal,
      })),
    )
  }, [coaQuery.data?.nodes])

  // Live validation
  const liveValidation = useMemo(() => {
    if (!currentMapping || !tree) return { blocking: [], warnings: [] }
    return validateMapping(currentMapping, tree)
  }, [currentMapping, tree])

  // Resolved accounts for all baskets
  const resolvedBaskets = useMemo(() => {
    if (!currentMapping || !tree) return null
    return resolveBaskets(currentMapping, tree)
  }, [currentMapping, tree])

  const handleToggleNode = (coaId: Id) => {
    if (!currentMapping || !tree) return
    const currentInclude = currentMapping.baskets[activeBasket]?.include ?? []
    const nextInclude = toggleNode(currentInclude, tree, coaId)

    setCurrentMapping({
      ...currentMapping,
      baskets: {
        ...currentMapping.baskets,
        [activeBasket]: { include: nextInclude },
      },
    })
    setSaveSuccess(false)
  }

  const handleSave = async () => {
    if (!currentMapping || !tree || isSaving) return
    if (liveValidation.blocking.length > 0) return

    setIsSaving(true)
    setSaveSuccess(false)

    try {
      const res = await saveAccountMappingFn({
        data: currentMapping,
      })

      if (res.ok) {
        setSaveSuccess(true)
        // Metrics and data checks depend on the mapping. Mark them stale WITHOUT refetching now:
        // awaiting a refetch of a slow metric (AP aging takes minutes) kept the button on "Saving..."
        // long after the mapping was saved. They reload the next time their page is opened.
        void queryClient.invalidateQueries({ queryKey: ['metric'], refetchType: 'none' })
        void queryClient.invalidateQueries({ queryKey: ['data-checks'], refetchType: 'none' })
        // Only the mapping changed (not the chart of accounts); refresh it in the background
        void queryClient.invalidateQueries({ queryKey: qk.accountMapping() })
      }
    } finally {
      setIsSaving(false)
    }
  }

  if (mappingQuery.isLoading || coaQuery.isLoading || !currentMapping || !tree) {
    return (
      <div className="space-y-4">
        <div className="py-12 text-center text-sm text-ink-muted">{t('common.loading')}</div>
      </div>
    )
  }

  const tabsConfig = BASKET_TABS.map((tab) => ({
    id: tab.id,
    label: t(tab.labelKey),
  }))

  const activeInclude = currentMapping.baskets[activeBasket]?.include ?? []
  const activeResolvedIds = resolvedBaskets?.[activeBasket] ?? []

  return (
    <div className="space-y-6">
      {/* Page Description */}
      <p className="text-sm text-ink-muted">{t('settings.description')}</p>

      {/* Default or Corrupted Notices */}
      {mappingQuery.data?.isDefault && (
        <Notice tone="warning" title={t('settings.isDefaultNotice')} />
      )}
      {mappingQuery.data?.corrupted && (
        <Notice tone="danger" title={t('settings.corruptedNotice')} />
      )}

      {/* Tabs */}
      <Tabs
        tabs={tabsConfig}
        value={activeBasket}
        onChange={(id) => setActiveBasket(id as BasketKey)}
      />

      {/* Two Column Layout: CoaTreePicker + BasketPreview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7">
          <CoaTreePicker
            tree={tree}
            include={activeInclude}
            onToggle={handleToggleNode}
          />
        </div>

        <div className="lg:col-span-5">
          <BasketPreview
            tree={tree}
            accountIds={activeResolvedIds}
          />
        </div>
      </div>

      {/* Validation Warnings & Blocking Conflicts */}
      <div className="space-y-3 pt-2">
        {liveValidation.blocking.length > 0 && (
          <Notice
            tone="danger"
            title={t('settings.conflictError')}
            body={liveValidation.blocking
              .filter(
                (b): b is Extract<typeof b, { kind: 'conflict' }> => b.kind === 'conflict',
              )
              .map((b) => {
                const node = tree.byId.get(b.coaId)
                const name = node ? `${node.code} - ${node.name}` : b.coaId
                const baskets = b.baskets.map((k: BasketKey) => t(`settings.baskets.${k}`)).join(', ')
                return `• ${name} (${baskets})`
              })
              .join('\n')}
          />
        )}

        {liveValidation.warnings.map((w, idx) => {
          if (w.kind === 'cashBankEmpty') {
            return (
              <Notice
                key={idx}
                tone="warning"
                title={t('settings.cashBankEmptyWarning')}
              />
            )
          }
          if (w.kind === 'missing') {
            return (
              <Notice
                key={idx}
                tone="warning"
                title={`${t('settings.missingAccountsWarning')} (${w.coaId})`}
              />
            )
          }
          return null
        })}

        {saveSuccess && (
          <Notice tone="success" title={t('settings.saveSuccess')} />
        )}
      </div>

      {/* Actions Footer */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
        <Button
          type="button"
          variant="primary"
          disabled={isSaving || liveValidation.blocking.length > 0}
          onClick={handleSave}
        >
          {isSaving ? t('settings.saving') : t('settings.save')}
        </Button>
      </div>
    </div>
  )
}
