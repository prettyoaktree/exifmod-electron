import { contextBridge, ipcRenderer } from 'electron'
import type { ConfigCatalog, CreatePresetInput, PresetRecord, UpdatePresetInput } from '../shared/types.js'

/** Paths sent before React subscribes (cold Open With: main emits on did-finish-load, listener was not ready yet). */
const pendingStartupPaths: string[] = []
const startupPathSubscribers = new Set<(p: string) => void>()

ipcRenderer.on('startup:path', (_e, p: string) => {
  if (startupPathSubscribers.size === 0) {
    pendingStartupPaths.push(p)
    return
  }
  for (const cb of startupPathSubscribers) cb(p)
})

const api = {
  getPaths: () =>
    ipcRenderer.invoke('app:getPaths') as Promise<{ dataDir: string; dbPath: string; configDir: string }>,
  getLocale: () => ipcRenderer.invoke('app:getLocale') as Promise<string>,
  preflight: () => ipcRenderer.invoke('app:preflight') as Promise<string[]>,
  openFolder: () => ipcRenderer.invoke('dialog:openFolder') as Promise<string | null>,
  openFiles: () => ipcRenderer.invoke('dialog:openFiles') as Promise<string[]>,
  resolveExiftool: () => ipcRenderer.invoke('exif:resolveTool') as Promise<string | null>,
  validateExiftool: (path?: string) => ipcRenderer.invoke('exif:validateTool', path) as Promise<string | null>,
  loadCatalog: () =>
    ipcRenderer.invoke('catalog:load') as Promise<{ catalog: ConfigCatalog; loadIssues: string[] }>,
  readMetadata: (filePath: string) => ipcRenderer.invoke('exif:readMetadata', filePath) as Promise<Record<string, unknown>>,
  mergePayloads: (sel: {
    camera?: number | null
    lens?: number | null
    author?: number | null
    film?: number | null
  }) => ipcRenderer.invoke('exif:mergePayloads', sel) as Promise<Record<string, unknown>>,
  applyExif: (filePath: string, payload: Record<string, unknown>) =>
    ipcRenderer.invoke('exif:apply', filePath, payload) as Promise<{ ok: boolean }>,
  createPreset: (input: CreatePresetInput) => ipcRenderer.invoke('presets:create', input) as Promise<number>,
  updatePreset: (input: UpdatePresetInput) => ipcRenderer.invoke('presets:update', input) as Promise<number>,
  getPreset: (id: number) => ipcRenderer.invoke('presets:get', id) as Promise<PresetRecord | null>,
  suggestedLensMounts: () => ipcRenderer.invoke('presets:suggestedMounts') as Promise<string[]>,
  resolveImageList: (targetPath: string) =>
    ipcRenderer.invoke('fs:resolveImageList', targetPath) as Promise<string[]>,
  listImagesInDir: (dirPath: string) =>
    ipcRenderer.invoke('fs:listImagesInDir', dirPath) as Promise<string[]>,
  isFile: (filePath: string) => ipcRenderer.invoke('fs:isFile', filePath) as Promise<boolean>,
  readImageDataUrl: (filePath: string) => ipcRenderer.invoke('fs:readImageDataUrl', filePath) as Promise<string>,
  ollamaDescribeImage: (filePath: string, opts?: { maxDescriptionUtf8Bytes?: number }) =>
    ipcRenderer.invoke('ollama:describeImage', filePath, opts ?? {}) as Promise<
      { ok: true; description: string; keywords: string[] } | { ok: false; error: string }
    >,
  onPresetsImported: (cb: () => void) => {
    const fn = (): void => cb()
    ipcRenderer.on('presets:imported', fn)
    return () => ipcRenderer.removeListener('presets:imported', fn)
  },
  onStartupPath: (cb: (p: string) => void) => {
    startupPathSubscribers.add(cb)
    const queued = pendingStartupPaths.splice(0, pendingStartupPaths.length)
    for (const p of queued) cb(p)
    return () => {
      startupPathSubscribers.delete(cb)
    }
  }
}

export type PreloadApi = typeof api

contextBridge.exposeInMainWorld('exifmod', api)
