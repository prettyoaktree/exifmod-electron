import { app, dialog } from 'electron'
// electron-updater is CJS; named ESM import breaks at runtime in Electron (see package interop).
import electronUpdater from 'electron-updater'
import { i18next } from './i18n.js'
import type { UpdaterUiPayload } from '../shared/updaterUi.js'

const { autoUpdater } = electronUpdater

const STARTUP_CHECK_DELAY_MS = 8_000

export type { UpdaterUiPayload } from '../shared/updaterUi.js'

let wired = false
let vocalManualCheck = false

export type AutoUpdateOptions = {
  /** Called before `quitAndInstall` so the main window close guard does not block shutdown. */
  allowQuitForInstall: () => void
  /** Push UI state to the renderer (macOS packaged app only). */
  sendToRenderer: (payload: UpdaterUiPayload) => void
}

function send(opts: AutoUpdateOptions, payload: UpdaterUiPayload): void {
  opts.sendToRenderer(payload)
}

function wireOnce(opts: AutoUpdateOptions): void {
  if (wired) return
  wired = true

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    const version = info.version ?? ''
    send(opts, { kind: 'available', version })
    if (vocalManualCheck) vocalManualCheck = false
  })

  autoUpdater.on('update-not-available', () => {
    if (vocalManualCheck) {
      vocalManualCheck = false
      send(opts, { kind: 'upToDate', version: app.getVersion() })
    }
  })

  autoUpdater.on('download-progress', (prog) => {
    const pct = typeof prog.percent === 'number' && !Number.isNaN(prog.percent) ? prog.percent : 0
    send(opts, {
      kind: 'downloading',
      percent: pct,
      transferred: prog.transferred ?? 0,
      total: prog.total ?? 0
    })
  })

  autoUpdater.on('update-downloaded', () => {
    send(opts, { kind: 'downloaded' })
  })

  autoUpdater.on('error', (err) => {
    console.error('[autoUpdate]', err)
    const msg = err instanceof Error ? err.message : String(err)
    if (vocalManualCheck) {
      vocalManualCheck = false
      send(opts, { kind: 'error', message: msg })
    }
  })
}

export function isAutoUpdateSupported(): boolean {
  return app.isPackaged && process.platform === 'darwin'
}

export function registerMacAutoUpdates(opts: AutoUpdateOptions): void {
  if (!isAutoUpdateSupported()) return
  wireOnce(opts)
  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch((e) => {
      console.error('[autoUpdate] startup check failed', e)
    })
  }, STARTUP_CHECK_DELAY_MS)
}

export async function manualCheckForUpdates(opts: AutoUpdateOptions): Promise<void> {
  if (!isAutoUpdateSupported()) {
    await dialog.showMessageBox({
      type: 'info',
      message: i18next.t('updater.devOnlyTitle'),
      detail: i18next.t('updater.devOnlyDetail')
    })
    return
  }
  wireOnce(opts)
  vocalManualCheck = true
  send(opts, { kind: 'checking' })
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    vocalManualCheck = false
    send(opts, {
      kind: 'error',
      message: e instanceof Error ? e.message : String(e)
    })
  }
}

export async function downloadPendingUpdate(): Promise<void> {
  if (!isAutoUpdateSupported()) return
  await autoUpdater.downloadUpdate()
}

export function quitAndInstallUpdate(opts: AutoUpdateOptions): void {
  opts.allowQuitForInstall()
  autoUpdater.quitAndInstall(false, true)
}

export function dismissUpdaterToIdle(opts: AutoUpdateOptions): void {
  send(opts, { kind: 'idle' })
}
