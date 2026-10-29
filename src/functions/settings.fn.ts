import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/functions/middleware'
import { mappingSchema } from '~/lib/settings/mapping-schema'
import { metricInputSchema } from '~/lib/filters/search-schema'
import type { AccountMapping } from '~/lib/finance/coa/basket-resolver'
import type { MappingIssue } from '~/lib/settings/mapping-validate'
import type { AccountGroup, Id, Money } from '~/lib/core/types'

export type GetAccountMappingResult = {
  mapping: AccountMapping
  isDefault: boolean
  corrupted: boolean
  issues: {
    blocking: MappingIssue[]
    warnings: MappingIssue[]
  }
}

export const getAccountMappingFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async (): Promise<GetAccountMappingResult> => {
    const { getCachedCoaTree } = await import('~/server/context')
    const { loadMappingState } = await import('~/server/services/shared/mapping.helper')
    const { validateMapping } = await import('~/lib/settings/mapping-validate')

    const tree = await getCachedCoaTree()
    const { mapping, isDefault, corrupted } = await loadMappingState(tree)

    const issues = validateMapping(mapping, tree)

    return {
      mapping,
      isDefault,
      corrupted,
      issues,
    }
  })

export const saveAccountMappingFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(mappingSchema)
  .handler(
    async ({
      data,
    }): Promise<{ ok: true; mapping: AccountMapping } | { ok: false; blocking: MappingIssue[] }> => {
      const { listCoa } = await import('~/server/repo/coa.repo')
      const { buildCoaTree } = await import('~/lib/finance/coa/coa-tree')
      const { validateMapping } = await import('~/lib/settings/mapping-validate')
      const { upsertMapping } = await import('~/server/repo/settings.repo')
      const { clearCache } = await import('~/server/cache')

      const coaRows = await listCoa()
      const tree = buildCoaTree(coaRows)

      const updatedMapping: AccountMapping = {
        ...data,
        updatedAt: new Date().toISOString(),
      }

      const issues = validateMapping(updatedMapping, tree)
      if (issues.blocking.length > 0) {
        return { ok: false, blocking: issues.blocking }
      }

      await upsertMapping(JSON.stringify(updatedMapping))
      clearCache()

      return { ok: true, mapping: updatedMapping }
    },
  )

export type CoaTreeNodeDto = {
  coaId: Id
  parentId: Id | null
  code: string
  name: string
  status: 'HEADER' | 'POSTABLE'
  level: number
  accountGroup: AccountGroup
  subAccountGroup: string
  saldoNormal: 'DEBET' | 'CREDIT'
  isOrphan?: boolean
  isCycle?: boolean
}

export type GetCoaTreeResult = {
  nodes: CoaTreeNodeDto[]
  balances: Record<Id, Money>
}

export const getCoaTreeFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => metricInputSchema.parse(d))
  .handler(async ({ data }): Promise<GetCoaTreeResult> => {
    const { getCachedCoaTree } = await import('~/server/context')

    const tree = await getCachedCoaTree()

    const nodes: CoaTreeNodeDto[] = []
    for (const node of tree.byId.values()) {
      if (node.coaId === '__orphans__') continue
      nodes.push({
        coaId: node.coaId,
        parentId: node.parentId,
        code: node.code,
        name: node.name,
        status: node.status,
        level: node.level,
        accountGroup: node.accountGroup,
        subAccountGroup: node.subAccountGroup,
        saldoNormal: node.saldoNormal,
        isOrphan: node.isOrphan,
        isCycle: node.isCycle,
      })
    }

    // Populate balances using balance engine (Step 9.2)
    const { resolveFilter } = await import('~/server/context')
    const { balancesAt } = await import('~/server/services/balance.service')

    const filter = await resolveFilter(data)
    const postableIds = nodes.filter((n) => n.status === 'POSTABLE').map((n) => n.coaId)
    const { byCoa } = await balancesAt({
      asOf: filter.asOf,
      coaIds: postableIds,
      filter,
    })

    const balances: Record<Id, Money> = Object.fromEntries(byCoa.entries())

    return {
      nodes,
      balances,
    }
  })
