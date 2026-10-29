import '@tanstack/react-start/server-only'
import type { CoaTree } from '~/lib/finance/coa/coa-tree'
import type { AccountMapping } from '~/lib/finance/coa/basket-resolver'
import { getMappingRow } from '~/server/repo/settings.repo'
import { parseMapping, defaultMapping } from '~/lib/settings/mapping-schema'

import { memo } from '~/server/cache'

const MAPPING_TTL_MS = 2 * 60 * 1000

export type MappingState = {
  mapping: AccountMapping
  /** Nothing saved yet: the default mapping is in use. */
  isDefault: boolean
  /** Something is saved but cannot be read: the default mapping is used instead. */
  corrupted: boolean
}

/** The stored mapping row is cached briefly; saving the mapping clears every memo entry. */
export async function loadMappingState(tree: CoaTree): Promise<MappingState> {
  const row = await memo('mapping:row', MAPPING_TTL_MS, () => getMappingRow())
  const nowIso = new Date().toISOString()
  if (!row || !row.valueprop) {
    return { mapping: defaultMapping(tree, nowIso), isDefault: true, corrupted: false }
  }
  const parsed = parseMapping(row.valueprop)
  if (!parsed) {
    return { mapping: defaultMapping(tree, nowIso), isDefault: false, corrupted: true }
  }
  return { mapping: parsed, isDefault: false, corrupted: false }
}

export async function loadAccountMapping(tree: CoaTree): Promise<AccountMapping> {
  return (await loadMappingState(tree)).mapping
}
