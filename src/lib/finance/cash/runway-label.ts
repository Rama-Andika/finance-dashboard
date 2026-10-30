/** How long the cash lasts, as text: "positive" when cash flow is positive, otherwise the months, or a dash. */
export function runwayLabel(
  t: (key: string) => string,
  runway: { cashFlowPositive: boolean; runwayMonths: string | null } | undefined,
): string {
  if (!runway) return '—'
  if (runway.cashFlowPositive) return t('metric.runwayPositive')
  return runway.runwayMonths ? `${runway.runwayMonths} ${t('metric.months')}` : '—'
}
