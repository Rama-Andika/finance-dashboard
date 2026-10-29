import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  // The QueryClient MUST be created inside getRouter (one per SSR request), never at module level.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
  })
  const router = createRouter({
    routeTree,
    context: { queryClient },
    // Hover/touch must not start a heavy report that nobody opened; pages load when they are visited.
    defaultPreload: false,
    scrollRestoration: true,
  })
  setupRouterSsrQueryIntegration({ router, queryClient })
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
