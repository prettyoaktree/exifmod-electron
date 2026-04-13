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

  it('omits ISO when values match as number vs string', () => {
    const proposed = { ISO: 400, Make: 'X' }
    const meta = { ISO: '400', Make: 'X' }
    expect(diffWritePayloadFromMetadata(proposed, meta)).toEqual({})
  })

  it('keeps Make when different', () => {
    const proposed = { Make: 'Canon', Model: '5D' }
    const meta = { Make: 'Nikon', Model: '5D' }
    expect(diffWritePayloadFromMetadata(proposed, meta)).toEqual({ Make: 'Canon' })
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
