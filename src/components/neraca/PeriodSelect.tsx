import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Calendar } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import type { Preset, Horizon } from '~/lib/filters/search-schema'
import { formatMonthYear } from '~/lib/format/date'
import { CustomRangeForm, PeriodOption, type PeriodMonthOption } from '~/components/neraca/PeriodSelectParts'

export type { PeriodMonthOption }

export interface PresetHint {
  preset: Preset
  from: string
  to: string
}

export interface PeriodSelectProps {
  preset: Preset
  /** Explicit month range ('YYYY-MM'); when both are set they replace the preset. */
  from?: string
  to?: string
  /** Months that exist in the periode table, newest first. */
  months?: PeriodMonthOption[]
  onRangeChange?: (from: string, to: string) => void
  onPresetChange: (preset: Preset) => void
  presetHints?: PresetHint[]
  isForwardMode?: boolean // true on /payment-plan
  horizon?: Horizon
  onHorizonChange?: (horizon: Horizon) => void
  disabled?: boolean
}

export function PeriodSelect({
  preset,
  from,
  to,
  months = [],
  onRangeChange,
  onPresetChange,
  presetHints = [],
  isForwardMode = false,
  horizon = '7',
  onHorizonChange,
  disabled = false,
}: PeriodSelectProps) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const lang = i18n.language === 'en' ? 'en' : 'id'

  const hintsMap = useMemo(() => {
    const map = new Map<Preset, string>()
    for (const h of presetHints) {
      if (h.from.slice(0, 7) === h.to.slice(0, 7)) {
        map.set(h.preset, formatMonthYear(h.from, lang))
      } else {
        const fromStr = formatMonthYear(h.from, lang)
        const toStr = formatMonthYear(h.to, lang)
        map.set(h.preset, `${fromStr} – ${toStr}`)
      }
    }
    return map
  }, [presetHints, lang])

  const standardPresets: Array<{ id: Preset; label: string }> = [
    { id: 'this-month', label: t('period.thisMonth') },
    { id: 'last-month', label: t('period.lastMonth') },
    { id: 'this-quarter', label: t('period.thisQuarter') },
    { id: 'ytd', label: t('period.ytd') },
    { id: 'last-12m', label: t('period.last12m') },
  ]

  const forwardPresets: Array<{ id: Horizon; label: string }> = [
    { id: '7', label: t('period.next7') },
    { id: '14', label: t('period.next14') },
    { id: '30', label: t('period.next30') },
  ]

  const hasRange = Boolean(from && to)
  const monthLabel = (month: string) => formatMonthYear(`${month}-01`, lang)

  // Current trigger display text
  const currentLabel = (() => {
    if (isForwardMode) {
      const match = forwardPresets.find((p) => p.id === horizon)
      return match ? match.label : t('period.next7')
    }
    if (from && to) {
      return from === to ? monthLabel(from) : `${monthLabel(from)} – ${monthLabel(to)}`
    }
    const match = standardPresets.find((p) => p.id === preset)
    const label = match ? match.label : t('period.thisMonth')
    const hint = hintsMap.get(preset)
    return hint ? `${label} · ${hint}` : label
  })()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="nr-select w-full sm:w-auto flex-1 sm:flex-none justify-between items-center min-w-0"
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={t('ui.shell.filterPeriod')}
          disabled={disabled}
        >
          <span className="flex items-center gap-2 min-w-0">
            <Calendar className="nr-icon nr-icon-sm shrink-0" size={16} strokeWidth={1.75} />
            <span className="nr-select-label shrink-0">{t('common.period')}</span>
            <span className="truncate">{currentLabel}</span>
          </span>
          <ChevronDown className="nr-icon nr-icon-sm ml-1 shrink-0" size={16} strokeWidth={1.75} />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="nr-menu p-1 w-65 max-w-[calc(100vw-2rem)] border border-line shadow-pop bg-surface rounded-md"
      >
        <div role="listbox" aria-label={t('ui.shell.periodChoices')} className="space-y-0.5">
          {isForwardMode ? (
            forwardPresets.map((item) => (
              <PeriodOption
                key={item.id}
                label={item.label}
                selected={item.id === horizon}
                onSelect={() => {
                  onHorizonChange?.(item.id)
                  setOpen(false)
                }}
              />
            ))
          ) : (
            <>
              {standardPresets.map((item) => (
                <PeriodOption
                  key={item.id}
                  label={item.label}
                  hint={hintsMap.get(item.id)}
                  selected={!hasRange && item.id === preset}
                  onSelect={() => {
                    onPresetChange(item.id)
                    setOpen(false)
                  }}
                />
              ))}

              <div className="nr-menu-sep h-px bg-line my-1" role="separator" />

              {months.length > 0 && onRangeChange && (
                <CustomRangeForm
                  months={months}
                  from={from}
                  to={to}
                  lang={lang}
                  onApply={(rangeFrom, rangeTo) => {
                    onRangeChange(rangeFrom, rangeTo)
                    setOpen(false)
                  }}
                />
              )}

              <div className="nr-menu-sep h-px bg-line my-1" role="separator" />
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
