import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_OLLAMA_MODEL } from './ollamaConfig.js'

const OLLAMA_PREFS_FILE = 'ollama-prefs.json'

type OllamaPrefsFile = {
  selectedModel?: string
}

function prefsPath(): string | null {
  try {
    if (!app.isReady()) return null
    return join(app.getPath('userData'), OLLAMA_PREFS_FILE)
  } catch {
    return null
  }
}

export function loadOllamaPrefsFile(): OllamaPrefsFile {
  try {
    const p = prefsPath()
    if (!p || !existsSync(p)) return {}
    const raw = readFileSync(p, 'utf8')
    const o = JSON.parse(raw) as unknown
    if (typeof o !== 'object' || o === null) return {}
    return o as OllamaPrefsFile
  } catch {
    return {}
  }
}

export function getSavedOllamaModelName(): string | null {
  const s = loadOllamaPrefsFile().selectedModel?.trim()
  return s || null
}

/**
 * Set the user's chosen Ollama model (ignored for describe if `EXIFMOD_OLLAMA_MODEL` is set).
 */
export function setSavedOllamaModelName(name: string): void {
  const trimmed = name.trim()
  const p = prefsPath()
  if (!p) {
    return
  }
  mkdirSync(app.getPath('userData'), { recursive: true })
  const cur = loadOllamaPrefsFile()
  writeFileSync(
    p,
    `${JSON.stringify({ ...cur, selectedModel: trimmed }, null, 2)}\n`,
    'utf8'
  )
}

export function isOllamaModelSetByEnv(): boolean {
  return Boolean((process.env.EXIFMOD_OLLAMA_MODEL || '').trim())
}

/**
 * Model id used for `/api/chat` and warmup. Env always wins; else saved; else default constant.
 */
export function resolveOllamaModelName(): string {
  const env = (process.env.EXIFMOD_OLLAMA_MODEL || '').trim()
  if (env) return env
  const saved = getSavedOllamaModelName()
  if (saved) return saved
  return DEFAULT_OLLAMA_MODEL
}

export type OllamaModelSelectionInfo = {
  /** Model string sent to Ollama. */
  effectiveModel: string
  /** True when `EXIFMOD_OLLAMA_MODEL` is set. */
  envLocked: boolean
  /** What we last saved, if any. */
  savedModel: string | null
  /** 'env' | 'saved' | 'default' */
  source: 'env' | 'saved' | 'default'
}

export function getOllamaModelSelectionInfo(): OllamaModelSelectionInfo {
  const env = (process.env.EXIFMOD_OLLAMA_MODEL || '').trim()
  if (env) {
    return { effectiveModel: env, envLocked: true, savedModel: getSavedOllamaModelName(), source: 'env' }
  }
  const saved = getSavedOllamaModelName()
  if (saved) {
    return { effectiveModel: saved, envLocked: false, savedModel: saved, source: 'saved' }
  }
  return { effectiveModel: DEFAULT_OLLAMA_MODEL, envLocked: false, savedModel: null, source: 'default' }
}
