import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/')({
  beforeLoad: ({ search }) => {
    throw redirect({
      to: '/summary',
      search: { ...search, chart: 'ytd' },
    })
  },
})
