/** Shared ExifTool `-j` tag reads (also re-exported from renderer `infer.ts`). */

export function metadataFirstTag(meta: Record<string, unknown>, candidates: readonly string[]): unknown {
  for (const name of candidates) {
    if (!(name in meta)) continue
    const val = meta[name]
    if (val != null && val !== '') return val
  }
  return undefined
}

const EXPOSURE_TIME_TAGS = ['ExposureTime', 'EXIF:ExposureTime'] as const
const FNUMBER_TAGS = ['FNumber', 'EXIF:FNumber'] as const

export function exposureTimeRawFromMetadata(meta: Record<string, unknown>): unknown {
  const raw = metadataFirstTag(meta, EXPOSURE_TIME_TAGS)
  if (raw != null) return raw
  const comp = meta['Composite:ShutterSpeed']
  if (typeof comp !== 'string') return undefined
  const t = comp.trim()
  if (!t) return undefined
  return t.split(/\s+/)[0]
}

export function fnumberRawFromMetadata(meta: Record<string, unknown>): unknown {
  const raw = metadataFirstTag(meta, FNUMBER_TAGS)
  if (raw != null) return raw
  const comp = meta['Composite:FNumber']
  if (typeof comp === 'string') {
    const t = comp.trim()
    if (t.toLowerCase().startsWith('f/')) return t.slice(2).trim() || undefined
    return t || undefined
  }
  return comp
}
