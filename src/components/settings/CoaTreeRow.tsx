import type { CSSProperties } from 'react'
import { ChevronRight, ChevronDown, Folder, FileText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '~/lib/cn'
import type { CoaTree } from '~/lib/finance/coa/coa-tree'
import type { flattenVisible } from '~/lib/finance/coa/coa-tree-view'
import type { Id } from '~/lib/core/types'
import { checkState } from '~/lib/finance/coa/basket-resolver'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'

export type CoaTreeItem = ReturnType<typeof flattenVisible>[number]

/** The `data-checked` value of a box: all, some (mixed) or none of the accounts below are in the basket. */
function checkedAttribute(isPartial: boolean, isChecked: boolean): 'mixed' | 'true' | 'false' {
  if (isPartial) return 'mixed'
  return isChecked ? 'true' : 'false'
}

function ExpandButton({ item, onToggleExpand }: { item: CoaTreeItem; onToggleExpand: (coaId: Id) => void }) {
  const { t } = useTranslation()
  if (!item.hasChildren) return <div className="w-5 h-5 shrink-0" />
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onToggleExpand(item.node.coaId)
      }}
      className="w-5 h-5 flex items-center justify-center text-ink-muted hover:text-ink cursor-pointer shrink-0"
      aria-label={item.isExpanded ? t('ui.shell.closeFolder') : t('ui.shell.openFolder')}
    >
      {item.isExpanded ? <ChevronDown size={14} strokeWidth={2} /> : <ChevronRight size={14} strokeWidth={2} />}
    </button>
  )
}

function CheckBox({
  name,
  isChecked,
  isPartial,
  onClick,
}: {
  name: string
  isChecked: boolean
  isPartial: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isPartial ? 'mixed' : isChecked}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      data-checked={checkedAttribute(isPartial, isChecked)}
      className="nr-box cursor-pointer shrink-0"
      aria-label={name}
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
  )
}

/** Hints after the name: a folder only partly in the basket, an account without a parent, a parent cycle. */
function RowBadges({ item, isPartial }: { item: CoaTreeItem; isPartial: boolean }) {
  const { t } = useTranslation()
  return (
    <>
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
      {item.node.isOrphan && (
        <span className="text-[10px] bg-warning-subtle text-warning px-1.5 py-0.5 rounded shrink-0">
          {t('settings.orphanBadge')}
        </span>
      )}
      {item.node.isCycle && (
        <span className="text-[10px] bg-danger-subtle text-danger px-1.5 py-0.5 rounded shrink-0">
          {t('settings.cycleBadge')}
        </span>
      )}
    </>
  )
}

/** One line of the account tree: indentation, expand button, checkbox, icon, code, name and hints. */
export function CoaTreeRow({
  item,
  tree,
  include,
  style,
  onToggle,
  onToggleExpand,
}: {
  item: CoaTreeItem
  tree: CoaTree
  include: Id[]
  /** Absolute position given by the virtual list. */
  style: CSSProperties
  onToggle: (coaId: Id) => void
  onToggleExpand: (coaId: Id) => void
}) {
  const { node, depth } = item
  const state = checkState(include, tree, node.coaId)
  const isChecked = state === 'checked'
  const isPartial = state === 'partial'
  const isHeader = node.status === 'HEADER'
  const Icon = isHeader ? Folder : FileText

  return (
    <div
      style={style}
      onClick={() => {
        if (item.hasChildren) {
          onToggleExpand(node.coaId)
        } else {
          onToggle(node.coaId)
        }
      }}
      className={cn(
        'flex items-center gap-2 px-2 py-1 rounded text-sm hover:bg-canvas transition-colors select-none cursor-pointer',
        isChecked && 'bg-primary-subtle/50',
      )}
    >
      <div style={{ width: `${depth * 20}px` }} className="shrink-0" />
      <ExpandButton item={item} onToggleExpand={onToggleExpand} />
      <CheckBox name={node.name} isChecked={isChecked} isPartial={isPartial} onClick={() => onToggle(node.coaId)} />
      <Icon size={15} className="text-ink-muted shrink-0" />
      <span className="font-mono text-xs text-ink-muted shrink-0 font-medium">{node.code}</span>
      <span className={cn('truncate text-ink', isHeader ? 'font-semibold' : 'font-normal')}>{node.name}</span>
      <RowBadges item={item} isPartial={isPartial} />
    </div>
  )
}
