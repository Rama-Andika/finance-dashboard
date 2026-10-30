import React from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'
import { translateCfLabel } from '~/lib/finance/cash/cashflow-labels'
import type { DrillStep } from '~/lib/filters/search-schema'

/** Metric name, then one crumb per drill step; every crumb but the last jumps back to that step. */
export function DrillBreadcrumbs({
  rootTitle,
  steps,
  onGoToSteps,
}: {
  rootTitle: string
  steps: DrillStep[]
  onGoToSteps: (steps: DrillStep[]) => void
}) {
  const { t } = useTranslation()
  return (
    <nav aria-label={t('drill.breadcrumbs')} className="nr-sheet-breadcrumbs">
      <button
        type="button"
        onClick={() => onGoToSteps([])}
        className="hover:text-ink transition underline-offset-2 hover:underline"
      >
        {rootTitle}
      </button>
      {steps.map((step, idx) => {
        const isLast = idx === steps.length - 1
        const label = translateCfLabel(t, step.label)
        return (
          <React.Fragment key={`${step.kind}-${step.id}-${idx}`}>
            <ChevronRight className="w-3.5 h-3.5 text-ink-muted shrink-0" />
            {isLast ? (
              <span className="active truncate max-w-[200px]" title={label}>
                {label}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onGoToSteps(steps.slice(0, idx + 1))}
                className="hover:text-ink transition truncate max-w-[160px] underline-offset-2 hover:underline"
                title={label}
              >
                {label}
              </button>
            )}
          </React.Fragment>
        )
      })}
    </nav>
  )
}
