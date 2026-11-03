import type { Id, Money } from '../../core/types'
import type { PnlLine } from './pnl'

/**
 * The two P&L lines that make up operating expense: Cost Of Sales (`cogs`) and Expense (`opex`).
 * Other Expense is not part of it (decision D42).
 */
export type OperatingExpenseGroup = 'cogs' | 'opex'

/** Cost Of Sales folders come first, then Expense folders. */
const GROUPS: readonly OperatingExpenseGroup[] = ['cogs', 'opex']

/** A top-level folder of the Cost Of Sales or Expense group: one slice of the Summary Expense donut. */
export type OperatingExpenseFolder = {
  id: Id
  /** The folder name from the chart of accounts, as it is in the ERP (not an i18n key). */
  label: string
  /** Net amount of the folder (debit - credit), the same number the P&L page shows for it. */
  amount: Money
  group: OperatingExpenseGroup
}

/**
 * The folders of the Cost Of Sales line followed by the folders of the Expense line of a P&L.
 * Nothing is recomputed, so the folder amounts add up to the `cogs` and `opex` lines of the same P&L.
 * A line that is missing gives no folders.
 */
export function buildOperatingExpenseFolders(lines: readonly PnlLine[]): OperatingExpenseFolder[] {
  return GROUPS.flatMap((group) => {
    const line = lines.find((l) => l.key === group)
    return (line?.folders ?? []).map((folder) => ({
      id: folder.id,
      label: folder.label,
      amount: folder.amount,
      group,
    }))
  })
}

/**
 * Slice names for the donut. When two folders share a name (ignoring upper/lower case and spaces at the ends),
 * the name of the group is added in brackets, for example "Freight (Cost of Goods Sold)", so the legend stays clear.
 * `groupNames` holds the translated group names; the caller translates, this file stays language-neutral.
 */
export function nameOperatingExpenseFolders(
  folders: readonly OperatingExpenseFolder[],
  groupNames: Record<OperatingExpenseGroup, string>,
): Array<{ id: Id; name: string; amount: Money }> {
  const keyOf = (label: string): string => label.trim().toLowerCase()
  const counts = new Map<string, number>()
  for (const folder of folders) {
    const key = keyOf(folder.label)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return folders.map((folder) => {
    const label = folder.label.trim()
    const shared = (counts.get(keyOf(folder.label)) ?? 0) > 1
    return {
      id: folder.id,
      name: shared ? `${label} (${groupNames[folder.group]})` : label,
      amount: folder.amount,
    }
  })
}
