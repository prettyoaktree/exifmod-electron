/**
 * True when `ollamaDescribeImage` failed due to an HTTP transport error (e.g. Ollama not listening).
 * Node’s `fetch` often surfaces this as a `TypeError` with message `fetch failed`.
 */
export function isOllamaTransportFailureError(message: string): boolean {
  const s = message.trim().toLowerCase()
  return s.includes('fetch failed')
}
