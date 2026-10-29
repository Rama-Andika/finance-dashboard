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
const LOAN = new Set([11, 12, 13, 14])
const FIXED_ASSET = new Set([44, 45, 49, 50, 51])
const WASTE_BANK = new Set([52, 53, 54])

export function getJournalGroupKey(typeNumber: number): JournalGroupKey {
  if (CASH_IN.has(typeNumber)) return 'cashIn'
  if (CASH_OUT.has(typeNumber)) return 'cashOut'
  if (SALES.has(typeNumber)) return 'sales'
  if (PURCHASE.has(typeNumber)) return 'purchase'
  if (LOAN.has(typeNumber)) return 'loan'
  if (FIXED_ASSET.has(typeNumber)) return 'fixedAsset'
  if (WASTE_BANK.has(typeNumber)) return 'wasteBank'
  return 'adjustment'
}

export const JOURNAL_GROUP_LABELS: Record<JournalGroupKey, { id: string; en: string }> = {
  cashIn: { id: 'Uang Masuk', en: 'Cash In' },
  cashOut: { id: 'Uang Keluar', en: 'Cash Out' },
  sales: { id: 'Penjualan & Piutang', en: 'Sales & Receivables' },
  purchase: { id: 'Pembelian & Utang', en: 'Purchases & Payables' },
  loan: { id: 'Pinjaman', en: 'Loans' },
  fixedAsset: { id: 'Aset Tetap', en: 'Fixed Assets' },
  adjustment: { id: 'Penyesuaian Non-Kas', en: 'Non-Cash Adjustments' },
  wasteBank: { id: 'Bank Sampah', en: 'Waste Bank' },
}
