import type { TFunction } from 'i18next'
import { billReference } from '~/lib/finance/ap-ar/payment-plan-bills'
import type { PaymentPlanBill } from '~/lib/finance/ap-ar/payment-plan'
import type { CsvColumn } from '~/lib/format/csv'

/**
 * The CSV columns of the bills table. The entity column appears only when more than one entity is in scope and the plan
 * status column only when some bill has a plan status, the same as in the table on screen.
 */
export function billExportColumns(options: {
  t: TFunction
  showEntity: boolean
  planStatusInUse: boolean
}): CsvColumn<PaymentPlanBill>[] {
  const { t, showEntity, planStatusInUse } = options
  const creditLabel = t('ui.col.creditRow')
  return [
    { header: t('ui.col.billNumber'), value: (r) => billReference(r, creditLabel), kind: 'text' },
    { header: t('ui.col.vendor'), value: (r) => r.vendorName, kind: 'text' },
    ...(showEntity
      ? [
          {
            header: t('common.entity'),
            value: (r: PaymentPlanBill) => r.entityName ?? t('common.noEntity'),
            kind: 'text' as const,
          },
        ]
      : []),
    { header: t('ui.col.dueDate'), value: (r) => r.dueDate, kind: 'date' },
    { header: t('ui.col.payableBalance'), value: (r) => r.balance, kind: 'money' },
    ...(planStatusInUse
      ? [{ header: t('ui.col.planStatus'), value: (r: PaymentPlanBill) => r.status, kind: 'text' as const }]
      : []),
  ]
}
