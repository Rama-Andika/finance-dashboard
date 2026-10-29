import { z } from 'zod'
import type { AccountMapping } from '~/lib/finance/basket-resolver'
import type { CoaTree } from '~/lib/finance/coa-tree'

const idList = z.array(z.string().regex(/^\d{1,20}$/)).max(1000)

export const mappingSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string(),
  baskets: z.object({
    cash: z.object({ include: idList }),
    bank: z.object({ include: idList }),
    deposit: z.object({ include: idList }),
    inTransit: z.object({ include: idList }),
    fixedCost: z.object({ include: idList }),
  }),
})

/** Parse valueprop. Broken/invalid JSON -> null (caller falls back to defaults + warning, data-model §5.4). */
export function parseMapping(valueprop: string | null): AccountMapping | null {
  if (!valueprop) return null
  try {
    const raw = JSON.parse(valueprop)
    const parsed = mappingSchema.safeParse(raw)
    return parsed.success ? (parsed.data as AccountMapping) : null
  } catch {
    return null
  }
}

/** New-client default (S7): every POSTABLE with sub_account_group 'Cash' in the cash basket; others empty. */
export function defaultMapping(tree: CoaTree, nowIso: string): AccountMapping {
  const cashPostables: string[] = []
  for (const node of tree.byId.values()) {
    if (node.status === 'POSTABLE' && node.subAccountGroup.toLowerCase() === 'cash') {
      cashPostables.push(node.coaId)
    }
  }

  return {
    version: 1,
    updatedAt: nowIso,
    baskets: {
      cash: { include: cashPostables.sort() },
      bank: { include: [] },
      deposit: { include: [] },
      inTransit: { include: [] },
      fixedCost: { include: [] },
    },
  }
}
