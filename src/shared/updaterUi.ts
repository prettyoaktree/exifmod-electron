/** Renderer state pushed from main via `updater:state` (macOS packaged auto-update). */
export type UpdaterUiPayload =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; version: string }
  | { kind: 'downloading'; percent: number; transferred: number; total: number }
  | { kind: 'downloaded' }
  | { kind: 'error'; message: string }
  | { kind: 'upToDate'; version: string }
