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

export function formatFnumberForUi(value: unknown): string {
  if (value == null || value === '') return ''
  if (typeof value === 'boolean') return ''
  if (typeof value === 'string') {
    const t = value.trim()
    if (!t) return ''
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
