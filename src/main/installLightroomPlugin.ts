import { existsSync, mkdirSync, cpSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { app } from 'electron'
import type { LrPluginInstallResult } from '../shared/lrPluginInstallResult.js'

export const PLUGIN_BUNDLE_RELEASE = 'EXIFmodOpen.lrplugin'
export const PLUGIN_BUNDLE_DEV = 'EXIFmodOpenDev.lrplugin'

/**
 * Path to the `electron` npm package: `Electron.app` (macOS) or `electron.exe` (Windows).
 * Used to patch the dev Lightroom plug-in.
 */
export function resolveDevElectronBinary(repoRoot: string): string {
  const dist = join(resolve(repoRoot), 'node_modules/electron/dist')
  return process.platform === 'win32' ? join(dist, 'electron.exe') : join(dist, 'Electron.app')
}

/** @deprecated Use {@link resolveDevElectronBinary} — name reflects the macOS bundle. */
export function resolveDevElectronAppBundle(repoRoot: string): string {
  return resolveDevElectronBinary(repoRoot)
}

/** Lua single-quoted string: escape backslashes and single quotes. */
export function escapePathForLuaSingleQuotedString(path: string): string {
  return path.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/** Placeholders in OpenInExifmodDev.lua (single-quoted Lua string literals). */
const DEV_LUA_ELECTRON_APP_PLACEHOLDER_QUOTED = "'__EXIFMOD_DEV_ELECTRON_APP__'"
const DEV_LUA_REPO_ROOT_PLACEHOLDER_QUOTED = "'__EXIFMOD_DEV_REPO_ROOT__'"

/** Placeholder in OpenInExifmod.lua (baked to this EXIFmod install on Help → Install from a packaged app). */
const RELEASE_LUA_INSTALLED_EXIF_PLACEHOLDER_QUOTED = "'__EXIFMOD_INSTALLED_EXIF__'"

/**
 * Resolves the EXIFmod install path the Lightroom release plug-in should use when it was
 * just copied from a packaged running app. Windows: EXIFmod.exe. macOS: the .app bundle
 * (Lr / `open -a` expects the bundle path).
 */
export function pathBakedForLrPluginFromRunningApp(): string {
  if (process.platform === 'win32') {
    return app.getPath('exe')
  }
  if (process.platform === 'darwin') {
    return resolve(join(process.resourcesPath, '..', '..'))
  }
  return ''
}

/** Fills the absolute EXIFmod path in OpenInExifmod.lua. */
export function patchOpenInExifmodReleaseLua(luaSource: string, installedExifPath: string): string {
  if (!luaSource.includes(RELEASE_LUA_INSTALLED_EXIF_PLACEHOLDER_QUOTED)) return luaSource
  return luaSource.replace(
    RELEASE_LUA_INSTALLED_EXIF_PLACEHOLDER_QUOTED,
    `'${escapePathForLuaSingleQuotedString(installedExifPath)}'`
  )
}

/** Injects absolute paths to the dev Electron binary and repo root for the dev Lightroom plug-in. */
export function patchOpenInExifmodDevLua(
  luaSource: string,
  electronBinaryPath: string,
  repoRoot: string
): string {
  let s = luaSource
  if (s.includes(DEV_LUA_ELECTRON_APP_PLACEHOLDER_QUOTED)) {
    s = s.replace(
      DEV_LUA_ELECTRON_APP_PLACEHOLDER_QUOTED,
      `'${escapePathForLuaSingleQuotedString(electronBinaryPath)}'`
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

/** User Modules folder: `~/Library/.../Modules` (macOS) or `%APPDATA%\...\Modules` (Windows). */
function lightroomModulesDir(): string {
  if (process.platform === 'win32') {
    const appData = process.env['APPDATA'] ?? join(homedir(), 'AppData', 'Roaming')
    return join(appData, 'Adobe', 'Lightroom', 'Modules')
  }
  return join(homedir(), 'Library/Application Support/Adobe/Lightroom/Modules')
}

/** Full path to a plug-in bundle in Adobe’s Lightroom Classic Modules directory. */
export function lightroomModulesDestPath(bundleName: string): string {
  return join(lightroomModulesDir(), bundleName)
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

function isLightroomPluginInstallSupportedPlatform(): boolean {
  return process.platform === 'darwin' || process.platform === 'win32'
}

/**
 * Installs the bundled LrC plug-in(s) into the user’s Adobe Modules folder. No UI; use the
 * returned `LrPluginInstallResult` in the renderer (in-app modal).
 */
export async function performLrPluginInstall(): Promise<LrPluginInstallResult> {
  if (!isLightroomPluginInstallSupportedPlatform()) {
    return { ok: false, error: 'unsupported' }
  }

  const srcRelease = resolveBundledReleasePluginSource()
  if (!srcRelease) {
    return { ok: false, error: 'missing_bundle', bundleName: PLUGIN_BUNDLE_RELEASE }
  }

  const destParent = lightroomModulesDir()
  const destRelease = lightroomModulesDestPath(PLUGIN_BUNDLE_RELEASE)

  try {
    mkdirSync(destParent, { recursive: true })
    rmSync(destRelease, { recursive: true, force: true })
    cpSync(srcRelease, destRelease, { recursive: true })
    if (app.isPackaged) {
      const openLua = join(destRelease, 'OpenInExifmod.lua')
      if (existsSync(openLua)) {
        const raw = readFileSync(openLua, 'utf8')
        const installed = pathBakedForLrPluginFromRunningApp()
        if (installed) {
          writeFileSync(openLua, patchOpenInExifmodReleaseLua(raw, installed), 'utf8')
        }
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: 'io', message: msg }
  }

  const isDevInstall = !app.isPackaged
  let destDev: string | null = null

  if (isDevInstall) {
    const srcDev = resolveBundledDevPluginSource()
    if (!srcDev) {
      return { ok: false, error: 'missing_bundle', bundleName: PLUGIN_BUNDLE_DEV }
    }
    destDev = lightroomModulesDestPath(PLUGIN_BUNDLE_DEV)
    try {
      const repoRoot = resolve(process.cwd())
      const electronBinary = resolveDevElectronBinary(repoRoot)
      if (!existsSync(electronBinary)) {
        return { ok: false, error: 'missing_electron', path: electronBinary }
      }

      rmSync(destDev, { recursive: true, force: true })
      cpSync(srcDev, destDev, { recursive: true })
      const luaPath = join(destDev, 'OpenInExifmodDev.lua')
      const lua = readFileSync(luaPath, 'utf8')
      const patched = patchOpenInExifmodDevLua(lua, electronBinary, repoRoot)
      writeFileSync(luaPath, patched, 'utf8')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, error: 'io', message: msg }
    }
  }

  return {
    ok: true,
    isDev: isDevInstall,
    pathRelease: destRelease,
    pathDev: destDev
  }
}
