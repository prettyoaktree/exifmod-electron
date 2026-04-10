import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { resolveLocaleTag } from '@shared/i18n/resolveLocale.js'
import en from '../../../locales/en.json'
import fr from '../../../locales/fr.json'

let inited = false

export async function initRendererI18n(localeHint: string | undefined): Promise<void> {
  if (inited) return
  const lng = resolveLocaleTag(localeHint)
  await i18next.use(initReactI18next).init({
    lng,
    fallbackLng: 'en',
    resources: {
      en: { translation: en as Record<string, unknown> },
      fr: { translation: fr as Record<string, unknown> }
    },
    interpolation: { escapeValue: false }
  })
  document.documentElement.lang = lng
  document.documentElement.dir = 'ltr'
  document.title = i18next.t('app.title')
  inited = true
}

export { i18next }
