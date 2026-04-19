import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { App } from 'electron'

const LEGACY_LRC_SUPPRESSED_FILE = 'lrc-snapshot-modal-suppressed.txt'
const CHOICES_FILE = 'remembered-dialog-choices.json'

export type PreWriteBackupChoice = 'ask' | 'always' | 'never'

export type RememberedDialogChoices = {
  lrcSnapshotModalSuppressed: boolean
  preWriteBackup: PreWriteBackupChoice
}

const DEFAULT_CHOICES: RememberedDialogChoices = {
  lrcSnapshotModalSuppressed: false,
  preWriteBackup: 'ask'
}

function choicesPath(app: App): string {
  return join(app.getPath('userData'), CHOICES_FILE)
}

function legacyLrcPath(app: App): string {
  return join(app.getPath('userData'), LEGACY_LRC_SUPPRESSED_FILE)
}

function readJsonSafe(raw: string): Partial<RememberedDialogChoices> {
  try {
    const o = JSON.parse(raw) as unknown
    if (typeof o !== 'object' || o === null) return {}
    return o as Partial<RememberedDialogChoices>
  } catch {
    return {}
  }
}

export function loadRememberedDialogChoices(app: App): RememberedDialogChoices {
  const p = choicesPath(app)
  let merged = { ...DEFAULT_CHOICES }
  try {
    if (existsSync(p)) {
      const partial = readJsonSafe(readFileSync(p, 'utf8'))
      merged = {
        ...merged,
        ...partial,
        lrcSnapshotModalSuppressed: Boolean(partial.lrcSnapshotModalSuppressed),
        preWriteBackup:
          partial.preWriteBackup === 'always' || partial.preWriteBackup === 'never' || partial.preWriteBackup === 'ask'
            ? partial.preWriteBackup
            : 'ask'
      }
    }
  } catch {
    /* */
  }
  if (!existsSync(p) && existsSync(legacyLrcPath(app))) {
    merged.lrcSnapshotModalSuppressed = true
  }
  return merged
}

function saveRememberedDialogChoices(app: App, c: RememberedDialogChoices): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(choicesPath(app), `${JSON.stringify(c, null, 2)}\n`, 'utf8')
}

export function setLrcSnapshotModalSuppressedChoice(app: App): void {
  const cur = loadRememberedDialogChoices(app)
  saveRememberedDialogChoices(app, { ...cur, lrcSnapshotModalSuppressed: true })
  try {
    if (existsSync(legacyLrcPath(app))) unlinkSync(legacyLrcPath(app))
  } catch {
    /* */
  }
}

export function isLrcSnapshotModalSuppressed(app: App): boolean {
  return loadRememberedDialogChoices(app).lrcSnapshotModalSuppressed
}

export function getPreWriteBackupChoice(app: App): PreWriteBackupChoice {
  return loadRememberedDialogChoices(app).preWriteBackup
}

export function setPreWriteBackupChoice(app: App, v: PreWriteBackupChoice): void {
  const cur = loadRememberedDialogChoices(app)
  saveRememberedDialogChoices(app, { ...cur, preWriteBackup: v })
}

export function resetAllRememberedDialogChoices(app: App): void {
  try {
    if (existsSync(choicesPath(app))) unlinkSync(choicesPath(app))
  } catch {
    /* */
  }
  try {
    if (existsSync(legacyLrcPath(app))) unlinkSync(legacyLrcPath(app))
  } catch {
    /* */
  }
}
