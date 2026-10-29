/** Fallback cash-flow rows carry translation keys (not display text) as their sub-group. */
export const CF_FALLBACK_PREFIX = 'cf.fallback.'

export const CF_FALLBACK = {
  bankLoan: `${CF_FALLBACK_PREFIX}bankLoan`,
  assetPurchase: `${CF_FALLBACK_PREFIX}assetPurchase`,
  assetSale: `${CF_FALLBACK_PREFIX}assetSale`,
  capitalContribution: `${CF_FALLBACK_PREFIX}capitalContribution`,
  ownerDrawings: `${CF_FALLBACK_PREFIX}ownerDrawings`,
  longTermLoan: `${CF_FALLBACK_PREFIX}longTermLoan`,
  customerReceipts: `${CF_FALLBACK_PREFIX}customerReceipts`,
  supplierPayments: `${CF_FALLBACK_PREFIX}supplierPayments`,
  operatingExpenses: `${CF_FALLBACK_PREFIX}operatingExpenses`,
  interestAndFees: `${CF_FALLBACK_PREFIX}interestAndFees`,
  otherIncome: `${CF_FALLBACK_PREFIX}otherIncome`,
} as const

/** Translates a fallback sub-group key; labels that come from the ERP setup are shown as they are. */
export function translateCfLabel(t: (key: string) => string, label: string): string {
  return label.startsWith(CF_FALLBACK_PREFIX) ? t(label) : label
}
