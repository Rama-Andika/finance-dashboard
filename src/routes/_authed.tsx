import { Outlet, createFileRoute, redirect, retainSearchParams } from '@tanstack/react-router'
import { currentUserOptions } from '~/queries/auth.queries'
import { companyInfoOptions } from '~/queries/company.queries'
import { AppShell } from '~/components/layout/AppShell'
import { APP_NAME } from '~/lib/brand'
import { documentTitle } from '~/lib/core/company-name'
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
  // The company name is only decoration: when it cannot be read, the page still opens and shows the app name.
  loader: ({ context }) => context.queryClient.ensureQueryData(companyInfoOptions()).catch(() => null),
  head: ({ loaderData }) => ({ meta: [{ title: documentTitle(loaderData?.name, APP_NAME) }] }),
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
