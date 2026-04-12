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
  const withFs = nonFilm.find((k) => k.includes('Film Stock'))
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

/**
 * Stock hint for catalog matching: prefer keyword containing `Film Stock`, else legacy = token after `film`.
 */
export function filmStockHintFromExifKeywords(keywordValues: string[]): string {
  const trimmed = keywordValues.map((k) => k.trim()).filter(Boolean)
  const hasFilm = trimmed.some((k) => k.toLowerCase() === 'film')
  if (!hasFilm) return ''
  for (const k of trimmed) {
    if (k.toLowerCase() === 'film') continue
    if (k.includes('Film Stock')) return stripFilmStockSuffix(k).trim()
  }
  const idx = trimmed.findIndex((k) => k.toLowerCase() === 'film')
  if (idx >= 0 && idx + 1 < trimmed.length) {
    return stripFilmStockSuffix(trimmed[idx + 1]!).trim()
  }
  return ''
}
