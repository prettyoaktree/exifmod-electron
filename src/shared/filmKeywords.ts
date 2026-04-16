import { fitKeywordsForExif } from './exifLimits.js'

/** Suffix for film stock EXIF keyword tokens written by EXIFmod (literal substring for inference). */
export const FILM_STOCK_SUFFIX = ' Film Stock'

/** Strip trailing ` Film Stock` (case-insensitive) from a keyword token. */
export function stripFilmStockSuffix(token: string): string {
  const t = token.trim()
  if (t.toLowerCase().endsWith(' film stock')) {
    return t.slice(0, -FILM_STOCK_SUFFIX.length).trim()
  }
  return t
}

/** Build the EXIF keyword for a film stock display name (single token after `film`). */
export function filmStockKeywordFromDisplayName(display: string): string {
  const base = stripFilmStockSuffix(display.trim())
  if (!base) return ''
  return base + FILM_STOCK_SUFFIX
}

/**
 * Canonical film preset Keywords for merge/write: `film` marker + one `… Film Stock` token when stock is known.
 * Use when merging film presets so legacy or imported payloads still get the suffix EXIFmod expects in files.
 */
export function normalizeFilmPresetPayloadForMerge(payload: Record<string, unknown>): Record<string, unknown> {
  const display = filmStockDisplayFromKeywordsPayload(payload)
  const stockKw = filmStockKeywordFromDisplayName(display)
  const out = { ...payload }
  out['Keywords'] = stockKw ? ['film', stockKw] : ['film']
  return out
}

/**
 * Film stock field display string from preset `Keywords` payload (excluding `film` marker).
 * Prefers the `… Film Stock` token; legacy tokens are joined with ", ".
 */
export function filmStockDisplayFromKeywordsPayload(pl: Record<string, unknown>): string {
  const kw = pl['Keywords']
  let vals: string[] = []
  if (typeof kw === 'string') {
    vals = kw.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
  } else if (Array.isArray(kw)) {
    vals = kw.map((v) => String(v).trim()).filter(Boolean)
  }
  const nonFilm = vals.filter((v) => v.toLowerCase() !== 'film')
  if (nonFilm.length === 0) return ''
  const withFs = nonFilm.find((k) => k.toLowerCase().includes('film stock'))
  if (withFs) return stripFilmStockSuffix(withFs)
  return nonFilm.map((k) => stripFilmStockSuffix(k)).join(', ')
}

/**
 * Merge preset Keywords with UI/AI keyword lists: preset order first, then extras, case-insensitive dedupe.
 */
export function mergeKeywordsDeduped(preset: string[], extras: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const add = (s: string): void => {
    const t = s.trim()
    if (!t) return
    const key = t.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push(t)
  }
  for (const x of preset) add(x)
  for (const x of extras) add(x)
  return out
}

/** Parse comma- or line-separated keywords from the main-window field. */
export function parseKeywordsField(text: string): string[] {
  return text
    .split(/[,;\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Format keyword array for the main-window field (comma-separated). */
export function formatKeywordsField(keywords: string[]): string {
  return keywords.join(', ')
}

/** Keywords array from merged preset payload (`Keywords` tag: string or string[]). */
export function mergedPresetKeywordsArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
  if (typeof v === 'string') return v.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
  return []
}

/**
 * Comma-separated descriptive keywords only (film identity tokens removed) for the New Keywords field.
 */
export function formatDescriptiveKeywordsLine(text: string): string {
  return formatKeywordsField(stripFilmIdentityFromKeywords(parseKeywordsField(text)))
}

/**
 * True when the descriptive (non-film) keyword sets parsed from `a` and `b` match, order-insensitive.
 */
export function descriptiveSlicesEqual(a: string, b: string): boolean {
  const norm = (s: string): string[] =>
    stripFilmIdentityFromKeywords(parseKeywordsField(s))
      .map((x) => x.toLowerCase())
      .sort((x, y) => x.localeCompare(y, 'en'))
  const sa = norm(a)
  const sb = norm(b)
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]!)
}

