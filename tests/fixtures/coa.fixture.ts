import type { CoaRow } from '~/lib/finance/coa-tree'

export const mockCoaRows: CoaRow[] = [
  // 1 Harta (Root HEADER)
  {
    coaId: '504404509311573860',
    parentId: '0',
    code: '1-0000',
    name: 'HARTA',
    status: 'HEADER',
    level: 1,
    accountGroup: 'Liquid Assets',
    subAccountGroup: '',
    saldoNormal: 'DEBET',
  },
  // 11 Kas & Bank (Child of 1-0000)
  {
    coaId: '504404509311573861',
    parentId: '504404509311573860',
    code: '1-1000',
    name: 'Kas & Setara Kas',
    status: 'HEADER',
    level: 2,
    accountGroup: 'Liquid Assets',
    subAccountGroup: '',
    saldoNormal: 'DEBET',
  },
  // 1110 Kas Operasional (POSTABLE under 1-1000)
  {
    coaId: '504404509311573862',
    parentId: '504404509311573861',
    code: '1-1100',
    name: 'Kas Operasional',
    status: 'POSTABLE',
    level: 3,
    accountGroup: 'Liquid Assets',
    subAccountGroup: 'Cash',
    saldoNormal: 'DEBET',
  },
  // 1120 Bank Mandiri (POSTABLE under 1-1000)
  {
    coaId: '504404509311573863',
    parentId: '504404509311573861',
    code: '1-1200',
    name: 'Bank Mandiri',
    status: 'POSTABLE',
    level: 3,
    accountGroup: 'Liquid Assets',
    subAccountGroup: 'Bank',
    saldoNormal: 'DEBET',
  },
  // Bank BCA placed directly under 1-0000 (code doesn't dictate hierarchy!)
  {
    coaId: '504404509311573864',
    parentId: '504404509311573860',
    code: '1-9999',
    name: 'Bank BCA Langsung',
    status: 'POSTABLE',
    level: 2,
    accountGroup: 'Liquid Assets',
    subAccountGroup: 'Bank',
    saldoNormal: 'DEBET',
  },
  // 2 Kewajiban (Root HEADER)
  {
    coaId: '504404509311573870',
    parentId: '0',
    code: '2-0000',
    name: 'KEWAJIBAN',
    status: 'HEADER',
    level: 1,
    accountGroup: 'Current Liabilities',
    subAccountGroup: '',
    saldoNormal: 'CREDIT',
  },
  // Utang Usaha (POSTABLE under 2-0000)
  {
    coaId: '504404509311573871',
    parentId: '504404509311573870',
    code: '2-1000',
    name: 'Utang Usaha',
    status: 'POSTABLE',
    level: 2,
    accountGroup: 'Current Liabilities',
    subAccountGroup: '',
    saldoNormal: 'CREDIT',
  },
]
