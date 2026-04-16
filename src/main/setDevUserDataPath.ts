import { app } from 'electron'
import { basename, dirname, join } from 'node:path'

/**
 * Development / unpackaged runs use a separate Electron `userData` directory so preset SQLite,
 * config JSON, tutorial flags, etc. do not overlap the installed release (`EXIFmod`).
 * Must run after `./setAppName.js` and before any `app.getPath('userData')`.
 */
if (!app.isPackaged) {
  const current = app.getPath('userData')
  const devRoot = join(dirname(current), `${basename(current)}-dev`)
  app.setPath('userData', devRoot)
}
