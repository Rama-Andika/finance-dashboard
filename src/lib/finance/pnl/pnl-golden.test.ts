import { describe, expect, it } from 'vitest'
import { buildPnl } from './pnl'
import { buildCoaTree, type CoaRow } from '../coa/coa-tree'

const row = (coaId: string, parentId: string, status: 'HEADER' | 'POSTABLE', name: string, accountGroup: CoaRow['accountGroup'], saldoNormal: CoaRow['saldoNormal']): CoaRow => ({
  coaId, parentId, code: coaId, name, status, level: 1, accountGroup, subAccountGroup: '', saldoNormal,
})

const tree = buildCoaTree([
  row('40', '0', 'HEADER', 'Revenue root', 'Revenue', 'CREDIT'),
  row('41', '40', 'POSTABLE', 'Sales', 'Revenue', 'CREDIT'),
  row('42', '40', 'POSTABLE', 'Services', 'Revenue', 'CREDIT'),
  row('50', '0', 'POSTABLE', 'Cost of goods', 'Cost Of Sales', 'DEBET'),
  row('60', '0', 'HEADER', 'Operating expense', 'Expense', 'DEBET'),
  row('61', '60', 'POSTABLE', 'Salary', 'Expense', 'DEBET'),
  row('62', '60', 'POSTABLE', 'Rent', 'Expense', 'DEBET'),
  row('70', '0', 'POSTABLE', 'Interest income', 'Other Revenue', 'CREDIT'),
  row('80', '0', 'POSTABLE', 'Bank fee', 'Other Expense', 'DEBET'),
  row('10', '0', 'POSTABLE', 'Cash', 'Liquid Assets', 'DEBET'),
])

const mv = (coaId: string, periodId: string, debet: string, credit: string) => ({ coaId, periodId, debet, credit })

