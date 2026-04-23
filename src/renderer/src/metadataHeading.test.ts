import { describe, expect, it } from 'vitest'
import { pickMetadataHeadingText } from './metadataHeading.js'

function fitsMaxWidth(max: number) {
  return (s: string) => s.length <= max
}

describe('pickMetadataHeadingText', () => {
  it('returns empty string when names is empty', () => {
    expect(
      pickMetadataHeadingText([], {
        prefix: 'Metadata: ',
        moreLabel: (r) => ` + ${r} more`,
        fits: () => true,
        compactFallback: () => 'fallback'
      })
    ).toBe('')
  })

  it('returns prefix plus single name when it fits', () => {
    expect(
      pickMetadataHeadingText(['a.tif'], {
        prefix: 'Metadata: ',
        moreLabel: (r) => ` + ${r} more`,
        fits: () => true,
        compactFallback: () => 'X'
      })
    ).toBe('Metadata: a.tif')
  })

  it('uses compact fallback for single name when it does not fit', () => {
    expect(
      pickMetadataHeadingText(['very-long-name.tif'], {
        prefix: 'Metadata: ',
        moreLabel: (r) => ` + ${r} more`,
        fits: (s) => s.length <= 12,
        compactFallback: (c) => `M (${c})`
      })
    ).toBe('M (1)')
  })

  it('lists all names when they fit', () => {
    expect(
      pickMetadataHeadingText(['a.tif', 'b.tif', 'c.tif'], {
        prefix: 'Metadata: ',
        moreLabel: (r) => ` + ${r} more`,
        fits: () => true,
        compactFallback: () => 'X'
      })
    ).toBe('Metadata: a.tif, b.tif, c.tif')
  })

  it('shows leading names and moreLabel when not all fit', () => {
    // Full three-name line is longer than 34 chars; two names + remainder fits.
    const fits = (s: string) => s.length <= 34
    expect(
      pickMetadataHeadingText(['aaa.tif', 'bbb.tif', 'ccc.tif'], {
        prefix: 'Metadata: ',
        moreLabel: (r) => ` +${r}m`,
        fits,
        compactFallback: () => 'compact'
      })
    ).toBe('Metadata: aaa.tif, bbb.tif +1m')
  })

  it('falls back to compact when even one name plus more does not fit', () => {
    const fits = fitsMaxWidth(10)
    expect(
      pickMetadataHeadingText(['long1.tif', 'long2.tif'], {
        prefix: 'Metadata: ',
        moreLabel: (r) => ` +${r}`,
        fits,
        compactFallback: (c) => `Z${c}`
      })
    ).toBe('Z2')
  })
})
