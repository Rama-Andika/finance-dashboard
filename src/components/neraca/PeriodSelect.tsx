import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Calendar } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import { Switch } from '~/components/ui/switch'
import { cn } from '~/lib/cn'
import type { Preset, Horizon } from '~/lib/filters/search-schema'
import { formatMonthYear } from '~/lib/format/date'

export interface PresetHint {
  preset: Preset
  from: string
  to: string
}

export interface PeriodSelectProps {
  preset: Preset
  p13: boolean
  onPresetChange: (preset: Preset) => void
  onP13Change: (p13: boolean) => void
  presetHints?: PresetHint[]
  isForwardMode?: boolean // true on /payment-plan
  horizon?: Horizon
  onHorizonChange?: (horizon: Horizon) => void
  disabled?: boolean
}

export function PeriodSelect({
  preset,
  p13,
  onPresetChange,
  onP13Change,
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

  const isP13Supported = preset === 'ytd' || preset === 'last-12m'

  // Current trigger display text
  const currentLabel = useMemo(() => {
    if (isForwardMode) {
      const match = forwardPresets.find((p) => p.id === horizon)
      return match ? match.label : '7 hari'
    }
    const match = standardPresets.find((p) => p.id === preset)
    const label = match ? match.label : t('period.thisMonth')
    const hint = hintsMap.get(preset)
    return hint ? `${label} · ${hint}` : label
  }, [isForwardMode, horizon, preset, hintsMap, t, standardPresets, forwardPresets])

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
            forwardPresets.map((item) => {
              const isSelected = item.id === horizon
              return (
                <div
                  key={item.id}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onHorizonChange?.(item.id)
                    setOpen(false)
                  }}
                  className={cn(
                    'nr-menu-item flex items-center justify-between px-3 py-2 rounded text-sm cursor-pointer transition-colors',
                    isSelected
                      ? 'bg-primary-subtle text-ink font-semibold'
                      : 'hover:bg-canvas text-ink',
                  )}
                >
                  <span>{item.label}</span>
                </div>
              )
            })
          ) : (
            <>
              {standardPresets.map((item) => {
                const isSelected = item.id === preset
                const hint = hintsMap.get(item.id)
                return (
                  <div
                    key={item.id}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onPresetChange(item.id)
                      setOpen(false)
                    }}
                    className={cn(
                      'nr-menu-item flex items-center justify-between px-3 py-2 rounded text-sm cursor-pointer transition-colors',
                      isSelected
                        ? 'bg-primary-subtle text-ink font-semibold'
                        : 'hover:bg-canvas text-ink',
                    )}
                  >
                    <span>{item.label}</span>
                    {hint && <span className="nr-menu-hint text-xs text-ink-muted">{hint}</span>}
                  </div>
                )
              })}

              <div className="nr-menu-sep h-px bg-line my-1" role="separator" />

              {/* Period 13 Switch */}
              <div
                className={cn(
                  'flex items-center justify-between px-3 py-2 rounded text-sm transition-opacity',
                  isP13Supported ? 'opacity-100' : 'opacity-40 cursor-not-allowed',
                )}
              >
                <div className="flex flex-col">
                  <span className="font-medium">{t('period.includeP13')}</span>
                  <span className="text-[11px] text-ink-muted">
                    {t('period.includeP13Hint') || 'Penyesuaian akhir tahun'}
                  </span>
                </div>
                <Switch
                  checked={p13}
                  disabled={!isP13Supported}
                  onCheckedChange={(checked) => onP13Change(checked)}
                />
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
