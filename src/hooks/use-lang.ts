import { useTranslation } from 'react-i18next'
import type { Lang } from '~/lib/core/types'

/** The language of the interface as the two codes the formatters know ('en' or 'id'). */
export function useLang(): Lang {
  const { i18n } = useTranslation()
  return i18n.language?.startsWith('en') ? 'en' : 'id'
}
