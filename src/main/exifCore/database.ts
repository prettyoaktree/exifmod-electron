import type { DataPaths } from '../../shared/types.js'
import { LEGACY_LENS_MOUNT_TO_DISPLAY } from './constants.js'
import { type PersistedDatabase, openPersistedDb } from './sqlJs.js'

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL CHECK (category IN ('camera', 'lens', 'author', 'film')),
    name TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    lens_system TEXT,
    lens_mount TEXT,
    lens_adaptable INTEGER,
    fixed_shutter INTEGER,
    fixed_aperture INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category, name)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_presets_category ON presets(category)`,
  `CREATE INDEX IF NOT EXISTS idx_presets_category_lens_mount ON presets(category, lens_mount)`,
  `CREATE INDEX IF NOT EXISTS idx_presets_camera_compat ON presets(category, lens_system, lens_mount, lens_adaptable) WHERE category = 'camera'`,
  `CREATE TRIGGER IF NOT EXISTS trg_presets_updated_at
   AFTER UPDATE ON presets
   BEGIN
     UPDATE presets SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
   END`
]

/** Add columns introduced after first release (existing DBs skip CREATE TABLE body). */
function migratePresetTableColumns(db: PersistedDatabase): void {
  const info = db.execRaw('PRAGMA table_info(presets)')
  const cols = new Set((info[0]?.values ?? []).map((row) => String(row[1])))
  if (!cols.has('fixed_shutter')) {
    db.runOnly('ALTER TABLE presets ADD COLUMN fixed_shutter INTEGER')
  }
  if (!cols.has('fixed_aperture')) {
    db.runOnly('ALTER TABLE presets ADD COLUMN fixed_aperture INTEGER')
  }
}

export async function openDb(paths: DataPaths): Promise<PersistedDatabase> {
  const db = await openPersistedDb(paths)
  for (const s of SCHEMA_STATEMENTS) {
    db.runOnly(s)
  }
  migratePresetTableColumns(db)
  db.persist()
  return db
}

export function migrateLensMountDisplayNames(db: PersistedDatabase): void {
  for (const [legacy, display] of Object.entries(LEGACY_LENS_MOUNT_TO_DISPLAY)) {
    db.runOnly('UPDATE presets SET lens_mount = ? WHERE lens_mount = ?', [display, legacy])
  }
  db.persist()
}
