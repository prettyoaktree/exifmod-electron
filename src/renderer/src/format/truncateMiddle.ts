/** Middle ellipsis: keep start and end of filename for recognition. */
export function truncateMiddle(text: string, maxLen: number, ellipsis = '…'): string {
  if (text.length <= maxLen) return text
  const el = ellipsis.length
  const keep = maxLen - el
  if (keep < 4) return text.slice(0, maxLen - el) + ellipsis
  const head = Math.ceil(keep / 2)
  const tail = Math.floor(keep / 2)
  return text.slice(0, head) + ellipsis + text.slice(text.length - tail)
}
