/**
 * Compare a proposed exiftool write payload to metadata already read from a file,
 * so preview / "pending write" only reflect tags that would actually change.
 * Used by renderer UI and by catalog preset ↔ file matching.
 */

import { formatCopyrightForExif, withCopyrightAsWrittenToExif } from './copyrightFormat.js'
import { authorIdentityFromMetadata } from './authorIdentity.js'
import { parseExposureTimeToSeconds } from './exifDisplayFormat.js'
import { fitKeywordsForExif } from './exifLimits.js'
import { extractFilmIdentityKeywords, normalizeFilmPresetPayloadForMerge, stripFilmStockSuffix } from './filmKeywords.js'
import {
  exposureTimeRawFromMetadata,
  fnumberRawFromMetadata,
  keywordValuesFromMetadata,
  metadataFirstTag
} from './exifMetadataTags.js'
import { scalarStringFromExiftoolJson } from './exiftoolJsonScalar.js'

function normalizeKeywordList(v: unknown): string[] {
  if (v == null) return []
  if (typeof v === 'string') return v.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
  return []
}

/** Normalized form for keyword diff equality (case-insensitive multiset). */
function keywordTokenForCompare(token: string): string {
  return token.trim().toLowerCase()
}

/**
 * Lightroom / other tools sometimes add both `… Film Stock` and a shorter duplicate of the same stock name.
 * For diff purposes, drop the bare token when a `… film stock` token covers it (same base name).
 */
function dedupeFilmStockShadowKeywords(lowerCased: Set<string>): void {
  for (const t of [...lowerCased]) {
    if (!t.endsWith(' film stock')) continue
    const base = stripFilmStockSuffix(t).toLowerCase().trim()
    if (base && lowerCased.has(base)) lowerCased.delete(base)
  }
}

function keywordMultisetNormalized(tokens: string[]): string[] {
  const lowered = fitKeywordsForExif(tokens)
    .map((x) => keywordTokenForCompare(x))
    .filter(Boolean)
  const set = new Set(lowered)
  dedupeFilmStockShadowKeywords(set)
  return [...set].sort((x, y) => x.localeCompare(y, 'en'))
}

/** Keywords from exiftool -j (tag names vary by file). */
function keywordsFromFileMeta(meta: Record<string, unknown>): string[] {
  const merged = keywordValuesFromMetadata(meta)
  if (merged.length > 0) return normalizeKeywordList(merged)
  const mwg = meta['MWG:Keywords']
  if (mwg == null || mwg === '') return []
  return normalizeKeywordList(mwg)
}

/** Same effective keywords after fit (merge order can differ from on-disk order; compare case-insensitively). */
function keywordListsEquivalent(proposed: unknown, meta: Record<string, unknown>): boolean {
  const p =
    proposed === ''
      ? []
      : Array.isArray(proposed)
        ? proposed.map((x) => String(x))
        : []
  const fromFile = keywordsFromFileMeta(meta)
  const sa = keywordMultisetNormalized(p)
  const sb = keywordMultisetNormalized(fromFile)
  if (sa.length !== sb.length) return false
  return sa.every((s, i) => s === sb[i]!)
}

function strTrimEq(a: unknown, b: unknown): boolean {
  return String(a ?? '').trim() === String(b ?? '').trim()
}

/** Unicode / whitespace normalization for comparing ExifTool strings to merged preset values. */
function normalizeLooseScalar(s: string): string {
  return s.normalize('NFKC').replace(/\s+/g, ' ').trim()
}

function looseStrEq(a: string, b: string): boolean {
  return normalizeLooseScalar(a) === normalizeLooseScalar(b)
}

/** First non-empty flattened string for tag priority lists (Author/Creator/Artist). */
function metadataScalarString(meta: Record<string, unknown>, keys: readonly string[]): string {
  for (const k of keys) {
    if (!(k in meta)) continue
    const s = scalarStringFromExiftoolJson(meta[k])
    if (s) return s
  }
  return ''
}

const COPYRIGHT_TAG_CANDIDATES = [
  'Copyright',
  'EXIF:Copyright',
  'XMP:Rights',
  'IPTC:Copyright',
  'Rights'
] as const

