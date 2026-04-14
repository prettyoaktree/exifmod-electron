import { describe, expect, it } from 'vitest'
import {
  extractFilmIdentityKeywords,
  filmStockHintFromExifKeywords,
  filmStockKeywordFromDisplayName,
  mergeKeywordsDeduped,
  normalizeFilmPresetPayloadForMerge,
  parseKeywordsField,
  stripFilmIdentityFromKeywords,
  stripFilmStockSuffix
} from './filmKeywords.js'

describe('stripFilmStockSuffix', () => {
  it('strips trailing Film Stock', () => {
    expect(stripFilmStockSuffix('Kodak Portra 400 Film Stock')).toBe('Kodak Portra 400')
  })
})

describe('filmStockKeywordFromDisplayName', () => {
  it('appends Film Stock', () => {
    expect(filmStockKeywordFromDisplayName('Acme 400')).toBe('Acme 400 Film Stock')
  })
})

describe('filmStockHintFromExifKeywords', () => {
  it('prefers token containing Film Stock', () => {
    expect(
      filmStockHintFromExifKeywords(['film', 'Kodak Film Stock', 'sunset', 'beach'])
    ).toBe('Kodak')
  })

  it('uses legacy keyword after film', () => {
    expect(filmStockHintFromExifKeywords(['film', 'Legacy Stock', 'x'])).toBe('Legacy Stock')
  })

  it('returns empty without film marker', () => {
    expect(filmStockHintFromExifKeywords(['foo'])).toBe('')
  })
})

describe('normalizeFilmPresetPayloadForMerge', () => {
  it('adds Film Stock suffix when legacy Keywords omit it', () => {
    const merged = normalizeFilmPresetPayloadForMerge({
      ISO: '400',
      Keywords: ['film', 'Kodak Portra 400']
    })
    expect(merged['Keywords']).toEqual(['film', 'Kodak Portra 400 Film Stock'])
    expect(merged['ISO']).toBe('400')
  })

  it('leaves canonical Keywords unchanged', () => {
    const merged = normalizeFilmPresetPayloadForMerge({
      Keywords: ['film', 'Acme 100 Film Stock']
    })
    expect(merged['Keywords']).toEqual(['film', 'Acme 100 Film Stock'])
  })
})

describe('mergeKeywordsDeduped', () => {
  it('preserves preset order and appends extras; case-insensitive dedupe', () => {
    expect(mergeKeywordsDeduped(['film', 'A Film Stock'], ['Sunset', 'film', 'sunset'])).toEqual([
      'film',
      'A Film Stock',
      'Sunset'
    ])
  })
})

describe('parseKeywordsField', () => {
  it('splits on comma and newline', () => {
    expect(parseKeywordsField('a, b\nc')).toEqual(['a', 'b', 'c'])
  })
})

describe('stripFilmIdentityFromKeywords', () => {
  it('removes film marker and Film Stock token', () => {
    expect(stripFilmIdentityFromKeywords(['film', 'Kodak Portra 400 Film Stock', 'beach'])).toEqual(['beach'])
  })

  it('removes legacy stock hint after film', () => {
    expect(stripFilmIdentityFromKeywords(['film', 'Legacy Stock', 'x'])).toEqual(['x'])
  })
})

describe('extractFilmIdentityKeywords', () => {
  it('keeps only film marker and Film Stock tokens', () => {
    expect(
      extractFilmIdentityKeywords(['beach', 'film', 'Kodak Portra 400 Film Stock', 'portrait'])
    ).toEqual(['film', 'Kodak Portra 400 Film Stock'])
  })

  it('dedupes case-insensitively while preserving first seen order', () => {
    expect(
      extractFilmIdentityKeywords(['Film', 'film', 'Acme Film Stock', 'acme film stock', 'other'])
    ).toEqual(['Film', 'Acme Film Stock'])
  })
})
