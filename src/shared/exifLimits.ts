/** EXIF ImageDescription (Notes) — matches app validation / common EXIF tool limits. */
export const IMAGEDESCRIPTION_MAX_UTF8_BYTES = 999

/**
 * Max UTF-8 bytes per keyword token (modern XMP dc:subject; generous for long film stock names).
 * IPTC-IIM used 64; we avoid truncating catalog `… Film Stock` tokens in normal use.
 */
export const KEYWORD_TOKEN_MAX_UTF8_BYTES = 1024

/** Upper bound on sum of UTF-8 lengths of all keyword tokens (guards pathological lists). */
export const KEYWORDS_MERGED_SUM_MAX_UTF8_BYTES = 32768

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

export function clampUtf8ByBytes(
  text: string,
  maxBytes: number = IMAGEDESCRIPTION_MAX_UTF8_BYTES
): string {
  if (maxBytes <= 0) return ''
  const enc = new TextEncoder()
  const raw = enc.encode(text)
  if (raw.length <= maxBytes) return text
  let cut = maxBytes
  while (cut > 0 && (raw[cut - 1]! & 0xc0) === 0x80) cut--
  return new TextDecoder('utf-8', { fatal: false }).decode(raw.slice(0, cut))
}

/**
 * Append AI description to existing Notes so the full string stays within ImageDescription limits.
 * Preserves existing text; only the new segment is truncated to fit.
 */
export function mergeImageDescriptionAppend(existing: string, addition: string): string {
  const max = IMAGEDESCRIPTION_MAX_UTF8_BYTES
  const head = clampUtf8ByBytes(existing.trim(), max)
  const addRaw = addition.trim()
  if (!addRaw) return head
  if (!head) return clampUtf8ByBytes(addRaw, max)
  const sep = '\n\n'
  const room = max - utf8ByteLength(head) - utf8ByteLength(sep)
  if (room <= 0) return head
  const tail = clampUtf8ByBytes(addRaw, room)
  if (!tail) return head
  return clampUtf8ByBytes(`${head}${sep}${tail}`, max)
}

/**
 * UTF-8 bytes still available for a new AI description when it is appended after existing Notes
 * (includes the two-byte `\n\n` separator when there is already text).
 */
export function remainingUtf8BytesForAiDescription(existing: string): number {
  const max = IMAGEDESCRIPTION_MAX_UTF8_BYTES
  const trimmed = existing.trim()
  if (!trimmed) return max
  const head = clampUtf8ByBytes(trimmed, max)
  const sep = '\n\n'
  return Math.max(0, max - utf8ByteLength(head) - utf8ByteLength(sep))
}

/**
 * Clamp each keyword, then keep a prefix of the list whose UTF-8 lengths sum within the budget.
 * Call after `mergeKeywordsDeduped` so preset / existing tokens stay and AI extras drop first when needed.
 */
export function fitKeywordsForExif(keywords: string[]): string[] {
  const out: string[] = []
  let sum = 0
  for (const raw of keywords) {
    const t = clampUtf8ByBytes(raw.trim(), KEYWORD_TOKEN_MAX_UTF8_BYTES)
    if (!t) continue
    const len = utf8ByteLength(t)
    if (sum + len > KEYWORDS_MERGED_SUM_MAX_UTF8_BYTES) break
    out.push(t)
    sum += len
  }
  return out
}
