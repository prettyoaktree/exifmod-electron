import { describe, expect, it } from 'vitest'
import { multiSelectAutofillSkips } from './infer.js'
import type { ConfigCatalog } from '@shared/types.js'

function catalog(over: Partial<ConfigCatalog> = {}): ConfigCatalog {
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
    camera_payload_by_name: { None: {} },
    lens_payload_by_name: { None: {} },
    author_payload_by_name: { None: {} },
    film_payload_by_name: { None: {} },
    ...over
  }
}

describe('multiSelectAutofillSkips', () => {
  it('returns empty flags for a single path', () => {
    const cat = catalog()
    const m = { Make: 'X', Model: 'Y' }
    expect(multiSelectAutofillSkips(cat, ['/a'], { '/a': m })).toEqual({})
  })

  it('marks camera when inferred camera strings differ', () => {
    const cat = catalog()
    const skips = multiSelectAutofillSkips(cat, ['/x', '/y'], {
      '/x': { Make: 'A', Model: 'A1' },
      '/y': { Make: 'B', Model: 'B1' }
    })
    expect(skips.camera).toBe(true)
  })
})
