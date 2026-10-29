import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Building2, ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '~/components/ui/sheet'

import { cn } from '~/lib/cn'

export type EntityItem = {
  code: string
  name: string
  isActive: boolean
}

export interface EntityPickerProps {
  entities: EntityItem[]
  selectedToken: string // 'all' or comma-separated codes
  onApply: (newEntityToken: string) => void
  disabled?: boolean
}

export function EntityPicker({
  entities,
  selectedToken,
  onApply,
  disabled = false,
}: EntityPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Track responsive screen size
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    setIsDesktop(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Resolve initial selected set from selectedToken
  const initialSelected = useMemo(() => {
    if (!selectedToken || selectedToken === 'all') {
      return new Set(entities.map((e) => e.code))
    }
    const codes = selectedToken.split(',').map((c) => c.trim()).filter(Boolean)
    return new Set(codes)
  }, [selectedToken, entities])

  const [tempSelected, setTempSelected] = useState<Set<string>>(initialSelected)

  // Reset temp selection when opening
  useEffect(() => {
    if (open) {
      setTempSelected(initialSelected)
      setSearchQuery('')
    }
  }, [open, initialSelected])

  // Filter entities by search query
  const filteredEntities = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return entities
    return entities.filter(
      (e) => e.name.toLowerCase().includes(q) || e.code.toLowerCase().includes(q),
    )
  }, [entities, searchQuery])

  const isAllSelected = tempSelected.size === entities.length
  const selectedCount = tempSelected.size
  const totalCount = entities.length

  const handleToggle = (code: string) => {
    const next = new Set(tempSelected)
    if (next.has(code)) {
      next.delete(code)
    } else {
      next.add(code)
    }
    setTempSelected(next)
  }

  const handleSelectAll = () => {
    setTempSelected(new Set(entities.map((e) => e.code)))
  }

  const handleClearAll = () => {
    setTempSelected(new Set())
  }

  const handleApply = () => {
    if (tempSelected.size === 0) return
    if (tempSelected.size === entities.length) {
      onApply('all')
    } else {
      const codeList = entities
        .filter((e) => tempSelected.has(e.code))
        .map((e) => e.code)
      onApply(codeList.join(','))
    }
    setOpen(false)
  }

  const handleCancel = () => {
    setTempSelected(initialSelected)
    setOpen(false)
  }

  // Label for trigger button
  const triggerLabel = useMemo(() => {
    if (!selectedToken || selectedToken === 'all' || initialSelected.size === entities.length) {
      return t('common.allEntities')
    }
    return `${initialSelected.size} dari ${entities.length}`
  }, [selectedToken, initialSelected, entities, t])

  const pickerContent = (
    <div className="nr-menu nr-picker flex flex-col max-h-120 w-[340px] max-w-[calc(100vw-2rem)] p-0 overflow-hidden border-0 bg-surface shadow-none">
      {/* Search & Actions Header */}
      <div className="nr-picker-head p-3 border-b border-line space-y-2">
        <label className="nr-search w-full! flex items-center gap-2">
          <Search className="nr-icon nr-icon-sm text-ink-muted shrink-0" size={16} />
          <input
            id="entity-search"
            type="search"
            placeholder={t('common.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent border-0 p-0 text-sm focus:outline-none text-ink placeholder:text-ink-muted"
          />
        </label>
        <div className="nr-picker-actions flex items-center justify-between text-xs text-ink-muted px-1">
          <span>{`${selectedCount} dari ${totalCount} dipilih`}</span>
          <span className="space-x-1">
            <button
              type="button"
              onClick={handleSelectAll}
              className="hover:text-ink cursor-pointer font-medium"
            >
              {t('common.selectAll')}
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={handleClearAll}
              className="hover:text-ink cursor-pointer font-medium"
            >
              {t('common.clear')}
            </button>
          </span>
        </div>
      </div>

      {/* Flat List of Entities */}
      <div
        role="listbox"
        aria-multiselectable="true"
        className="flex-1 max-h-75 overflow-y-auto p-1.5 space-y-0.5"
      >
        {filteredEntities.map((entity) => {
          const isChecked = tempSelected.has(entity.code)
          return (
            <div
              key={entity.code}
              role="option"
              aria-checked={isChecked}
              aria-selected={isChecked}
              onClick={() => handleToggle(entity.code)}
              className="nr-check group"
            >
              <span className="nr-box shrink-0">
                {isChecked && (
                  <svg viewBox="0 0 24 24">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </span>
              <div className="nr-check-text flex-1 min-w-0 text-left">
                <b className="truncate text-ink font-semibold text-[13px] leading-4.5 block">
                  {entity.name}
                  {!entity.isActive && (
                    <span className="ml-1.5 text-[11px] text-ink-muted font-normal font-sans">
                      (nonaktif)
                    </span>
                  )}
                </b>
              </div>
            </div>
          )
        })}
        {filteredEntities.length === 0 && (
          <div className="py-6 text-center text-xs text-ink-muted">
            {t('common.noData')}
          </div>
        )}
      </div>

      {/* Footer Buttons */}
      <div className="nr-picker-foot p-3 border-t border-line flex items-center justify-end gap-2 bg-canvas">
        <button
          className="nr-btn nr-btn-ghost text-xs px-3 py-1.5"
          type="button"
          onClick={handleCancel}
        >
          {t('common.cancel')}
        </button>
        <button
          className="nr-btn nr-btn-primary text-xs px-3 py-1.5"
          type="button"
          disabled={tempSelected.size === 0}
          onClick={handleApply}
        >
          {t('common.apply')}
        </button>
      </div>
    </div>
  )

  const triggerButton = (
    <button
      className="nr-select w-full sm:w-auto flex-1 sm:flex-none justify-between items-center min-w-0"
      type="button"
      aria-haspopup="listbox"
      aria-label={t('ui.shell.filterEntity')}
      disabled={disabled}
    >
      <span className="flex items-center gap-2 min-w-0">
        <Building2 className="nr-icon nr-icon-sm shrink-0" size={16} strokeWidth={1.75} />
        <span className="nr-select-label shrink-0">{t('common.entity')}</span>
        <span className="truncate">{triggerLabel}</span>
      </span>
      <ChevronDown className="nr-icon nr-icon-sm ml-1 shrink-0" size={16} strokeWidth={1.75} />
    </button>
  )

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-auto p-0 border border-line shadow-pop rounded-md overflow-hidden"
        >
          {pickerContent}
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{triggerButton}</SheetTrigger>
      <SheetContent side="bottom" className="p-0 rounded-t-xl max-h-[90vh] flex flex-col">
        <SheetHeader className="p-3 border-b border-line">
          <SheetTitle className="text-base font-semibold">{t('common.entity')}</SheetTitle>
        </SheetHeader>
        {pickerContent}
      </SheetContent>
    </Sheet>
  )
}
