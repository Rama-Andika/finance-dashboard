import { safeRedirectSchema } from '~/lib/filters/safe-redirect'
import { AppFooter } from '~/components/layout/AppFooter'
import { APP_NAME } from '~/lib/brand'
import { useState, type FormEvent } from 'react'
import { createFileRoute, useRouter, redirect } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { getCurrentUserFn, loginFn } from '~/functions/auth.fn'
import { Button } from '~/components/neraca/Button'
import { Notice } from '~/components/neraca/Notice'
import { ThemeToggle, LangToggle } from '~/components/neraca/PrefsToggles'

const searchSchema = z.object({
  redirect: safeRedirectSchema,
})

export const Route = createFileRoute('/login')({
  validateSearch: searchSchema,
  beforeLoad: async ({ search }) => {
    const user = await getCurrentUserFn()
    if (user) {
      throw redirect({ href: search.redirect })
    }
  },
  component: LoginPage,
})

function LoginPage() {
  const router = useRouter()
  const search = Route.useSearch()
  const { t } = useTranslation()

  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<'invalid' | 'tooMany' | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const resolvedLoginId =
      loginId.trim() || (form.elements.namedItem('loginId') as HTMLInputElement)?.value.trim() || ''
    const resolvedPassword = password || (form.elements.namedItem('password') as HTMLInputElement)?.value || ''
    if (!resolvedLoginId || !resolvedPassword) return

    setIsSubmitting(true)
    setError(null)

    try {
      const res = await loginFn({
        data: {
          loginId: resolvedLoginId,
          password: resolvedPassword,
        },
      })

      if (!res.ok) {
        setError(res.error)
        setIsSubmitting(false)
        return
      }

      await router.invalidate()
      router.history.push(search.redirect)
    } catch {
      setError('invalid')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col justify-center items-center p-4 relative">
      {/* Quick theme and language switches in header/corner */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <ThemeToggle />
        <LangToggle />
      </div>

      <div className="w-full max-w-sm flex flex-col items-center">
        {/* Brand */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-ink">{APP_NAME}</h1>
          <p className="text-sm text-ink-muted mt-1">{t('auth.title')}</p>
        </div>

        {/* Card */}
        <div className="nr-card w-full p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Notice tone="danger" title={error === 'tooMany' ? t('auth.tooMany') : t('auth.invalid')} />}

            <div className="space-y-1">
              <label htmlFor="loginId" className="block text-xs font-semibold text-ink-muted uppercase tracking-wider">
                {t('auth.loginId')}
              </label>
              <input
                id="loginId"
                name="loginId"
                type="text"
                autoComplete="username"
                required
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                className="nr-input w-full"
                disabled={isSubmitting}
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="password" className="block text-xs font-semibold text-ink-muted uppercase tracking-wider">
                {t('auth.password')}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="nr-input w-full"
                disabled={isSubmitting}
              />
            </div>

            <div className="pt-2">
              <Button type="submit" variant="primary" className="w-full justify-center" disabled={isSubmitting}>
                {isSubmitting ? '...' : t('auth.submit')}
              </Button>
            </div>
          </form>
        </div>
        <AppFooter className="mt-6" />
      </div>
    </div>
  )
}
