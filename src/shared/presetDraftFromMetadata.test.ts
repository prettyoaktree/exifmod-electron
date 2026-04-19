import { describe, expect, it } from 'vitest'
import {
  analyzeCameraFirstStaging,
  buildCameraPresetDraft,
  buildFilmPresetDraft,
  buildLensPresetDraft,
  canonicalCameraMakeModel,
  canonicalLensMakeModel,
  catalogHasPresetName,
  computeAutoFillPresetIds,
  filmCurrentDisplayForStaging,
  filmDisplayCandidateFromMetadata,
  inferUniqueLensMount,
  integratedLensMatchesFixedLensDisplay,
  matchStateForAuthorCategory,
  matchStateForCameraCategory,
  matchStateForFilmCategory,
  matchStateForLensCategory
} from './presetDraftFromMetadata.js'
import type { ConfigCatalog } from './types.js'

function emptyCatalog(over: Partial<ConfigCatalog> = {}): ConfigCatalog {
  return {
    camera_values: ['None'],
    lens_values: ['None'],
    author_values: ['None'],
    film_values: ['None'],
    camera_file_map: {},
    lens_file_map: {},
    author_file_map: {},
    film_file_map: {},
    camera_metadata_map: {},
    lens_metadata_map: {},
    camera_identity_by_name: {},
    lens_identity_by_name: {},
    author_identity_by_name: {},
    film_identity_by_name: {},
    ...over
  }
}

describe('canonicalCameraMakeModel', () => {
  it('keeps model when it already starts with make (FED)', () => {
    expect(canonicalCameraMakeModel({ Make: 'FED', Model: 'FED 1' })).toEqual({ Make: 'FED', Model: 'FED 1' })
  })
  it('keeps Konica-style model', () => {
    expect(canonicalCameraMakeModel({ Make: 'Konica', Model: 'Konica IIIa' })).toEqual({
      Make: 'Konica',
      Model: 'Konica IIIa'
    })
  })
  it('prepends make when model does not start with make', () => {
    expect(canonicalCameraMakeModel({ Make: 'Acme', Model: 'IIIa' })).toEqual({ Make: 'Acme', Model: 'Acme IIIa' })
  })
  it('uses make alone when model empty', () => {
    expect(canonicalCameraMakeModel({ Make: 'Sony', Model: '' })).toEqual({ Make: 'Sony', Model: 'Sony' })
  })
})

describe('canonicalLensMakeModel', () => {
  it('merges legacy Lens into LensMake', () => {
    expect(
      canonicalLensMakeModel({
        Lens: 'Minolta',
        LensModel: 'Minolta Rokkor MD 50mm f/2'
      })
    ).toEqual({ LensMake: 'Minolta', LensModel: 'Minolta Rokkor MD 50mm f/2' })
  })
})

describe('inferUniqueLensMount', () => {
  const mounts = ['Leica LTM', 'Minolta MD', 'Minolta SR', 'Canon RF']
  it('returns undefined when zero matches', () => {
    expect(inferUniqueLensMount('Sony', mounts)).toBeUndefined()
  })
  it('returns undefined when multiple mounts contain make', () => {
    expect(inferUniqueLensMount('Minolta', mounts)).toBeUndefined()
  })
  it('returns the mount when exactly one match', () => {
    expect(inferUniqueLensMount('Canon', mounts)).toBe('Canon RF')
  })
})

describe('catalogHasPresetName', () => {
  it('is case-insensitive', () => {
    expect(catalogHasPresetName(['None', 'Canon P'], 'canon p')).toBe(true)
  })
})

