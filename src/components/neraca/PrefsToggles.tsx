import { Sun, Moon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usePrefs } from '~/components/layout/prefs-context'

/** Light/dark switch; shows the icon of the theme you would switch to. */
export function ThemeToggle() {
  const { prefs, setTheme } = usePrefs()
  const { t } = useTranslation()
  const isLight = prefs.theme === 'light'

  return (
    <button
      type="button"
      onClick={() => setTheme(isLight ? 'dark' : 'light')}
      className="nr-btn nr-btn-icon"
      aria-label={isLight ? t('ui.shell.switchToDark') : t('ui.shell.switchToLight')}
    >
      {isLight ? (
        <Moon className="nr-icon" size={18} strokeWidth={1.75} />
      ) : (
        <Sun className="nr-icon" size={18} strokeWidth={1.75} />
      )}
    </button>
  )
}

/** EN/ID switch; the label is the current language. */
export function LangToggle() {
  const { prefs, setLang } = usePrefs()
  const { t } = useTranslation()

  return (
    <button
      type="button"
      onClick={() => setLang(prefs.lang === 'en' ? 'id' : 'en')}
      className="nr-btn h-9 px-2.5 text-xs font-semibold"
      aria-label={t('ui.shell.switchLanguage')}
    >
      {prefs.lang.toUpperCase()}
    </button>
  )
}
