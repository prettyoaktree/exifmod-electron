/** Shared exposure / aperture formatting for main process catalog and renderer UI. */

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

/**
 * Seconds from an EXIF ExposureTime value (positive number, decimal string, or rational `num/den`;
 * leading token only if extra text follows, e.g. composite shutter strings).
 */
export function parseExposureTimeToSeconds(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'boolean') return null
  if (typeof value === 'number') {
    const v = Number(value)
    return Number.isFinite(v) && v > 0 ? v : null
  }
  const raw = String(value).trim()
  if (!raw) return null
  const firstToken = raw.split(/\s+/)[0] ?? ''
  const slash = firstToken.indexOf('/')
  if (slash >= 0) {
    const num = Number(firstToken.slice(0, slash).trim())
    const den = Number(firstToken.slice(slash + 1).trim())
    if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) return num / den
    return null
  }
  const n = Number(firstToken)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function formatFnumberForUi(value: unknown): string {
  if (value == null || value === '') return ''
  if (typeof value === 'boolean') return ''
  if (typeof value === 'string') {
    const t = value.trim()
    if (!t) return ''
    const lower = t.toLowerCase()
    if (lower === 'undef' || lower === 'undefined' || lower === 'nan') return ''
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
