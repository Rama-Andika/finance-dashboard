import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, X, ChevronRight, Loader2 } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle } from '~/components/ui/sheet'
import { drillOptions } from '~/queries/drill.queries'
import { JournalList, type JournalItem } from './JournalList'
import { Skeleton } from '~/components/neraca/Skeleton'
import { MetricError } from '~/components/neraca/MetricError'
import { formatMoneyFull } from '~/lib/format/number'
import { formatDate } from '~/lib/format/date'
import type { Lang } from '~/lib/finance/types'
import type { DrillState, DrillStep, DrillStepKind } from '~/server/services/drill.service'

const METRIC_TITLES: Record<string, { id: string; en: string }> = {
  revenue: { id: 'Pendapatan', en: 'Revenue' },
  cashPosition: { id: 'Posisi Kas', en: 'Cash Position' },
  inTransit: { id: 'Kas Dalam Perjalanan', en: 'In-Transit Cash' },
  cashFlow: { id: 'Arus Kas', en: 'Cash Flow' },
  pnl: { id: 'Laba Rugi', en: 'Profit & Loss' },
  expensePaid: { id: 'Beban Dibayar', en: 'Expense Paid' },
  apAging: { id: 'Utang Usaha', en: 'Accounts Payable' },
  arAging: { id: 'Piutang Usaha', en: 'Accounts Receivable' },
  fixedCost: { id: 'Beban Tetap', en: 'Fixed Cost' },
  paymentPlan: { id: 'Rencana Bayar', en: 'Payment Plan' },
  budget: { id: 'Anggaran', en: 'Budget' },
}

