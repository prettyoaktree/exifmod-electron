import { i18next } from '../i18n.js'
import {
  clampUtf8ByBytes,
  IMAGEDESCRIPTION_MAX_UTF8_BYTES,
  utf8ByteLength
} from '@shared/exifLimits.js'

export { clampUtf8ByBytes, utf8ByteLength }

const EXPOSURE_TIME_CHARS = /^[\d\s./]+$/

export function validateExposureTimeForExif(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (!EXPOSURE_TIME_CHARS.test(trimmed)) {
    return i18next.t('validation.exposureTime')
  }
  return null
}

export function validateFnumberForExif(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n <= 0) {
    return i18next.t('validation.fNumber')
  }
  return null
}

export function validateImageDescriptionForExif(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const n = utf8ByteLength(trimmed)
  if (n > IMAGEDESCRIPTION_MAX_UTF8_BYTES) {
    return i18next.t('validation.imageDescriptionBytes', { bytes: n, max: IMAGEDESCRIPTION_MAX_UTF8_BYTES })
  }
  return null
}
