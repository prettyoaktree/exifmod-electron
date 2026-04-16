import { describe, expect, it } from 'vitest'
import {
  buildMergedKeywordsForWrite,
  descriptiveSlicesEqual,
  extractFilmIdentityKeywords,
  filmStockHintFromExifKeywords,
  filmStockKeywordFromDisplayName,
  formatDescriptiveKeywordsLine,
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

  it('matches Film Stock suffix case-insensitively', () => {
    expect(filmStockHintFromExifKeywords(['film', 'Kodak PORTRA film stock', 'x'])).toBe('Kodak PORTRA')
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

  it('removes film identity case-insensitively', () => {
    expect(stripFilmIdentityFromKeywords(['Film', 'Kodak Portra 400 film stock', 'beach'])).toEqual(['beach'])
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

describe('descriptiveSlicesEqual', () => {
  it('ignores film tokens and keyword order', () => {
    expect(descriptiveSlicesEqual('beach, film, Kodak Film Stock', 'Kodak Film Stock, beach, film')).toBe(true)
    expect(descriptiveSlicesEqual('beach', 'beach, portrait')).toBe(false)
  })
})

describe('formatDescriptiveKeywordsLine', () => {
  it('drops film identity tokens', () => {
    expect(formatDescriptiveKeywordsLine('beach, film, Kodak Portra 400 Film Stock')).toBe('beach')
  })
})

describe('buildMergedKeywordsForWrite', () => {
  it('returns empty when clearKeywords', () => {
    expect(
      buildMergedKeywordsForWrite({
        mergedPresetKeywords: ['film', 'X Film Stock'],
        keywordsText: 'beach',
        keywordsBaseline: '',
        clearKeywords: true,
        clearFilm: false
      })
    ).toEqual([])
  })

  it('preserves descriptives from baseline when keywordsText is empty', () => {
    const baseline = 'beach, film, Kodak Portra 400 Film Stock'
    const out = buildMergedKeywordsForWrite({
      mergedPresetKeywords: ['film', 'Kodak Portra 400 Film Stock'],
      keywordsText: '',
      keywordsBaseline: baseline,
      clearKeywords: false,
      clearFilm: false
    })
    expect(out).toContain('film')
    expect(out).toContain('Kodak Portra 400 Film Stock')
    expect(out).toContain('beach')
  })

  it('uses film tokens from baseline when preset has no film Keywords', () => {
    const baseline = 'sunset, film, Acme 100 Film Stock'
    const out = buildMergedKeywordsForWrite({
      mergedPresetKeywords: [],
      keywordsText: '',
      keywordsBaseline: baseline,
      clearKeywords: false,
      clearFilm: false
    })
    expect(out).toContain('film')
    expect(out).toContain('sunset')
  })

  it('strips film identity when clearFilm', () => {
    const baseline = 'beach, film, Kodak Portra 400 Film Stock'
    const out = buildMergedKeywordsForWrite({
      mergedPresetKeywords: ['film', 'Kodak Portra 400 Film Stock'],
      keywordsText: '',
      keywordsBaseline: baseline,
      clearKeywords: false,
      clearFilm: true
    })
    expect(out).not.toContain('film')
    expect(out).toContain('beach')
  })

  it('canonicalizes film marker to lowercase in write output', () => {
    const out = buildMergedKeywordsForWrite({
      mergedPresetKeywords: ['Film', 'Acme 100 FILM STOCK'],
      keywordsText: '',
      keywordsBaseline: 'portrait, FILM, Acme 100 film stock',
      clearKeywords: false,
      clearFilm: false
    })
    expect(out).toContain('film')
    expect(out).not.toContain('Film')
  })

  it('does not introduce standalone Film marker from mixed casing', () => {
    const out = buildMergedKeywordsForWrite({
      mergedPresetKeywords: ['FILM', 'Acme 100 film stock'],
      keywordsText: 'street',
      keywordsBaseline: '',
      clearKeywords: false,
      clearFilm: false
    })
    expect(out.filter((k) => k.toLowerCase() === 'film')).toEqual(['film'])
  })
})
