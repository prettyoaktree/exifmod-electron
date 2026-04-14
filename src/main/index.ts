import './setAppName.js'
import './cliPath.js'
import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import { i18next, initMainI18n } from './i18n.js'
import { localizePreflightIssues, localizeIssueLine } from './localizePreflight.js'
import { localizeSkipReason, localizeMergeErrorMessage, localizeExportErrorMessage } from './localizeMerge.js'
import { localizeThrownPresetError } from './localizeStoreError.js'
import { resolveLocaleTag } from '../shared/i18n/resolveLocale.js'
import { dirname, join, resolve as resolvePath } from 'node:path'
import type { MergeImportResult } from '../shared/types.js'
import { fileURLToPath } from 'node:url'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import {
  getPaths,
  mergePresetsFromSqliteFile,
  exportPresetDatabaseFile,
  preflightIssues,
  loadCatalog,
  readExifMetadata,
  buildApplyCommand,
  resolveExiftoolPath,
  validateExiftool,
  ensureDatabaseInitialized,
  mergeSelectedPayloads,
  createPreset,
  updatePreset,
  getPresetRecord,
  suggestedLensMountCodes,
  setSqlWasmPath,
  isSupportedImagePath
} from './exifCore/index.js'
import { spawnExiftool } from './exiftoolRunner.js'
import { ollamaDescribeImage } from './ollamaDescribe.js'
import {
  checkOllamaAvailability,
  ollamaTryStartServer,
  registerOllamaWillQuit,
  runOllamaStartupFlow
} from './ollamaLifecycle.js'
import { readImagePreviewDataUrl } from './previewImage.js'
import type { CreatePresetInput, UpdatePresetInput } from '../shared/types.js'
import { manualCheckForUpdates, registerMacAutoUpdates } from './autoUpdate.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const APP_COPYRIGHT = '© 2026 Alon Yaffe, All Rights Reserved.'

/** Window / taskbar icon: packaged copies `build/icon.png` to Resources; dev uses repo `build/icon.png`. */
function resolveAppIconPath(): string | undefined {
  if (app.isPackaged) {
    const p = join(process.resourcesPath, 'icon.png')
    return existsSync(p) ? p : undefined
  }
  const dev = join(__dirname, '../../build/icon.png')
  return existsSync(dev) ? dev : undefined
}

/** electron-vite emits `index.mjs`; older setups may use `index.js`. */
function resolvePreloadScript(): string {
  const mjs = join(__dirname, '../preload/index.mjs')
  const js = join(__dirname, '../preload/index.js')
  if (existsSync(mjs)) return mjs
  if (existsSync(js)) return js
  return mjs
}

/** Native About panel: icon, same headline as the main window (`app.title`), version, copyright. */
function applyAboutPanelOptions(): void {
  const iconPath = resolveAppIconPath()
  app.setAboutPanelOptions({
    applicationName: i18next.t('app.title'),
    applicationVersion: app.getVersion(),
    copyright: APP_COPYRIGHT,
    ...(iconPath ? { iconPath } : {})
  })
}

let mainWindow: BrowserWindow | null = null

/** When false, the main window `close` event is prevented until the renderer confirms (pending changes check). */
let allowMainWindowClose = false

function allowQuitForInstallForUpdate(): void {
  allowMainWindowClose = true
}

const autoUpdateOpts = { allowQuitForInstall: allowQuitForInstallForUpdate }

/** macOS: paths queued before BrowserWindow exists (e.g. open-file before ready). */
const preReadyOpenPaths: string[] = []

/** Debounce batching for Finder multi-select via repeated open-file (darwin). */
const OPEN_FILE_DEBOUNCE_MS = 280
let openFileBuffer: string[] = []
let openFileDebounceTimer: ReturnType<typeof setTimeout> | null = null

/** Suppress duplicate open-file right after cold-start delivery (macOS often sends both argv and open-file). */
let suppressOpenFileDuplicatePath: string | null = null
let suppressOpenFileDuplicateUntil = 0

function collectPositionalArgvPaths(): string[] {
  const slice = process.argv.slice(app.isPackaged ? 1 : 2)
  const out: string[] = []
  for (const a of slice) {
    if (!a || a.startsWith('-')) continue
    try {
      out.push(resolvePath(a))
    } catch {
      /* */
    }
  }
  return out
}

