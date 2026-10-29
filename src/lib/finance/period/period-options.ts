/** How many months the period picker lists at most (the newest ones). */
export const MAX_PERIOD_OPTIONS = 12

/**
 * The newest `max` months of a newest-first list. Months in `keep` (the range that is currently
 * selected) stay in the list even when older, so the dropdown never shows a value it cannot display.
 */
export function limitMonthOptions<T extends { month: string }>(
  months: readonly T[],
  keep: ReadonlyArray<string | undefined> = [],
  max: number = MAX_PERIOD_OPTIONS,
): T[] {
  const wanted = new Set(keep.filter((m): m is string => Boolean(m)))
  return months.filter((m, index) => index < max || wanted.has(m.month))
}
