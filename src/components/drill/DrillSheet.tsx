import { searchUpdater } from '~/lib/filters/search-update'
import { translateCfLabel } from '~/lib/finance/cash/cashflow-labels'
import { useEffect, useRef } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, X, Loader2 } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle } from '~/components/ui/sheet'
import { useDrillData, parseDrill, type DrillSearchParams } from './useDrillData'
import { JournalList, type JournalItem } from './JournalList'
import { DrillBreadcrumbs } from './DrillBreadcrumbs'
import { DrillTable } from './DrillTable'
import { Skeleton } from '~/components/neraca/Skeleton'
import { MetricError } from '~/components/neraca/MetricError'
import type { Lang } from '~/lib/core/types'
import type { DrillStep, DrillStepKind } from '~/lib/filters/search-schema'

type SearchUpdater = (prev: Record<string, unknown>) => Record<string, unknown>

/** Rows requested per "load more" click. */
const DRILL_PAGE_SIZE = 200

export function DrillSheet() {
  const search = useSearch({ strict: false }) as DrillSearchParams
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const lang = (i18n.language?.startsWith('en') ? 'en' : 'id') as Lang

  const drill = parseDrill(search.drill)
  const isOpen = Boolean(drill && drill.metric && drill.steps.length)

  // Focus restoration
  const previousActiveElementRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = document.activeElement as HTMLElement | null
    } else if (previousActiveElementRef.current) {
      previousActiveElementRef.current.focus?.()
      previousActiveElementRef.current = null
    }
  }, [isOpen])

  const { offset, setOffset, allRows, data, isLoading, isFetching, error, refetch } = useDrillData(search, drill, isOpen)

  const updateSearch = (updater: SearchUpdater) => {
    // Opening or stepping through a drill must not scroll the page behind the sheet to the top
    navigate({ to: '.', search: searchUpdater(updater), resetScroll: false })
  }

  const handleClose = () => {
    updateSearch((prev) => {
      const next = { ...prev }
      delete next.drill
      return next
    })
  }

  const goToSteps = (steps: DrillStep[]) => {
    if (!drill) return
    if (steps.length === 0) {
      handleClose()
      return
    }
    updateSearch((prev) => ({ ...prev, drill: { metric: drill.metric, steps } }))
  }

  const handleBack = () => {
    if (!drill) return
    goToSteps(drill.steps.slice(0, -1))
  }

  const handleRowDrill = (row: Record<string, string | null>) => {
    if (!drill || !data?.nextKind) return
    const nextStep: DrillStep = {
      kind: data.nextKind as DrillStepKind,
      id: row.id || '',
      label: (row.name || row.label || row.code || row.docNumber || row.invoiceNumber || row.id || '').slice(0, 200),
    }
    goToSteps([...drill.steps, nextStep])
  }

  if (!isOpen || !drill) return null

  const metricRootTitle = t(`drill.metric.${drill.metric}`, { defaultValue: drill.metric })
  const title = data ? t(data.titleKey, { label: translateCfLabel(t, data.titleLabel) }) : metricRootTitle
  const isJournalLeaf = Boolean(data?.columns.some((c) => c.id === 'journalNumber'))
  const journalItems: JournalItem[] = isJournalLeaf
    ? allRows.map((r) => ({
        id: r.id ?? '',
        journalNumber: r.journalNumber ?? '',
        transDate: r.transDate ?? '',
        journalTypeLabel: `${t(`journalType.${r.journalTypeKey ?? 'adjustment'}`)} (${r.journalType ?? ''})`,
        memo: r.memo ?? '',
        debet: r.debet ?? '0.00',
        credit: r.credit ?? '0.00',
        entityName: r.entityName ?? null,
      }))
    : []

  const loadMore = data?.hasMore ? (
    <div className="pt-4 pb-2 flex justify-center">
      <button
        type="button"
        onClick={() => setOffset((prev) => prev + DRILL_PAGE_SIZE)}
        disabled={isFetching}
        className="nr-btn text-sm flex items-center gap-2"
      >
        {isFetching && <Loader2 className="w-4 h-4 animate-spin" />}
        {t('drill.loadMore')}
      </button>
    </div>
  ) : null

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent
        side="right"
        data-drill-sheet
        showCloseButton={false}
        className="w-full sm:max-w-2xl md:max-w-3xl p-0 flex flex-col gap-0 border-l border-line bg-surface overflow-hidden"
      >
        <SheetTitle className="sr-only">{title}</SheetTitle>

        <div className="nr-sheet-head">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={handleBack}
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
              onClick={handleClose}
              className="p-1.5 rounded text-ink-muted hover:text-ink hover:bg-canvas transition"
              title={t('drill.close')}
              aria-label={t('drill.close')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <DrillBreadcrumbs rootTitle={metricRootTitle} steps={drill.steps} onGoToSteps={goToSteps} />
        </div>

        <div className="nr-sheet-body">
          {isLoading && offset === 0 ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-6 w-1/3" />
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : error ? (
            <MetricError error={error} reset={() => refetch()} />
          ) : isJournalLeaf ? (
            <>
              <JournalList items={journalItems} lang={lang} showEntity={Boolean(data?.showEntity)} />
              {loadMore}
            </>
          ) : (
            <div className="space-y-4">
              <DrillTable
                columns={data?.columns ?? []}
                rows={allRows}
                hasNext={Boolean(data?.nextKind)}
                showEntity={Boolean(data?.showEntity)}
                lang={lang}
                onRowClick={handleRowDrill}
              />
              {loadMore}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
