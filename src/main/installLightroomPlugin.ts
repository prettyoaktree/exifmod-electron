import { existsSync, mkdirSync, cpSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { app, dialog, type BrowserWindow } from 'electron'
import { i18next } from './i18n.js'

export const PLUGIN_BUNDLE_RELEASE = 'EXIFmodOpen.lrplugin'
export const PLUGIN_BUNDLE_DEV = 'EXIFmodOpenDev.lrplugin'

/** Path inside the `electron` npm package (macOS). */
export function resolveDevElectronAppBundle(repoRoot: string): string {
  return join(resolve(repoRoot), 'node_modules/electron/dist/Electron.app')
}

/** Lua single-quoted string: escape backslashes and single quotes. */
export function escapePathForLuaSingleQuotedString(path: string): string {
  return path.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/** Placeholders in OpenInExifmodDev.lua (single-quoted Lua string literals). */
const DEV_LUA_ELECTRON_APP_PLACEHOLDER_QUOTED = "'__EXIFMOD_DEV_ELECTRON_APP__'"
const DEV_LUA_REPO_ROOT_PLACEHOLDER_QUOTED = "'__EXIFMOD_DEV_REPO_ROOT__'"

/** Injects absolute paths to Electron.app and repo root for the dev Lightroom plug-in. */
export function patchOpenInExifmodDevLua(
  luaSource: string,
  electronAppPath: string,
  repoRoot: string
): string {
  let s = luaSource
  if (s.includes(DEV_LUA_ELECTRON_APP_PLACEHOLDER_QUOTED)) {
    s = s.replace(
      DEV_LUA_ELECTRON_APP_PLACEHOLDER_QUOTED,
      `'${escapePathForLuaSingleQuotedString(electronAppPath)}'`
    )
  }
  if (s.includes(DEV_LUA_REPO_ROOT_PLACEHOLDER_QUOTED)) {
    s = s.replace(
      DEV_LUA_REPO_ROOT_PLACEHOLDER_QUOTED,
      `'${escapePathForLuaSingleQuotedString(resolve(repoRoot))}'`
    )
  }
  return s
}

/** Adobe Lightroom Classic: third-party plug-ins in the user Modules folder (macOS). */
export function lightroomModulesDestPath(bundleName: string): string {
  return join(homedir(), 'Library/Application Support/Adobe/Lightroom/Modules', bundleName)
}

/**
 * Packaged app: `resources/EXIFmodOpen.lrplugin` from electron-builder extraResources.
 * Dev: repo `extras/lightroom-classic-exifmod-open/EXIFmodOpen.lrplugin` (cwd = project root).
 */
export function resolveBundledReleasePluginSource(): string | null {
  if (app.isPackaged) {
    const p = join(process.resourcesPath, PLUGIN_BUNDLE_RELEASE)
    return existsSync(p) ? p : null
  }
  const p = join(process.cwd(), 'extras/lightroom-classic-exifmod-open', PLUGIN_BUNDLE_RELEASE)
  return existsSync(p) ? p : null
}

/** Dev-only second bundle; not shipped in packaged apps. */
export function resolveBundledDevPluginSource(): string | null {
  if (app.isPackaged) return null
  const p = join(process.cwd(), 'extras/lightroom-classic-exifmod-open', PLUGIN_BUNDLE_DEV)
  return existsSync(p) ? p : null
}

export async function installLightroomPlugin(win: BrowserWindow | null): Promise<void> {
  if (process.platform !== 'darwin') {
    await dialog.showMessageBox(win ?? undefined, {
      type: 'info',
      title: i18next.t('dialog.installLrPluginNotMacTitle'),
      message: i18next.t('dialog.installLrPluginNotMacTitle'),
      detail: i18next.t('dialog.installLrPluginNotMacDetail')
    })
    return
  }

  const srcRelease = resolveBundledReleasePluginSource()
  if (!srcRelease) {
    await dialog.showMessageBox(win ?? undefined, {
      type: 'error',
      title: i18next.t('dialog.installLrPluginMissingTitle'),
      message: i18next.t('dialog.installLrPluginMissingTitle'),
      detail: i18next.t('dialog.installLrPluginMissingDetail', { path: PLUGIN_BUNDLE_RELEASE })
    })
    return
  }

  const destParent = join(homedir(), 'Library/Application Support/Adobe/Lightroom/Modules')
  const destRelease = lightroomModulesDestPath(PLUGIN_BUNDLE_RELEASE)

  try {
    mkdirSync(destParent, { recursive: true })
    rmSync(destRelease, { recursive: true, force: true })
    cpSync(srcRelease, destRelease, { recursive: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await dialog.showMessageBox(win ?? undefined, {
      type: 'error',
      title: i18next.t('dialog.installLrPluginFailedTitle'),
      message: i18next.t('dialog.installLrPluginFailedTitle'),
      detail: i18next.t('dialog.installLrPluginFailedDetail', { message: msg })
    })
    return
  }

  const isDevInstall = !app.isPackaged
  let destDev: string | null = null

  if (isDevInstall) {
    const srcDev = resolveBundledDevPluginSource()
    if (!srcDev) {
      await dialog.showMessageBox(win ?? undefined, {
        type: 'error',
        title: i18next.t('dialog.installLrPluginMissingTitle'),
        message: i18next.t('dialog.installLrPluginMissingTitle'),
        detail: i18next.t('dialog.installLrPluginMissingDetail', { path: PLUGIN_BUNDLE_DEV })
      })
      return
    }
    destDev = lightroomModulesDestPath(PLUGIN_BUNDLE_DEV)
    try {
      const repoRoot = resolve(process.cwd())
      const electronApp = resolveDevElectronAppBundle(repoRoot)
      if (!existsSync(electronApp)) {
        await dialog.showMessageBox(win ?? undefined, {
          type: 'error',
          title: i18next.t('dialog.installLrPluginMissingTitle'),
          message: i18next.t('dialog.installLrPluginMissingTitle'),
          detail: i18next.t('dialog.installLrPluginDevElectronAppMissing', { path: electronApp })
        })
        return
      }

      rmSync(destDev, { recursive: true, force: true })
      cpSync(srcDev, destDev, { recursive: true })
      const luaPath = join(destDev, 'OpenInExifmodDev.lua')
      const lua = readFileSync(luaPath, 'utf8')
      const patched = patchOpenInExifmodDevLua(lua, electronApp, repoRoot)
      writeFileSync(luaPath, patched, 'utf8')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await dialog.showMessageBox(win ?? undefined, {
        type: 'error',
        title: i18next.t('dialog.installLrPluginFailedTitle'),
        message: i18next.t('dialog.installLrPluginFailedTitle'),
        detail: i18next.t('dialog.installLrPluginFailedDetail', { message: msg })
      })
      return
    }
  }

  const successDetail = isDevInstall
    ? i18next.t('dialog.installLrPluginSuccessDetailDev', {
        pathRelease: destRelease,
        pathDev: destDev ?? ''
      })
    : i18next.t('dialog.installLrPluginSuccessDetail', { path: destRelease })

  await dialog.showMessageBox(win ?? undefined, {
    type: 'info',
    title: i18next.t('dialog.installLrPluginSuccessTitle'),
    message: i18next.t('dialog.installLrPluginSuccessTitle'),
    detail: successDetail
  })
}
