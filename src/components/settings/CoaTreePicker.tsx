import { useState, useMemo, useRef, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronRight, ChevronDown, Search, Folder, FileText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '~/lib/cn'
import type { CoaTree } from '~/lib/finance/coa/coa-tree'
import { flattenVisible, matchingCoaIds } from '~/lib/finance/coa/coa-tree-view'
import type { Id } from '~/lib/core/types'
import { checkState } from '~/lib/finance/coa/basket-resolver'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip'

/** The `data-checked` value of a box: all, some (mixed) or none of the accounts below are in the basket. */
function checkedAttribute(isPartial: boolean, isChecked: boolean): 'mixed' | 'true' | 'false' {
  if (isPartial) return 'mixed'
  return isChecked ? 'true' : 'false'
}

export interface CoaTreePickerProps {
  tree: CoaTree
  include: Id[]
  onToggle: (coaId: Id) => void
  className?: string
}

export function CoaTreePicker({
  tree,
  include,
  onToggle,
  className,
}: CoaTreePickerProps) {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<Id>>(() => {
    // Initially expand top-level roots
    return new Set(tree.roots.map((r) => r.coaId))
  })

  const parentRef = useRef<HTMLDivElement>(null)

  const toggleExpand = (coaId: Id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(coaId)) {
        next.delete(coaId)
      } else {
        next.add(coaId)
      }
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
        for (const id of matchingIds) {
          next.add(id)
        }
        return next
      })
    }
  }, [matchingIds])

  const visibleItems = useMemo(() => flattenVisible(tree, expandedIds, matchingIds), [tree, expandedIds, matchingIds])

  const virtualizer = useVirtualizer({
    count: visibleItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 10,
  })

  return (
    <div className={cn('flex flex-col border border-border rounded-lg bg-surface overflow-hidden', className)}>
      {/* Search Header */}
      <div className="p-3 border-b border-border bg-canvas flex items-center gap-2">
        <label className="nr-search w-full! flex items-center gap-2 px-2.5 py-1.5 rounded bg-surface border border-border">
          <Search className="nr-icon nr-icon-sm text-ink-muted" size={16} />
          <input
            type="search"
            placeholder={t('ui.shell.coaSearch')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent border-0 p-0 text-sm focus:outline-none text-ink placeholder:text-ink-muted"
          />
        </label>
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="text-xs font-semibold text-ink-muted hover:text-ink px-2"
          >
            {t('common.clear')}
          </button>
        )}
      </div>

      {/* Virtualized Tree List */}
      <div
        ref={parentRef}
        className="flex-1 min-h-[420px] max-h-[580px] overflow-y-auto p-2"
        role="tree"
        aria-label={t('ui.shell.coaTree')}
      >
        {visibleItems.length === 0 ? (
          <div className="py-12 text-center text-sm text-ink-muted">
            {t('common.noData')}
          </div>
        ) : (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            <TooltipProvider delayDuration={300}>
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const item = visibleItems[virtualItem.index]!
                const { node, depth, hasChildren, isExpanded } = item
                const state = checkState(include, tree, node.coaId)
                const isChecked = state === 'checked'
                const isPartial = state === 'partial'
                const isHeader = node.status === 'HEADER'

                return (
                  <div
                    key={node.coaId}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                    onClick={() => onToggle(node.coaId)}
                    className={cn(
                      'flex items-center gap-2 px-2 py-1 rounded text-sm hover:bg-canvas transition-colors select-none cursor-pointer',
                      isChecked && 'bg-primary-subtle/50',
                    )}
                  >
                    {/* Indentation */}
                    <div style={{ width: `${depth * 20}px` }} className="shrink-0" />

                    {/* Expand/Collapse Chevron */}
                    {hasChildren ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleExpand(node.coaId)
                        }}
                        className="w-5 h-5 flex items-center justify-center text-ink-muted hover:text-ink cursor-pointer shrink-0"
                        aria-label={isExpanded ? t('ui.shell.closeFolder') : t('ui.shell.openFolder')}
                      >
                        {isExpanded ? (
                          <ChevronDown size={14} strokeWidth={2} />
                        ) : (
                          <ChevronRight size={14} strokeWidth={2} />
                        )}
                      </button>
                    ) : (
                      <div className="w-5 h-5 shrink-0" />
                    )}

                    {/* Checkbox */}
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isPartial ? 'mixed' : isChecked}
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggle(node.coaId)
                      }}
                      data-checked={checkedAttribute(isPartial, isChecked)}
                      className="nr-box cursor-pointer shrink-0"
                      aria-label={node.name}
                    >
                      {isChecked && (
                        <svg viewBox="0 0 24 24">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                      {isPartial && (
                        <svg viewBox="0 0 24 24">
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      )}
                    </button>

                    {/* Icon */}
                    {isHeader ? (
                      <Folder size={15} className="text-ink-muted shrink-0" />
                    ) : (
                      <FileText size={15} className="text-ink-muted shrink-0" />
                    )}

                    {/* Code & Name */}
                    <span className="font-mono text-xs text-ink-muted shrink-0 font-medium">
                      {node.code}
                    </span>

                    <span
                      className={cn(
                        'truncate text-ink',
                        isHeader ? 'font-semibold' : 'font-normal',
                      )}
                    >
                      {node.name}
                    </span>

                    {/* Partial hint */}
                    {isPartial && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-[11px] text-ink-muted italic shrink-0 cursor-help">
                            ({t('settings.notAutoIncluded')})
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t('settings.notAutoIncluded')}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}

                    {/* Special badges */}
                    {node.isOrphan && (
                      <span className="text-[10px] bg-warning-subtle text-warning px-1.5 py-0.5 rounded shrink-0">
                        Tanpa Induk
                      </span>
                    )}
                    {node.isCycle && (
                      <span className="text-[10px] bg-danger-subtle text-danger px-1.5 py-0.5 rounded shrink-0">
                        Siklus
                      </span>
                    )}
                  </div>
                )
              })}
            </TooltipProvider>
          </div>
        )}
      </div>
    </div>
  )
}
