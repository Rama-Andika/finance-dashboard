import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '~/lib/cn'
import { limitMonthOptions } from '~/lib/finance/period/period-options'
import { formatMonthYear } from '~/lib/format/date'
import type { Lang } from '~/lib/core/types'

export type PeriodMonthOption = { month: string; status: 'Open' | 'Pre Closed' | 'Closed' }

/** One choice of the period list (a preset or a look-ahead horizon), with an optional month hint. */
export function PeriodOption({
  label,
  hint,
  selected,
  onSelect,
}: {
  label: string
  hint?: string | undefined
  selected: boolean
  onSelect: () => void
}) {
  return (
    <div
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        'nr-menu-item flex items-center justify-between px-3 py-2 rounded text-sm cursor-pointer transition-colors',
        selected ? 'bg-primary-subtle text-ink font-semibold' : 'hover:bg-canvas text-ink',
      )}
    >
      <span>{label}</span>
      {hint && <span className="nr-menu-hint text-xs text-ink-muted">{hint}</span>}
    </div>
  )
}

/** Pick a range of real periods (months of the periode table). Keeps its own draft until "Apply". */
export function CustomRangeForm({
  months,
  from,
  to,
  lang,
  onApply,
}: {
  months: PeriodMonthOption[]
  from?: string | undefined
  to?: string | undefined
  lang: Lang
  onApply: (from: string, to: string) => void
}) {
  const { t } = useTranslation()
  const [draftFrom, setDraftFrom] = useState(from ?? months[0]?.month ?? '')
  const [draftTo, setDraftTo] = useState(to ?? months[0]?.month ?? '')
  useEffect(() => {
    // The month list arrives after the first render, and the URL range can change from outside
    setDraftFrom(from ?? months[0]?.month ?? '')
    setDraftTo(to ?? months[0]?.month ?? '')
  }, [from, to, months])

  const draftInvalid = !draftFrom || !draftTo || draftFrom > draftTo
  // Only the newest 12 months are listed; the range that is selected right now always stays listed.
  const monthOptions = useMemo(
    () => limitMonthOptions(months, [from, to, draftFrom, draftTo]),
    [months, from, to, draftFrom, draftTo],
  )

  const statusLabel = (status: PeriodMonthOption['status']) =>
    t(`period.picker.${status === 'Open' ? 'open' : status === 'Pre Closed' ? 'preClosed' : 'closed'}`)
  const monthLabel = (month: string) => formatMonthYear(`${month}-01`, lang)

  const monthSelect = (value: string, onChange: (month: string) => void) => (
    <select className="nr-select h-8 text-sm text-ink w-full" value={value} onChange={(e) => onChange(e.target.value)}>
      {monthOptions.map((m) => (
        <option key={m.month} value={m.month}>
          {monthLabel(m.month)} · {statusLabel(m.status)}
        </option>
      ))}
    </select>
  )

  return (
    <div className="px-3 py-2 space-y-2">
      <span className="text-xs font-semibold text-ink-muted">{t('period.picker.custom')}</span>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-ink-muted">
          {t('period.picker.from')}
          {monthSelect(draftFrom, setDraftFrom)}
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-ink-muted">
          {t('period.picker.to')}
          {monthSelect(draftTo, setDraftTo)}
        </label>
      </div>
      {draftFrom > draftTo && (
        <p className="text-[11px] text-danger" role="alert">{t('period.picker.invalidRange')}</p>
      )}
      <button
        type="button"
        className="nr-btn w-full justify-center text-sm"
        disabled={draftInvalid}
        onClick={() => onApply(draftFrom, draftTo)}
      >
        {t('period.picker.apply')}
      </button>
    </div>
  )
}
