import i18next, { type i18n } from 'i18next'
import { initReactI18next } from 'react-i18next'
import type { Lang } from '~/lib/core/types'
import en from './locales/en.json'
import id from './locales/id.json'

/** Create a new instance per root render (SSR-safe: no state shared between requests). */
export function createI18n(lang: Lang): i18n {
  const instance = i18next.createInstance()
  void instance.use(initReactI18next).init({
    lng: lang,
    fallbackLng: 'en',
    resources: { en: { translation: en }, id: { translation: id } },
    interpolation: { escapeValue: false },
    initAsync: false, // synchronous init (called `initImmediate` in older i18next versions)
  })
  return instance
}
