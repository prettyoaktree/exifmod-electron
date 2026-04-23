import {
  clampUtf8ByBytes,
  fitKeywordsForExif,
  IMAGEDESCRIPTION_MAX_UTF8_BYTES
} from '../shared/exifLimits.js'
import { OLLAMA_ERROR_EMPTY_SOFT } from '../shared/ollamaResultCodes.js'
import {
  assertLoopbackOllamaBaseUrl,
  buildOllamaChatOptions,
  getOllamaBaseUrlString,
  resolveOllamaModelName
} from './ollamaConfig.js'
import {
  getCustomDescribeSystemPromptTemplate,
  setCustomDescribeSystemPromptTemplate
} from './ollamaDescribePromptPrefs.js'
import { readImagePreviewJpegBase64Ollama } from './previewImage.js'

export { assertLoopbackOllamaBaseUrl, DEFAULT_OLLAMA_BASE, DEFAULT_OLLAMA_MODEL } from './ollamaConfig.js'

/** Substitute per request so the model sees the real EXIF byte cap. */
export const DESCRIBE_SYSTEM_PROMPT_MAX_BYTES_PLACEHOLDER = '{{MAX_DESC_BYTES}}'

export const DEFAULT_DESCRIBE_SYSTEM_PROMPT_TEMPLATE = `You label a photograph for EXIF ImageDescription: high-level scene and main subjects only—setting, time of day, and obvious activity when clear. Reply with ONLY valid JSON, no markdown, no other text.
Shape: {"description":"English; must match the For description rules (edit this sample and those rules together if you change style).","keywords":["short","tokens","lowercase ok"]}
Hard limit: the "description" string must be at most ${DESCRIBE_SYSTEM_PROMPT_MAX_BYTES_PLACEHOLDER} UTF-8 bytes (bytes, not characters). Use far less—leave headroom.

For "description":
- One short telegraphic line (e.g. "Downtown at night, wet street; shop lights."). If you want more than one sentence, change this bullet and the Shape line above to match—models weight the example JSON highly.
- **Do not** list fine details: textures, small objects, background clutter, or minor props unless they define the scene. Skip exact counts, tiny text, and small background figures.
- No mood essays, no poetry, no marketing words. No hedging ("appears to", "likely", "suggesting").

Keywords: 5–20 broad tokens: place type, time/light, main subject type. Skip pixel-level or niche detail. Do not use film stock tokens or the exact phrase "Film Stock".`

const CHAT_TIMEOUT_MS = 180_000
/** Text-only warmup to verify the configured model responds (startup / availability). */
const WARMUP_TIMEOUT_MS = 30_000

/** Resolved loopback API base URL and model (same env defaults as describe). */
export function resolveOllamaConnection(options?: { baseUrl?: string; model?: string }): { api: URL; model: string } {
  const baseUrl = options?.baseUrl ?? getOllamaBaseUrlString()
  const model = options?.model ?? resolveOllamaModelName()
  const api = assertLoopbackOllamaBaseUrl(baseUrl)
  return { api, model }
}

/**
 * Minimal chat completion against the configured model (no image read).
 * Used at startup to detect a reachable Ollama server and warm the model.
 */
