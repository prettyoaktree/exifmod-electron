import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Terminal sessions inherit the user's shell PATH; GUI macOS apps often do not include Homebrew.
 * `child_process.spawn('ollama', …)` resolves against `process.env.PATH` — prepend common dirs so
 * the Ollama CLI matches Terminal behavior after double-click or Finder launch.
 */
function augmentPathForGuiLaunchedApp(): void {
  const sep = process.platform === 'win32' ? ';' : ':'
  const extra =
    process.platform === 'darwin'
      ? ['/opt/homebrew/bin', '/usr/local/bin', join(homedir(), '.local/bin')]
      : process.platform === 'win32'
        ? []
        : ['/usr/local/bin', join(homedir(), '.local/bin')]

  const existing = (process.env.PATH ?? '').split(sep).filter(Boolean)
  const seen = new Set(existing)
  const prepended: string[] = []
  for (const dir of extra) {
    if (!seen.has(dir)) {
      prepended.push(dir)
      seen.add(dir)
    }
  }
  if (prepended.length === 0) return
  process.env.PATH = [...prepended, ...existing].join(sep)
}

augmentPathForGuiLaunchedApp()
