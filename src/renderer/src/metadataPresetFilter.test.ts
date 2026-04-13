import { describe, expect, it } from 'vitest'
import { filterOptionsByDisplayQuery } from './metadataPresetFilter.js'

describe('filterOptionsByDisplayQuery', () => {
  const display = (s: string) => (s === 'None' ? 'Do not modify' : s)

  it('returns all options when query is empty or whitespace', () => {
    const opts = ['None', 'Alpha', 'Beta']
    expect(filterOptionsByDisplayQuery(opts, '', display)).toEqual(opts)
    expect(filterOptionsByDisplayQuery(opts, '   ', display)).toEqual(opts)
  })

  it('matches case-insensitive substring on display string', () => {
    const opts = ['None', 'Kodak Portra', 'Kodak Gold']
    expect(filterOptionsByDisplayQuery(opts, 'port', display)).toEqual(['Kodak Portra'])
    expect(filterOptionsByDisplayQuery(opts, 'KODAK', display)).toEqual(['Kodak Portra', 'Kodak Gold'])
  })

  it('matches localized None label', () => {
    const opts = ['None', 'Other']
    expect(filterOptionsByDisplayQuery(opts, 'modify', display)).toEqual(['None'])
  })

  it('returns empty array when nothing matches', () => {
    expect(filterOptionsByDisplayQuery(['A', 'B'], 'zzz', (x) => x)).toEqual([])
  })
})