export type BuildMergedKeywordsForWriteOpts = {
  /** `merged['Keywords']` after preset merge (Camera → Lens → Author → Film). */
  mergedPresetKeywords: unknown
  keywordsText: string
  /** Last-read Keywords field from the file (string form). */
  keywordsBaseline: string
  clearKeywords: boolean
  clearFilm: boolean
}

/**
 * Final Keywords array for EXIF write: film-identifying tokens first (from Film preset or on-file),
 * then descriptive tokens from the New field or, when empty, from the file baseline. Lanes do not
 * overwrite each other.
 */
export function buildMergedKeywordsForWrite(opts: BuildMergedKeywordsForWriteOpts): string[] {
  if (opts.clearKeywords) return []

  const presetKw = mergedPresetKeywordsArray(opts.mergedPresetKeywords)

  let filmTokens: string[] = []
  if (!opts.clearFilm) {
    const fromPreset = extractFilmIdentityKeywords(presetKw)
    filmTokens =
      fromPreset.length > 0
        ? fromPreset
        : extractFilmIdentityKeywords(parseKeywordsField(opts.keywordsBaseline))
    filmTokens = filmTokens.map((k) => (k.toLowerCase() === 'film' ? 'film' : k))
  }

  const uiDesc = stripFilmIdentityFromKeywords(parseKeywordsField(opts.keywordsText))
  const baseDesc = stripFilmIdentityFromKeywords(parseKeywordsField(opts.keywordsBaseline))
  const descriptiveTokens = uiDesc.length > 0 ? uiDesc : baseDesc

  let combined = mergeKeywordsDeduped(filmTokens, descriptiveTokens)
  if (opts.clearFilm) {
    combined = stripFilmIdentityFromKeywords(combined)
  }
  return fitKeywordsForExif(combined)
}

/**
 * Remove film catalog identity tokens from a keyword list (marker `film`, `… Film Stock`, legacy stock hint).
 * Used when clearing Film row metadata without removing unrelated keywords.
 */
export function stripFilmIdentityFromKeywords(tokens: string[]): string[] {
  const trimmed = tokens.map((x) => x.trim()).filter(Boolean)
  if (trimmed.length === 0) return []
  const hint = filmStockHintFromExifKeywords(trimmed)
  const stockKw = hint ? filmStockKeywordFromDisplayName(hint) : ''
  return trimmed.filter((k) => {
    const kl = k.toLowerCase()
    if (kl === 'film') return false
    if (k.toLowerCase().includes('film stock')) return false
    if (stockKw && k.toLowerCase() === stockKw.toLowerCase()) return false
    if (hint) {
      const base = stripFilmStockSuffix(k)
      if (base.toLowerCase() === hint.toLowerCase()) return false
    }
    return true
  })
}

/** Extract only film-identifying keyword tokens (`film`, `... Film Stock`) preserving first-seen casing/order. */
export function extractFilmIdentityKeywords(tokens: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of tokens) {
    const t = raw.trim()
    if (!t) continue
    const tl = t.toLowerCase()
    const isFilmIdentity = tl === 'film' || tl.endsWith(' film stock')
    if (!isFilmIdentity) continue
    if (seen.has(tl)) continue
    seen.add(tl)
    out.push(t)
  }
  return out
}

export function filmStockHintFromExifKeywords(keywordValues: string[]): string {
  const trimmed = keywordValues.map((k) => k.trim()).filter(Boolean)
  const hasFilm = trimmed.some((k) => k.toLowerCase() === 'film')
  if (!hasFilm) return ''
  for (const k of trimmed) {
    if (k.toLowerCase() === 'film') continue
    if (k.toLowerCase().includes('film stock')) return stripFilmStockSuffix(k).trim()
  }
  const idx = trimmed.findIndex((k) => k.toLowerCase() === 'film')
  if (idx >= 0 && idx + 1 < trimmed.length) {
    return stripFilmStockSuffix(trimmed[idx + 1]!).trim()
  }
  return ''
}
