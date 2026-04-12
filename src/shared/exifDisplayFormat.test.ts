import { describe, expect, it } from 'vitest'
import { formatExposureTimeForUi, formatFnumberForUi } from './exifDisplayFormat.js'

describe('formatExposureTimeForUi', () => {
  it('formats decimals', () => {
    expect(formatExposureTimeForUi(0.008)).toBe('0.008')
  })
  it('trims strings', () => {
    expect(formatExposureTimeForUi('  1/125  ')).toBe('1/125')
  })
})

describe('formatFnumberForUi', () => {
  it('formats integers', () => {
    expect(formatFnumberForUi(8)).toBe('8')
  })
  it('formats decimals', () => {
    expect(formatFnumberForUi(2.8)).toBe('2.8')
  })
})