function copyrightStringsFromMeta(meta: Record<string, unknown>): string[] {
  const out: string[] = []
  for (const k of COPYRIGHT_TAG_CANDIDATES) {
    if (!(k in meta)) continue
    const s = scalarStringFromExiftoolJson(meta[k])
    if (s) out.push(s)
  }
  return out
}

/** Many cameras / Lightroom put only the photographer name in EXIF Copyright; preset stores full © notice. */
function thinPhotographerCreditLine(s: string): boolean {
  const t = s.trim()
  if (!t) return false
  if (/©|\(c\)/i.test(t)) return false
  return t.length <= 200
}

function copyrightMatches(proposed: unknown, meta: Record<string, unknown>): boolean {
  const p = String(proposed ?? '').trim()
  const fromFile = copyrightStringsFromMeta(meta)
  if (!p && fromFile.length === 0) return true
  if (!p) return false
  const pEff = formatCopyrightForExif(p) ?? ''
  const pNorm = normalizeLooseScalar(pEff || p)
  for (const c of fromFile) {
    const cEff = formatCopyrightForExif(c) ?? ''
    const cNorm = normalizeLooseScalar(cEff || c)
    if (pNorm === cNorm) return true
    if (strTrimEq(pEff, c) || strTrimEq(p, cEff) || strTrimEq(p, c)) return true
    if (looseStrEq(pEff, c) || looseStrEq(p, cEff)) return true
    if (thinPhotographerCreditLine(c) && pNorm.includes(normalizeLooseScalar(c))) return true
  }
  return false
}

const CREATOR_TAG_CANDIDATES = [
  'Creator',
  'EXIF:Creator',
  'XMP:Creator',
  'XMP-dc:Creator'
] as const
const ARTIST_TAG_CANDIDATES = ['Artist', 'EXIF:Artist', 'XMP:Artist'] as const
const AUTHOR_TAG_CANDIDATES = ['Author', 'EXIF:Author', 'XMP:Author'] as const

function authorTagMatches(proposed: unknown, meta: Record<string, unknown>): boolean {
  const onDisk = metadataScalarString(meta, AUTHOR_TAG_CANDIDATES)
  if (strTrimEq(String(proposed ?? '').trim(), 'Person') && !onDisk) {
    return true
  }
  return looseStrEq(String(proposed ?? ''), onDisk)
}

function valueMatchesAcrossKeys(
  proposed: unknown,
  meta: Record<string, unknown>,
  keys: readonly string[]
): boolean {
  const p = String(proposed ?? '').trim()
  if (!p) {
    for (const k of keys) {
      if (!(k in meta)) continue
      if (scalarStringFromExiftoolJson(meta[k])) return false
    }
    return true
  }
  for (const k of keys) {
    if (!(k in meta)) continue
    const s = scalarStringFromExiftoolJson(meta[k])
    if (s && looseStrEq(p, s)) return true
  }
  return false
}

function creatorTagMatches(proposed: unknown, meta: Record<string, unknown>): boolean {
  if (valueMatchesAcrossKeys(proposed, meta, CREATOR_TAG_CANDIDATES)) return true
  const p = String(proposed ?? '').trim()
  if (!p) return false
  return looseStrEq(p, authorIdentityFromMetadata(meta))
}

function artistTagMatches(proposed: unknown, meta: Record<string, unknown>): boolean {
  if (valueMatchesAcrossKeys(proposed, meta, ARTIST_TAG_CANDIDATES)) return true
  const p = String(proposed ?? '').trim()
  if (!p) return false
  return looseStrEq(p, authorIdentityFromMetadata(meta))
}

/**
 * Preset payloads may use decimal seconds; exiftool often returns rationals like `1/60`.
 * Prefer exact string match (legacy behavior), then numeric seconds equivalence.
 */
function exposureTimeMatches(proposed: unknown, meta: Record<string, unknown>): boolean {
  const raw = exposureTimeRawFromMetadata(meta)
  const pStr = String(proposed ?? '').trim()
  if (!pStr) return raw == null || String(raw ?? '').trim() === ''
  if (strTrimEq(proposed, raw)) return true
  const pSec = parseExposureTimeToSeconds(proposed)
  const mSec = parseExposureTimeToSeconds(raw)
  if (pSec != null && mSec != null) {
    const tol = Math.max(1e-15, Math.max(pSec, mSec) * 1e-10)
    return Math.abs(pSec - mSec) <= tol
  }
  return false
}

