import { describe, expect, it } from 'vitest'
import { diffHighlightsToIconCategories } from './pendingIconCategories.js'
import { emptyDiffAttributeHighlights } from './exifPayloadDiff.js'

describe('diffHighlightsToIconCategories', () => {
  it('returns ordered keys for mixed highlights', () => {
    const h = {
      ...emptyDiffAttributeHighlights(),
      Film: true,
      Camera: true,
      notes: true
    }
    expect(diffHighlightsToIconCategories(h)).toEqual(['camera', 'film', 'desc'])
  })

  it('returns empty when nothing set', () => {
    expect(diffHighlightsToIconCategories(emptyDiffAttributeHighlights())).toEqual([])
  })
})
