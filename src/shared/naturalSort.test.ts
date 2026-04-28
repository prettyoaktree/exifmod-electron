import { describe, expect, it } from 'vitest'
import { compareNaturalPathBaseName } from './naturalSort.js'

describe('compareNaturalPathBaseName', () => {
  it('sorts numeric suffixes naturally', () => {
    const values = ['image1.jpg', 'image10.jpg', 'image2.jpg']
    values.sort(compareNaturalPathBaseName)
    expect(values).toEqual(['image1.jpg', 'image2.jpg', 'image10.jpg'])
  })

  it('handles multiple numeric groups', () => {
    const values = ['scanA2_10.tif', 'scanA2_2.tif', 'scanA10_1.tif']
    values.sort(compareNaturalPathBaseName)
    expect(values).toEqual(['scanA2_2.tif', 'scanA2_10.tif', 'scanA10_1.tif'])
  })
})