describe('matchStateForCameraCategory', () => {
  const cat = emptyCatalog({ camera_values: ['None', 'Canon P'] })
  it('matches existing preset', () => {
    expect(matchStateForCameraCategory(cat, [{ Make: 'Canon', Model: 'Canon P' }])).toEqual({ kind: 'matched' })
  })
  it('matches when preset display name differs but payload identity matches EXIF', () => {
    const renamed = emptyCatalog({
      camera_values: ['None', 'My preset'],
      camera_identity_by_name: { 'My preset': 'Canon P' }
    })
    expect(matchStateForCameraCategory(renamed, [{ Make: 'Canon', Model: 'Canon P' }])).toEqual({ kind: 'matched' })
  })
  it('unmatched yields draft', () => {
    const r = matchStateForCameraCategory(cat, [{ Make: 'FED', Model: 'FED 1' }])
    expect(r.kind).toBe('unmatched')
    if (r.kind === 'unmatched') {
      expect(r.displayName).toBe('FED 1')
      expect(r.draft).toEqual(buildCameraPresetDraft({ Make: 'FED', Model: 'FED 1' }))
    }
  })
})

describe('matchStateForFilmCategory', () => {
  const cat = emptyCatalog({ film_values: ['None', 'Kodak Gold 200 (ISO 200)'] })
  it('uses infer string when present', () => {
    expect(
      matchStateForFilmCategory(cat, [{ Keywords: ['film', 'Kodak Gold 200 Film Stock'], ISO: 200 }], [
        'Kodak Gold 200 (ISO 200)'
      ])
    ).toEqual({ kind: 'matched' })
  })
  it('falls back to candidate when infer empty', () => {
    const meta = { Keywords: ['film', 'Acme 100 Film Stock'], ISO: '400' }
    const r = matchStateForFilmCategory(cat, [meta], [''])
    expect(r.kind).toBe('unmatched')
    if (r.kind === 'unmatched') {
      expect(r.displayName).toBe('Acme 100 (ISO 400)')
    }
  })
})

describe('filmCurrentDisplayForStaging', () => {
  it('prefers infer when non-empty', () => {
    expect(
      filmCurrentDisplayForStaging([{ Keywords: ['film'] }, { Keywords: ['film'] }], [
        'Catalog Name',
        'Catalog Name'
      ])
    ).toBe('Catalog Name')
  })
})

describe('matchStateForAuthorCategory', () => {
  const cat = emptyCatalog({ author_values: ['None', 'Jane Doe'] })
  it('matches', () => {
    expect(matchStateForAuthorCategory(cat, [{ Artist: 'Jane Doe' }])).toEqual({ kind: 'matched' })
  })
})

describe('matchStateForLensCategory', () => {
  const cat = emptyCatalog({ lens_values: ['None', 'Minolta Rokkor MD 50mm f/2'] })
  const mounts = ['Minolta MD']
  it('matches when preset display name differs but payload identity matches EXIF', () => {
    const renamed = emptyCatalog({
      lens_values: ['None', 'My lens'],
      lens_identity_by_name: { 'My lens': 'Minolta Rokkor MD 50mm f/2' }
    })
    expect(
      matchStateForLensCategory(
        renamed,
        [{ LensMake: 'Minolta', LensModel: 'Minolta Rokkor MD 50mm f/2' }],
        mounts
      )
    ).toEqual({ kind: 'matched' })
  })
  it('unmatched with inferred mount in draft when unique', () => {
    const r = matchStateForLensCategory(
      cat,
      [{ LensMake: 'Minolta', LensModel: 'Minolta Rokkor MD 50mm f/1.4' }],
      mounts
    )
    expect(r.kind).toBe('unmatched')
    if (r.kind === 'unmatched') {
      const d = buildLensPresetDraft({ LensMake: 'Minolta', LensModel: 'Minolta Rokkor MD 50mm f/1.4' }, mounts)
      expect(r.draft.payload['LensMount']).toBe('Minolta MD')
      expect(r.draft.lens_mount).toBe('Minolta MD')
      expect(d.payload['LensMount']).toBe('Minolta MD')
    }
  })
})

describe('filmDisplayCandidateFromMetadata', () => {
  it('returns empty without film marker', () => {
    expect(filmDisplayCandidateFromMetadata({ Keywords: ['sunset'], ISO: 400 })).toBe('')
  })
})

