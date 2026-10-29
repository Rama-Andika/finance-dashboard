import type { CfLine, CfSetupRow } from '~/lib/finance/cash/cashflow'

export const mockCashCoaIds = ['1110', '1120', '1130'] // Kas, Bank, Deposito

export const mockCashLines: CfLine[] = [
  // 1. Mixed journal: Kas 100 + Piutang 50 -> Pendapatan 150
  {
    glId: 'gl_1',
    journalType: 1,
    periodId: 'p1',
    coaId: '1110', // Kas (our cash)
    segmentDetailId: 'loc1',
    debet: '100.00',
    credit: '0.00',
  },
  {
    glId: 'gl_1',
    journalType: 1,
    periodId: 'p1',
    coaId: '1210', // Piutang EDC (counter)
    segmentDetailId: 'loc1',
    debet: '50.00',
    credit: '0.00',
  },
  {
    glId: 'gl_1',
    journalType: 1,
    periodId: 'p1',
    coaId: '4110', // Pendapatan (counter)
    segmentDetailId: 'loc1',
    debet: '0.00',
    credit: '150.00',
  },

  // 2. Internal transfer: Kas 200 -> Bank 200 (both our cash)
  {
    glId: 'gl_2',
    journalType: 1,
    periodId: 'p1',
    coaId: '1110', // Kas
    segmentDetailId: 'loc1',
    debet: '0.00',
    credit: '200.00',
  },
  {
    glId: 'gl_2',
    journalType: 1,
    periodId: 'p1',
    coaId: '1120', // Bank
    segmentDetailId: 'loc1',
    debet: '200.00',
    credit: '0.00',
  },

  // 3. Rounding split: Outflow 100 split across 3 equal counter lines (w = 33.333...)
  {
    glId: 'gl_3',
    journalType: 1,
    periodId: 'p1',
    coaId: '1110', // Kas
    segmentDetailId: 'loc1',
    debet: '0.00',
    credit: '100.00',
  },
  {
    glId: 'gl_3',
    journalType: 1,
    periodId: 'p1',
    coaId: '6110', // Expense 1
    segmentDetailId: 'loc1',
    debet: '33.33',
    credit: '0.00',
  },
  {
    glId: 'gl_3',
    journalType: 1,
    periodId: 'p1',
    coaId: '6120', // Expense 2
    segmentDetailId: 'loc1',
    debet: '33.33',
    credit: '0.00',
  },
  {
    glId: 'gl_3',
    journalType: 1,
    periodId: 'p1',
    coaId: '6130', // Expense 3
    segmentDetailId: 'loc1',
    debet: '33.34',
    credit: '0.00',
  },
]

export const mockCfSetup: CfSetupRow[] = [
  {
    groupName: 'Aktivitas Operasi',
    groupSequence: 1,
    subGroup: 'Penerimaan dari pelanggan',
    subSequence: 1,
    valueDisplayed: 0, // Inflow only
    accountGroup: 'Revenue',
    subAccountGroup: '',
  },
  {
    groupName: 'Aktivitas Operasi',
    groupSequence: 1,
    subGroup: 'Pembayaran biaya operasional',
    subSequence: 2,
    valueDisplayed: 1, // Outflow only
    accountGroup: 'Expense',
    subAccountGroup: '',
  },
  {
    groupName: 'Aktivitas Investasi',
    groupSequence: 2,
    subGroup: 'Pembelian Asset',
    subSequence: 1,
    valueDisplayed: 1, // Outflow only
    accountGroup: 'Fixed Assets',
    subAccountGroup: '',
  },
  {
    groupName: 'Aktivitas Investasi',
    groupSequence: 2,
    subGroup: 'Penjualan Asset',
    subSequence: 2,
    valueDisplayed: 0, // Inflow only
    accountGroup: 'Fixed Assets',
    subAccountGroup: '',
  },
]
