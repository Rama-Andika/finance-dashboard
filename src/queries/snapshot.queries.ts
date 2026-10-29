import { queryOptions } from '@tanstack/react-query'
import { getSnapshotInfoFn } from '~/functions/snapshot.fn'

export const snapshotInfoOptions = () =>
  queryOptions({
    queryKey: ['snapshot-info'],
    queryFn: () => getSnapshotInfoFn(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
