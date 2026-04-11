/**
 * Compare a proposed exiftool write payload to metadata already read from a file,
 * so preview / "pending write" only reflect tags that would actually change.
 */

import { fitKeywordsForExif } from '@shared/exifLimits.js'
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

/** Same effective keywords after fit (merge order can differ from on-disk order). */
function keywordListsEquivalent(proposed: unknown, meta: Record<string, unknown>): boolean {
  const p = Array.isArray(proposed) ? proposed.map((x) => String(x)) : []
  const fromFile = keywordsFromFileMeta(meta)
  const a = fitKeywordsForExif(p)
  const b = fitKeywordsForExif(fromFile)
  if (a.length !== b.length) return false
  const sa = [...a].sort((x, y) => x.localeCompare(y, 'en'))
  const sb = [...b].sort((x, y) => x.localeCompare(y, 'en'))
  return sa.every((s, i) => s === sb[i])
}

function strTrimEq(a: unknown, b: unknown): boolean {
  return String(a ?? '').trim() === String(b ?? '').trim()
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
    case 'ExposureTime': {
      const raw = exposureTimeRawFromMetadata(meta)
      const p = String(proposed).trim()
      if (!p) return raw == null || String(raw).trim() === ''
      return strTrimEq(p, raw)
    }
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
