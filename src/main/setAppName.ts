import { app } from 'electron'

/**
 * Import first from the main entry so `app.setName` runs before other main modules.
 * Affects APIs that read `app.name` / `app.getName()`; the macOS menu bar title in **development**
 * still comes from the Electron.app bundle — see README.
 */
app.setName('EXIFmod')
