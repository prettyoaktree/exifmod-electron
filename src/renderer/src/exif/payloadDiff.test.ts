import { describe, expect, it } from 'vitest'
import {
  diffToAttributeHighlights,
  diffWritePayloadFromMetadata,
  mergeDiffAttributeHighlights,
  writePayloadMatchesFile
} from './payloadDiff.js'

describe('diffWritePayloadFromMetadata', () => {
  it('returns empty when Keywords match after fit (order-independent)', () => {
    const proposed = { Keywords: ['film', 'Kodak Portra 400 Film Stock', 'beach'] }
    const meta = { Keywords: ['beach', 'film', 'Kodak Portra 400 Film Stock'] }
    expect(writePayloadMatchesFile(proposed, meta)).toBe(true)
  })

  it('treats keyword tokens case-insensitively (film marker, stock suffix, descriptive)', () => {
    const proposed = { Keywords: ['film', 'Kodak Gold 200 Film Stock', 'Beach'] }
    const meta = { Keywords: ['Film', 'BEACH', 'kodak gold 200 film stock'] }
    expect(writePayloadMatchesFile(proposed, meta)).toBe(true)
  })

  it('ignores redundant film stock duplicate (short token + … Film Stock) from Lightroom-style keyword lists', () => {
    const proposed = {
      Keywords: ['film', 'Lomography Color Negative 100 Film Stock', 'shelf unit', 'window']
    }
    const meta = {
      Keywords: [
        'film',
        'Lomography Color Negative 100 Film Stock',
        'Lomography Color Negative 100',
        'shelf unit',
        'window'
      ]
    }
    expect(writePayloadMatchesFile(proposed, meta)).toBe(true)
  })

  it('includes Keywords when clearing to empty string vs file with keywords', () => {
    const proposed = { Keywords: '' }
    const meta = { Keywords: ['a', 'b'] }
    expect(diffWritePayloadFromMetadata(proposed, meta)).toEqual({ Keywords: '' })
  })

  it('omits ISO when values match as number vs string', () => {
    const proposed = { ISO: 400, Make: 'X' }
    const meta = { ISO: '400', Make: 'X' }
    expect(diffWritePayloadFromMetadata(proposed, meta)).toEqual({})
  })

  it('treats ExposureTime as matching when decimal seconds equal rational on file', () => {
    const proposed = { ExposureTime: 1 / 60 }
    const meta = { ExposureTime: '1/60' }
    expect(writePayloadMatchesFile(proposed, meta)).toBe(true)
  })

  it('keeps Make when different', () => {
    const proposed = { Make: 'Canon', Model: '5D' }
    const meta = { Make: 'Nikon', Model: '5D' }
    expect(diffWritePayloadFromMetadata(proposed, meta)).toEqual({ Make: 'Canon' })
  })

  it('treats merged author preset as no-op when XMP Creator holds identity (no EXIF Author)', () => {
    const proposed = {
      Author: 'Person',
      Creator: 'Alon Yaffe',
      Copyright: '© 2026 Alon Yaffe. All rights reserved.'
    }
    const meta = {
      'XMP:Creator': ['Alon Yaffe'],
      Copyright: '© 2026 Alon Yaffe. All rights reserved.'
    }
    expect(writePayloadMatchesFile(proposed, meta)).toBe(true)
  })

  it('matches Creator when ExifTool returns XMP dc:creator lang-alt objects (Lightroom)', () => {
    const proposed = { Creator: 'Alon Yaffe' }
    const meta = {
      'XMP:Creator': [{ lang: 'x-default', value: 'Alon Yaffe' }]
    }
    expect(writePayloadMatchesFile(proposed, meta)).toBe(true)
  })

  it('matches Copyright when Rights is only in XMP:Rights as lang-alt struct', () => {
    const proposed = { Copyright: '© 2026 Alon Yaffe. All rights reserved.' }
    const meta = {
      'XMP:Rights': [{ lang: 'x-default', value: '© 2026 Alon Yaffe. All rights reserved.' }]
    }
    expect(writePayloadMatchesFile(proposed, meta)).toBe(true)
  })

  it('matches Copyright when file uses IPTC:Copyright and preset uses formatted notice', () => {
    const proposed = { Copyright: '© 2026 Alon Yaffe. All rights reserved.' }
    const meta = { 'IPTC:Copyright': '© 2026 Alon Yaffe. All rights reserved.' }
    expect(writePayloadMatchesFile(proposed, meta)).toBe(true)
  })

  it('treats thin EXIF Copyright (photographer name only) as matching full formatted notice', () => {
    const proposed = { Copyright: '© 2026 Alon Yaffe. All rights reserved.' }
    const meta = { Copyright: 'Alon Yaffe' }
    expect(writePayloadMatchesFile(proposed, meta)).toBe(true)
  })

  it('matches Creator when identity exists only as thin Copyright line', () => {
    const proposed = { Creator: 'Alon Yaffe' }
    const meta = { Copyright: 'Alon Yaffe' }
    expect(writePayloadMatchesFile(proposed, meta)).toBe(true)
  })
})

describe('diffToAttributeHighlights', () => {
  it('maps EXIF keys to UI rows', () => {
    expect(diffToAttributeHighlights({ ExposureTime: '1/60', FNumber: 8, LensModel: 'X' })).toEqual(
      expect.objectContaining({ shutter: true, aperture: true, Lens: true })
    )
    expect(diffToAttributeHighlights({ Make: 'Kodak', Model: 'Instamatic' })).toEqual(
      expect.objectContaining({ Camera: true, Lens: false })
    )
  })

  it('merges OR across staged files', () => {
    const a = diffToAttributeHighlights({ Make: 'X' })
    const b = diffToAttributeHighlights({ ISO: 400 })
    expect(mergeDiffAttributeHighlights(a, b)).toEqual(
      expect.objectContaining({ Camera: true, Film: true })
    )
  })
})
