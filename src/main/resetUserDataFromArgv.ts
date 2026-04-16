import { app, dialog } from 'electron'
import { existsSync, mkdirSync, rmSync } from 'node:fs'

/** Wipe EXIFmod `userData` (presets DB, config JSON, tutorial flags, etc.). Pass on the command line for QA. */
export const RESET_APP_DATA_ARG = '--reset-app-data'

/**
 * If argv contains {@link RESET_APP_DATA_ARG}, deletes the entire Electron `userData` directory for this app
 * and recreates an empty root so later startup steps can mkdir subpaths.
 * @returns whether a reset was performed
 */
export function resetUserDataIfRequestedFromArgv(argv: string[] = process.argv): boolean {
  if (!argv.includes(RESET_APP_DATA_ARG)) return false
  const root = app.getPath('userData')
  console.warn('[EXIFmod] Removing all application data (--reset-app-data):', root)
  try {
    if (existsSync(root)) {
      rmSync(root, { maxRetries: 3, recursive: true, force: true })
    }
    mkdirSync(root, { recursive: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[EXIFmod] --reset-app-data failed:', e)
    dialog.showErrorBox('EXIFmod', `Could not reset application data: ${msg}`)
    app.exit(1)
  }
  return true
}
