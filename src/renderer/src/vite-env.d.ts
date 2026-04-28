/// <reference types="vite/client" />

import type { ConfigCatalog, CreatePresetInput, PresetRecord, UpdatePresetInput } from '../../shared/types'
import type { UpdaterUiPayload } from '../../shared/updaterUi'
import type { FilmRollLogCreateInput, FilmRollParsedLog } from '../../shared/filmRollLog'

export interface ExifmodApi {
  getPaths: () => Promise<{ dataDir: string; dbPath: string; configDir: string }>
  getLocale: () => Promise<string>
  preflight: () => Promise<string[]>
  openFolder: () => Promise<string | null>
  openFiles: () => Promise<string[]>
  openFilmRollLog: () => Promise<string | null>
  resolveExiftool: () => Promise<string | null>
  validateExiftool: (path?: string) => Promise<string | null>
  loadCatalog: () => Promise<{ catalog: ConfigCatalog; loadIssues: string[] }>
  readMetadata: (filePath: string) => Promise<Record<string, unknown>>
  readMetadataBatch: (filePaths: string[]) => Promise<Record<string, Record<string, unknown>>>
  onReadMetadataBatchProgress: (cb: (p: { done: number; total: number }) => void) => () => void
  mergePayloads: (sel: {
    camera?: number | null
    lens?: number | null
    author?: number | null
    film?: number | null
  }) => Promise<Record<string, unknown>>
  applyExif: (filePath: string, payload: Record<string, unknown>, opts?: { backupFirst?: boolean }) => Promise<{
    ok: boolean
  }>
  applyExifBatch: (
    items: Array<{ path: string; payload: Record<string, unknown>; backupFirst?: boolean }>
  ) => Promise<Array<{ path: string; ok: boolean; error?: string }>>
  onApplyExifBatchProgress: (cb: (p: { done: number; total: number; path: string }) => void) => () => void
  createPreset: (input: CreatePresetInput) => Promise<number>
  updatePreset: (input: UpdatePresetInput) => Promise<number>
  deletePreset: (id: number) => Promise<void>
  getPreset: (id: number) => Promise<PresetRecord | null>
  suggestedLensMounts: () => Promise<string[]>
  unusedLensMounts: () => Promise<string[]>
  clearUnusedLensMount: (mount: string) => Promise<{ cleared: number }>
  resolveImageList: (targetPath: string) => Promise<string[]>
  listImagesInDir: (dirPath: string) => Promise<string[]>
  isFile: (filePath: string) => Promise<boolean>
  readImageDataUrl: (filePath: string) => Promise<string>
  createFilmRollLog: (input: FilmRollLogCreateInput) => Promise<{ canceled: true } | { canceled: false; filePath: string }>
  parseFilmRollLog: (
    filePath: string,
    expectedImageCount: number
  ) => Promise<{ ok: false; message: string } | { ok: true; parsed: FilmRollParsedLog }>
  ollamaDescribeImage: (
    filePath: string,
    opts?: { maxDescriptionUtf8Bytes?: number }
  ) => Promise<{ ok: true; description: string; keywords: string[] } | { ok: false; error: string }>
  ollamaStartupFlow: () => Promise<
    | { status: 'ready'; initialReachable: boolean }
    | { status: 'server_down' }
    | { status: 'no_cli' }
  >
  ollamaCheckAvailability: () => Promise<
    | { status: 'ready'; initialReachable: boolean }
    | { status: 'server_down' }
    | { status: 'no_cli' }
  >
  ollamaTryStartServer: () => Promise<{ ok: true } | { ok: false; error: string }>
  ollamaGetDescribeSystemPrompt: (maxDescriptionUtf8Bytes?: number) => Promise<string>
  ollamaGetDescribeSystemPromptState: () => Promise<{ isCustom: boolean; template: string }>
  ollamaSetDescribeSystemPrompt: (text: string | null) => Promise<
    { ok: true } | { ok: false; error: 'missing_placeholder' }
  >
  onPresetsImported: (cb: () => void) => () => void
  onTutorialStart: (cb: (payload?: { firstRun?: boolean }) => void) => () => void
  markTutorialOnboardingSeen: () => Promise<void>
  getLaunchFromLrc: () => Promise<boolean>
  getLrcSnapshotModalSuppressed: () => Promise<boolean>
  setLrcSnapshotModalSuppressed: () => Promise<void>
  getPreWriteBackupChoice: () => Promise<'ask' | 'always' | 'never'>
  setPreWriteBackupChoice: (v: 'ask' | 'always' | 'never') => Promise<void>
  resetRememberedDialogChoices: () => Promise<void>
  onRememberedChoicesReset: (cb: () => void) => () => void
  onLaunchFromLrc: (cb: (fromLrc: boolean) => void) => () => void
  onStartupPath: (cb: (p: string) => void) => () => void
  onFilmRollMenuCreate: (cb: () => void) => () => void
  onFilmRollMenuImport: (cb: () => void) => () => void
  onOllamaLaunching: (cb: () => void) => () => void
  onAppCloseRequested: (cb: () => void) => () => void
  confirmAppClose: () => void
  getUpdaterSupport: () => Promise<{ supported: boolean }>
  onUpdaterState: (cb: (payload: UpdaterUiPayload) => void) => () => void
  updaterDownload: () => Promise<void>
  updaterQuitAndInstall: () => Promise<void>
  updaterDismiss: () => Promise<void>
  updaterCheck: () => Promise<void>
}

declare global {
  interface Window {
    /** Undefined if preload failed to load or page opened outside Electron. */
    exifmod?: ExifmodApi
  }
}
