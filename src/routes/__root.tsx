import { useMemo, type ReactNode } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import { I18nextProvider } from 'react-i18next'
import { getPrefsFn } from '~/functions/prefs.fn'
import { createI18n } from '~/i18n'
import appCss from '~/styles/app.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async () => ({
    prefs: await getPrefsFn(),
  }),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Neraca — Finance Dashboard' },
    ],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
      },
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  const { prefs } = Route.useRouteContext()
  const i18nInstance = useMemo(() => createI18n(prefs.lang), [prefs.lang])

  return (
    <html lang={prefs.lang} data-theme={prefs.theme}>
      <head>
        <HeadContent />
      </head>
      <body>
        <I18nextProvider i18n={i18nInstance}>
          {children}
        </I18nextProvider>
        <Scripts />
      </body>
    </html>
  )
}