export async function ollamaWarmup(options?: { baseUrl?: string; model?: string }): Promise<{ ok: boolean }> {
  let api: URL
  let model: string
  const opts = buildOllamaChatOptions()
  try {
    ;({ api, model } = resolveOllamaConnection(options))
  } catch {
    return { ok: false }
  }

  const chatUrl = new URL('/api/chat', api).href
  const body = JSON.stringify({
    model,
    stream: false,
    think: false,
    messages: [{ role: 'user', content: 'ping' }],
    options: {
      temperature: opts.temperature,
      top_p: opts.top_p,
      num_predict: 32,
      num_ctx: opts.num_ctx
    }
  })

  try {
    const res = await fetch(chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(WARMUP_TIMEOUT_MS)
    })
    if (!res.ok) return { ok: false }
    const data = (await res.json()) as { message?: { content?: string } }
    const content = data.message?.content
    if (typeof content !== 'string' || !content.trim()) return { ok: false }
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export function formatDescribeSystemPromptTemplate(
  template: string,
  maxDescriptionUtf8Bytes: number
): string {
  return template.split(DESCRIBE_SYSTEM_PROMPT_MAX_BYTES_PLACEHOLDER).join(String(maxDescriptionUtf8Bytes))
}

function resolveDescribeSystemPromptForRequest(maxDescriptionUtf8Bytes: number): string {
  const custom = getCustomDescribeSystemPromptTemplate()
  const base =
    custom != null && custom.trim().length > 0 ? custom : DEFAULT_DESCRIBE_SYSTEM_PROMPT_TEMPLATE
  return formatDescribeSystemPromptTemplate(base, maxDescriptionUtf8Bytes)
}

export function getDescribeSystemPrompt(maxDescriptionUtf8Bytes?: number): string {
  const rawCap = maxDescriptionUtf8Bytes
  const maxDescBytes =
    rawCap == null || !Number.isFinite(rawCap)
      ? IMAGEDESCRIPTION_MAX_UTF8_BYTES
      : Math.min(IMAGEDESCRIPTION_MAX_UTF8_BYTES, Math.max(0, Math.floor(rawCap)))
  const cap = maxDescBytes <= 0 ? 1 : maxDescBytes
  return resolveDescribeSystemPromptForRequest(cap)
}

export function getDescribeSystemPromptState(): { isCustom: boolean; template: string } {
  const c = getCustomDescribeSystemPromptTemplate()
  if (c != null && c.trim().length > 0) {
    return { isCustom: true, template: c }
  }
  return { isCustom: false, template: DEFAULT_DESCRIBE_SYSTEM_PROMPT_TEMPLATE }
}

export function setDescribeSystemPromptFromUser(
  template: string | null | undefined
): { ok: true } | { ok: false; error: 'missing_placeholder' } {
  if (template == null || !String(template).trim()) {
    setCustomDescribeSystemPromptTemplate(null)
    return { ok: true }
  }
  const t = String(template)
  if (!t.includes(DESCRIBE_SYSTEM_PROMPT_MAX_BYTES_PLACEHOLDER)) {
    return { ok: false, error: 'missing_placeholder' }
  }
  setCustomDescribeSystemPromptTemplate(t)
  return { ok: true }
}

function parseAssistantJson(content: string): { description: string; keywords: string[] } | null {
  const t = content.trim()
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1]!.trim() : t
  try {
    const o = JSON.parse(raw) as unknown
    if (typeof o !== 'object' || o === null) return null
    const obj = o as Record<string, unknown>
    const description = String(obj['description'] ?? '').trim()
    const kw = obj['keywords']
    const keywords = Array.isArray(kw)
      ? kw.map((x) => String(x).trim()).filter(Boolean).slice(0, 40)
      : []
    return { description, keywords }
  } catch {
    return null
  }
}

export type OllamaDescribeResult =
  | { ok: true; description: string; keywords: string[] }
  | { ok: false; error: string }

export async function ollamaDescribeImage(
  filePath: string,
  options?: { baseUrl?: string; model?: string; maxDescriptionUtf8Bytes?: number }
): Promise<OllamaDescribeResult> {
  const model = options?.model ?? resolveOllamaModelName()
  const baseUrl = options?.baseUrl ?? getOllamaBaseUrlString()
  const rawCap = options?.maxDescriptionUtf8Bytes
  const maxDescBytes =
    rawCap == null || !Number.isFinite(rawCap)
      ? IMAGEDESCRIPTION_MAX_UTF8_BYTES
      : Math.min(IMAGEDESCRIPTION_MAX_UTF8_BYTES, Math.max(0, Math.floor(rawCap)))
  if (maxDescBytes <= 0) {
    return { ok: false, error: 'No room left for Notes (ImageDescription limit reached).' }
  }
  let api: URL
  try {
    api = assertLoopbackOllamaBaseUrl(baseUrl)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  let imageBase64: string
  try {
    imageBase64 = await readImagePreviewJpegBase64Ollama(filePath)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  const chatUrl = new URL('/api/chat', api).href
  const oOpts = buildOllamaChatOptions()
  const body = JSON.stringify({
    model,
    stream: false,
    think: false,
    messages: [
      {
        role: 'user',
        content: resolveDescribeSystemPromptForRequest(maxDescBytes),
        images: [imageBase64]
      }
    ],
    options: oOpts
  })

  try {
    const res = await fetch(chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(CHAT_TIMEOUT_MS)
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return { ok: false, error: `Ollama HTTP ${res.status}${errText ? `: ${errText.slice(0, 200)}` : ''}` }
    }
    const data = (await res.json()) as { message?: { content?: string } }
    const content = data.message?.content
    if (typeof content !== 'string' || !content.trim()) {
      return { ok: false, error: 'Ollama returned an empty response' }
    }
    const parsed = parseAssistantJson(content)
    if (!parsed) {
      return { ok: false, error: 'Could not parse JSON from model response' }
    }
    const description = clampUtf8ByBytes(parsed.description.trim(), maxDescBytes)
    const keywords = fitKeywordsForExif(parsed.keywords)
    if (!description.trim() && keywords.length === 0) {
      return { ok: false, error: OLLAMA_ERROR_EMPTY_SOFT }
    }
    return {
      ok: true,
      description,
      keywords
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}
