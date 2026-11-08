import { describe, expect, it } from 'vitest'
import type { TFunction } from 'i18next'
import { buildCsv } from '~/lib/format/csv'
import type { PaymentPlanBill } from '~/lib/finance/ap-ar/payment-plan'
import { billExportColumns } from './bills-export-columns'

// A translator that answers with the key, so the tests do not depend on the wording of any language file.
const t = ((key: string) => key) as unknown as TFunction

const bill = (over: Partial<PaymentPlanBill>): PaymentPlanBill => ({
  invoiceId: '1',
  vendorId: '1',
  vendorName: 'Alpha',
  entityName: null,
  invoiceNumber: 'INV-1',
  dueDate: '2025-10-15',
  balance: '100.00',
  status: 'approved',
  overdue: false,
  kind: 'bill',
  ...over,
})

describe('billExportColumns', () => {
  it('has the bill, vendor, due date, balance and plan status columns for a table of one entity', () => {
    const columns = billExportColumns({ t, showEntity: false, planStatusInUse: true })
    expect(columns.map((c) => c.header)).toEqual([
      'ui.col.billNumber',
      'ui.col.vendor',
      'ui.col.dueDate',
      'ui.col.payableBalance',
      'ui.col.planStatus',
    ])
    expect(columns.map((c) => c.kind)).toEqual(['text', 'text', 'date', 'money', 'text'])
  })

  it('leaves the plan status column out when no bill has a plan status', () => {
    const columns = billExportColumns({ t, showEntity: false, planStatusInUse: false })
    expect(columns.map((c) => c.header)).not.toContain('ui.col.planStatus')
    expect(columns).toHaveLength(4)
  })

  it('adds the entity column after the vendor when several entities are in scope, and names a bill without entity', () => {
    const columns = billExportColumns({ t, showEntity: true, planStatusInUse: false })
    expect(columns.map((c) => c.header)).toEqual([
      'ui.col.billNumber',
      'ui.col.vendor',
      'common.entity',
      'ui.col.dueDate',
      'ui.col.payableBalance',
    ])
    const entity = columns[2]!
    expect(entity.value(bill({ entityName: 'Store A' }))).toBe('Store A')
    expect(entity.value(bill({ entityName: null }))).toBe('common.noEntity')
  })

  it('writes the credit label where a credit row would have a bill number, and the negative amount as it is', () => {
    const columns = billExportColumns({ t, showEntity: false, planStatusInUse: true })
    const rows = [bill({}), bill({ invoiceId: 'credit:1', invoiceNumber: '', kind: 'credit', balance: '-30.00' })]

    const lines = buildCsv(rows, columns, 'comma-dot').replace('﻿', '').split('\r\n')

    expect(lines).toEqual([
      'ui.col.billNumber,ui.col.vendor,ui.col.dueDate,ui.col.payableBalance,ui.col.planStatus',
      'INV-1,Alpha,2025-10-15,100.00,approved',
      'ui.col.creditRow,Alpha,2025-10-15,-30.00,approved',
    ])
  })
})
