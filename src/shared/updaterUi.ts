/** Renderer state pushed from main via `updater:state` (macOS packaged auto-update). */
export type UpdaterUiPayload =
  | { kind: 'idle' }
  /** `manual` = Help / footer Check; `auto` = delayed startup check — footer uses this for panel auto-open rules. */
  | { kind: 'checking'; source: 'manual' | 'auto' }
  | { kind: 'available'; version: string }
  | { kind: 'downloading'; percent: number; transferred: number; total: number }
  | { kind: 'downloaded' }
  | { kind: 'error'; message: string }
  | { kind: 'upToDate'; version: string }
