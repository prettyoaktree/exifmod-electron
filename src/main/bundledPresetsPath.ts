import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/** Dev: `out/main` → repo `resources/default-presets`. Packaged: `Resources/default-presets`. */
export function resolveBundledDefaultPresetsDir(): string | null {
  if (app.isPackaged) {
    const p = join(process.resourcesPath, 'default-presets')
    return existsSync(p) ? p : null
  }
  const dev = join(__dirname, '../../resources/default-presets')
  return existsSync(dev) ? dev : null
}
