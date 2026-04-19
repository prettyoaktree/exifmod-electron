import { describe, expect, it } from 'vitest'
import { scalarStringFromExiftoolJson } from './exiftoolJsonScalar.js'

describe('scalarStringFromExiftoolJson', () => {
  it('flattens XMP lang-alt Creator structs', () => {
    const v = [{ lang: 'x-default', value: 'Alon Yaffe' }]
    expect(scalarStringFromExiftoolJson(v)).toBe('Alon Yaffe')
  })

  it('joins multiple lang entries with semicolons', () => {
    const v = [
      { lang: 'x-default', value: 'A' },
      { lang: 'en', value: 'B' }
    ]
    expect(scalarStringFromExiftoolJson(v)).toBe('A; B')
  })

  it('reads Rights from plain string', () => {
    expect(scalarStringFromExiftoolJson('© 2026 Test.')).toBe('© 2026 Test.')
  })
})
