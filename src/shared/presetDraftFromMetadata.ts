/**
 * Build preset drafts and catalog-match checks from ExifTool-style metadata objects.
 * Naming aligns with bundled seeds and {@link displayNameForRecord} in the main-process store.
 */

import {
  filmStockKeywordFromDisplayName,
  normalizeFilmPresetPayloadForMerge,
  stripFilmStockSuffix
} from './filmKeywords.js'
import type { ConfigCatalog } from './types.js'

export type PresetInitialDraft = {
  payload: Record<string, unknown>
  lens_system?: 'fixed' | 'interchangeable'
  lens_mount?: string | null
  lens_adaptable?: boolean
  fixed_shutter?: boolean
  fixed_aperture?: boolean
}

/** Promote legacy EXIF lens tags; same rules as PresetEditor migrateLegacyLensFromPayload. */
export function migrateLegacyLensFromExif(meta: Record<string, unknown>): Record<string, unknown> {
  const p = { ...meta }
  const legacy = p['Lens']
  if (legacy != null && String(legacy).trim() !== '') {
    const mk = p['LensMake']
    if (mk == null || String(mk).trim() === '') {
      p['LensMake'] = legacy
    }
  }
  delete p['Lens']

  const lid = p['LensID']
  if (lid != null && String(lid).trim() !== '') {
    const model = p['LensModel']
    if (model == null || String(model).trim() === '') {
      p['LensModel'] = lid
    }
  }
  delete p['LensID']
  return p
}

export function canonicalCameraMakeModel(meta: Record<string, unknown>): { Make: string; Model: string } {
  let make = String(meta['Make'] ?? '').trim()
  let model = String(meta['Model'] ?? '').trim()
  if (!model && make) {
    return { Make: make, Model: make }
  }
  if (!make && model) {
    return { Make: '', Model: model }
  }
  if (!make && !model) {
    return { Make: '', Model: '' }
  }
  const ml = model.toLowerCase()
  const kl = make.toLowerCase()
  if (ml === kl || ml.startsWith(kl + ' ') || ml.startsWith(kl)) {
    return { Make: make, Model: model }
  }
  return { Make: make, Model: `${make} ${model}`.trim() }
}

export function cameraDisplayNameForCatalog(meta: Record<string, unknown>): string {
  const { Model } = canonicalCameraMakeModel(meta)
  return Model.trim()
}

export function canonicalLensMakeModel(meta: Record<string, unknown>): { LensMake: string; LensModel: string } {
  const p = migrateLegacyLensFromExif(meta)
  let lensMake = String(p['LensMake'] ?? '').trim()
  let lensModel = String(p['LensModel'] ?? '').trim()
  if (!lensModel && lensMake) {
    return { LensMake: lensMake, LensModel: lensMake }
  }
  if (!lensMake && lensModel) {
    return { LensMake: '', LensModel: lensModel }
  }
  if (!lensMake && !lensModel) {
    return { LensMake: '', LensModel: '' }
  }
  const ml = lensModel.toLowerCase()
  const kl = lensMake.toLowerCase()
  if (ml === kl || ml.startsWith(kl + ' ') || ml.startsWith(kl)) {
    return { LensMake: lensMake, LensModel: lensModel }
  }
  return { LensMake: lensMake, LensModel: `${lensMake} ${lensModel}`.trim() }
}

export function lensDisplayNameForCatalog(meta: Record<string, unknown>): string {
  const { LensModel } = canonicalLensMakeModel(meta)
  return LensModel.trim()
}

/** Mirrors main `filmNameFromKeywords` (store.ts). */
export function filmStockBaseNameFromMetadata(meta: Record<string, unknown>): string {
  const keywords = meta['Keywords']
  let values: string[] = []
  if (typeof keywords === 'string') values = [keywords]
  else if (Array.isArray(keywords)) values = keywords.map((v) => String(v))
  const hasFilmMarker = values.some((v) => v.trim().toLowerCase() === 'film')
  if (!hasFilmMarker) return ''
  for (const value of values) {
    const n = value.trim()
    if (!n || n.toLowerCase() === 'film') continue
    if (n.includes('Film Stock')) return stripFilmStockSuffix(n)
  }
  for (const value of values) {
    const n = value.trim()
    if (n && n.toLowerCase() !== 'film') return stripFilmStockSuffix(n)
  }
  return ''
}

