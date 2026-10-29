import React from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, ArrowRight, X, AlertTriangle } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle } from '~/components/ui/sheet'
import { Notice } from '~/components/neraca/Notice'
import { Skeleton } from '~/components/neraca/Skeleton'
import { useGlobalMetricInput } from '~/components/layout/useGlobalMetricInput'
import { dataChecksOptions } from '~/queries/data-checks.queries'
import { formatMoneyFull } from '~/lib/format/number'
import type { Lang } from '~/lib/finance/types'

export interface DataChecksPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DataChecksPanel({ open, onOpenChange }: DataChecksPanelProps) {
  const search = useSearch({ strict: false }) as { entity?: string; preset?: string; p13?: boolean }
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const lang = (i18n.language?.startsWith('en') ? 'en' : 'id') as Lang

  const queryInput = useGlobalMetricInput()

  const { data: checks, isLoading, error } = useQuery({
    ...dataChecksOptions(queryInput),
    enabled: open,
  })

  const handleNavigateTo = (link: string) => {
    onOpenChange(false)
    // Keep the global filters (entity, period) when jumping to the related page.
    const keep = (prev: Record<string, unknown>) => prev
    navigate({ to: link, search: keep as never })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl md:max-w-2xl p-0 flex flex-col gap-0 border-l border-line bg-surface overflow-hidden"
        showCloseButton={false}
      >
        <SheetTitle className="sr-only">
          {t('dataChecks.title')}
        </SheetTitle>

        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-warning/10 text-warning flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink m-0">
                {t('dataChecks.title')}
              </h2>
              <span className="text-xs text-ink-muted">
                {checks ? t('ui.shell.findingsCount', { count: checks.length }) : t('ui.shell.checking')}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-1.5 rounded text-ink-muted hover:text-ink hover:bg-canvas transition"
            aria-label={t('ui.shell.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          ) : error ? (
            <Notice
              tone="danger"
              title={t('ui.shell.loadFailed')}
              body={error instanceof Error ? error.message : t('ui.shell.systemError')}
            />
          ) : !checks || checks.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-positive/10 text-positive mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-medium text-ink">
                {t('ui.shell.dataChecksEmptyTitle')}
              </h3>
              <p className="text-xs text-ink-muted max-w-sm mx-auto">
                {t('ui.shell.dataChecksEmptyBody')}
              </p>
            </div>
          ) : (
            checks.map((item) => {
              const formattedAmount = item.amount ? formatMoneyFull(item.amount, lang) : ''
              const title = t(`dataChecks.${item.code}.title`, item.code)
              const body = t(`dataChecks.${item.code}.body`, {
                count: item.count,
                amount: formattedAmount,
              })

              return (
                <div key={item.code} className="space-y-2">
                  <Notice
                    tone={item.level}
                    title={title}
                    body={body}
                  />
                  <div className="flex justify-end pr-1">
                    <button
                      type="button"
                      onClick={() => handleNavigateTo(item.link)}
                      className="text-xs font-semibold text-forest hover:text-forest-strong inline-flex items-center gap-1 transition underline-offset-2 hover:underline"
                    >
                      {t('dataChecks.viewDetail')}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
