import '@tanstack/react-start/server-only'
import type { z } from 'zod'
import type { AccountGroup, Id, Money } from '~/lib/core/types'
import type { AccountMapping } from '~/lib/finance/coa/basket-resolver'
import { buildCoaTree, ORPHAN_FOLDER_ID } from '~/lib/finance/coa/coa-tree'
import type { mappingSchema } from '~/lib/settings/mapping-schema'
import { validateMapping, type MappingIssue } from '~/lib/settings/mapping-validate'
import { clearCache } from '~/server/cache'
import { getCachedCoaTree, type AppContextFilter } from '~/server/context'
import { listCoa } from '~/server/repo/coa.repo'
import { upsertMapping } from '~/server/repo/settings.repo'
import { balancesAt } from '~/server/services/balance.service'
import { loadMappingState } from '~/server/services/shared/mapping.helper'

export type GetAccountMappingResult = {
  mapping: AccountMapping
  isDefault: boolean
  corrupted: boolean
  issues: {
    blocking: MappingIssue[]
    warnings: MappingIssue[]
  }
}

export type SaveAccountMappingResult = { ok: true; mapping: AccountMapping } | { ok: false; blocking: MappingIssue[] }

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

/** The saved account mapping (or the default), with the problems validation finds in it. */
export async function getAccountMappingState(): Promise<GetAccountMappingResult> {
  const tree = await getCachedCoaTree()
  const { mapping, isDefault, corrupted } = await loadMappingState(tree)
  const issues = validateMapping(mapping, tree)

  return {
    mapping,
    isDefault,
    corrupted,
    issues,
  }
}

/**
 * Validates and saves the account mapping. The CoA is read fresh (not from the 10-minute cache)
 * so validation sees the current accounts. A saved mapping clears every cached metric.
 */
export async function saveAccountMapping(input: z.infer<typeof mappingSchema>): Promise<SaveAccountMappingResult> {
  const tree = buildCoaTree(await listCoa())

  const updatedMapping: AccountMapping = {
    ...input,
    updatedAt: new Date().toISOString(),
  }

  const issues = validateMapping(updatedMapping, tree)
  if (issues.blocking.length > 0) {
    return { ok: false, blocking: issues.blocking }
  }

  await upsertMapping(JSON.stringify(updatedMapping))
  clearCache()

  return { ok: true, mapping: updatedMapping }
}

/** Every CoA node plus the balance of each postable account as of the filter's end date. */
export async function getCoaTreeWithBalances(filter: AppContextFilter): Promise<GetCoaTreeResult> {
  const tree = await getCachedCoaTree()

  const nodes: CoaTreeNodeDto[] = []
  for (const node of tree.byId.values()) {
    if (node.coaId === ORPHAN_FOLDER_ID) continue
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
}
