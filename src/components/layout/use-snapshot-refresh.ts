import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { startSnapshotRefreshFn } from '~/functions/snapshot.fn'
import { isSnapshotRefreshing } from '~/lib/finance/ap-ar/snapshot-state'
import { snapshotInfoOptions } from '~/queries/snapshot.queries'

/** Why a press of the button did not start a refresh; shown under the button. */
export type RefreshNotice = { kind: 'cooldown'; seconds: number } | { kind: 'unavailable' } | { kind: 'error' }

/** Queries that show numbers built from the snapshot tables; reloaded (when on screen) once a refresh is over. */
const DATA_QUERY_KEYS = [['metric'], ['drill'], ['data-checks']] as const

/**
 * State of the "Refresh now" button: whether it is shown, whether a refresh is in progress, the message after a refused
 * press, and the press itself. When the run this tab started is over, the numbers on screen are reloaded.
 */
export function useSnapshotRefresh() {
  const queryClient = useQueryClient()
  const { data } = useQuery(snapshotInfoOptions())
  const [notice, setNotice] = useState<RefreshNotice | null>(null)
  // Runs that had finished when the user pressed the button; null while this tab is not waiting for a run.
  const runsAtPress = useRef<number | null>(null)

  const refreshing = isSnapshotRefreshing(data)
  const finishedRuns = data?.job.finishedRuns ?? 0

  const mutation = useMutation({
    mutationFn: () => startSnapshotRefreshFn(),
    onSuccess: (result) => {
      if (result.status === 'cooldown') {
        runsAtPress.current = null
        setNotice({ kind: 'cooldown', seconds: result.retryAfterSeconds })
      } else if (result.status === 'unavailable') {
        runsAtPress.current = null
        setNotice({ kind: 'unavailable' })
      } else {
        // started, or a run was already going: follow it
        void queryClient.invalidateQueries({ queryKey: snapshotInfoOptions().queryKey })
      }
    },
    onError: () => {
      runsAtPress.current = null
      setNotice({ kind: 'error' })
    },
  })

  useEffect(() => {
    if (runsAtPress.current === null || refreshing || finishedRuns === runsAtPress.current) return
    runsAtPress.current = null
    for (const queryKey of DATA_QUERY_KEYS) void queryClient.invalidateQueries({ queryKey })
  }, [refreshing, finishedRuns, queryClient])

  // The cooldown message names a number of seconds; drop it once they are over so it does not go stale.
  useEffect(() => {
    if (notice?.kind !== 'cooldown') return
    const timer = setTimeout(() => setNotice(null), notice.seconds * 1000)
    return () => clearTimeout(timer)
  }, [notice])

  const press = () => {
    setNotice(null)
    runsAtPress.current = queryClient.getQueryData(snapshotInfoOptions().queryKey)?.job.finishedRuns ?? 0
    mutation.mutate()
  }

  return { canRefresh: data?.canRefresh === true, busy: refreshing || mutation.isPending, notice, press }
}