function deliverOpenPathToRenderer(absolutePath: string): void {
  const resolved = resolvePath(absolutePath)

  const send = (): void => {
    mainWindow?.webContents.send('startup:path', resolved)
  }

  if (!mainWindow) return

  const wc = mainWindow.webContents
  if (wc.isLoading()) {
    wc.once('did-finish-load', send)
  } else {
    send()
  }
}

function showFinderMultiPathDialog(): void {
  void dialog.showMessageBox({
    type: 'warning',
    message: i18next.t('ipc.finderMultiPathTitle'),
    detail: i18next.t('ipc.finderMultiPathDetail')
  })
}

function flushOpenFileBuffer(): void {
  openFileDebounceTimer = null
  if (openFileBuffer.length === 0) return
  const uniq = [...new Set(openFileBuffer.map((p) => resolvePath(p)))]
  openFileBuffer = []
  if (uniq.length > 1) {
    showFinderMultiPathDialog()
    return
  }
  if (uniq.length === 1) {
    const r = uniq[0]!
    const resolved = resolvePath(r)
    if (
      suppressOpenFileDuplicatePath != null &&
      suppressOpenFileDuplicatePath === resolved &&
      Date.now() < suppressOpenFileDuplicateUntil
    ) {
      return
    }
    deliverOpenPathToRenderer(r)
  }
}

function processLaunchPathsFromArgvAndPreReady(): void {
  const fromArgv = collectPositionalArgvPaths()
  const fromPre = preReadyOpenPaths.map((p) => resolvePath(p))
  preReadyOpenPaths.length = 0

  const combined = [...new Set([...fromArgv, ...fromPre])]
  if (combined.length > 1) {
    showFinderMultiPathDialog()
    return
  }
  if (combined.length === 1) {
    const p = combined[0]!
    suppressOpenFileDuplicatePath = resolvePath(p)
    suppressOpenFileDuplicateUntil = Date.now() + 2000
    deliverOpenPathToRenderer(p)
  }
}

if (process.platform === 'darwin') {
  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    if (!app.isReady()) {
      preReadyOpenPaths.push(filePath)
      return
    }
    openFileBuffer.push(filePath)
    if (openFileDebounceTimer) clearTimeout(openFileDebounceTimer)
    openFileDebounceTimer = setTimeout(flushOpenFileBuffer, OPEN_FILE_DEBOUNCE_MS)
  })
}

function getDataPaths() {
  return getPaths(app.getPath('userData'))
}

const LAST_IMAGE_FOLDER_FILE = 'last-image-folder.txt'

/** Written when the user finishes or dismisses the onboarding tutorial (not written when using `--simulate-first-run`). */
const TUTORIAL_ONBOARDING_SEEN_FILE = 'tutorial-onboarding-seen.txt'

/**
 * Development / QA: show the first-run tutorial on launch without persisting completion.
 * Example: `npm run dev -- --simulate-first-run`
 */
const SIMULATE_FIRST_RUN = process.argv.includes('--simulate-first-run')

function isTutorialOnboardingSeen(): boolean {
  try {
    return existsSync(join(app.getPath('userData'), TUTORIAL_ONBOARDING_SEEN_FILE))
  } catch {
    return false
  }
}

function markTutorialOnboardingSeenFile(): void {
  try {
    writeFileSync(join(app.getPath('userData'), TUTORIAL_ONBOARDING_SEEN_FILE), '1\n', 'utf8')
  } catch {
    /* ignore */
  }
}

function shouldAutoOpenTutorial(): boolean {
  return SIMULATE_FIRST_RUN || !isTutorialOnboardingSeen()
}

function deliverTutorialStart(payload: { firstRun?: boolean } = {}): void {
  const win = mainWindow
  if (!win) return
  const send = (): void => {
    win.webContents.send('tutorial:start', payload)
  }
  const wc = win.webContents
  if (wc.isLoading()) wc.once('did-finish-load', send)
  else send()
}

function scheduleTutorialAutoOpenIfNeeded(): void {
  const win = mainWindow
  if (!win || !shouldAutoOpenTutorial()) return
  deliverTutorialStart({ firstRun: true })
}

function getLastImageFolderForDialog(): string | undefined {
  try {
    const p = join(app.getPath('userData'), LAST_IMAGE_FOLDER_FILE)
    if (!existsSync(p)) return undefined
    const raw = readFileSync(p, 'utf8').trim()
    if (!raw) return undefined
    if (!existsSync(raw)) return undefined
    return statSync(raw).isDirectory() ? raw : undefined
  } catch {
    return undefined
  }
}

