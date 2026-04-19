/** Infer mapping "current value" hints from exiftool -j metadata (simplified from Qt). */

import { filmCurrentDisplayForStaging, type AutofillSkips } from '@shared/presetDraftFromMetadata.js'
import { filmStockHintFromExifKeywords, formatKeywordsField } from '@shared/filmKeywords.js'
import { clampUtf8ByBytes, fitKeywordsForExif } from '@shared/exifLimits.js'
import type { ConfigCatalog } from '@shared/types.js'

import {
  exposureTimeRawFromMetadata,
  fnumberRawFromMetadata,
  metadataFirstTag
} from '@shared/exifMetadataTags.js'

export { formatExposureTimeForUi, formatFnumberForUi } from '@shared/exifDisplayFormat.js'
export { exposureTimeRawFromMetadata, fnumberRawFromMetadata, metadataFirstTag }

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

/**
 * When multiple files are staged, skip autofill for categories whose Current column would show “Multiple”
 * (same rules as the metadata table: inferred Camera/Lens/Author from {@link inferCategoryValues}, Film from
 * {@link filmCurrentDisplayForStaging}).
 */
export function multiSelectAutofillSkips(
  catalog: ConfigCatalog,
  paths: string[],
  metaByPath: Record<string, Record<string, unknown>>
): AutofillSkips {
  if (paths.length <= 1) return {}
  const filmOpts = catalog.film_values
  const per = paths.map((p) => inferCategoryValues(metaByPath[p] ?? {}, filmOpts))
  const multi = (vals: string[]) => paths.length > 1 && new Set(vals).size > 1
  const inferFilms = paths.map((p) => inferCategoryValues(metaByPath[p] ?? {}, filmOpts).Film ?? '')
  const metas = paths.map((p) => metaByPath[p] ?? {})
  return {
    camera: multi(per.map((x) => x.Camera ?? '')),
    lens: multi(per.map((x) => x.Lens ?? '')),
    film: filmCurrentDisplayForStaging(metas, inferFilms) === 'Multiple',
    author: multi(per.map((x) => x.Author ?? ''))
  }
}
