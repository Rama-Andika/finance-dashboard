import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'

export type EntityItem = {
  /** Location id (the value used in the URL) */
  id: string
  code: string
  name: string
  isActive: boolean
}

export interface EntityPickerPanelProps {
  entities: EntityItem[]
  selected: ReadonlySet<string>
  searchQuery: string
  onSearchChange: (query: string) => void
  onToggle: (id: string) => void
  onSelectAll: () => void
  onClear: () => void
  onCancel: () => void
  onApply: () => void
}

/** The body of the entity picker (search, list with check boxes, Cancel / Apply), shown in a popover or a sheet. */
export function EntityPickerPanel({
  entities,
  selected,
  searchQuery,
  onSearchChange,
  onToggle,
  onSelectAll,
  onClear,
  onCancel,
  onApply,
}: EntityPickerPanelProps) {
  const { t } = useTranslation()

  const filteredEntities = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return entities
    return entities.filter((e) => e.name.toLowerCase().includes(q) || e.code.toLowerCase().includes(q))
  }, [entities, searchQuery])

  return (
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
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-transparent border-0 p-0 text-sm focus:outline-none text-ink placeholder:text-ink-muted"
          />
        </label>
        <div className="nr-picker-actions flex items-center justify-between text-xs text-ink-muted px-1">
          <span>{t('common.selectedOf', { count: selected.size, total: entities.length })}</span>
          <span className="space-x-1">
            <button type="button" onClick={onSelectAll} className="hover:text-ink cursor-pointer font-medium">
              {t('common.selectAll')}
            </button>
            <span>·</span>
            <button type="button" onClick={onClear} className="hover:text-ink cursor-pointer font-medium">
              {t('common.clear')}
            </button>
          </span>
        </div>
      </div>

      {/* Flat List of Entities */}
      <div role="listbox" aria-multiselectable="true" className="flex-1 max-h-75 overflow-y-auto p-1.5 space-y-0.5">
        {filteredEntities.map((entity) => {
          const isChecked = selected.has(entity.id)
          return (
            <div
              key={entity.id}
              role="option"
              aria-checked={isChecked}
              aria-selected={isChecked}
              onClick={() => onToggle(entity.id)}
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
                      {t('common.inactive')}
                    </span>
                  )}
                </b>
              </div>
            </div>
          )
        })}
        {filteredEntities.length === 0 && (
          <div className="py-6 text-center text-xs text-ink-muted">{t('common.noData')}</div>
        )}
      </div>

      {/* Footer Buttons */}
      <div className="nr-picker-foot p-3 border-t border-line flex items-center justify-end gap-2 bg-canvas">
        <button className="nr-btn nr-btn-ghost text-xs px-3 py-1.5" type="button" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button
          className="nr-btn nr-btn-primary text-xs px-3 py-1.5"
          type="button"
          disabled={selected.size === 0}
          onClick={onApply}
        >
          {t('common.apply')}
        </button>
      </div>
    </div>
  )
}
