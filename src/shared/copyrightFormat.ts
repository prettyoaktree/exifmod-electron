/** Already in our `© {year} …` form (or user pasted full notice) — do not prefix again. */
const COPYRIGHT_YEAR_PREFIX = /^©\s*\d{4}\s+/

/**
 * User-entered copyright suffix (preset / merge payload). Full EXIF value is built at write time.
 * Idempotent: strings that already start with `©` + 4-digit year are returned unchanged.
 */
export function formatCopyrightForExif(userCopyright: string): string | null {
  const t = userCopyright.trim()
  if (!t) return null
  if (COPYRIGHT_YEAR_PREFIX.test(t)) return t
  const year = new Date().getFullYear()
  return `© ${year} ${t}`
}

/** Shallow copy with `Copyright` replaced by the string ExifTool will write (or key removed). */
export function withCopyrightAsWrittenToExif(payload: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!payload) return null
  if (!Object.prototype.hasOwnProperty.call(payload, 'Copyright')) return { ...payload }
  const formatted = formatCopyrightForExif(String(payload['Copyright'] ?? ''))
  const out = { ...payload }
  if (formatted === null) delete out['Copyright']
  else out['Copyright'] = formatted
  return out
}
