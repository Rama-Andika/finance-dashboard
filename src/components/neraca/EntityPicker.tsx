import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Building2, ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '~/components/ui/sheet'
import { useIsDesktop } from '~/components/layout/useIsDesktop'
import { EntityPickerPanel, type EntityItem } from '~/components/neraca/EntityPickerPanel'

export type { EntityItem }

export interface EntityPickerProps {
  entities: EntityItem[]
  selectedToken: string // 'all' or comma-separated location ids
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
  const isDesktop = useIsDesktop()
  const [searchQuery, setSearchQuery] = useState('')

  // Resolve initial selected set from selectedToken
  const initialSelected = useMemo(() => {
    if (!selectedToken || selectedToken === 'all') {
      return new Set(entities.map((e) => e.id))
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

  const handleToggle = (id: string) => {
    const next = new Set(tempSelected)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setTempSelected(next)
  }

  const handleApply = () => {
    if (tempSelected.size === 0) return
    if (tempSelected.size === entities.length) {
      onApply('all')
    } else {
      onApply(entities.filter((e) => tempSelected.has(e.id)).map((e) => e.id).join(','))
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
    return t('common.entitiesSelected', { count: initialSelected.size, total: entities.length })
  }, [selectedToken, initialSelected, entities, t])

  const pickerContent = (
    <EntityPickerPanel
      entities={entities}
      selected={tempSelected}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onToggle={handleToggle}
      onSelectAll={() => setTempSelected(new Set(entities.map((e) => e.id)))}
      onClear={() => setTempSelected(new Set())}
      onCancel={handleCancel}
      onApply={handleApply}
    />
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
