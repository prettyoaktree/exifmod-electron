/**
 * Tri-state merge for per-file "Remove" (clear-on-write) flags when multiple files are staged.
 */

export type RemoveTriState = 'allOn' | 'allOff' | 'mixed'

export function mergeRemoveTriState(paths: string[], getFlag: (path: string) => boolean): RemoveTriState {
  if (paths.length === 0) return 'allOff'
  const vals = paths.map(getFlag)
  if (vals.every(Boolean)) return 'allOn'
  if (vals.every((v) => !v)) return 'allOff'
  return 'mixed'
}

export function anyStagedClear(paths: string[], getFlag: (path: string) => boolean): boolean {
  return paths.some(getFlag)
}
