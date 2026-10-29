import { Outlet, createFileRoute, redirect, retainSearchParams } from '@tanstack/react-router'
import { getCurrentUserFn } from '~/functions/auth.fn'
import { AppShell } from '~/components/layout/AppShell'
import { globalSearchSchema } from '~/lib/filters/search-schema'

export const Route = createFileRoute('/_authed')({
  validateSearch: globalSearchSchema,
  search: {
    middlewares: [retainSearchParams(['entity', 'preset', 'p13', 'from', 'to'])],
  },
  beforeLoad: async ({ location }) => {
    const user = await getCurrentUserFn()
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
