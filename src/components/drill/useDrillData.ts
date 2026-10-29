import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { drillOptions } from '~/queries/drill.queries'
import { drillSchema, MONTH_KEY_RE, PRESETS, type DrillState, type Preset } from '~/lib/filters/search-schema'

export type DrillSearchParams = {
  entity?: string
  preset?: string
  from?: string
  to?: string
  p13?: boolean
  drill?: unknown
}


export function parseDrill(raw: unknown): DrillState | null {
  if (!raw) return null
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw
    const parsed = drillSchema.safeParse(value)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** Fetches the current drill page and accumulates the rows of "load more" pages. */
export function useDrillData(search: DrillSearchParams, drill: DrillState | null, isOpen: boolean) {
  // Pagination offset & accumulated rows
  const [offset, setOffset] = useState(0)
  const [allRows, setAllRows] = useState<Array<Record<string, string | null>>>([])
  const drillKey = drill ? `${drill.metric}:${drill.steps.map((s) => `${s.kind}-${s.id}`).join('/')}` : ''

  useEffect(() => {
    setOffset(0)
    setAllRows([])
  }, [drillKey])

  const preset: Preset = (PRESETS as readonly string[]).includes(search.preset ?? '')
    ? (search.preset as Preset)
    : 'this-month'

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    ...drillOptions({
      entity: search.entity ?? 'all',
      preset,
      from: MONTH_KEY_RE.test(search.from ?? '') ? search.from : undefined,
      to: MONTH_KEY_RE.test(search.to ?? '') ? search.to : undefined,
      p13: Boolean(search.p13),
      drill: drill ?? { metric: '', steps: [] },
      offset,
    }),
    enabled: isOpen,
  })

  useEffect(() => {
    if (!data?.rows) return
    if (offset === 0) {
      setAllRows(data.rows)
    } else {
      setAllRows((prev) => {
        const seen = new Set(prev.map((r) => r.id))
        return [...prev, ...data.rows.filter((r) => !seen.has(r.id))]
      })
    }
  }, [data?.rows, offset])

  return { offset, setOffset, allRows, data, isLoading, isFetching, error, refetch }
}
