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

/**
 * The state built from the stored text, remembered per chart of accounts: the text is parsed once, and every caller gets
 * the same `mapping` object (so `resolved-baskets.ts` can remember what it resolved from it). A new chart of accounts
 * (the tree is cached for 10 minutes) or a new stored text builds the state again.
 */
const stateCache = new WeakMap<CoaTree, { valueprop: string | null; state: MappingState }>()

/** The stored mapping row is cached briefly; saving the mapping clears that cache. The returned state is shared: read-only. */
export async function loadMappingState(tree: CoaTree): Promise<MappingState> {
  const row = await memo('mapping:row', MAPPING_TTL_MS, () => getMappingRow())
  const valueprop = row?.valueprop ? row.valueprop : null
  const cached = stateCache.get(tree)
  if (cached && cached.valueprop === valueprop) return cached.state

  const state = buildMappingState(tree, valueprop)
  stateCache.set(tree, { valueprop, state })
  return state
}

function buildMappingState(tree: CoaTree, valueprop: string | null): MappingState {
  const nowIso = new Date().toISOString()
  if (!valueprop) {
    return { mapping: defaultMapping(tree, nowIso), isDefault: true, corrupted: false }
  }
  const parsed = parseMapping(valueprop)
  if (!parsed) {
    return { mapping: defaultMapping(tree, nowIso), isDefault: false, corrupted: true }
  }
  return { mapping: parsed, isDefault: false, corrupted: false }
}

export async function loadAccountMapping(tree: CoaTree): Promise<AccountMapping> {
  return (await loadMappingState(tree)).mapping
}
