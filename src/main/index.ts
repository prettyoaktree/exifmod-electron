import { app, BrowserWindow, ipcMain, dialog, Menu, nativeImage } from 'electron'
import { i18next, initMainI18n } from './i18n.js'
import { localizePreflightIssues, localizeIssueLine } from './localizePreflight.js'
import { localizeSkipReason, localizeMergeErrorMessage, localizeExportErrorMessage } from './localizeMerge.js'
import { localizeThrownPresetError } from './localizeStoreError.js'
import { resolveLocaleTag } from '../shared/i18n/resolveLocale.js'
import { execFile as execFileCb } from 'node:child_process'
import { dirname, extname, join } from 'node:path'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
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
import type { CreatePresetInput, UpdatePresetInput } from '../shared/types.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/** Must run before `app.whenReady()` so the macOS menu bar shows this name instead of "Electron". */
app.setName('ExifMod')

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

let mainWindow: BrowserWindow | null = null

/** Max longest edge for preview (pixels). Keeps IPC payload small and memory stable. */
const PREVIEW_MAX_EDGE = 2048
const PREVIEW_JPEG_QUALITY = 82
/** Raw data-URL fallback only for types Chromium displays well in <img>; cap size to avoid OOM. */
const LEGACY_PREVIEW_MAX_BYTES = 48 * 1024 * 1024

const LEGACY_DATA_URL_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])

function execFileAsync(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFileCb(command, args, (err) => (err ? reject(err) : resolve()))
  })
}

/** macOS: rasterize TIFF to JPEG via `sips` (handles many 8/16‑bit and layered TIFFs Quick Look mishandles). */
async function previewTiffWithSips(filePath: string): Promise<string | null> {
  let dir: string | undefined
  try {
    dir = await mkdtemp(join(tmpdir(), 'exifmod-preview-'))
    const outJpg = join(dir, 'preview.jpg')
    await execFileAsync('sips', ['-s', 'format', 'jpeg', '-Z', String(PREVIEW_MAX_EDGE), filePath, '--out', outJpg])
    const buf = await readFile(outJpg)
    if (buf.length < 32) return null
    return `data:image/jpeg;base64,${buf.toString('base64')}`
  } catch {
    return null
  } finally {
    if (dir) {
      try {
        await rm(dir, { recursive: true, force: true })
      } catch {
        /* */
      }
    }
  }
}

/**
 * Build a JPEG data URL the renderer can always show. Chromium does not decode TIFF in img tags;
 * use NativeImage / platform tools. On macOS, Quick Look thumbnails for TIFF often return a generic
 * document icon — avoid `createThumbnailFromPath` for .tif/.tiff and prefer `sips` first.
 */
async function readImagePreviewDataUrl(filePath: string): Promise<string> {
  const ext = extname(filePath).toLowerCase()
  const tiff = ext === '.tif' || ext === '.tiff'

  if (tiff && process.platform === 'darwin') {
    const fromSips = await previewTiffWithSips(filePath)
    if (fromSips) return fromSips
  }

  const skipQuickLookThumb = tiff && process.platform === 'darwin'
  if (!skipQuickLookThumb && (process.platform === 'darwin' || process.platform === 'win32')) {
    try {
      const thumb = await nativeImage.createThumbnailFromPath(filePath, {
        width: PREVIEW_MAX_EDGE,
        height: PREVIEW_MAX_EDGE
      })
      if (!thumb.isEmpty()) {
        const buf = thumb.toJPEG(PREVIEW_JPEG_QUALITY)
        return `data:image/jpeg;base64,${buf.toString('base64')}`
      }
    } catch {
      /* fall through */
    }
  }

  let image = nativeImage.createFromPath(filePath)
  if (!image.isEmpty()) {
    const { width, height } = image.getSize()
    const maxEdge = Math.max(width, height)
    if (maxEdge > PREVIEW_MAX_EDGE) {
      const scale = PREVIEW_MAX_EDGE / maxEdge
      image = image.resize({
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
        quality: 'good'
      })
    }
    const buf = image.toJPEG(PREVIEW_JPEG_QUALITY)
    return `data:image/jpeg;base64,${buf.toString('base64')}`
  }

  if (!LEGACY_DATA_URL_EXTS.has(ext)) {
    throw new Error(i18next.t('preview.decodeFailed'))
  }
  const sz = statSync(filePath).size
  if (sz > LEGACY_PREVIEW_MAX_BYTES) {
    throw new Error(i18next.t('preview.tooLarge'))
  }
  const buf = await readFile(filePath)
  const mime =
    ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/jpeg'
  return `data:${mime};base64,${buf.toString('base64')}`
}

function getDataPaths() {
  return getPaths(app.getPath('userData'))
}

const LAST_IMAGE_FOLDER_FILE = 'last-image-folder.txt'

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
    title: i18next.t('app.title')
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

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
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
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
        input.lens_adaptable
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
        input.lens_adaptable
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
}

function sendStartupPathIfAny(): void {
  const argv = process.argv.slice(app.isPackaged ? 1 : 2)
  const pathArg = argv.find((a) => !a.startsWith('-') && a.length > 0)
  if (!pathArg || !mainWindow) return
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow?.webContents.send('startup:path', pathArg)
  })
}

app.whenReady().then(async () => {
  await initMainI18n()
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
  const dockIcon = resolveAppIconPath()
  if (process.platform === 'darwin' && dockIcon && app.dock) {
    app.dock.setIcon(dockIcon)
  }
  createWindow()
  sendStartupPathIfAny()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
      sendStartupPathIfAny()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