export function isoStringFromMetadata(meta: Record<string, unknown>): string {
  return String(meta['ISO'] ?? meta['EXIF:ISO'] ?? '').trim()
}

/**
 * Film preset display string as in the catalog (`filmName` or `filmName (ISO n)`), matching store `displayNameForRecord` for film.
 */
export function filmDisplayCandidateFromMetadata(meta: Record<string, unknown>): string {
  const filmName = filmStockBaseNameFromMetadata(meta).trim()
  if (!filmName) return ''
  const iso = isoStringFromMetadata(meta)
  let display = filmName
  if (iso) display = `${display} (ISO ${iso})`.trim()
  return display
}

export function authorIdentityFromMetadata(meta: Record<string, unknown>): string {
  return String(meta['Author Name'] ?? meta['Creator'] ?? meta['Artist'] ?? '').trim()
}

/**
 * `mount.toLowerCase().includes(lensMake.toLowerCase())` — returns the mount iff exactly one match.
 */
export function inferUniqueLensMount(lensMake: string, suggestedMounts: readonly string[]): string | undefined {
  const mk = lensMake.trim()
  if (!mk) return undefined
  const mkl = mk.toLowerCase()
  const hits = suggestedMounts.filter((m) => m.toLowerCase().includes(mkl))
  if (hits.length !== 1) return undefined
  return hits[0]
}

export function catalogHasPresetName(values: readonly string[], candidate: string): boolean {
  const c = candidate.trim().toLowerCase()
  if (!c) return false
  return values.some((v) => v !== 'None' && v.trim().toLowerCase() === c)
}

export function buildCameraPresetDraft(meta: Record<string, unknown>): PresetInitialDraft {
  const { Make, Model } = canonicalCameraMakeModel(meta)
  return {
    payload: { Make, Model },
    lens_system: 'interchangeable',
    lens_mount: null,
    lens_adaptable: false,
    fixed_shutter: false,
    fixed_aperture: false
  }
}

export function buildLensPresetDraft(meta: Record<string, unknown>, suggestedMounts: readonly string[]): PresetInitialDraft {
  const { LensMake, LensModel } = canonicalLensMakeModel(meta)
  const mount = inferUniqueLensMount(LensMake, suggestedMounts)
  const payload: Record<string, unknown> = { LensMake, LensModel }
  if (mount) payload['LensMount'] = mount
  return {
    payload,
    lens_mount: mount ?? null
  }
}

export function buildFilmPresetDraft(meta: Record<string, unknown>): PresetInitialDraft {
  const base = filmStockBaseNameFromMetadata(meta).trim()
  const iso = isoStringFromMetadata(meta)
  const payload: Record<string, unknown> = {}
  if (iso) payload['ISO'] = iso
  if (base) {
    const stockKw = filmStockKeywordFromDisplayName(base)
    payload['Keywords'] = stockKw ? ['film', stockKw] : ['film']
  } else {
    payload['Keywords'] = ['film']
  }
  return {
    payload: normalizeFilmPresetPayloadForMerge(payload)
  }
}

export function buildAuthorPresetDraft(meta: Record<string, unknown>): PresetInitialDraft {
  const id = authorIdentityFromMetadata(meta)
  const payload: Record<string, unknown> = {
    Author: 'Person'
  }
  if (id) {
    payload['Artist'] = id
    payload['Creator'] = id
  }
  const copy = String(meta['Copyright'] ?? '').trim()
  if (copy) payload['Copyright'] = copy
  return { payload }
}

type CategoryMatchState =
  | { kind: 'no_data' }
  | { kind: 'multiple' }
  | { kind: 'matched' }
  | { kind: 'unmatched'; displayName: string; draft: PresetInitialDraft }