function rememberLastImageFolder(dirPath: string): void {
  try {
    writeFileSync(join(app.getPath('userData'), LAST_IMAGE_FOLDER_FILE), dirPath, 'utf8')
  } catch {
    /* ignore */
  }
}

function createWindow(): void {
  allowMainWindowClose = false
  const iconPath = resolveAppIconPath()
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 640,
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: resolvePreloadScript(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    title: i18next.t('app.windowTitle')
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('close', (e) => {
    if (allowMainWindowClose) return
    e.preventDefault()
    const w = mainWindow
    if (w && !w.isDestroyed()) {
      w.webContents.send('app:close-requested')
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    {
      label: i18next.t('menu.file'),
      submenu: [
        {
          label: i18next.t('menu.importPresetDatabase'),
          click: () => void handleImportDatabasePickFile()
        },
        {
          label: i18next.t('menu.exportPresetDatabase'),
          click: () => void handleExportPresetDatabase()
        },
        { type: 'separator' },
        ...(process.platform === 'darwin' ? [] : [{ role: 'quit' as const }])
      ]
    },
    {
      label: i18next.t('menu.edit'),
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(process.platform === 'darwin' ? [{ role: 'pasteAndMatchStyle' }] : []),
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' }
      ]
    },
    {
      label: i18next.t('menu.help'),
      submenu: [
        {
          label: i18next.t('menu.tutorial'),
          click: () => deliverTutorialStart({ firstRun: false })
        },
        ...(process.platform === 'darwin'
          ? [
              { type: 'separator' as const },
              {
                label: i18next.t('menu.checkForUpdates'),
                click: () => void manualCheckForUpdates(autoUpdateOpts)
              }
            ]
          : [])
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))

  scheduleTutorialAutoOpenIfNeeded()
}

async function runMergeImport(sourcePath: string, win: BrowserWindow | null | undefined): Promise<void> {
  try {
    const paths = getDataPaths()
    mkdirSync(paths.dataDir, { recursive: true })
    const result: MergeImportResult = await mergePresetsFromSqliteFile(sourcePath, paths)
    mainWindow?.webContents.send('presets:imported')
    const detailParts: string[] = [
      i18next.t('importExport.importDetail', { count: result.imported, path: sourcePath })
    ]
    if (result.skipped.length > 0) {
      detailParts.push(
        '\n\n' +
          i18next.t('importExport.notImportedHeader', { count: result.skipped.length }) +
          '\n' +
          result.skipped
            .map((s) =>
              i18next.t('importExport.skippedLine', {
                category: s.category,
                name: s.name,
                reason: localizeSkipReason(s)
              })
            )
            .join('\n')
      )
    }
    const detail = detailParts.join('')
    await dialog.showMessageBox(win ?? undefined, {
      type: result.imported === 0 && result.skipped.length > 0 ? 'warning' : 'info',
      message: i18next.t('importExport.importFinished'),
      detail
    })
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    await dialog.showMessageBox(win ?? undefined, {
      type: 'error',
      message: i18next.t('importExport.importFailed'),
      detail: localizeMergeErrorMessage(raw)
    })
  }
}

async function handleImportDatabasePickFile(): Promise<void> {
  const win = mainWindow ?? BrowserWindow.getFocusedWindow()
  const r = await dialog.showOpenDialog(win ?? undefined, {
    title: i18next.t('dialog.importPresetTitle'),
    defaultPath: app.getPath('documents'),
    properties: ['openFile'],
    filters: [{ name: i18next.t('dialog.sqliteDatabase'), extensions: ['sqlite3', 'sqlite', 'db'] }]
  })
  if (r.canceled || !r.filePaths[0]) return
  await runMergeImport(r.filePaths[0], win)
}

async function handleExportPresetDatabase(): Promise<void> {
  const win = mainWindow ?? BrowserWindow.getFocusedWindow()
  const r = await dialog.showOpenDialog(win ?? undefined, {
    title: i18next.t('dialog.exportPresetTitle'),
    defaultPath: app.getPath('documents'),
    properties: ['openDirectory', 'createDirectory'],
    message: i18next.t('dialog.exportChooseFolder')
  })
  if (r.canceled || !r.filePaths[0]) return
  const dir = r.filePaths[0]
  const destPath = join(dir, 'presets.sqlite3')
  if (existsSync(destPath)) {
    const confirm = await dialog.showMessageBox(win ?? undefined, {
      type: 'question',
      buttons: [i18next.t('dialog.buttonReplace'), i18next.t('dialog.buttonCancel')],
      defaultId: 1,
      cancelId: 1,
      message: i18next.t('dialog.replaceSqliteMessage'),
      detail: i18next.t('dialog.replaceSqliteDetail', { dir })
    })
    if (confirm.response !== 0) return
  }
  try {
    const paths = getDataPaths()
    await exportPresetDatabaseFile(destPath, paths)
    await dialog.showMessageBox(win ?? undefined, {
      type: 'info',
      message: i18next.t('importExport.exportSuccess'),
      detail: destPath
    })
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    await dialog.showMessageBox(win ?? undefined, {
      type: 'error',
      message: i18next.t('importExport.exportFailed'),
      detail: localizeExportErrorMessage(raw)
    })
  }
}

function setupIpc(): void {
  ipcMain.handle('app:getPaths', () => getDataPaths())

  ipcMain.handle('app:getLocale', () => resolveLocaleTag(app.getLocale()))

  ipcMain.handle('app:markTutorialOnboardingSeen', () => {
    if (!SIMULATE_FIRST_RUN) markTutorialOnboardingSeenFile()
  })

  ipcMain.handle('app:preflight', async () => {
    const paths = getDataPaths()
    return localizePreflightIssues(await preflightIssues(paths))
  })

  ipcMain.handle('dialog:openFolder', async () => {
    const win = mainWindow ?? BrowserWindow.getFocusedWindow()
    const defaultPath = getLastImageFolderForDialog()
    const r = await dialog.showOpenDialog(win ?? undefined, {
      properties: ['openDirectory'],
      ...(defaultPath ? { defaultPath } : {})
    })
    if (r.canceled || !r.filePaths[0]) return null
    const chosen = r.filePaths[0]
    rememberLastImageFolder(chosen)
    return chosen
  })

  ipcMain.handle('dialog:openFiles', async () => {
    const win = mainWindow ?? BrowserWindow.getFocusedWindow()
    const r = await dialog.showOpenDialog(win ?? undefined, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: i18next.t('dialog.imagesFilter'),
          extensions: ['jpg', 'jpeg', 'tif', 'tiff', 'JPG', 'JPEG', 'TIF', 'TIFF']
        }
      ]
    })
    if (r.canceled) return [] as string[]
    return r.filePaths
  })

  ipcMain.handle('exif:resolveTool', () => resolveExiftoolPath())

  ipcMain.handle('exif:validateTool', (_e, path?: string) => {
    const msg = validateExiftool(path)
    return msg ? localizeIssueLine(msg) : null
  })

  ipcMain.handle('catalog:load', async () => {
    const paths = getDataPaths()
    await ensureDatabaseInitialized(paths)
    const { catalog, loadIssues } = await loadCatalog(paths)
    return { catalog, loadIssues: localizePreflightIssues(loadIssues) }
  })

  ipcMain.handle('exif:readMetadata', async (_e, filePath: string) => {
    const tool = resolveExiftoolPath()
    if (!tool) throw new Error(i18next.t('ipc.exiftoolNotFound'))
    return readExifMetadata(tool, filePath)
  })

  ipcMain.handle(
    'exif:mergePayloads',
    async (
      _e,
      sel: { camera?: number | null; lens?: number | null; author?: number | null; film?: number | null }
    ) => {
      const paths = getDataPaths()
      await ensureDatabaseInitialized(paths)
      return mergeSelectedPayloads(paths, sel.camera ?? null, sel.lens ?? null, sel.author ?? null, sel.film ?? null)
    }
  )

  ipcMain.handle('exif:apply', async (_e, filePath: string, payload: Record<string, unknown>) => {
    const tool = resolveExiftoolPath()
    if (!tool) throw new Error(i18next.t('ipc.exiftoolNotFound'))
    const args = buildApplyCommand(tool, filePath, payload)
    const { stderr, code } = await spawnExiftool(args, { timeoutMs: 120_000 })
    if (code !== 0) throw new Error(stderr || i18next.t('ipc.exiftoolExit', { code }))
    return { ok: true }
  })

  ipcMain.handle('presets:create', async (_e, input: CreatePresetInput) => {
    const paths = getDataPaths()
    await ensureDatabaseInitialized(paths)
    try {
      return await createPreset(
        paths,
        input.category,
        input.name,
        input.payload,
        input.lens_system,
        input.lens_mount,
        input.lens_adaptable,
        input.fixed_shutter,
        input.fixed_aperture
      )
    } catch (e) {
      throw localizeThrownPresetError(e)
    }
  })

  ipcMain.handle('presets:update', async (_e, input: UpdatePresetInput) => {
    const paths = getDataPaths()
    await ensureDatabaseInitialized(paths)
    try {
      return await updatePreset(
        paths,
        input.id,
        input.name,
        input.payload,
        input.lens_system,
        input.lens_mount,
        input.lens_adaptable,
        input.fixed_shutter,
        input.fixed_aperture
      )
    } catch (e) {
      throw localizeThrownPresetError(e)
    }
  })

  ipcMain.handle('presets:get', async (_e, id: number) => {
    const paths = getDataPaths()
    await ensureDatabaseInitialized(paths)
    return getPresetRecord(paths, id)
  })

  ipcMain.handle('presets:suggestedMounts', async () => {
    const paths = getDataPaths()
    await ensureDatabaseInitialized(paths)
    return suggestedLensMountCodes(paths)
  })

  ipcMain.handle('fs:resolveImageList', (_e, targetPath: string) => {
    try {
      const st = statSync(targetPath)
      if (st.isDirectory()) {
        const out: string[] = []
        for (const n of readdirSync(targetPath).sort()) {
          const full = join(targetPath, n)
          try {
            if (statSync(full).isFile() && isSupportedImagePath(full)) out.push(full)
          } catch {
            /* */
          }
        }
        return out
      }
      if (st.isFile() && isSupportedImagePath(targetPath)) return [targetPath]
    } catch {
      /* */
    }
    return [] as string[]
  })

  ipcMain.handle('fs:listImagesInDir', (_e, dirPath: string) => {
    const out: string[] = []
    try {
      const names = readdirSync(dirPath)
      for (const n of names.sort()) {
        const full = join(dirPath, n)
        try {
          if (statSync(full).isFile() && isSupportedImagePath(full)) out.push(full)
        } catch {
          /* */
        }
      }
    } catch {
      return [] as string[]
    }
    return out
  })

  ipcMain.handle('fs:readImageDataUrl', async (_e, filePath: string) => readImagePreviewDataUrl(filePath))

  ipcMain.handle(
    'ollama:describeImage',
    async (_e, filePath: string, opts?: { maxDescriptionUtf8Bytes?: number }) =>
      ollamaDescribeImage(filePath, opts)
  )

  ipcMain.handle('ollama:startupFlow', async () => {
    const win = mainWindow ?? BrowserWindow.getFocusedWindow()
    return runOllamaStartupFlow(win ?? null)
  })

  ipcMain.handle('ollama:checkAvailability', async () => checkOllamaAvailability())

  ipcMain.handle('ollama:tryStartServer', async () => {
    const win = mainWindow ?? BrowserWindow.getFocusedWindow()
    return ollamaTryStartServer(win ?? null)
  })

  ipcMain.handle('fs:isFile', (_e, filePath: string) => {
    try {
      return statSync(filePath).isFile()
    } catch {
      return false
    }
  })

  ipcMain.on('app:confirm-close', () => {
    allowMainWindowClose = true
    const w = mainWindow
    if (w && !w.isDestroyed()) {
      w.close()
    } else {
      app.quit()
    }
  })
}

app.whenReady().then(async () => {
  await initMainI18n()
  applyAboutPanelOptions()
  setSqlWasmPath(
    app.isPackaged
      ? join(process.resourcesPath, 'sql-wasm.wasm')
      : join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm')
  )
  const paths = getDataPaths()
  mkdirSync(paths.dataDir, { recursive: true })
  try {
    await ensureDatabaseInitialized(paths)
  } catch {
    /* preflight surfaces issues */
  }
  setupIpc()
  registerOllamaWillQuit()
  const dockIcon = resolveAppIconPath()
  if (process.platform === 'darwin' && dockIcon && app.dock) {
    app.dock.setIcon(dockIcon)
  }
  createWindow()
  processLaunchPathsFromArgvAndPreReady()
  if (app.isPackaged && process.platform === 'darwin') {
    registerMacAutoUpdates(autoUpdateOpts)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // Quit when the main window closes on all platforms (including macOS; default Electron skips quit on darwin).
  app.quit()
})
