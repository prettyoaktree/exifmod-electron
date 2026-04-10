import { i18next } from '../i18n.js'

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

const IMAGEDESCRIPTION_MAX = 999

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

export function clampUtf8ByBytes(text: string, maxBytes: number = IMAGEDESCRIPTION_MAX): string {
  if (maxBytes <= 0) return ''
  const enc = new TextEncoder()
  const raw = enc.encode(text)
  if (raw.length <= maxBytes) return text
  let cut = maxBytes
  while (cut > 0 && (raw[cut - 1]! & 0xc0) === 0x80) cut--
  return new TextDecoder('utf-8', { fatal: false }).decode(raw.slice(0, cut))
}

export function validateImageDescriptionForExif(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const n = utf8ByteLength(trimmed)
  if (n > IMAGEDESCRIPTION_MAX) {
    return i18next.t('validation.imageDescriptionBytes', { bytes: n, max: IMAGEDESCRIPTION_MAX })
  }
  return null
}
