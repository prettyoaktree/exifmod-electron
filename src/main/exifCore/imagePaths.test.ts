import { describe, expect, it } from 'vitest'
import { isRawImagePath, isRasterInFileWritePath, sidecarXmpPath } from './imagePaths.js'

describe('imagePaths', () => {
  it('classifies RAW extensions', () => {
    expect(isRawImagePath('/photos/img.cr2')).toBe(true)
    expect(isRawImagePath('/photos/img.CR3')).toBe(true)
    expect(isRawImagePath('/photos/img.jpg')).toBe(false)
  })

  it('classifies raster in-file extensions', () => {
    expect(isRasterInFileWritePath('/a/b.JPEG')).toBe(true)
    expect(isRasterInFileWritePath('/a/raw.nef')).toBe(false)
  })

  it('sidecarXmpPath', () => {
    expect(sidecarXmpPath('/dir/foo.NEF')).toMatch(/foo\.xmp$/)
  })
})
