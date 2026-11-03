import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '~/queries/keys'
import { accountMappingQueryOptions, coaTreeQueryOptions } from '~/queries/settings.queries'
import { saveAccountMappingFn } from '~/functions/settings.fn'
import { buildCoaTree } from '~/lib/finance/coa/coa-tree'
import { toggleNode, resolveBaskets, type AccountMapping } from '~/lib/finance/coa/basket-resolver'
import { validateMapping } from '~/lib/settings/mapping-validate'
import type { BasketKey, Id } from '~/lib/core/types'

/**
 * State of the Account Mapping page: the saved mapping and the chart of accounts, the edit in progress for the
 * selected basket, its live validation and saving.
 */
export function useAccountMappingEditor(search: Parameters<typeof coaTreeQueryOptions>[0]) {
  const queryClient = useQueryClient()
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
  const validation = useMemo(() => {
    if (!currentMapping || !tree) return { blocking: [], warnings: [] }
    return validateMapping(currentMapping, tree)
  }, [currentMapping, tree])

  // Resolved accounts for all baskets
  const resolvedBaskets = useMemo(() => {
    if (!currentMapping || !tree) return null
    return resolveBaskets(currentMapping, tree)
  }, [currentMapping, tree])

  const toggle = (coaId: Id) => {
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

  const save = async () => {
    if (!currentMapping || !tree || isSaving) return
    if (validation.blocking.length > 0) return

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

  return {
    isLoading: mappingQuery.isLoading || coaQuery.isLoading || !currentMapping,
    tree,
    isDefault: Boolean(mappingQuery.data?.isDefault),
    corrupted: Boolean(mappingQuery.data?.corrupted),
    activeBasket,
    setActiveBasket,
    activeInclude: currentMapping?.baskets[activeBasket]?.include ?? [],
    activeResolvedIds: resolvedBaskets?.[activeBasket] ?? [],
    validation,
    isSaving,
    saveSuccess,
    toggle,
    save,
  }
}
