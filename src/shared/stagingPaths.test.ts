import { describe, expect, it } from 'vitest'
import { getStagingPaths } from './stagingPaths.js'

const files = ['/a/one.tif', '/a/two.tif', '/a/three.tif']

describe('getStagingPaths', () => {
  it('returns empty when no files', () => {
    expect(getStagingPaths([], new Set(), 0)).toEqual([])
    expect(getStagingPaths([], new Set([0]), null)).toEqual([])
  })

  it('uses currentIndex when nothing is selected', () => {
    expect(getStagingPaths(files, new Set(), 1)).toEqual(['/a/two.tif'])
    expect(getStagingPaths(files, new Set(), null)).toEqual([])
    expect(getStagingPaths(files, new Set(), 99)).toEqual([])
  })

  it('uses the single selected index, not a different currentIndex', () => {
    expect(getStagingPaths(files, new Set([0]), 2)).toEqual(['/a/one.tif'])
    expect(getStagingPaths(files, new Set([2]), 0)).toEqual(['/a/three.tif'])
  })

  it('returns all selected paths sorted by index when multiple selected', () => {
    expect(getStagingPaths(files, new Set([2, 0]), 1)).toEqual(['/a/one.tif', '/a/three.tif'])
  })

  it('filters invalid indices when multiple selected', () => {
    expect(getStagingPaths(files, new Set([0, 2, 5, -1]), 1)).toEqual(['/a/one.tif', '/a/three.tif'])
  })
})
