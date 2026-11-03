import { useNavigate } from '@tanstack/react-router'
import { searchUpdater } from '~/lib/filters/search-update'
import type { DrillStep, DrillStepKind, DrillState } from '~/lib/filters/search-schema'

type SearchUpdater = (prev: Record<string, unknown>) => Record<string, unknown>
type DrillRow = Record<string, string | null>

/** Moving through the drill levels: the drill lives in the URL, so every move is a search update. */
export function useDrillNavigation(drill: DrillState | null, nextKind: DrillStepKind | null | undefined) {
  const navigate = useNavigate()

  const updateSearch = (updater: SearchUpdater) => {
    // Opening or stepping through a drill must not scroll the page behind the sheet to the top
    navigate({ to: '.', search: searchUpdater(updater), resetScroll: false })
  }

  const close = () => {
    updateSearch((prev) => {
      const next = { ...prev }
      delete next.drill
      return next
    })
  }

  const goToSteps = (steps: DrillStep[]) => {
    if (!drill) return
    if (steps.length === 0) {
      close()
      return
    }
    updateSearch((prev) => ({ ...prev, drill: { metric: drill.metric, steps } }))
  }

  const back = () => {
    if (drill) goToSteps(drill.steps.slice(0, -1))
  }

  /** Opens the next level for the clicked row (nothing happens on the last level). */
  const drillInto = (row: DrillRow) => {
    if (!drill || !nextKind) return
    const label = row.name || row.label || row.code || row.docNumber || row.invoiceNumber || row.id || ''
    goToSteps([...drill.steps, { kind: nextKind, id: row.id || '', label: label.slice(0, 200) }])
  }

  return { close, goToSteps, back, drillInto }
}
