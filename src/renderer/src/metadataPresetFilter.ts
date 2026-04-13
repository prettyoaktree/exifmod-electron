/**
 * Client-side preset list filtering: case-insensitive substring match on display labels.
 */

export function filterOptionsByDisplayQuery(
  options: string[],
  query: string,
  display: (internal: string) => string
): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...options]
  return options.filter((opt) => display(opt).toLowerCase().includes(q))
}