function numLikeEq(proposed: unknown, meta: unknown): boolean {
  const p = Number(proposed)
  const m = Number(meta)
  if (Number.isFinite(p) && Number.isFinite(m)) return Math.abs(p - m) < 1e-5
  return strTrimEq(proposed, meta)
}

function stringFieldMatches(key: string, proposed: unknown, meta: Record<string, unknown>): boolean {
  const cur = metadataFirstTag(meta, [key, `EXIF:${key}`] as const)
  return strTrimEq(proposed, cur ?? '')
}

function tagMatches(key: string, proposed: unknown, meta: Record<string, unknown>): boolean {
  if (proposed === undefined) return true

  switch (key) {
    case 'Keywords':
      return keywordListsEquivalent(proposed, meta)
    case 'ImageDescription':
      return strTrimEq(
        proposed,
        metadataFirstTag(meta, ['ImageDescription', 'EXIF:ImageDescription'] as const)
      )
    case 'Copyright':
      return copyrightMatches(proposed, meta)
    case 'ExposureTime':
      return exposureTimeMatches(proposed, meta)
    case 'FNumber':
      return fnumberMatches(proposed, meta)
    case 'ISO':
      return numLikeEq(proposed, metadataFirstTag(meta, ['ISO', 'EXIF:ISO'] as const))
    case 'FocalLength':
      return numLikeEq(proposed, metadataFirstTag(meta, ['FocalLength', 'EXIF:FocalLength'] as const))
    case 'Make':
    case 'Model':
    case 'LensMake':
    case 'LensModel':
      return stringFieldMatches(key, proposed, meta)
    case 'Artist':
      return artistTagMatches(proposed, meta)
    case 'Creator':
      return creatorTagMatches(proposed, meta)
    case 'Author':
      return authorTagMatches(proposed, meta)
    default:
      if (Array.isArray(proposed)) return false
      return stringFieldMatches(key, proposed, meta)
  }
}

function fnumberMatches(proposed: unknown, meta: Record<string, unknown>): boolean {
  const raw = fnumberRawFromMetadata(meta)
  if (proposed === '' || proposed === null || (typeof proposed === 'string' && !proposed.trim())) {
    return raw == null || String(raw).trim() === ''
  }
  return numLikeEq(proposed, raw)
}

/**
 * Subset of `proposed` write payload whose values differ from `fileMetadata` (last exiftool -j read).
 * Use for preview and to skip no-op writes. `proposed` should match what apply uses (Copyright formatted).
 */
export function diffWritePayloadFromMetadata(
  proposed: Record<string, unknown> | null,
  fileMetadata: Record<string, unknown>
): Record<string, unknown> {
  if (!proposed || Object.keys(proposed).length === 0) return {}
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(proposed)) {
    if (val === undefined) continue
    if (tagMatches(key, val, fileMetadata)) continue
    out[key] = val
  }
  return out
}

/** True if the proposed write would not change any tag compared to file metadata. */
export function writePayloadMatchesFile(
  proposed: Record<string, unknown> | null,
  fileMetadata: Record<string, unknown>
): boolean {
  return Object.keys(diffWritePayloadFromMetadata(proposed, fileMetadata)).length === 0
}

/** UI/catalog-only keys never written as EXIF (same idea as main `stripWriteExcludedFields`). */
const PRESET_PAYLOAD_COMPARE_EXCLUDED = new Set(['Film', 'Film Maker'])

/**
 * True iff every tag defined on the saved preset payload is already represented on the file
 * (same rules as “no pending write” / {@link writePayloadMatchesFile}).
 */
