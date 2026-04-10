import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import './App.css'
import { initRendererI18n } from './i18n.js'
import { resolveLocaleTag } from '@shared/i18n/resolveLocale.js'

async function bootstrap(): Promise<void> {
  let hint: string | undefined
  try {
    hint = await window.exifmod?.getLocale?.()
  } catch {
    hint = undefined
  }
  await initRendererI18n(hint ?? resolveLocaleTag(navigator.language))

  const el = document.getElementById('root')
  if (el) {
    createRoot(el).render(
      <StrictMode>
        <App />
      </StrictMode>
    )
  }
}

void bootstrap()
