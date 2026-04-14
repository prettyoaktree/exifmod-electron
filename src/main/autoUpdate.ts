import { app, dialog } from 'electron'
// electron-updater is CJS; named ESM import breaks at runtime in Electron (see package interop).
import electronUpdater from 'electron-updater'
import { i18next } from './i18n.js'

const { autoUpdater } = electronUpdater

const STARTUP_CHECK_DELAY_MS = 8_000

let wired = false
let vocalManualCheck = false
let busy = false

export type AutoUpdateOptions = {
  /** Called before `quitAndInstall` so the main window close guard does not block shutdown. */
  allowQuitForInstall: () => void
}

function t(key: string, opts?: Record<string, string | number>): string {
  return opts ? i18next.t(key, opts) : i18next.t(key)
}

async function promptDownload(version: string): Promise<boolean> {
  const r = await dialog.showMessageBox({
    type: 'info',
    buttons: [t('updater.downloadButton'), t('updater.laterButton')],
    defaultId: 0,
    cancelId: 1,
    message: t('updater.updateAvailableTitle'),
    detail: t('updater.updateAvailableDetail', { version })
  })
  return r.response === 0
}

async function promptRestart(): Promise<boolean> {
  const r = await dialog.showMessageBox({
    type: 'info',
    buttons: [t('updater.restartButton'), t('updater.laterButton')],
    defaultId: 0,
    cancelId: 1,
    message: t('updater.downloadedTitle'),
    detail: t('updater.downloadedDetail')
  })
  return r.response === 0
}

function wireOnce(opts: AutoUpdateOptions): void {
  if (wired) return
  wired = true

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', async (info) => {
    if (busy) return
    busy = true
    const wasManual = vocalManualCheck
    try {
      const version = info.version ?? ''
      const ok = await promptDownload(version)
      if (ok) {
        await autoUpdater.downloadUpdate()
      }
    } catch (e) {
      console.error('[autoUpdate] download failed', e)
      if (wasManual) {
        await dialog.showMessageBox({
          type: 'error',
          message: t('updater.checkFailedTitle'),
          detail: e instanceof Error ? e.message : String(e)
        })
      }
    } finally {
      busy = false
      if (wasManual) vocalManualCheck = false
    }
  })

  autoUpdater.on('update-not-available', async () => {
    if (vocalManualCheck) {
      vocalManualCheck = false
      await dialog.showMessageBox({
        type: 'info',
        message: t('updater.upToDateTitle'),
        detail: t('updater.upToDateDetail', { version: app.getVersion() })
      })
    }
  })

  autoUpdater.on('update-downloaded', async () => {
    const ok = await promptRestart()
    if (!ok) return
    opts.allowQuitForInstall()
    autoUpdater.quitAndInstall(false, true)
  })

  autoUpdater.on('error', (err) => {
    console.error('[autoUpdate]', err)
    if (vocalManualCheck) {
      vocalManualCheck = false
      void dialog.showMessageBox({
        type: 'error',
        message: t('updater.checkFailedTitle'),
        detail: err instanceof Error ? err.message : String(err)
      })
    }
  })
}

export function registerMacAutoUpdates(opts: AutoUpdateOptions): void {
  if (!app.isPackaged || process.platform !== 'darwin') return
  wireOnce(opts)
  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch((e) => {
      console.error('[autoUpdate] startup check failed', e)
    })
  }, STARTUP_CHECK_DELAY_MS)
}

export async function manualCheckForUpdates(opts: AutoUpdateOptions): Promise<void> {
  if (!app.isPackaged || process.platform !== 'darwin') {
    await dialog.showMessageBox({
      type: 'info',
      message: t('updater.devOnlyTitle'),
      detail: t('updater.devOnlyDetail')
    })
    return
  }
  wireOnce(opts)
  vocalManualCheck = true
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    vocalManualCheck = false
    await dialog.showMessageBox({
      type: 'error',
      message: t('updater.checkFailedTitle'),
      detail: e instanceof Error ? e.message : String(e)
    })
  }
}
