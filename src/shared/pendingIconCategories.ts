import type { DiffAttributeHighlights } from './exifPayloadDiff.js'
import type { MetaCategory } from './metaCategory.js'

/** Fixed visual order of chips in the file list. */
const ORDER: { flag: keyof DiffAttributeHighlights; key: MetaCategory }[] = [
  { flag: 'Camera', key: 'camera' },
  { flag: 'Lens', key: 'lens' },
  { flag: 'Film', key: 'film' },
  { flag: 'Author', key: 'author' },
  { flag: 'shutter', key: 'shutter' },
  { flag: 'aperture', key: 'aperture' },
  { flag: 'notes', key: 'desc' },
  { flag: 'keywords', key: 'keywords' }
]

/**
 * From a per-file write diff (via diffToAttributeHighlights), the icon categories
 * to show in the file list, in a consistent order.
 */
export function diffHighlightsToIconCategories(h: DiffAttributeHighlights): MetaCategory[] {
  const out: MetaCategory[] = []
  for (const { flag, key } of ORDER) {
    if (h[flag]) out.push(key)
  }
  return out
}
