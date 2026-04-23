/**
 * Paths whose metadata is shown/edited in the metadata pane and applied on write.
 *
 * - **2+ selected:** all selected rows (batch).
 * - **1 selected:** that row only (even if keyboard focus is elsewhere).
 * - **0 selected:** the focused row (`currentIndex`) if in range, else none.
 */
export function getStagingPaths(
  files: string[],
  selectedIndices: Set<number>,
  currentIndex: number | null
): string[] {
  const n = files.length
  const rows = [...selectedIndices].sort((a, b) => a - b)
  if (rows.length > 1) {
    return rows.filter((r) => r >= 0 && r < n).map((r) => files[r]!)
  }
  if (rows.length === 1) {
    const r = rows[0]!
    if (r >= 0 && r < n) return [files[r]!]
  }
  if (currentIndex != null && currentIndex >= 0 && currentIndex < n) {
    return [files[currentIndex]!]
  }
  return []
}
