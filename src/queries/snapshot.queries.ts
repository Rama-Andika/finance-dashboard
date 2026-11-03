import { queryOptions } from '@tanstack/react-query'
import { getSnapshotInfoFn } from '~/functions/snapshot.fn'
import { snapshotPollInterval } from '~/lib/finance/ap-ar/snapshot-state'
import { qk } from '~/queries/keys'

export const snapshotInfoOptions = () =>
  queryOptions({
    queryKey: qk.snapshotInfo(),
    queryFn: () => getSnapshotInfoFn(),
    staleTime: 30_000,
    // Once a minute while idle; every few seconds while a refresh runs, so the label and the button follow it.
    refetchInterval: (query) => snapshotPollInterval(query.state.data),
  })
