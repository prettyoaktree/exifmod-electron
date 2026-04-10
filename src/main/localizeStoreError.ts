import { PresetStoreError } from './exifCore/errors.js'
import { i18next } from './i18n.js'

export function localizePresetStoreMessage(message: string): string {
  const dup = message.match(/^A (\w+) preset named '([^']*)' already exists\.$/)
  if (dup) return i18next.t('store.duplicatePreset', { category: dup[1], name: dup[2] })

  const nf = message.match(/^Preset id=(\d+) was not found\.$/)
  if (nf) return i18next.t('store.presetNotFound', { id: nf[1] })

  const ir = message.match(/^Invalid preset reference: (.+)$/)
  if (ir) return i18next.t('store.invalidPresetRef', { ref: ir[1] })

  if (message.startsWith('Unsupported preset category:')) {
    return i18next.t('store.unsupportedCategory', {
      category: message.slice('Unsupported preset category: '.length)
    })
  }

  if (message === "Camera lens_system must be 'fixed' or 'interchangeable'.") {
    return i18next.t('store.cameraLensSystem')
  }

  if (message === 'Preset name is required.') return i18next.t('store.nameRequired')

  return message
}

export function localizeThrownPresetError(e: unknown): Error {
  if (e instanceof PresetStoreError) {
    return new Error(localizePresetStoreMessage(e.message))
  }
  return e instanceof Error ? e : new Error(String(e))
}
