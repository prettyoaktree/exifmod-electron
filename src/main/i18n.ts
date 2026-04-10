import i18next from 'i18next'
import { app } from 'electron'
import { resolveLocaleTag } from '../shared/i18n/resolveLocale.js'
import en from '../../locales/en.json'
import fr from '../../locales/fr.json'

let inited = false

export async function initMainI18n(): Promise<void> {
  if (inited) return
  const lng = resolveLocaleTag(app.getLocale())
  await i18next.init({
    lng,
    fallbackLng: 'en',
    resources: {
      en: { translation: en as Record<string, unknown> },
      fr: { translation: fr as Record<string, unknown> }
    },
    interpolation: { escapeValue: false }
  })
  inited = true
}

export { i18next }
