import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const FILE = 'ollama-describe-prompt-prefs.json'

type PrefsFile = {
  customSystemPromptTemplate?: string
}

function path(): string | null {
  try {
    if (!app.isReady()) return null
    return join(app.getPath('userData'), FILE)
  } catch {
    return null
  }
}

function read(): PrefsFile {
  try {
    const p = path()
    if (!p || !existsSync(p)) return {}
    const raw = readFileSync(p, 'utf8')
    const o = JSON.parse(raw) as unknown
    if (typeof o !== 'object' || o === null) return {}
    return o as PrefsFile
  } catch {
    return {}
  }
}

/** Raw template (may include `{{MAX_DESC_BYTES}}`); `null` if using the app default. */
export function getCustomDescribeSystemPromptTemplate(): string | null {
  const t = read().customSystemPromptTemplate
  if (typeof t !== 'string') return null
  const s = t.trim()
  return s ? t : null
}

export function setCustomDescribeSystemPromptTemplate(template: string | null): void {
  const p = path()
  if (!p) {
    return
  }
  mkdirSync(app.getPath('userData'), { recursive: true })
  const cur = read()
  if (template == null || !template.trim()) {
    const next: PrefsFile = { ...cur }
    delete next.customSystemPromptTemplate
    writeFileSync(p, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    return
  }
  writeFileSync(p, `${JSON.stringify({ ...cur, customSystemPromptTemplate: template }, null, 2)}\n`, 'utf8')
}
