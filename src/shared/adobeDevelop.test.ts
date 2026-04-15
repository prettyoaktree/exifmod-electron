import { describe, expect, it } from 'vitest'
import { exiftoolHasSettingsMeansAdobeCrsDevelop } from './adobeDevelop.js'

describe('exiftoolHasSettingsMeansAdobeCrsDevelop', () => {
  it('is true for boolean/string forms from exiftool -j', () => {
    expect(exiftoolHasSettingsMeansAdobeCrsDevelop(true)).toBe(true)
    expect(exiftoolHasSettingsMeansAdobeCrsDevelop('true')).toBe(true)
    expect(exiftoolHasSettingsMeansAdobeCrsDevelop('True')).toBe(true)
    expect(exiftoolHasSettingsMeansAdobeCrsDevelop(1)).toBe(true)
    expect(exiftoolHasSettingsMeansAdobeCrsDevelop('1')).toBe(true)
  })

  it('is false when absent or false', () => {
    expect(exiftoolHasSettingsMeansAdobeCrsDevelop(undefined)).toBe(false)
    expect(exiftoolHasSettingsMeansAdobeCrsDevelop(false)).toBe(false)
    expect(exiftoolHasSettingsMeansAdobeCrsDevelop('false')).toBe(false)
  })
})