export function presetPayloadSatisfiedByFileMetadata(
  category: 'camera' | 'lens' | 'author' | 'film',
  presetPayload: Record<string, unknown>,
  fileMetadata: Record<string, unknown>
): boolean {
  const stripped: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(presetPayload)) {
    if (PRESET_PAYLOAD_COMPARE_EXCLUDED.has(k)) continue
    stripped[k] = v
  }
  let prepared: Record<string, unknown> = stripped
  if (category === 'film') {
    prepared = normalizeFilmPresetPayloadForMerge({ ...stripped })
  }
  const preview = withCopyrightAsWrittenToExif(prepared)
  if (category === 'film') {
    const copy = { ...preview }
    const rawKw = copy['Keywords']
    delete copy['Keywords']
    if (!writePayloadMatchesFile(copy, fileMetadata)) return false
    if (rawKw === undefined) return true
    const proposedTokens = Array.isArray(rawKw)
      ? rawKw.map((x) => String(x))
      : typeof rawKw === 'string'
        ? rawKw.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
        : []
    const need = extractFilmIdentityKeywords(proposedTokens).map((x) => x.toLowerCase())
    if (need.length === 0) return true
    const have = extractFilmIdentityKeywords(keywordsFromFileMeta(fileMetadata)).map((x) => x.toLowerCase())
    return need.every((token) => have.includes(token))
  }
  return writePayloadMatchesFile(preview, fileMetadata)
}

/** Maps to metadata table row highlights (Camera/Lens/Film/Author + shutter/aperture/notes/keywords). */
export interface DiffAttributeHighlights {
  Camera: boolean
  Lens: boolean
  Film: boolean
  Author: boolean
  shutter: boolean
  aperture: boolean
  notes: boolean
  keywords: boolean
}

export function emptyDiffAttributeHighlights(): DiffAttributeHighlights {
  return {
    Camera: false,
    Lens: false,
    Film: false,
    Author: false,
    shutter: false,
    aperture: false,
    notes: false,
    keywords: false
  }
}

export function mergeDiffAttributeHighlights(a: DiffAttributeHighlights, b: DiffAttributeHighlights): DiffAttributeHighlights {
  return {
    Camera: a.Camera || b.Camera,
    Lens: a.Lens || b.Lens,
    Film: a.Film || b.Film,
    Author: a.Author || b.Author,
    shutter: a.shutter || b.shutter,
    aperture: a.aperture || b.aperture,
    notes: a.notes || b.notes,
    keywords: a.keywords || b.keywords
  }
}

function localExifTagName(key: string): string {
  const i = key.lastIndexOf(':')
  return i >= 0 ? key.slice(i + 1) : key
}

/**
 * Which UI rows should show “pending” styling, from a write diff (output of `diffWritePayloadFromMetadata`).
 * Unknown tag names are ignored so we do not highlight categories when we cannot classify the change.
 */
export function diffToAttributeHighlights(diff: Record<string, unknown>): DiffAttributeHighlights {
  const h = emptyDiffAttributeHighlights()
  for (const rawKey of Object.keys(diff)) {
    const k = localExifTagName(rawKey)
    switch (k) {
      case 'ExposureTime':
      case 'ShutterSpeedValue':
      // Composite:ShutterSpeed, EXIF:ShutterSpeed, etc. (local part after the last `:`)
      case 'ShutterSpeed':
        h.shutter = true
        break
      case 'FNumber':
      case 'ApertureValue':
      // Some toolchains surface aperture under this local name
      case 'Aperture':
        h.aperture = true
        break
      case 'ImageDescription':
        h.notes = true
        break
      // XMP / IPTC local names (after `ns:…`) when diffs use those keys
      case 'Description':
      case 'Caption-Abstract':
        h.notes = true
        break
      case 'Keywords':
        h.keywords = true
        break
      case 'Subject':
      case 'HierarchicalSubject':
        h.keywords = true
        break
      case 'ISO':
      case 'RecommendedExposureIndex':
      case 'SensitivityType':
        h.Film = true
        break
      case 'Artist':
      case 'Creator':
      case 'Author':
      case 'Copyright':
        h.Author = true
        break
      case 'LensModel':
      case 'Lens':
      case 'LensMake':
      case 'FocalLength':
      case 'FocalLengthIn35mmFilmFormat':
      case 'FocalLengthIn35mmFormat':
      case 'MaxApertureValue':
      case 'LensSerialNumber':
        h.Lens = true
        break
      case 'Make':
      case 'Model':
      case 'BodySerialNumber':
      case 'SerialNumber':
      case 'CameraSerialNumber':
      case 'HostComputer':
      case 'Software':
      case 'DateTimeOriginal':
      case 'CreateDate':
      case 'ModifyDate':
      case 'OffsetTimeOriginal':
        h.Camera = true
        break
      default:
        break
    }
  }
  return h
}
