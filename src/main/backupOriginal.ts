import { copyFileSync, existsSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'

/**
 * Copy `filePath` to the same directory using `name.ext.exifmod-backup-<timestamp>` (with numeric suffix if needed).
 */
export function createPreWriteBackupCopy(filePath: string): { ok: true; backupPath: string } | { ok: false; error: string } {
  const dir = dirname(filePath)
  const ext = extname(filePath)
  const base = basename(filePath, ext)
  const ts = Date.now()
  let backupPath = join(dir, `${base}${ext}.exifmod-backup-${ts}`)
  let n = 0
  while (existsSync(backupPath)) {
    n++
    backupPath = join(dir, `${base}${ext}.exifmod-backup-${ts}-${n}`)
  }
  try {
    copyFileSync(filePath, backupPath)
    return { ok: true, backupPath }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
