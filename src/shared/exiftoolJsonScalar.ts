/**
 * Flatten ExifTool `-j` values into a single comparable string.
 * Handles strings, numbers, arrays, and XMP lang-alt / struct shapes like
 * `{ lang: 'x-default', value: '…' }` (common for `XMP:Creator`, `XMP:Rights`).
 */
export function scalarStringFromExiftoolJson(v: unknown): string {
  if (v == null || v === '') return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v).trim()
  if (Array.isArray(v)) {
    const parts = v.map(scalarStringFromExiftoolJson).filter(Boolean)
    return parts.join('; ')
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (typeof o.value === 'string') return o.value.trim()
    if (typeof o.Value === 'string') return o.Value.trim()
    if (o.Item !== undefined) return scalarStringFromExiftoolJson(o.Item)
    return ''
  }
  return ''
}
