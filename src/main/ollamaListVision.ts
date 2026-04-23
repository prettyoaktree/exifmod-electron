import { assertLoopbackOllamaBaseUrl, getOllamaBaseUrlString } from './ollamaConfig.js'

const CACHE_TTL_MS = 45_000
const DEFAULT_CONCURRENCY = 6

type CacheEntry = { at: number; key: string; names: string[] }
let listCache: CacheEntry | null = null

export function bustOllamaVisionListCache(): void {
  listCache = null
}

type TagsResponse = { models?: Array<{ name?: string }> }
type ShowResponse = { capabilities?: string[] }

async function ollamaShowModel(api: URL, name: string, signal: AbortSignal): Promise<string[] | null> {
  const showUrl = new URL('/api/show', api).href
  const res = await fetch(showUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
    signal
  })
  if (!res.ok) return null
  const data = (await res.json()) as ShowResponse
  const caps = data.capabilities
  if (!Array.isArray(caps)) return null
  return caps.includes('vision') ? [name] : []
}

export async function ollamaListVisionModelNamesInternal(options: {
  api: URL
  signal?: AbortSignal
  concurrency?: number
}): Promise<{ ok: true; models: string[] } | { ok: false; error: string }> {
  const { api, signal, concurrency = DEFAULT_CONCURRENCY } = options
  const tagsUrl = new URL('/api/tags', api).href
  let res: Response
  try {
    res = await fetch(tagsUrl, { method: 'GET', signal: signal ?? AbortSignal.timeout(30_000) })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    return { ok: false, error: `Ollama HTTP ${res.status}${t ? `: ${t.slice(0, 200)}` : ''}` }
  }
  const data = (await res.json()) as TagsResponse
  const names = (data.models ?? [])
    .map((m) => (typeof m.name === 'string' ? m.name : ''))
    .filter(Boolean)
  if (names.length === 0) {
    return { ok: true, models: [] }
  }
  const vision: string[] = []
  for (let i = 0; i < names.length; i += concurrency) {
    const chunk = names.slice(i, i + concurrency)
    const results = await Promise.all(
      chunk.map((n) => ollamaShowModel(api, n, signal ?? AbortSignal.timeout(60_000)))
    )
    for (const r of results) {
      if (r) vision.push(...r)
    }
  }
  vision.sort((a, b) => a.localeCompare(b))
  return { ok: true, models: vision }
}

/**
 * List installed Ollama models that report the `vision` capability (Ollama 0.20+ `POST /api/show`).
 */
export async function ollamaListVisionModelNames(options?: {
  baseUrl?: string
}): Promise<{ ok: true; models: string[] } | { ok: false; error: string }> {
  const baseUrl = options?.baseUrl ?? getOllamaBaseUrlString()
  let api: URL
  try {
    api = assertLoopbackOllamaBaseUrl(baseUrl)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  return ollamaListVisionModelNamesInternal({ api })
}

/**
 * Same as `ollamaListVisionModelNames` with a short in-memory cache; use `forceRefresh` to bypass.
 */
export async function ollamaListVisionModelNamesWithCache(
  options?: { forceRefresh?: boolean; baseUrl?: string }
): Promise<{ ok: true; models: string[] } | { ok: false; error: string }> {
  const baseUrl = options?.baseUrl ?? getOllamaBaseUrlString()
  let api: URL
  try {
    api = assertLoopbackOllamaBaseUrl(baseUrl)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  const key = api.href
  if (!options?.forceRefresh && listCache && listCache.key === key && Date.now() - listCache.at < CACHE_TTL_MS) {
    return { ok: true, models: [...listCache.names] }
  }
  const r = await ollamaListVisionModelNamesInternal({ api })
  if (!r.ok) return r
  listCache = { at: Date.now(), key, names: r.models }
  return { ok: true, models: r.models }
}
