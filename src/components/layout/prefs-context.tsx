import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { setPrefsFn } from '~/functions/prefs.fn'

export type Prefs = { theme: 'light' | 'dark'; lang: 'en' | 'id' }

type PrefsContextValue = {
  prefs: Prefs
  setTheme: (theme: Prefs['theme']) => void
  setLang: (lang: Prefs['lang']) => void
}

const PrefsContext = createContext<PrefsContextValue | null>(null)

/**
 * Theme and language apply in the browser immediately; the cookie is saved in the background.
 * No router reload is needed because no page data depends on either (the server sends
 * translation keys, not translated text).
 */
export function PrefsProvider({
  initial,
  children,
}: {
  initial: Prefs
  children: (prefs: Prefs) => ReactNode
}) {
  const [prefs, setPrefs] = useState<Prefs>(initial)

  const save = useCallback((next: Partial<Prefs>, rollback: Partial<Prefs>) => {
    setPrefsFn({ data: next }).catch(() => setPrefs((p) => ({ ...p, ...rollback })))
  }, [])

  const setTheme = useCallback(
    (theme: Prefs['theme']) => {
      setPrefs((p) => {
        save({ theme }, { theme: p.theme })
        return { ...p, theme }
      })
    },
    [save],
  )

  const setLang = useCallback(
    (lang: Prefs['lang']) => {
      setPrefs((p) => {
        save({ lang }, { lang: p.lang })
        return { ...p, lang }
      })
    },
    [save],
  )

  const value = useMemo(() => ({ prefs, setTheme, setLang }), [prefs, setTheme, setLang])
  return <PrefsContext.Provider value={value}>{children(prefs)}</PrefsContext.Provider>
}

export function usePrefs(): PrefsContextValue {
  const ctx = useContext(PrefsContext)
  if (!ctx) throw new Error('usePrefs must be used inside PrefsProvider')
  return ctx
}
