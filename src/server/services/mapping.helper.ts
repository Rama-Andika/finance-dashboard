import '@tanstack/react-start/server-only'
import type { CoaTree } from '~/lib/finance/coa-tree'
import type { AccountMapping } from '~/lib/finance/basket-resolver'
import { getMappingRow } from '~/server/repo/settings.repo'
import { parseMapping, defaultMapping } from '~/lib/settings/mapping-schema'

import { memo } from '~/server/cache'

const MAPPING_TTL_MS = 2 * 60 * 1000

/** The stored mapping row is cached briefly; saving the mapping clears every memo entry. */
export async function loadAccountMapping(tree: CoaTree): Promise<AccountMapping> {
  const row = await memo('mapping:row', MAPPING_TTL_MS, () => getMappingRow())
  const nowIso = new Date().toISOString()
  if (!row || !row.valueprop) {
    return defaultMapping(tree, nowIso)
  }
  const parsed = parseMapping(row.valueprop)
  if (!parsed) {
    return defaultMapping(tree, nowIso)
  }
  return parsed
}