function uniformOrMultiple<T>(values: T[], eq: (a: T, b: T) => boolean): 'empty' | 'uniform' | 'multiple' {
  const filtered = values.filter((v) => v != null) as T[]
  if (filtered.length === 0) return 'empty'
  const first = filtered[0]!
  for (let i = 1; i < filtered.length; i++) {
    if (!eq(first, filtered[i]!)) return 'multiple'
  }
  return 'uniform'
}

export function matchStateForCameraCategory(
  catalog: ConfigCatalog,
  metas: Record<string, unknown>[]
): CategoryMatchState {
  const displays = metas.map((m) => cameraDisplayNameForCatalog(m))
  if (displays.every((d) => !d.trim())) return { kind: 'no_data' }
  const u = uniformOrMultiple(displays, (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase())
  if (u === 'multiple') return { kind: 'multiple' }
  const displayName = displays[0]!.trim()
  if (!displayName) return { kind: 'no_data' }
  if (catalogHasPresetName(catalog.camera_values, displayName)) return { kind: 'matched' }
  return { kind: 'unmatched', displayName, draft: buildCameraPresetDraft(metas[0]!) }
}

export function matchStateForLensCategory(
  catalog: ConfigCatalog,
  metas: Record<string, unknown>[],
  suggestedMounts: readonly string[]
): CategoryMatchState {
  const displays = metas.map((m) => lensDisplayNameForCatalog(m))
  if (displays.every((d) => !d.trim())) return { kind: 'no_data' }
  const u = uniformOrMultiple(displays, (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase())
  if (u === 'multiple') return { kind: 'multiple' }
  const displayName = displays[0]!.trim()
  if (!displayName) return { kind: 'no_data' }
  if (catalogHasPresetName(catalog.lens_values, displayName)) return { kind: 'matched' }
  return { kind: 'unmatched', displayName, draft: buildLensPresetDraft(metas[0]!, suggestedMounts) }
}

/**
 * @param inferFilmResolved — value from `inferCategoryValues` for Film (per file), same order as `metas`.
 */
export function filmCurrentDisplayForStaging(
  metas: Record<string, unknown>[],
  inferFilmResolved: string[]
): string {
  const n = metas.length
  if (n === 0) return ''
  if (inferFilmResolved.length !== n) return ''
  const uInfer = uniformOrMultiple(inferFilmResolved, (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase())
  if (uInfer === 'multiple') return 'Multiple'

  const inferred = inferFilmResolved[0]!.trim()
  if (inferred) return inferred

  const candidates = metas.map((m) => filmDisplayCandidateFromMetadata(m))
  const uCand = uniformOrMultiple(candidates, (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase())
  if (uCand === 'multiple') return 'Multiple'
  return candidates[0]!.trim()
}

export function matchStateForFilmCategory(
  catalog: ConfigCatalog,
  metas: Record<string, unknown>[],
  inferFilmResolved: string[]
): CategoryMatchState {
  if (metas.length === 0) return { kind: 'no_data' }
  const display = filmCurrentDisplayForStaging(metas, inferFilmResolved)
  if (display === 'Multiple') return { kind: 'multiple' }
  if (!display.trim()) return { kind: 'no_data' }
  if (catalogHasPresetName(catalog.film_values, display)) return { kind: 'matched' }
  return { kind: 'unmatched', displayName: display, draft: buildFilmPresetDraft(metas[0]!) }
}

export function matchStateForAuthorCategory(catalog: ConfigCatalog, metas: Record<string, unknown>[]): CategoryMatchState {
  const ids = metas.map((m) => authorIdentityFromMetadata(m))
  if (ids.every((d) => !d.trim())) return { kind: 'no_data' }
  const u = uniformOrMultiple(ids, (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase())
  if (u === 'multiple') return { kind: 'multiple' }
  const displayName = ids[0]!.trim()
  if (!displayName) return { kind: 'no_data' }
  if (catalogHasPresetName(catalog.author_values, displayName)) return { kind: 'matched' }
  return { kind: 'unmatched', displayName, draft: buildAuthorPresetDraft(metas[0]!) }
}
