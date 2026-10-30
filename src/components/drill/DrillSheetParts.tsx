import { useEffect, useRef } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, X, Loader2 } from 'lucide-react'
import { JournalList, type JournalItem } from './JournalList'
import { DrillBreadcrumbs } from './DrillBreadcrumbs'
import { DrillTable } from './DrillTable'
import { Skeleton } from '~/components/neraca/Skeleton'
import { MetricError } from '~/components/neraca/MetricError'
import type { Lang } from '~/lib/core/types'
import type { DrillStep } from '~/lib/filters/search-schema'
import type { DrillPage } from './useDrillData'

type DrillRow = Record<string, string | null>

/** Puts the focus back on the element that opened the sheet once it closes. */
export function useRestoreFocus(isOpen: boolean) {
  const previousActiveElementRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = document.activeElement as HTMLElement | null
    } else if (previousActiveElementRef.current) {
      previousActiveElementRef.current.focus?.()
      previousActiveElementRef.current = null
    }
  }, [isOpen])
}

/** Back and close buttons, the title and the breadcrumbs. */
export function DrillSheetHeader({
  title,
  rootTitle,
  steps,
  onBack,
  onClose,
  onGoToSteps,
}: {
  title: string
  rootTitle: string
  steps: DrillStep[]
  onBack: () => void
  onClose: () => void
  onGoToSteps: (steps: DrillStep[]) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="nr-sheet-head">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 -ml-1.5 rounded text-ink-muted hover:text-ink hover:bg-canvas transition"
            title={t('drill.back')}
            aria-label={t('drill.back')}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base font-semibold text-ink truncate">{title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded text-ink-muted hover:text-ink hover:bg-canvas transition"
          title={t('drill.close')}
          aria-label={t('drill.close')}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <DrillBreadcrumbs rootTitle={rootTitle} steps={steps} onGoToSteps={onGoToSteps} />
    </div>
  )
}

function LoadMoreButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="pt-4 pb-2 flex justify-center">
      <button type="button" onClick={onClick} disabled={loading} className="nr-btn text-sm flex items-center gap-2">
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {t('drill.loadMore')}
      </button>
    </div>
  )
}

function DrillSkeleton() {
  return (
    <div className="space-y-3 py-4">
      <Skeleton className="h-6 w-1/3" />
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  )
}

/** The leaf level (journal lines) has its own list; its rows are told apart by the journal number column. */
function isJournalLevel(data: DrillPage | undefined): boolean {
  return Boolean(data?.columns.some((c) => c.id === 'journalNumber'))
}

function journalItemsOf(rows: DrillRow[], t: TFunction): JournalItem[] {
  return rows.map((r) => ({
    id: r.id ?? '',
    journalNumber: r.journalNumber ?? '',
    transDate: r.transDate ?? '',
    journalTypeLabel: `${t(`journalType.${r.journalTypeKey ?? 'adjustment'}`)} (${r.journalType ?? ''})`,
    memo: r.memo ?? '',
    debet: r.debet ?? '0.00',
    credit: r.credit ?? '0.00',
    entityName: r.entityName ?? null,
  }))
}

export type DrillBodyProps = {
  data: DrillPage | undefined
  allRows: DrillRow[]
  isLoading: boolean
  isFetching: boolean
  error: unknown
  hasMore: boolean
  lang: Lang
  onRetry: () => void
  onLoadMore: () => void
  onRowClick: (row: DrillRow) => void
}

/** What the sheet shows for the current level: loading, an error, the journal list or the drill table. */
export function DrillBody(props: DrillBodyProps) {
  const { t } = useTranslation()
  const { data, allRows, isLoading, isFetching, error, hasMore, lang } = props
  if (isLoading) return <DrillSkeleton />
  if (error) return <MetricError error={error} reset={props.onRetry} />

  const loadMore = hasMore ? <LoadMoreButton onClick={props.onLoadMore} loading={isFetching} /> : null
  const showEntity = Boolean(data?.showEntity)

  if (isJournalLevel(data)) {
    return (
      <>
        <JournalList items={journalItemsOf(allRows, t)} lang={lang} showEntity={showEntity} />
        {loadMore}
      </>
    )
  }
  return (
    <div className="space-y-4">
      <DrillTable
        columns={data?.columns ?? []}
        rows={allRows}
        hasNext={Boolean(data?.nextKind)}
        showEntity={showEntity}
        lang={lang}
        onRowClick={props.onRowClick}
      />
      {loadMore}
    </div>
  )
}