export function DrillSheet() {
  const search = useSearch({ strict: false }) as any
  const navigate = useNavigate()
  const { i18n } = useTranslation()
  const lang = (i18n.language?.startsWith('en') ? 'en' : 'id') as Lang

  // Parse drill state safely
  let drill: DrillState | null = null
  if (search?.drill) {
    if (typeof search.drill === 'string') {
      try {
        drill = JSON.parse(search.drill)
      } catch {
        drill = null
      }
    } else if (typeof search.drill === 'object' && search.drill.metric) {
      drill = search.drill
    }
  }

  const isOpen = Boolean(drill && drill.metric && drill.steps?.length)

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

  // Pagination offset & accumulated rows
  const [offset, setOffset] = useState(0)
  const [allRows, setAllRows] = useState<Array<Record<string, string | null>>>([])
  const drillKey = drill ? `${drill.metric}:${drill.steps.map((s) => `${s.kind}-${s.id}`).join('/')}` : ''

  // Reset pagination on drill path change
  useEffect(() => {
    setOffset(0)
    setAllRows([])
  }, [drillKey])

  // Query
  const queryInput = {
    entity: (search?.entity ?? 'all') as string,
    preset: (search?.preset ?? 'this-month') as any,
    p13: Boolean(search?.p13),
    chart: search?.chart,
    drill: drill as any,
    offset,
  }

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    ...drillOptions(queryInput),
    enabled: isOpen,
  })

  // Accumulate rows
  useEffect(() => {
    if (data?.rows) {
      if (offset === 0) {
        setAllRows(data.rows)
      } else {
        setAllRows((prev) => {
          const seen = new Set(prev.map((r) => r.id))
          const fresh = data.rows.filter((r) => !seen.has(r.id))
          return [...prev, ...fresh]
        })
      }
    }
  }, [data?.rows, offset])

  const handleClose = () => {
    navigate({
      search: ((prev: any) => {
        const next = { ...prev }
        delete next.drill
        return next
      }) as any,
    })
  }

  const handleBack = () => {
    if (!drill || drill.steps.length <= 1) {
      handleClose()
    } else {
      navigate({
        search: ((prev: any) => ({
          ...prev,
          drill: {
            metric: drill!.metric,
            steps: drill!.steps.slice(0, -1),
          },
        })) as any,
      })
    }
  }

  const handleStepClick = (index: number) => {
    if (!drill) return
    if (index === -1) {
      handleClose()
      return
    }
    navigate({
      search: ((prev: any) => ({
        ...prev,
        drill: {
          metric: drill!.metric,
          steps: drill!.steps.slice(0, index + 1),
        },
      })) as any,
    })
  }

  const handleRowDrill = (row: Record<string, string | null>) => {
    if (!drill || !data?.nextKind) return
    const nextStep: DrillStep = {
      kind: data.nextKind as DrillStepKind,
      id: row.id || '',
      label: row.name || row.label || row.code || row.txNumber || row.invoiceNumber || row.id || '',
    }
    navigate({
      search: ((prev: any) => ({
        ...prev,
        drill: {
          metric: drill!.metric,
          steps: [...drill!.steps, nextStep],
        },
      })) as any,
    })
  }

  if (!isOpen || !drill) return null

  const metricRootTitle = METRIC_TITLES[drill.metric]?.[lang] || drill.metric
  const isJournalLeaf = Boolean(data?.columns.some((c) => c.id === 'journalNumber'))

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent
        side="right"
        data-drill-sheet
        showCloseButton={false}
        className="w-full sm:max-w-2xl md:max-w-3xl p-0 flex flex-col gap-0 border-l border-line bg-surface overflow-hidden"
      >
        <SheetTitle className="sr-only">
          {data?.title || 'Rincian Transaksi'}
        </SheetTitle>

        {/* Header */}
        <div className="nr-sheet-head">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={handleBack}
                className="p-1.5 -ml-1.5 rounded text-ink-muted hover:text-ink hover:bg-canvas transition"
                title={lang === 'id' ? 'Kembali' : 'Back'}
                aria-label={lang === 'id' ? 'Kembali' : 'Back'}
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base font-semibold text-ink truncate">
                {data?.title || metricRootTitle}
              </h2>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 rounded text-ink-muted hover:text-ink hover:bg-canvas transition"
              title={lang === 'id' ? 'Tutup' : 'Close'}
              aria-label={lang === 'id' ? 'Tutup' : 'Close'}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Breadcrumb Trail */}
          <nav aria-label="Drill breadcrumbs" className="nr-sheet-breadcrumbs">
            <button
              type="button"
              onClick={() => handleStepClick(-1)}
              className="hover:text-ink transition underline-offset-2 hover:underline"
            >
              {metricRootTitle}
            </button>
            {drill.steps.map((step, idx) => {
              const isLast = idx === drill!.steps.length - 1
              return (
                <React.Fragment key={`${step.kind}-${step.id}-${idx}`}>
                  <ChevronRight className="w-3.5 h-3.5 text-muted shrink-0" />
                  {isLast ? (
                    <span className="active truncate max-w-[200px]" title={step.label}>
                      {step.label}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleStepClick(idx)}
                      className="hover:text-ink transition truncate max-w-[160px] underline-offset-2 hover:underline"
                      title={step.label}
                    >
                      {step.label}
                    </button>
                  )}
                </React.Fragment>
              )
            })}
          </nav>
        </div>

        {/* Body */}
        <div className="nr-sheet-body">
          {isLoading && offset === 0 ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <MetricError
              error={error}
              reset={() => refetch()}
            />
          ) : isJournalLeaf ? (
            <>
              <JournalList items={allRows as unknown as JournalItem[]} lang={lang} />
              {data?.hasMore && (
                <div className="pt-4 pb-2 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setOffset((prev) => prev + 200)}
                    disabled={isFetching}
                    className="nr-btn nr-btn-secondary text-sm flex items-center gap-2"
                  >
                    {isFetching && <Loader2 className="w-4 h-4 animate-spin" />}
                    {lang === 'id' ? 'Muat 200 baris lagi' : 'Load 200 more lines'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="nr-table-wrap">
                <table className="nr-table">
                  <thead>
                    <tr>
                      {data?.columns.map((col) => (
                        <th
                          key={col.id}
                          className={col.kind === 'money' ? 'nr-r' : undefined}
                        >
                          {col.label}
                        </th>
                      ))}
                      {data?.nextKind && <th className="w-10"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {allRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={(data?.columns.length || 0) + (data?.nextKind ? 1 : 0)}
                          className="text-center py-10 text-muted text-sm"
                        >
                          {lang === 'id' ? 'Tidak ada data untuk rincian ini' : 'No data for this detail'}
                        </td>
                      </tr>
                    ) : (
                      allRows.map((row) => (
                        <tr
                          key={row.id || Math.random()}
                          onClick={() => handleRowDrill(row)}
                          className={data?.nextKind ? 'cursor-pointer hover:bg-canvas/60 transition' : undefined}
                        >
                          {data?.columns.map((col) => {
                            const val = row[col.id]
                            if (col.kind === 'money') {
                              return (
                                <td key={col.id} className="nr-r font-mono text-sm">
                                  {val ? formatMoneyFull(val, lang) : '0,00'}
                                </td>
                              )
                            }
                            if (col.kind === 'code') {
                              return (
                                <td key={col.id}>
                                  <span className="nr-code">{val || '—'}</span>
                                </td>
                              )
                            }
                            if (col.kind === 'date') {
                              return (
                                <td key={col.id} className="text-sm">
                                  {val ? formatDate(val, lang) : '—'}
                                </td>
                              )
                            }
                            return (
                              <td key={col.id} className="text-sm">
                                {val || '—'}
                              </td>
                            )
                          })}
                          {data?.nextKind && (
                            <td className="text-right text-muted pr-3">
                              <ChevronRight className="w-4 h-4 inline" />
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {data?.hasMore && (
                <div className="pt-2 pb-2 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setOffset((prev) => prev + 200)}
                    disabled={isFetching}
                    className="nr-btn nr-btn-secondary text-sm flex items-center gap-2"
                  >
                    {isFetching && <Loader2 className="w-4 h-4 animate-spin" />}
                    {lang === 'id' ? 'Muat lebih banyak' : 'Load more'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
