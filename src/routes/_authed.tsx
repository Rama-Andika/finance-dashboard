import { Outlet, createFileRoute, redirect, retainSearchParams } from '@tanstack/react-router'
import { currentUserOptions } from '~/queries/auth.queries'
import { AppShell } from '~/components/layout/AppShell'
import { globalSearchSchema } from '~/lib/filters/search-schema'

export const Route = createFileRoute('/_authed')({
  validateSearch: globalSearchSchema,
  search: {
    middlewares: [retainSearchParams(['entity', 'preset', 'p13', 'from', 'to'])],
  },
  beforeLoad: async ({ location, context }) => {
    const user = await context.queryClient.fetchQuery(currentUserOptions())
    if (!user) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
    return { user }
  },
  component: AuthedLayout,
})

function AuthedLayout() {
  const { user } = Route.useRouteContext()
  return (
    <AppShell user={user}>
      <Outlet />
    </AppShell>
  )
}
