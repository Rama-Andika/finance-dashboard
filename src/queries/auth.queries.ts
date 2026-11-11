import { queryOptions } from '@tanstack/react-query'
import { getCurrentUserFn } from '~/functions/auth.fn'
import { qk } from '~/queries/keys'

/** How long a signed-in answer is reused, so moving between pages does not ask the server every time. */
const CURRENT_USER_STALE_MS = 60_000

/**
 * The signed-in user. Only a signed-in answer is remembered: "nobody" goes stale at once, so a login is seen on the next
 * navigation. Every server function still checks the session itself; this only saves the extra round trip per page.
 */
export const currentUserOptions = () =>
  queryOptions({
    queryKey: qk.currentUser(),
    queryFn: () => getCurrentUserFn(),
    staleTime: (query) => (query.state.data ? CURRENT_USER_STALE_MS : 0),
  })
