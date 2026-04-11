/** Infer mapping "current value" hints from exiftool -j metadata (simplified from Qt). */

import { filmStockHintFromExifKeywords, formatKeywordsField } from '@shared/filmKeywords.js'
import { clampUtf8ByBytes, fitKeywordsForExif } from '@shared/exifLimits.js'

export function metadataFirstTag(meta: Record<string, unknown>, candidates: readonly string[]): unknown {
  for (const name of candidates) {
    if (!(name in meta)) continue
    const val = meta[name]
    if (val != null && val !== '') return val
  }
  return undefined
}

const EXPOSURE_TIME_TAGS = ['ExposureTime', 'EXIF:ExposureTime'] as const
const FNUMBER_TAGS = ['FNumber', 'EXIF:FNumber'] as const

export function exposureTimeRawFromMetadata(meta: Record<string, unknown>): unknown {
  const raw = metadataFirstTag(meta, EXPOSURE_TIME_TAGS)
  if (raw != null) return raw
  const comp = meta['Composite:ShutterSpeed']
  if (typeof comp !== 'string') return undefined
  const t = comp.trim()
  if (!t) return undefined
  return t.split(/\s+/)[0]
}

export function fnumberRawFromMetadata(meta: Record<string, unknown>): unknown {
  const raw = metadataFirstTag(meta, FNUMBER_TAGS)
  if (raw != null) return raw
  const comp = meta['Composite:FNumber']
  if (typeof comp === 'string') {
    const t = comp.trim()
    if (t.toLowerCase().startsWith('f/')) return t.slice(2).trim() || undefined
    return t || undefined
  }
  return comp
}

export function formatExposureTimeForUi(value: unknown): string {
  if (value == null || value === '') return ''
  if (typeof value === 'boolean') return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') {
    const v = Number(value)
    if (v <= 0) return ''
    const s = v.toFixed(12).replace(/\.?0+$/, '')
    return s || String(v)
  }
  return String(value).trim()
}

export function formatFnumberForUi(value: unknown): string {
  if (value == null || value === '') return ''
  if (typeof value === 'boolean') return ''
  if (typeof value === 'string') {
    const t = value.trim()
    if (!t) return ''
    const n = Number(t)
    if (Number.isFinite(n)) return formatFnumberForUi(n)
    return t
  }
  if (typeof value === 'number') {
    const v = Number(value)
    if (v <= 0) return ''
    if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v))
    return String(v)
  }
  return String(value).trim()
}

/** Keywords as written in the main window field (comma-separated). */
export function keywordsFieldFromMetadata(meta: Record<string, unknown>): string {
  const k = meta['Keywords']
  const arr: string[] =
    typeof k === 'string'
      ? k.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
      : Array.isArray(k)
        ? k.map((v) => String(v).trim()).filter(Boolean)
        : []
  return formatKeywordsField(fitKeywordsForExif(arr))
}

export function imageDescriptionFromMetadata(meta: Record<string, unknown>): string {
  const raw = metadataFirstTag(meta, ['ImageDescription', 'EXIF:ImageDescription'] as const)
  if (raw == null) return ''
  const s = String(raw).trim()
  if (!s) return ''
  return clampUtf8ByBytes(s)
}

export function inferCategoryValues(
  meta: Record<string, unknown>,
  filmOptions: string[]
): Record<string, string> {
  let keywords = meta['Keywords']
  const keywordValues: string[] =
    typeof keywords === 'string'
      ? [keywords]
      : Array.isArray(keywords)
        ? keywords.map((v) => String(v))
        : []

  const filmOpts = filmOptions.filter((o) => o !== 'None')
  let filmFromKeywords = ''
  const stockHint = filmStockHintFromExifKeywords(keywordValues)
  const metadataIso = String(meta['ISO'] ?? '').trim()

  if (stockHint) {
    const parsed = filmOpts.map((option) => {
      let baseName = option
      let optionIso = ''
      if (option.includes(' (ISO ') && option.endsWith(')')) {
        const idx = option.lastIndexOf(' (ISO ')
        baseName = option.slice(0, idx)
        optionIso = option.slice(idx + 6, -1).trim()
      }
      return { full: option, base: baseName.trim(), iso: optionIso }
    })

    const filmNameKeywords = [stockHint]
    for (const keyword of filmNameKeywords) {
      const kl = keyword.toLowerCase()
      for (const { full, base, iso } of parsed) {
        if (base.toLowerCase() === kl) {
          if (metadataIso && iso && iso === metadataIso) {
            filmFromKeywords = full
            break
          }
        }
      }
      if (filmFromKeywords) break
    }
    if (!filmFromKeywords) {
      for (const keyword of filmNameKeywords) {
        const kl = keyword.toLowerCase()
        for (const { full, base } of parsed) {
          if (base.toLowerCase() === kl) {
            filmFromKeywords = full
            break
          }
        }
        if (filmFromKeywords) break
      }
    }
    if (!filmFromKeywords) {
      for (const keyword of filmNameKeywords) {
        const kl = keyword.toLowerCase()
        for (const { full, base } of parsed) {
          const bl = base.toLowerCase()
          if (kl.includes(bl) || bl.includes(kl)) {
            filmFromKeywords = full
            break
          }
        }
        if (filmFromKeywords) break
      }
    }
  }

  const lensModelHint =
    metadataFirstTag(meta, ['LensModel', 'Lens', 'EXIF:LensModel'] as const) ?? ''

  return {
    Camera: String(meta['Model'] ?? meta['Make'] ?? ''),
    Lens: String(lensModelHint),
    Film: filmFromKeywords,
    Author: String(meta['Author Name'] ?? meta['Creator'] ?? meta['Artist'] ?? '')
  }
}