describe('buildPnl: full statement', () => {
  it('computes every line, per period and with folders, from all five account groups', () => {
    const { lines } = buildPnl({
      tree,
      movements: [
        mv('41', 'p1', '0.00', '1000.00'),
        mv('41', 'p2', '50.00', '700.00'), // a return in p2
        mv('42', 'p1', '0.00', '300.00'),
        mv('50', 'p1', '400.00', '0.00'),
        mv('50', 'p3', '90.00', '10.00'), // a period with only cost of sales
        mv('61', 'p1', '200.00', '0.00'),
        mv('61', 'p2', '200.00', '20.00'),
        mv('62', 'p2', '100.00', '0.00'),
        mv('70', 'p2', '0.00', '15.00'),
        mv('80', 'p1', '5.00', '0.00'),
        mv('10', 'p1', '999.00', '0.00'), // an asset: not part of the statement
      ],
    })
    expect(lines.map((l) => ({ key: l.key, amount: l.amount, margin: l.margin, byPeriod: l.byPeriod }))).toMatchInlineSnapshot(`
      [
        {
          "amount": "1950.00",
          "byPeriod": {
            "p1": "1300.00",
            "p2": "650.00",
            "p3": "0.00",
          },
          "key": "revenue",
          "margin": null,
        },
        {
          "amount": "480.00",
          "byPeriod": {
            "p1": "400.00",
            "p2": "0.00",
            "p3": "80.00",
          },
          "key": "cogs",
          "margin": null,
        },
        {
          "amount": "1470.00",
          "byPeriod": {
            "p1": "900.00",
            "p2": "650.00",
            "p3": "-80.00",
          },
          "key": "grossProfit",
          "margin": "0.7538461538461538461538461538461538461538",
        },
        {
          "amount": "480.00",
          "byPeriod": {
            "p1": "200.00",
            "p2": "280.00",
            "p3": "0.00",
          },
          "key": "opex",
          "margin": null,
        },
        {
          "amount": "990.00",
          "byPeriod": {
            "p1": "700.00",
            "p2": "370.00",
            "p3": "-80.00",
          },
          "key": "operatingProfit",
          "margin": "0.5076923076923076923076923076923076923077",
        },
        {
          "amount": "15.00",
          "byPeriod": {
            "p1": "0.00",
            "p2": "15.00",
            "p3": "0.00",
          },
          "key": "otherRevenue",
          "margin": null,
        },
        {
          "amount": "5.00",
          "byPeriod": {
            "p1": "5.00",
            "p2": "0.00",
            "p3": "0.00",
          },
          "key": "otherExpense",
          "margin": null,
        },
        {
          "amount": "1000.00",
          "byPeriod": {
            "p1": "695.00",
            "p2": "385.00",
            "p3": "-80.00",
          },
          "key": "netProfit",
          "margin": "0.5128205128205128205128205128205128205128",
        },
      ]
    `)
    expect(lines.filter((l) => l.folders.length > 0).map((l) => [l.key, l.folders])).toMatchInlineSnapshot(`
      [
        [
          "revenue",
          [
            {
              "amount": "1650.00",
              "children": [
                {
                  "amount": "1650.00",
                  "code": "41",
                  "id": "41",
                  "label": "Sales",
                },
              ],
              "code": "41",
              "id": "41",
              "label": "Sales",
            },
            {
              "amount": "300.00",
              "children": [
                {
                  "amount": "300.00",
                  "code": "42",
                  "id": "42",
                  "label": "Services",
                },
              ],
              "code": "42",
              "id": "42",
              "label": "Services",
            },
          ],
        ],
        [
          "cogs",
          [
            {
              "amount": "480.00",
              "children": [
                {
                  "amount": "480.00",
                  "code": "50",
                  "id": "50",
                  "label": "Cost of goods",
                },
              ],
              "code": "50",
              "id": "50",
              "label": "Cost of goods",
            },
          ],
        ],
        [
          "opex",
          [
            {
              "amount": "380.00",
              "children": [
                {
                  "amount": "380.00",
                  "code": "61",
                  "id": "61",
                  "label": "Salary",
                },
              ],
              "code": "61",
              "id": "61",
              "label": "Salary",
            },
            {
              "amount": "100.00",
              "children": [
                {
                  "amount": "100.00",
                  "code": "62",
                  "id": "62",
                  "label": "Rent",
                },
              ],
              "code": "62",
              "id": "62",
              "label": "Rent",
            },
          ],
        ],
        [
          "otherRevenue",
          [
            {
              "amount": "15.00",
              "children": [
                {
                  "amount": "15.00",
                  "code": "70",
                  "id": "70",
                  "label": "Interest income",
                },
              ],
              "code": "70",
              "id": "70",
              "label": "Interest income",
            },
          ],
        ],
        [
          "otherExpense",
          [
            {
              "amount": "5.00",
              "children": [
                {
                  "amount": "5.00",
                  "code": "80",
                  "id": "80",
                  "label": "Bank fee",
                },
              ],
              "code": "80",
              "id": "80",
              "label": "Bank fee",
            },
          ],
        ],
      ]
    `)
  })

  it('gives no margin when there is no revenue', () => {
    const { lines } = buildPnl({ tree, movements: [mv('61', 'p1', '10.00', '0.00')] })
    expect(lines.map((l) => [l.key, l.amount, l.margin])).toMatchInlineSnapshot(`
      [
        [
          "revenue",
          "0.00",
          null,
        ],
        [
          "cogs",
          "0.00",
          null,
        ],
        [
          "grossProfit",
          "0.00",
          null,
        ],
        [
          "opex",
          "10.00",
          null,
        ],
        [
          "operatingProfit",
          "-10.00",
          null,
        ],
        [
          "otherRevenue",
          "0.00",
          null,
        ],
        [
          "otherExpense",
          "0.00",
          null,
        ],
        [
          "netProfit",
          "-10.00",
          null,
        ],
      ]
    `)
  })

  it('returns zero lines without movements', () => {
    const { lines } = buildPnl({ tree, movements: [] })
    expect(lines.map((l) => [l.key, l.amount, l.byPeriod])).toMatchInlineSnapshot(`
      [
        [
          "revenue",
          "0.00",
          {},
        ],
        [
          "cogs",
          "0.00",
          {},
        ],
        [
          "grossProfit",
          "0.00",
          {},
        ],
        [
          "opex",
          "0.00",
          {},
        ],
        [
          "operatingProfit",
          "0.00",
          {},
        ],
        [
          "otherRevenue",
          "0.00",
          {},
        ],
        [
          "otherExpense",
          "0.00",
          {},
        ],
        [
          "netProfit",
          "0.00",
          {},
        ],
      ]
    `)
  })
})
