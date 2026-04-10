/// <reference types="vite/client" />

import type { ConfigCatalog, CreatePresetInput, PresetRecord, UpdatePresetInput } from '../../shared/types'

export interface ExifmodApi {
  getPaths: () => Promise<{ dataDir: string; dbPath: string; configDir: string }>
  getLocale: () => Promise<string>
  preflight: () => Promise<string[]>
  openFolder: () => Promise<string | null>
  openFiles: () => Promise<string[]>
  resolveExiftool: () => Promise<string | null>
  validateExiftool: (path?: string) => Promise<string | null>
  loadCatalog: () => Promise<{ catalog: ConfigCatalog; loadIssues: string[] }>
  readMetadata: (filePath: string) => Promise<Record<string, unknown>>
  mergePayloads: (sel: {
    camera?: number | null
    lens?: number | null
    author?: number | null
    film?: number | null
  }) => Promise<Record<string, unknown>>
  applyExif: (filePath: string, payload: Record<string, unknown>) => Promise<{ ok: boolean }>
  createPreset: (input: CreatePresetInput) => Promise<number>
  updatePreset: (input: UpdatePresetInput) => Promise<number>
  getPreset: (id: number) => Promise<PresetRecord | null>
  suggestedLensMounts: () => Promise<string[]>
  resolveImageList: (targetPath: string) => Promise<string[]>
  listImagesInDir: (dirPath: string) => Promise<string[]>
  readImageDataUrl: (filePath: string) => Promise<string>
  onPresetsImported: (cb: () => void) => () => void
  onStartupPath: (cb: (p: string) => void) => () => void
}

declare global {
  interface Window {
    /** Undefined if preload failed to load or page opened outside Electron. */
    exifmod?: ExifmodApi
  }
}
