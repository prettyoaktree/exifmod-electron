import { filmStockDisplayFromKeywordsPayload } from '@shared/filmKeywords.js'
import type { Cat } from './categories.js'

function trimNonEmpty(s: string): boolean {
  return s.trim().length > 0
}

function authorIdentityFromPayload(p: Record<string, unknown>): string {
  return String(p['Artist'] ?? p['Creator'] ?? '').trim()
}

export type PresetEditorValidationInput = {
  category: Cat
  name: string
  payload: Record<string, unknown>
  lensSystem: 'fixed' | 'interchangeable'
  lensMount: string
}

/**
 * @returns i18n key under `presetEditor.*` if invalid, else `null`.
 */
export function validatePresetEditorInput(input: PresetEditorValidationInput): string | null {
  const { category, name, payload, lensSystem, lensMount } = input

  if (!trimNonEmpty(name)) {
    return 'presetEditor.validationPresetNameRequired'
  }

  if (category === 'Camera') {
    if (!trimNonEmpty(String(payload['Make'] ?? ''))) {
      return 'presetEditor.validationCameraMakeRequired'
    }
    if (!trimNonEmpty(String(payload['Model'] ?? ''))) {
      return 'presetEditor.validationCameraModelRequired'
    }
    if (lensSystem === 'interchangeable' && !trimNonEmpty(lensMount)) {
      return 'presetEditor.validationCameraLensMountRequired'
    }
    return null
  }

  if (category === 'Lens') {
    if (!trimNonEmpty(String(payload['LensMake'] ?? ''))) {
      return 'presetEditor.validationLensMakeRequired'
    }
    if (!trimNonEmpty(String(payload['LensModel'] ?? ''))) {
      return 'presetEditor.validationLensModelRequired'
    }
    return null
  }

  if (category === 'Film') {
    const stock = filmStockDisplayFromKeywordsPayload(payload).trim()
    if (!stock) {
      return 'presetEditor.validationFilmStockRequired'
    }
    return null
  }

  if (category === 'Author') {
    if (!trimNonEmpty(authorIdentityFromPayload(payload))) {
      return 'presetEditor.validationAuthorIdentityRequired'
    }
    return null
  }

  return null
}
