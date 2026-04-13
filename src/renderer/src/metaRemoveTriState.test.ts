import { describe, expect, it } from 'vitest'
import { anyStagedClear, mergeRemoveTriState } from './metaRemoveTriState'

describe('mergeRemoveTriState', () => {
  it('returns allOff for empty paths', () => {
    expect(mergeRemoveTriState([], () => true)).toBe('allOff')
  })

  it('returns allOn when every path is true', () => {
    expect(mergeRemoveTriState(['a', 'b'], (p) => p === 'a' || p === 'b')).toBe('allOn')
  })

  it('returns allOff when every path is false', () => {
    expect(mergeRemoveTriState(['a', 'b'], () => false)).toBe('allOff')
  })

  it('returns mixed when values differ', () => {
    expect(mergeRemoveTriState(['a', 'b', 'c'], (p) => p === 'b')).toBe('mixed')
  })
})

describe('anyStagedClear', () => {
  it('is false when no path is true', () => {
    expect(anyStagedClear(['a', 'b'], () => false)).toBe(false)
  })

  it('is true when any path is true', () => {
    expect(anyStagedClear(['a', 'b'], (p) => p === 'b')).toBe(true)
  })
})
