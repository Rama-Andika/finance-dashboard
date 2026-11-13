import { queryOptions } from '@tanstack/react-query'
import { getAppVersionFn } from '~/functions/app-version.fn'
import { qk } from '~/queries/keys'

/**
 * A light round trip to the server. It is asked again when the tab becomes visible again (and the answer is more than
 * 30 seconds old); the point is the X-App-Version header of the response, which src/start.ts passes to the version store.
 */
export const appVersionOptions = () =>
  queryOptions({
    queryKey: qk.appVersion(),
    queryFn: () => getAppVersionFn(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
