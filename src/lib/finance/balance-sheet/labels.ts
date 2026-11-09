import { ASSET_GROUPS, EQUITY_GROUPS, LIABILITY_GROUPS } from '../coa/account-groups'
import type { AccountGroup, Money } from '../../core/types'

const GROUP_LABELS: Record<string, string> = {
  'Liquid Assets': 'liquidAssets',
  'Fixed Assets': 'fixedAssets',
  'Other Assets': 'otherAssets',
  'Current Liabilities': 'currentLiabilities',
  'Long Term Liabilities': 'longTermLiabilities',
  Equity: 'equity',
}

/** i18n key (`balanceSheet.group.*`) of the name of a balance sheet account group. */
export function groupLabelKey(group: AccountGroup): string {
  return `balanceSheet.group.${GROUP_LABELS[group] ?? group}`
}

/** One slice of a composition chart: a group, the i18n key of its name and its total. */
export type CompositionItem = { id: AccountGroup; labelKey: string; amount: Money }

function compositionOf(groups: readonly AccountGroup[], groupTotals: Record<string, Money>): CompositionItem[] {
  return groups.map((group) => ({ id: group, labelKey: groupLabelKey(group), amount: groupTotals[group] ?? '0.00' }))
}

/** What the assets are made of: liquid, fixed and other assets. */
export function assetsComposition(groupTotals: Record<string, Money>): CompositionItem[] {
  return compositionOf(ASSET_GROUPS, groupTotals)
}

/** What the liabilities and equity side is made of: current and long-term liabilities, and equity. */
export function liabilitiesEquityComposition(groupTotals: Record<string, Money>): CompositionItem[] {
  return compositionOf([...LIABILITY_GROUPS, ...EQUITY_GROUPS], groupTotals)
}