describe('integratedLensMatchesFixedLensDisplay', () => {
  it('matches case-insensitive model to fixed display', () => {
    expect(integratedLensMatchesFixedLensDisplay({ LensModel: 'Canon 35mm f/2' }, 'Canon 35mm f/2')).toBe(true)
    expect(integratedLensMatchesFixedLensDisplay({ LensModel: 'canon 35mm f/2' }, 'Canon 35mm f/2')).toBe(true)
  })
  it('treats None preset as empty file lens only', () => {
    expect(integratedLensMatchesFixedLensDisplay({}, 'None')).toBe(true)
    expect(integratedLensMatchesFixedLensDisplay({ LensModel: 'X' }, 'None')).toBe(false)
  })
})

describe('analyzeCameraFirstStaging', () => {
  const flcCatalog = emptyCatalog({
    camera_values: ['None', 'Canon P'],
    camera_file_map: { 'Canon P': 42 },
    camera_identity_by_name: { 'Canon P': 'Canon P' },
    camera_metadata_map: {
      'Canon P': {
        lens_system: 'fixed',
        lens_mount: null,
        lens_adaptable: false,
        locks_lens: true,
        fixed_lens_display: 'Canon 35mm f/2'
      }
    }
  })

  it('FLC good: body and integrated lens match', () => {
    const r = analyzeCameraFirstStaging(flcCatalog, [
      { Make: 'Canon', Model: 'Canon P', LensModel: 'Canon 35mm f/2' }
    ])
    expect(r.skipLensCatalogMatch).toBe(true)
    expect(r.suggestCameraPresetFromMetadata).toBe(false)
    expect(r.autoCameraId).toBe(42)
  })

  it('FLC incomplete: body matches catalog FLC but lens disagrees — suggest Camera +, no auto camera id', () => {
    const r = analyzeCameraFirstStaging(flcCatalog, [
      { Make: 'Canon', Model: 'Canon P', LensModel: 'Wrong Lens' }
    ])
    expect(r.skipLensCatalogMatch).toBe(true)
    expect(r.suggestCameraPresetFromMetadata).toBe(true)
    expect(r.autoCameraId).toBe(null)
  })

  const ilcCatalog = emptyCatalog({
    camera_values: ['None', 'Sony A7'],
    camera_file_map: { 'Sony A7': 7 },
    camera_identity_by_name: { 'Sony A7': 'Sony A7' },
    camera_metadata_map: {
      'Sony A7': {
        lens_system: 'interchangeable',
        lens_mount: 'E',
        lens_adaptable: false,
        locks_lens: false
      }
    },
    lens_values: ['None', 'FE 50mm'],
    lens_file_map: { 'FE 50mm': 99 },
    lens_identity_by_name: { 'FE 50mm': 'FE 50mm' },
    lens_metadata_map: { 'FE 50mm': { lens_mount: 'E' } }
  })

  it('ILC: does not skip lens catalog match; auto-fills camera', () => {
    const r = analyzeCameraFirstStaging(ilcCatalog, [{ Make: 'Sony', Model: 'Sony A7' }])
    expect(r.skipLensCatalogMatch).toBe(false)
    expect(r.autoCameraId).toBe(7)
  })

  it('computeAutoFillPresetIds fills lens when ILC and lens matched', () => {
    const ids = computeAutoFillPresetIds(
      ilcCatalog,
      { Make: 'Sony', Model: 'Sony A7', LensModel: 'FE 50mm' },
      '',
      []
    )
    expect(ids.cameraId).toBe(7)
    expect(ids.lensId).toBe(99)
  })

  it('computeAutoFillPresetIds skips lens id on FLC good path', () => {
    const ids = computeAutoFillPresetIds(
      flcCatalog,
      { Make: 'Canon', Model: 'Canon P', LensModel: 'Canon 35mm f/2' },
      '',
      []
    )
    expect(ids.cameraId).toBe(42)
    expect(ids.lensId).toBe(null)
  })
})
