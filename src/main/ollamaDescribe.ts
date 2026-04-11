import {
  clampUtf8ByBytes,
  fitKeywordsForExif,
  IMAGEDESCRIPTION_MAX_UTF8_BYTES
} from '../shared/exifLimits.js'
import { readImagePreviewJpegBase64 } from './previewImage.js'

const DEFAULT_BASE = 'http://127.0.0.1:11434'
const DEFAULT_MODEL = 'gemma4'
const CHAT_TIMEOUT_MS = 180_000

/** Allow only loopback — reject LAN/public hosts. */
export function assertLoopbackOllamaBaseUrl(urlString: string): URL {
  let u: URL
  try {
    u = new URL(urlString)
  } catch {
    throw new Error('Invalid Ollama URL')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Ollama URL must use http or https')
  }
  const h = u.hostname
  const hl = h.toLowerCase()
  if (hl === '127.0.0.1' || hl === 'localhost' || hl === '::1' || h === '[::1]') {
    return u
  }
  throw new Error('Ollama URL must use a loopback host (127.0.0.1, localhost, or ::1)')
}

function buildSystemPrompt(maxDescriptionUtf8Bytes: number): string {
  return `You describe a photograph for EXIF ImageDescription metadata (a short file label, not a caption essay). Reply with ONLY valid JSON, no markdown, no other text.
Shape: {"description":"one terse line in English","keywords":["short","tokens","lowercase ok"]}
Hard limit: the "description" string must be at most ${maxDescriptionUtf8Bytes} UTF-8 bytes (bytes, not characters). Aim to use far less—leave headroom. If you are near the limit, you are writing too much.

For "description" follow ALL of these:
- Prefer exactly ONE short sentence. Two sentences only if one cannot list the essentials; never write three or more.
- Keep it under ~35 words and ~220 characters as a soft target (still respect the UTF-8 byte limit above).
- Telegraphic catalog style: main subject, setting, one or two concrete facts. Example tone: "City street at night; wet pavement; neon signs." Not a scenic paragraph.
- Minimal adjectives. No stacked clauses, no comma chains that read like a tour of the frame.
- No hedging or guesswork phrasing: avoid "likely", "probably", "appears to", "suggesting", "creating a sense of".
- No mood-atmosphere essays: do not narrate sky, water, reflections, and season in separate phrases unless one short phrase suffices.
- No poetry, marketing, or filler words ("breathtaking", "calm reflective", "muted", "prominent" unless necessary).

Keywords: 5–20 short tokens (subjects, setting, objects). Do not repeat film stock tokens or the word "Film Stock" in keywords.`
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
  const baseUrl = options?.baseUrl ?? process.env.EXIFMOD_OLLAMA_HOST ?? DEFAULT_BASE
  const model = options?.model ?? process.env.EXIFMOD_OLLAMA_MODEL ?? DEFAULT_MODEL
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
    imageBase64 = await readImagePreviewJpegBase64(filePath)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  const chatUrl = new URL('/api/chat', api).href
  const body = JSON.stringify({
    model,
    stream: false,
    messages: [
      {
        role: 'user',
        content: buildSystemPrompt(maxDescBytes),
        images: [imageBase64]
      }
    ]
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
    return {
      ok: true,
      description: clampUtf8ByBytes(parsed.description.trim(), maxDescBytes),
      keywords: fitKeywordsForExif(parsed.keywords)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}
