import { useTranslation } from 'react-i18next'
import { Button } from '~/components/neraca/Button'
import { HORIZONS, type Horizon } from '~/lib/filters/search-schema'

/** Horizon tabs (7 / 14 / 30 days) and the "include inflows" toggle. */
export function PaymentPlanControls({
  horizon,
  inflow,
  onHorizonChange,
  onToggleInflow,
}: {
  horizon: Horizon
  inflow: boolean
  onHorizonChange: (h: Horizon) => void
  onToggleInflow: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <span className="text-xs text-ink-muted font-medium">{t('ui.paymentPlan.horizon')}</span>
        <div className="nr-tabs" role="tablist">
          {HORIZONS.map((h) => (
            <button
              key={h}
              type="button"
              className="nr-tab"
              role="tab"
              aria-selected={horizon === h}
              onClick={() => onHorizonChange(h)}
            >
              {h} {t('ui.paymentPlan.days')}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant={inflow ? 'primary' : 'secondary'} onClick={onToggleInflow}>
          {t('metric.includeInflows')}
        </Button>
      </div>
    </div>
  )
}
