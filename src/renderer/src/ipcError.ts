/**
 * `ipcRenderer.invoke` rejects with an Error whose message is often:
 * `Error invoking remote method 'channel': Error: <inner>`
 * UI should show only the inner message.
 */
export function unwrapIpcErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  const m = raw.match(/^Error invoking remote method '[^']+':\s*(.+)$/s)
  if (!m?.[1]) return raw
  let inner = m[1].trim()
  for (let i = 0; i < 5 && /^Error:\s*/i.test(inner); i++) {
    inner = inner.replace(/^Error:\s*/i, '').trim()
  }
  return inner || raw
}
