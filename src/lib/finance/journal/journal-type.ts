export type JournalGroupKey =
  | 'cashIn'
  | 'cashOut'
  | 'sales'
  | 'purchase'
  | 'loan'
  | 'fixedAsset'
  | 'adjustment'
  | 'wasteBank'

const CASH_IN = new Set([0, 3, 15, 24, 30, 41, 42])
const CASH_OUT = new Set([1, 2, 4, 5, 16, 22, 28, 31, 36])
const SALES = new Set([8, 9, 23, 25, 32, 55, 56])
const PURCHASE = new Set([6, 21, 37, 39, 40, 43, 57])
/** Bank-loan journals: always Funding in the fallback cash-flow rules. */
export const LOAN_JOURNAL_TYPES: ReadonlySet<number> = new Set([11, 12, 13, 14])
/** Fixed-asset journals: always Investing in the fallback cash-flow rules. */
export const FIXED_ASSET_JOURNAL_TYPES: ReadonlySet<number> = new Set([44, 45, 49, 50, 51])
const WASTE_BANK = new Set([52, 53, 54])

export function getJournalGroupKey(typeNumber: number): JournalGroupKey {
  if (CASH_IN.has(typeNumber)) return 'cashIn'
  if (CASH_OUT.has(typeNumber)) return 'cashOut'
  if (SALES.has(typeNumber)) return 'sales'
  if (PURCHASE.has(typeNumber)) return 'purchase'
  if (LOAN_JOURNAL_TYPES.has(typeNumber)) return 'loan'
  if (FIXED_ASSET_JOURNAL_TYPES.has(typeNumber)) return 'fixedAsset'
  if (WASTE_BANK.has(typeNumber)) return 'wasteBank'
  return 'adjustment'
}

/** All group keys; their labels live in the i18n files under `journalType.<key>`. */
export const JOURNAL_GROUP_KEYS: readonly JournalGroupKey[] = [
  'cashIn',
  'cashOut',
  'sales',
  'purchase',
  'loan',
  'fixedAsset',
  'adjustment',
  'wasteBank',
]
