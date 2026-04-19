import { scalarStringFromExiftoolJson } from './exiftoolJsonScalar.js'

/** EXIF/IPTC `Copyright` often holds only the photographer name (no ©); use for identity when dedicated Creator tags are absent. */
function thinPhotographerCreditLine(s: string): boolean {
  const t = s.trim()
  if (!t) return false
  if (/©|\(c\)/i.test(t)) return false
  return t.length <= 200
}

/** First non-empty identity string from common Lightroom / XMP / EXIF tag variants (arrays flattened). */
export function authorIdentityFromMetadata(meta: Record<string, unknown>): string {
  const keys = [
    'Author Name',
    'Creator',
    'XMP:Creator',
    'EXIF:Creator',
    'Artist',
    'EXIF:Artist',
    'XMP:Artist'
  ] as const
  for (const k of keys) {
    if (!(k in meta)) continue
    const s = scalarStringFromExiftoolJson(meta[k])
    if (s) return s
  }
  for (const k of ['Copyright', 'EXIF:Copyright'] as const) {
    if (!(k in meta)) continue
    const s = scalarStringFromExiftoolJson(meta[k])
    if (s && thinPhotographerCreditLine(s)) return s
  }
  return ''
}
