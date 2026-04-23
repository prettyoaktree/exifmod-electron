/** Shared Ollama loopback URL validation and describe tuning defaults (main process). */

export const DEFAULT_OLLAMA_BASE = 'http://127.0.0.1:11434'
export const DEFAULT_OLLAMA_MODEL = 'gemma4'

const DEFAULT_NUM_CTX = 16_384
const DEFAULT_NUM_PREDICT = 448
const DEFAULT_TEMPERATURE = 0.2
const DEFAULT_TOP_P = 0.9

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

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw == null || raw === '') return fallback
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return n
}

function parseFiniteEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw == null || raw === '') return fallback
  const n = Number.parseFloat(raw)
  if (!Number.isFinite(n)) return fallback
  return n
}

/** Ollama `/api/chat` `options` for describe + warmup (non-streaming). */
export function buildOllamaChatOptions(): {
  temperature: number
  top_p: number
  num_predict: number
  num_ctx: number
} {
  return {
    temperature: parseFiniteEnv('EXIFMOD_OLLAMA_TEMPERATURE', DEFAULT_TEMPERATURE),
    top_p: DEFAULT_TOP_P,
    num_predict: parsePositiveIntEnv('EXIFMOD_OLLAMA_NUM_PREDICT', DEFAULT_NUM_PREDICT),
    num_ctx: parsePositiveIntEnv('EXIFMOD_OLLAMA_NUM_CTX', DEFAULT_NUM_CTX)
  }
}

export function getOllamaBaseUrlString(): string {
  return process.env.EXIFMOD_OLLAMA_HOST ?? DEFAULT_OLLAMA_BASE
}
