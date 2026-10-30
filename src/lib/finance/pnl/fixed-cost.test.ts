import { describe, expect, it } from 'vitest'
import { computeFixedCost } from './fixed-cost'
import { buildCoaTree, type CoaRow } from '../coa/coa-tree'

const mockCoa: CoaRow[] = [
  {
    coaId: '6110',
    parentId: '0',
    code: '6-1100',
    name: 'Gaji Karyawan Tetap',
    status: 'POSTABLE',
    level: 1,
    accountGroup: 'Expense',
    subAccountGroup: '',
    saldoNormal: 'DEBET',
  },
  {
    coaId: '6120',
    parentId: '0',
    code: '6-1200',
    name: 'Sewa Gedung Kantor',
    status: 'POSTABLE',
    level: 1,
    accountGroup: 'Expense',
    subAccountGroup: '',
    saldoNormal: 'DEBET',
  },
  {
    coaId: '6210',
    parentId: '0',
    code: '6-2100',
    name: 'Komisi Penjualan (Variabel)',
    status: 'POSTABLE',
    level: 1,
    accountGroup: 'Expense',
    subAccountGroup: '',
    saldoNormal: 'DEBET',
  },
]

describe('fixed cost pure calculations', () => {
  const tree = buildCoaTree(mockCoa)

  it('separates fixed cost accounts from variable expense and calculates average', () => {
    // 6110 and 6120 are in fixedCost basket. 6210 is variable expense.
    const fixedCoaIds = new Set(['6110', '6120'])
    const expenseCoaIds = new Set(['6110', '6120', '6210'])

    const movements = [
      // Month 1 (p1)
      { coaId: '6110', periodId: 'p1', debet: '500.00', credit: '0.00' },
      { coaId: '6120', periodId: 'p1', debet: '300.00', credit: '0.00' },
      { coaId: '6210', periodId: 'p1', debet: '200.00', credit: '0.00' },

      // Month 2 (p2)
      { coaId: '6110', periodId: 'p2', debet: '500.00', credit: '0.00' },
      { coaId: '6120', periodId: 'p2', debet: '300.00', credit: '0.00' },
      { coaId: '6210', periodId: 'p2', debet: '400.00', credit: '0.00' },
    ]

    const months = [
      { month: '2026-09', periodIds: ['p1'] },
      { month: '2026-10', periodIds: ['p2'] },
    ]

    const res = computeFixedCost({
      fixedCoaIds,
      expenseCoaIds,
      movements,
      months,
      tree,
    })

    expect(res.basketEmpty).toBe(false)
    expect(res.months).toHaveLength(2)

    // Month 1: fixed = 500 + 300 = 800.00, variable = 200.00
    expect(res.months[0]?.fixed).toBe('800.00')
    expect(res.months[0]?.variable).toBe('200.00')

    // Month 2: fixed = 500 + 300 = 800.00, variable = 400.00
    expect(res.months[1]?.fixed).toBe('800.00')
    expect(res.months[1]?.variable).toBe('400.00')

    // Average fixed = (800 + 800) / 2 = 800.00
    expect(res.averageFixed).toBe('800.00')

    // Breakdown includes 2 accounts
    expect(res.byFolder).toHaveLength(1)
    expect(res.byFolder[0]?.amount).toBe('1600.00')
    expect(res.byFolder[0]?.children).toHaveLength(2)
  })

  it('handles empty fixed cost basket correctly', () => {
    const res = computeFixedCost({
      fixedCoaIds: new Set(),
      expenseCoaIds: new Set(['6110']),
      movements: [],
      months: [{ month: '2026-10', periodIds: ['p1'] }],
      tree,
    })

    expect(res.basketEmpty).toBe(true)
    expect(res.averageFixed).toBe('0.00')
    expect(res.byFolder).toHaveLength(0)
  })
})

describe("fixed cost: edge cases", () => {
  const row = (coaId: string, parentId: string, status: "HEADER" | "POSTABLE", name: string): CoaRow => ({
    coaId, parentId, code: coaId, name, status, level: 1, accountGroup: "Expense", subAccountGroup: "", saldoNormal: "DEBET",
  })
  const tree = buildCoaTree([
    row("60", "0", "HEADER", "Staff"),
    row("61", "60", "POSTABLE", "Salary"),
    row("62", "60", "POSTABLE", "Bonus"),
    row("70", "0", "HEADER", "Premises"),
    row("71", "70", "POSTABLE", "Rent"),
    row("80", "0", "POSTABLE", "Other expense"),
    row("90", "0", "POSTABLE", "Not an expense account"),
  ])
  const mv = (coaId: string, periodId: string, debet: string, credit = "0.00") => ({ coaId, periodId, debet, credit })

  it("adds every period of a month, ignores periods outside the months and accounts outside both baskets", () => {
    const res = computeFixedCost({
      fixedCoaIds: new Set(["61", "71"]),
      expenseCoaIds: new Set(["61", "71", "80"]),
      movements: [
        mv("61", "p1", "100.00"),
        mv("61", "p1b", "50.00"), // second period of the same month
        mv("71", "p1", "30.00"),
        mv("80", "p1", "20.00"), // variable
        mv("90", "p1", "999.00"), // in no basket: ignored
        mv("61", "p9", "7.00"), // period of no listed month: not in the monthly figures
      ],
      months: [{ month: "2026-09", periodIds: ["p1", "p1b"] }, { month: "2026-10", periodIds: ["p2"] }],
      tree,
    })
    expect(res.months).toEqual([
      { month: "2026-09", fixed: "180.00", variable: "20.00" },
      { month: "2026-10", fixed: "0.00", variable: "0.00" },
    ])
    expect(res.averageFixed).toBe("90.00")
  })

  it("lets a credit reduce the cost and counts an account in both baskets as fixed only", () => {
    const res = computeFixedCost({
      fixedCoaIds: new Set(["61"]),
      expenseCoaIds: new Set(["61", "80"]),
      movements: [mv("61", "p1", "100.00", "40.00"), mv("80", "p1", "10.00")],
      months: [{ month: "2026-10", periodIds: ["p1"] }],
      tree,
    })
    expect(res.months).toEqual([{ month: "2026-10", fixed: "60.00", variable: "10.00" }])
  })

  it("groups the fixed accounts under their parent folder and sums every movement of the account", () => {
    const res = computeFixedCost({
      fixedCoaIds: new Set(["61", "62", "71", "80"]),
      expenseCoaIds: new Set(["61", "62", "71", "80"]),
      movements: [mv("61", "p1", "100.00"), mv("62", "p1", "25.00"), mv("71", "p1", "30.00"), mv("80", "p1", "5.00"), mv("61", "p9", "1.00")],
      months: [{ month: "2026-10", periodIds: ["p1"] }],
      tree,
    })
    const folders = res.byFolder.map((f) => [f.id, f.label, f.amount, (f.children ?? []).map((c) => [c.id, c.amount])])
    expect(folders).toEqual([
      ["60", "Staff", "126.00", [["61", "101.00"], ["62", "25.00"]]],
      ["70", "Premises", "30.00", [["71", "30.00"]]],
      ["__root__", "i18n:fixedCostRoot", "5.00", [["80", "5.00"]]],
    ])
  })

  it("returns a zero average when there are no months", () => {
    const res = computeFixedCost({ fixedCoaIds: new Set(["61"]), expenseCoaIds: new Set(["61"]), movements: [mv("61", "p1", "10.00")], months: [], tree })
    expect(res.averageFixed).toBe("0.00")
    expect(res.months).toEqual([])
  })
})
