import '@tanstack/react-start/server-only'
import type { CoaTree } from '~/lib/finance/coa-tree'
import type { AccountMapping } from '~/lib/finance/basket-resolver'
import { getMappingRow } from '~/server/repo/settings.repo'
import { parseMapping, defaultMapping } from '~/lib/settings/mapping-schema'

export async function loadAccountMapping(tree: CoaTree): Promise<AccountMapping> {
  const row = await getMappingRow()
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
