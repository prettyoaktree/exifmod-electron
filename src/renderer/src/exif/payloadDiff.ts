/**
 * Compare a proposed exiftool write payload to metadata already read from a file,
 * so preview / "pending write" only reflect tags that would actually change.
 */

import { parseExposureTimeToSeconds } from '@shared/exifDisplayFormat.js'
import { fitKeywordsForExif } from '@shared/exifLimits.js'
import { stripFilmStockSuffix } from '@shared/filmKeywords.js'
import {
  exposureTimeRawFromMetadata,
  fnumberRawFromMetadata,
  metadataFirstTag
} from './infer.js'

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
  const candidates = [
    'Keywords',
    'EXIF:Keywords',
    'IPTC:Keywords',
    'XMP:Subject',
    'Subject',
    'MWG:Keywords'
  ] as const
  for (const c of candidates) {
    const v = meta[c]
    if (v == null || v === '') continue
    return normalizeKeywordList(v)
  }
  return []
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
      return strTrimEq(proposed, metadataFirstTag(meta, ['Copyright', 'EXIF:Copyright', 'XMP:Rights'] as const))
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
    case 'Artist':
    case 'Creator':
    case 'Author':
      return stringFieldMatches(key, proposed, meta)
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
        h.shutter = true
        break
      case 'FNumber':
      case 'ApertureValue':
        h.aperture = true
        break
      case 'ImageDescription':
        h.notes = true
        break
      case 'Keywords':
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
