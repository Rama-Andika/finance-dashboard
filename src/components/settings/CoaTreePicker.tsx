import { useState, useMemo, useRef, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '~/lib/cn'
import type { CoaTree } from '~/lib/finance/coa/coa-tree'
import { flattenVisible, matchingCoaIds } from '~/lib/finance/coa/coa-tree-view'
import type { Id } from '~/lib/core/types'
import { TooltipProvider } from '~/components/ui/tooltip'
import { CoaTreeRow } from './CoaTreeRow'

export interface CoaTreePickerProps {
  tree: CoaTree
  include: Id[]
  onToggle: (coaId: Id) => void
  className?: string
}

/** Which folders are open and what the search leaves visible; searching opens every folder on the way to a hit. */
function useCoaTreeView(tree: CoaTree) {
  const [searchQuery, setSearchQuery] = useState('')
  // Initially expand top-level roots
  const [expandedIds, setExpandedIds] = useState<Set<Id>>(() => new Set(tree.roots.map((r) => r.coaId)))

  const toggleExpand = (coaId: Id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(coaId)) next.delete(coaId)
      else next.add(coaId)
      return next
    })
  }

  // Ids to keep while searching (hits and their ancestors); null when there is no search
  const matchingIds = useMemo(() => matchingCoaIds(tree, searchQuery), [tree, searchQuery])

  // Automatically expand all ancestor nodes when searching
  useEffect(() => {
    if (matchingIds) {
      setExpandedIds((prev) => {
        const next = new Set(prev)
        for (const id of matchingIds) next.add(id)
        return next
      })
    }
  }, [matchingIds])

  const visibleItems = useMemo(() => flattenVisible(tree, expandedIds, matchingIds), [tree, expandedIds, matchingIds])

  return { searchQuery, setSearchQuery, toggleExpand, visibleItems }
}

function CoaSearchBar({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation()
  return (
    <div className="p-3 border-b border-border bg-canvas flex items-center gap-2">
      <label className="nr-search w-full! flex items-center gap-2 px-2.5 py-1.5 rounded bg-surface border border-border">
        <Search className="nr-icon nr-icon-sm text-ink-muted" size={16} />
        <input
          type="search"
          placeholder={t('ui.shell.coaSearch')}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent border-0 p-0 text-sm focus:outline-none text-ink placeholder:text-ink-muted"
        />
      </label>
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="text-xs font-semibold text-ink-muted hover:text-ink px-2"
        >
          {t('common.clear')}
        </button>
      )}
    </div>
  )
}

export function CoaTreePicker({ tree, include, onToggle, className }: CoaTreePickerProps) {
  const { t } = useTranslation()
  const { searchQuery, setSearchQuery, toggleExpand, visibleItems } = useCoaTreeView(tree)

  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: visibleItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 10,
  })

  return (
    <div className={cn('flex flex-col border border-border rounded-lg bg-surface overflow-hidden', className)}>
      <CoaSearchBar value={searchQuery} onChange={setSearchQuery} />

      {/* Virtualized Tree List */}
      <div
        ref={parentRef}
        className="flex-1 min-h-[420px] max-h-[580px] overflow-y-auto p-2"
        role="tree"
        aria-label={t('ui.shell.coaTree')}
      >
        {visibleItems.length === 0 ? (
          <div className="py-12 text-center text-sm text-ink-muted">{t('common.noData')}</div>
        ) : (
          <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
            <TooltipProvider delayDuration={300}>
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const item = visibleItems[virtualItem.index]
                if (!item) return null
                return (
                  <CoaTreeRow
                    key={item.node.coaId}
                    item={item}
                    tree={tree}
                    include={include}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                    onToggle={onToggle}
                    onToggleExpand={toggleExpand}
                  />
                )
              })}
            </TooltipProvider>
          </div>
        )}
      </div>
    </div>
  )
}
