/** What differs between the Payables (AP) and Receivables (AR) pages: wording, route and drill metric. */
export type SideConfig = {
  route: '/payables' | '/receivables'
  drillMetric: 'apAging' | 'arAging'
  partyKind: 'vendor' | 'customer'
  exportName: string
  navKey: string
  /** i18n keys of this side (vendor wording for AP, customer wording for AR) */
  keys: {
    notDue: string
    partyColumn: string
    unknownParty: string
    totalColumn: string
    overdueColumn: string
    reconciliationDiff: string
    reconciliationDetail: string
    agingTitle: string
    tableTitle: string
    exportPartyCode: string
    exportPartyName: string
    exportTotal: string
    overdueLabel: string
  }
}

export const SIDES: Record<'ap' | 'ar', SideConfig> = {
  ap: {
    route: '/payables',
    drillMetric: 'apAging',
    partyKind: 'vendor',
    exportName: 'payables',
    navKey: 'nav.payables',
    keys: {
      notDue: 'ui.payables.notDue',
      partyColumn: 'ui.col.vendor',
      unknownParty: 'ui.col.unknownVendor',
      totalColumn: 'ui.payables.totalPayableIdr',
      overdueColumn: 'ui.payables.overdueIdr',
      reconciliationDiff: 'ui.payables.reconciliationDiff',
      reconciliationDetail: 'ui.payables.reconciliationDetail',
      agingTitle: 'ui.payables.accountsPayableAging',
      tableTitle: 'ui.payables.payableByVendor',
      exportPartyCode: 'ui.col.vendorCode',
      exportPartyName: 'ui.col.vendorName',
      exportTotal: 'ui.col.totalPayable',
      overdueLabel: 'ui.payables.overdue',
    },
  },
  ar: {
    route: '/receivables',
    drillMetric: 'arAging',
    partyKind: 'customer',
    exportName: 'receivables',
    navKey: 'nav.receivables',
    keys: {
      notDue: 'ui.receivables.notDue',
      partyColumn: 'ui.receivables.customer',
      unknownParty: 'ui.col.unknownCustomer',
      totalColumn: 'ui.receivables.totalReceivableIdr',
      overdueColumn: 'ui.receivables.overdueIdr',
      reconciliationDiff: 'ui.receivables.reconciliationDiff',
      reconciliationDetail: 'ui.receivables.reconciliationDetail',
      agingTitle: 'ui.receivables.accountsReceivableAging',
      tableTitle: 'ui.receivables.receivablesByCustomer',
      exportPartyCode: 'ui.col.customerCode',
      exportPartyName: 'ui.col.customerName',
      exportTotal: 'ui.col.totalReceivable',
      overdueLabel: 'ui.receivables.overdue',
    },
  },
}
