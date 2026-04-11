import { existsSync, mkdirSync, readFileSync, readdirSync, copyFileSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ConfigCatalog, DataPaths, MergeImportResult, MergeImportSkip } from '../../shared/types.js'
import { CONTROL_FIELDS, FALLBACK_LENS_MOUNT_NAMES, IMAGE_EXTENSIONS, LENS_MOUNT_DEFAULTS_FILENAME } from './constants.js'
import { migrateLensMountDisplayNames, openDb } from './database.js'
import { PresetStoreError } from './errors.js'
import { stripFilmStockSuffix } from '../../shared/filmKeywords.js'
import { sortedStrings, stripWriteExcludedFields } from './pure.js'
import type { PersistedDatabase } from './sqlJs.js'
import { getSqlJs } from './sqlJs.js'
import type { Database, Statement } from 'sql.js'

let goodStateBackupWritten = false

function sortKeysDeep(x: unknown): unknown {
  if (x === null || typeof x !== 'object') return x
  if (Array.isArray(x)) return x.map(sortKeysDeep)
  const o = x as Record<string, unknown>
  const sorted: Record<string, unknown> = {}
  for (const k of Object.keys(o).sort()) {
    sorted[k] = sortKeysDeep(o[k])
  }
  return sorted
}

function payloadFingerprintCombined(
  payload: Record<string, unknown>,
  lens_system: string | null | undefined,
  lens_mount: string | null | undefined,
  lens_adaptable: number | null | undefined
): string {
  const combined = {
    payload: sortKeysDeep(payload),
    lens_system,
    lens_mount,
    lens_adaptable: lens_adaptable != null ? Boolean(lens_adaptable) : null
  }
  return JSON.stringify(sortKeysDeep(combined))
}

function filmNameFromKeywords(data: Record<string, unknown>): string {
  const keywords = data['Keywords']
  let values: string[] = []
  if (typeof keywords === 'string') values = [keywords]
  else if (Array.isArray(keywords)) values = keywords.map((v) => String(v))
  const hasFilmMarker = values.some((v) => v.trim().toLowerCase() === 'film')
  if (!hasFilmMarker) return ''
  for (const value of values) {
    const n = value.trim()
    if (!n || n.toLowerCase() === 'film') continue
    if (n.includes('Film Stock')) return stripFilmStockSuffix(n)
  }
  for (const value of values) {
    const n = value.trim()
    if (n && n.toLowerCase() !== 'film') return stripFilmStockSuffix(n)
  }
  return ''
}

function displayNameForRecord(category: string, data: Record<string, unknown>, fallback: string): string {
  if (category === 'camera') return String(data['Model'] ?? '').trim() || fallback
  if (category === 'lens')
    return String(data['LensModel'] ?? data['Lens'] ?? data['LensMake'] ?? '').trim() || fallback
  if (category === 'author')
    return String(data['Author Name'] ?? data['Creator'] ?? data['Artist'] ?? '').trim() || fallback
  if (category === 'film') {
    const filmName = filmNameFromKeywords(data).trim()
    const iso = String(data['ISO'] ?? '').trim()
    let display = filmName
    if (iso) display = `${display} (ISO ${iso})`.trim()
    return display || fallback
  }
  return fallback
}

function getConfigCategory(filename: string): string {
  if (filename.startsWith('camera_')) return 'camera'
  if (filename.startsWith('lens_')) return 'lens'
  if (filename.startsWith('author_')) return 'author'
  if (filename.startsWith('film_')) return 'film'
  return 'other'
}

function normalizeCategory(category: string): string {
  const n = String(category || '')
    .trim()
    .toLowerCase()
  const aliases: Record<string, string> = {
    camera: 'camera',
    cameras: 'camera',
    lens: 'lens',
    lenses: 'lens',
    film: 'film',
    films: 'film',
    author: 'author',
    authors: 'author'
  }
  const r = aliases[n]
  if (!r) throw new PresetStoreError(`Unsupported preset category: ${category}`)
  return r
}

function normalizeLensSystem(value: string | null | undefined, category: string): string | null {
  if (category !== 'camera') return null
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
  if (!normalized) return 'interchangeable'
  if (normalized !== 'fixed' && normalized !== 'interchangeable') {
    throw new PresetStoreError("Camera lens_system must be 'fixed' or 'interchangeable'.")
  }
  return normalized
}

function normalizeLensMount(value: string | null | undefined, category: string): string | null {
  if (category !== 'camera' && category !== 'lens') return null
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function normalizeLensAdaptable(value: boolean | number | null | undefined, category: string): number | null {
  if (category !== 'camera') return null
  if (value == null) return 0
  return value ? 1 : 0
}

function normalizePayloadJson(payload: Record<string, unknown>): string {
  const payloadClean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(payload)) {
    if (!CONTROL_FIELDS.has(k)) payloadClean[k] = v
  }
  return JSON.stringify(payloadClean, Object.keys(payloadClean).sort())
}

export async function verifyPresetDatabase(paths: DataPaths): Promise<string[]> {
  const issues: string[] = []
  if (!existsSync(paths.dbPath)) return ['Preset database file is missing.']
  const db = await openDb(paths)
  try {
    const raw = db.execRaw('PRAGMA integrity_check')
    const first = raw[0]
    const cell = first?.values?.[0]?.[0]
    if (String(cell).toLowerCase() !== 'ok') {
      issues.push(`Database integrity_check failed: ${String(cell)}`)
      return issues
    }
    const rows = db.all('SELECT id, category, payload_json FROM presets')
    const categories = new Set(['camera', 'lens', 'author', 'film'])
    for (const row of rows) {
      const id = Number(row['id'])
      const cat = String(row['category'])
      if (!categories.has(cat)) {
        issues.push(`Preset id=${id}: invalid category ${JSON.stringify(cat)}.`)
        continue
      }
      try {
        JSON.parse(String(row['payload_json']))
      } catch (e) {
        issues.push(`Preset id=${id}: invalid payload JSON: ${e}`)
      }
    }
  } finally {
    db.close()
  }
  return issues
}

function writeGoodStateBackup(paths: DataPaths): void {
  try {
    mkdirSync(paths.dataDir, { recursive: true })
    const tmp = `${paths.backupPath}.tmp`
    copyFileSync(paths.dbPath, tmp)
    renameSync(tmp, paths.backupPath)
  } catch {
    /* ignore */
  }
}

function maybeBackupAfterVerifiedGood(issues: string[], paths: DataPaths): void {
  if (issues.length > 0 || goodStateBackupWritten) return
  writeGoodStateBackup(paths)
  goodStateBackupWritten = true
}

export function loadDefaultLensMountCodes(paths: DataPaths): string[] {
  const p = paths.lensMountDefaultsPath
  if (!existsSync(p)) return [...FALLBACK_LENS_MOUNT_NAMES].sort()
  try {
    const data = JSON.parse(readFileSync(p, 'utf8')) as unknown
    if (!Array.isArray(data)) return [...FALLBACK_LENS_MOUNT_NAMES].sort()
    const out: string[] = []
    const seen = new Set<string>()
    for (const item of data) {
      const code = String(item).trim()
      if (!code || seen.has(code)) continue
      seen.add(code)
      out.push(code)
    }
    return out.length ? out.sort() : [...FALLBACK_LENS_MOUNT_NAMES].sort()
  } catch {
    return [...FALLBACK_LENS_MOUNT_NAMES].sort()
  }
}

function fetchDistinctLensMounts(db: PersistedDatabase): string[] {
  const rows = db.all(
    `SELECT DISTINCT lens_mount FROM presets
     WHERE lens_mount IS NOT NULL AND TRIM(lens_mount) <> ''
     ORDER BY lens_mount`
  )
  return rows.map((r) => String(r['lens_mount']).trim()).filter(Boolean)
}

export async function importJsonPresets(paths: DataPaths): Promise<{ imported: number; skipped_duplicates: number; errors: string[] }> {
  const stats = { imported: 0, skipped_duplicates: 0, errors: [] as string[] }
  const root = paths.configDir
  if (!existsSync(root)) return stats
  mkdirSync(paths.dataDir, { recursive: true })
  const db = await openDb(paths)
  try {
    const existingFingerprints: Record<string, Set<string>> = {
      camera: new Set(),
      lens: new Set(),
      author: new Set(),
      film: new Set()
    }
    const presetRows = db.all('SELECT category, payload_json, lens_system, lens_mount, lens_adaptable FROM presets')
    for (const row of presetRows) {
      const payload = JSON.parse(String(row['payload_json'])) as Record<string, unknown>
      existingFingerprints[String(row['category'])]!.add(
        payloadFingerprintCombined(payload, row['lens_system'] as string | null, row['lens_mount'] as string | null, row['lens_adaptable'] as number | null)
      )
    }

    const files = readdirSync(root).filter((f) => f.endsWith('.json') && f !== LENS_MOUNT_DEFAULTS_FILENAME)
    for (const filename of files.sort()) {
      const category = getConfigCategory(filename)
      if (!['camera', 'lens', 'author', 'film'].includes(category)) continue
      let rawData: Record<string, unknown>
      try {
        rawData = JSON.parse(readFileSync(join(root, filename), 'utf8')) as Record<string, unknown>
        if (typeof rawData !== 'object' || rawData === null) throw new Error('root must be a JSON object')
      } catch (e) {
        stats.errors.push(`${filename}: ${e}`)
        continue
      }
      const fallbackName = filename
        .replace(`${category}_`, '')
        .replace('.json', '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
      const displayName = displayNameForRecord(category, rawData, fallbackName)
      const lens_system = rawData['LensSystem'] as string | undefined
      const lens_mount = rawData['LensMount'] as string | undefined
      const lens_adaptable_raw = rawData['LensAdaptable']
      const lens_adaptable = lens_adaptable_raw == null ? null : lens_adaptable_raw ? 1 : 0
      const payload: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(rawData)) {
        if (!CONTROL_FIELDS.has(k)) payload[k] = v
      }
      const fp = payloadFingerprintCombined(payload, lens_system ?? null, lens_mount ?? null, lens_adaptable)
      if (existingFingerprints[category]!.has(fp)) {
        stats.skipped_duplicates++
        continue
      }
      try {
        db.runOnly(
          `INSERT OR IGNORE INTO presets
          (category, name, payload_json, lens_system, lens_mount, lens_adaptable)
          VALUES (?, ?, ?, ?, ?, ?)`,
          [category, displayName, JSON.stringify(payload, Object.keys(payload).sort()), lens_system ?? null, lens_mount ?? null, lens_adaptable]
        )
        db.persist()
        const ch = db.get('SELECT changes() AS c')!
        if (Number(ch['c']) === 1) {
          stats.imported++
          existingFingerprints[category]!.add(fp)
        }
      } catch (e) {
        stats.errors.push(`${filename}: ${e}`)
      }
    }
  } finally {
    db.close()
  }
  return stats
}

export async function ensureDatabaseInitialized(paths: DataPaths): Promise<void> {
  mkdirSync(paths.dataDir, { recursive: true })
  mkdirSync(paths.configDir, { recursive: true })
  const db = await openDb(paths)
  let count = 0
  try {
    migrateLensMountDisplayNames(db)
    const row = db.get('SELECT COUNT(*) AS cnt FROM presets')
    count = Number(row?.cnt ?? 0)
  } finally {
    db.close()
  }
  if (count === 0) {
    await importJsonPresets(paths)
  }
  const verifyIssues = await verifyPresetDatabase(paths)
  maybeBackupAfterVerifiedGood(verifyIssues, paths)
}

function normalizePresetRef(presetRef: number | string | null | undefined): number | null {
  if (presetRef == null || presetRef === '') return null
  if (typeof presetRef === 'number' && Number.isFinite(presetRef)) return presetRef
  if (typeof presetRef === 'string') {
    const s = presetRef.trim()
    if (/^\d+$/.test(s)) return parseInt(s, 10)
  }
  throw new PresetStoreError(`Invalid preset reference: ${String(presetRef)}`)
}

export async function readConfigPayload(
  paths: DataPaths,
  presetRef: number | string | null | undefined
): Promise<Record<string, unknown>> {
  const id = normalizePresetRef(presetRef)
  if (id == null) return {}
  await ensureDatabaseInitialized(paths)
  const db = await openDb(paths)
  try {
    const row = db.get('SELECT payload_json FROM presets WHERE id = ?', [id])
    if (!row) return {}
    const rawData = JSON.parse(String(row['payload_json'])) as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(rawData)) {
      if (!CONTROL_FIELDS.has(k)) out[k] = v
    }
    return out
  } finally {
    db.close()
  }
}

export async function mergeSelectedPayloads(
  paths: DataPaths,
  cameraFile: number | null | undefined,
  lensFile: number | null | undefined,
  authorFile: number | null | undefined,
  filmFile: number | null | undefined
): Promise<Record<string, unknown>> {
  const merged: Record<string, unknown> = {}
  if (cameraFile) Object.assign(merged, await readConfigPayload(paths, cameraFile))
  if (lensFile) Object.assign(merged, await readConfigPayload(paths, lensFile))
  if (authorFile) Object.assign(merged, await readConfigPayload(paths, authorFile))
  if (filmFile) Object.assign(merged, await readConfigPayload(paths, filmFile))
  /** Raw merged tags + user Copyright (no ©/year yet). `sanitizeWritePayload` runs only at ExifTool apply. */
  return stripWriteExcludedFields(merged)
}

export async function loadCatalog(paths: DataPaths): Promise<{ catalog: ConfigCatalog; loadIssues: string[] }> {
  const loadIssues: string[] = []
  const camera_options: string[] = []
  const lens_options: string[] = []
  const author_options: string[] = []
  const film_options: string[] = []
  const camera_file_map: Record<string, number | null | undefined> = { None: null }
  const lens_file_map: Record<string, number | null | undefined> = { None: null }
  const author_file_map: Record<string, number | null | undefined> = { None: null }
  const film_file_map: Record<string, number | null | undefined> = { None: null }
  const camera_metadata_map: ConfigCatalog['camera_metadata_map'] = {
    None: { lens_system: null, lens_mount: null, lens_adaptable: false }
  }
  const lens_metadata_map: ConfigCatalog['lens_metadata_map'] = {
    None: { lens_mount: null }
  }

  let rows: {
    id: number
    category: string
    name: string
    payload_json: string
    lens_system: string | null
    lens_mount: string | null
    lens_adaptable: number | null
  }[] = []

  try {
    await ensureDatabaseInitialized(paths)
    const db = await openDb(paths)
    try {
      rows = db.all(
        `SELECT id, category, name, payload_json, lens_system, lens_mount, lens_adaptable
         FROM presets ORDER BY category, name`
      ) as typeof rows
    } finally {
      db.close()
    }
  } catch (e) {
    loadIssues.push(String(e))
  }

  for (const row of rows) {
    const category = row.category
    const display_name = row.name
    const preset_id = row.id
    const payload = JSON.parse(row.payload_json) as Record<string, unknown>
    if (category === 'camera') {
      camera_options.push(display_name)
      camera_file_map[display_name] = preset_id
      let lens_system = row.lens_system
      if (lens_system !== 'fixed' && lens_system !== 'interchangeable') {
        const hasLensData = Object.keys(payload).some((k) => k.startsWith('Lens'))
        lens_system = hasLensData ? 'fixed' : 'interchangeable'
      }
      camera_metadata_map[display_name] = {
        lens_system,
        lens_mount: row.lens_mount,
        lens_adaptable: row.lens_adaptable != null ? Boolean(row.lens_adaptable) : false,
        fixed_lens_display:
          String(payload['LensModel'] ?? '').trim() ||
          String(payload['LensMake'] ?? '').trim() ||
          String(payload['Lens'] ?? '').trim() ||
          'None'
      }
    } else if (category === 'lens') {
      lens_options.push(display_name)
      lens_file_map[display_name] = preset_id
      lens_metadata_map[display_name] = { lens_mount: row.lens_mount }
    } else if (category === 'author') {
      author_options.push(display_name)
      author_file_map[display_name] = preset_id
    } else if (category === 'film') {
      film_options.push(display_name)
      film_file_map[display_name] = preset_id
    }
  }

  const catalog: ConfigCatalog = {
    camera_values: ['None', ...sortedStrings(camera_options)],
    lens_values: ['None', ...sortedStrings(lens_options)],
    author_values: ['None', ...sortedStrings(author_options)],
    film_values: ['None', ...sortedStrings(film_options)],
    camera_file_map,
    lens_file_map,
    author_file_map,
    film_file_map,
    camera_metadata_map,
    lens_metadata_map
  }
  return { catalog, loadIssues }
}

export async function getPresetRecord(paths: DataPaths, presetRef: number | string | null | undefined) {
  const id = normalizePresetRef(presetRef)
  if (id == null) return null
  await ensureDatabaseInitialized(paths)
  const db = await openDb(paths)
  try {
    const row = db.get(
      `SELECT id, category, name, payload_json, lens_system, lens_mount, lens_adaptable FROM presets WHERE id = ?`,
      [id]
    )
    if (!row) return null
    return {
      id: Number(row['id']),
      category: String(row['category']),
      name: String(row['name']),
      payload: JSON.parse(String(row['payload_json'])) as Record<string, unknown>,
      lens_system: row['lens_system'] as string | null,
      lens_mount: row['lens_mount'] as string | null,
      lens_adaptable: row['lens_adaptable'] != null ? Boolean(row['lens_adaptable']) : null
    }
  } finally {
    db.close()
  }
}

export async function createPreset(
  paths: DataPaths,
  category: string,
  name: string,
  payload: Record<string, unknown>,
  lens_system?: string | null,
  lens_mount?: string | null,
  lens_adaptable?: boolean | number | null
): Promise<number> {
  const normalized_category = normalizeCategory(category)
  const normalized_name = String(name ?? '').trim()
  if (!normalized_name) throw new PresetStoreError('Preset name is required.')
  const payload_json = normalizePayloadJson(payload)
  const ls = normalizeLensSystem(lens_system, normalized_category)
  const lm = normalizeLensMount(lens_mount, normalized_category)
  const la = normalizeLensAdaptable(lens_adaptable, normalized_category)

  await ensureDatabaseInitialized(paths)
  const db = await openDb(paths)
  try {
    try {
      db.run(
        `INSERT INTO presets (category, name, payload_json, lens_system, lens_mount, lens_adaptable)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [normalized_category, normalized_name, payload_json, ls, lm, la]
      )
      const row = db.get('SELECT last_insert_rowid() AS id')!
      return Number(row['id'])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('UNIQUE constraint failed')) {
        throw new PresetStoreError(`A ${normalized_category} preset named '${normalized_name}' already exists.`)
      }
      throw e
    }
  } finally {
    db.close()
  }
}

export async function updatePreset(
  paths: DataPaths,
  presetId: number,
  name: string,
  payload: Record<string, unknown>,
  lens_system?: string | null,
  lens_mount?: string | null,
  lens_adaptable?: boolean | number | null
): Promise<number> {
  const existing = await getPresetRecord(paths, presetId)
  if (!existing) throw new PresetStoreError(`Preset id=${presetId} was not found.`)
  const normalized_name = String(name ?? '').trim()
  if (!normalized_name) throw new PresetStoreError('Preset name is required.')
  const payload_json = normalizePayloadJson(payload)
  const category = existing.category
  const ls = normalizeLensSystem(lens_system, category)
  const lm = normalizeLensMount(lens_mount, category)
  const la = normalizeLensAdaptable(lens_adaptable, category)

  await ensureDatabaseInitialized(paths)
  const db = await openDb(paths)
  try {
    try {
      db.run(
        `UPDATE presets SET name = ?, payload_json = ?, lens_system = ?, lens_mount = ?, lens_adaptable = ? WHERE id = ?`,
        [normalized_name, payload_json, ls, lm, la, presetId]
      )
      return presetId
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('UNIQUE constraint failed')) {
        throw new PresetStoreError(`A ${category} preset named '${normalized_name}' already exists.`)
      }
      throw e
    }
  } finally {
    db.close()
  }
}

export async function suggestedLensMountCodes(paths: DataPaths): Promise<string[]> {
  const defaults = loadDefaultLensMountCodes(paths)
  if (!existsSync(paths.dbPath)) return sortedStrings(defaults)
  await ensureDatabaseInitialized(paths)
  const db = await openDb(paths)
  try {
    const distinct = fetchDistinctLensMounts(db)
    return sortedStrings([...defaults, ...distinct])
  } finally {
    db.close()
  }
}

export async function validateConfigFiles(paths: DataPaths): Promise<string[]> {
  const issues: string[] = []
  try {
    await ensureDatabaseInitialized(paths)
    issues.push(...(await verifyPresetDatabase(paths)))
    const db = await openDb(paths)
    try {
      const row = db.get('SELECT COUNT(*) AS cnt FROM presets')
      if (Number(row?.cnt ?? 0) === 0) issues.push('No presets found in database.')
    } finally {
      db.close()
    }
  } catch (e) {
    issues.push(`Preset database unavailable: ${e}`)
  }
  return issues
}

export async function importPresetDatabase(sourceSqlitePath: string, destDbPath: string): Promise<void> {
  const verifyPaths: DataPaths = {
    dataDir: dirname(destDbPath),
    dbPath: sourceSqlitePath,
    backupPath: join(dirname(destDbPath), 'presets.sqlite3.good'),
    lensMountDefaultsPath: join(dirname(destDbPath), LENS_MOUNT_DEFAULTS_FILENAME),
    configDir: join(dirname(destDbPath), 'config')
  }
  const issues = await verifyPresetDatabase(verifyPaths)
  if (issues.length) {
    throw new Error(`Source database is not valid:\n${issues.join('\n')}`)
  }
  mkdirSync(dirname(destDbPath), { recursive: true })
  copyFileSync(sourceSqlitePath, destDbPath)
}

/** Copy the live preset database to a single file (e.g. for backup or transfer). */
export async function exportPresetDatabaseFile(destPath: string, paths: DataPaths): Promise<void> {
  await ensureDatabaseInitialized(paths)
  if (!existsSync(paths.dbPath)) {
    throw new Error('Preset database not found.')
  }
  const issues = await verifyPresetDatabase(paths)
  if (issues.length) {
    throw new Error(`Cannot export: preset database is invalid:\n${issues.join('\n')}`)
  }
  mkdirSync(dirname(destPath), { recursive: true })
  copyFileSync(paths.dbPath, destPath)
}

/** Validate preset DB in memory without writing to disk (unlike openDb + verifyPresetDatabase on a path). */
function verifyPresetDatabaseMemory(db: Database): string[] {
  const issues: string[] = []
  let integrity: { columns: string[]; values: unknown[][] }[]
  try {
    integrity = db.exec('PRAGMA integrity_check')
  } catch (e) {
    issues.push(`Could not read database: ${e}`)
    return issues
  }
  const cell = integrity[0]?.values?.[0]?.[0]
  if (String(cell).toLowerCase() !== 'ok') {
    issues.push(`Database integrity_check failed: ${String(cell)}`)
    return issues
  }
  let stmt: Statement
  try {
    stmt = db.prepare('SELECT id, category, payload_json FROM presets')
  } catch {
    issues.push('Missing or invalid presets table.')
    return issues
  }
  const categories = new Set(['camera', 'lens', 'author', 'film'])
  try {
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>
      const id = Number(row['id'])
      const cat = String(row['category'])
      if (!categories.has(cat)) {
        issues.push(`Preset id=${id}: invalid category ${JSON.stringify(cat)}.`)
        continue
      }
      try {
        JSON.parse(String(row['payload_json']))
      } catch (e) {
        issues.push(`Preset id=${id}: invalid payload JSON: ${e}`)
      }
    }
  } finally {
    stmt.free()
  }
  return issues
}

/**
 * Merge presets from another ExifMod presets.sqlite3 into the destination database.
 * Inserts only rows whose (category, name) are not already present. Does not modify the source file.
 */
export async function mergePresetsFromSqliteFile(sourceFilePath: string, destPaths: DataPaths): Promise<MergeImportResult> {
  if (!existsSync(sourceFilePath)) {
    throw new Error(`File not found: ${sourceFilePath}`)
  }
  const srcBytes = readFileSync(sourceFilePath)
  const SQL = await getSqlJs()
  const srcDb = new SQL.Database(srcBytes)
  const skipped: MergeImportSkip[] = []
  let imported = 0
  let rows: Record<string, unknown>[] = []

  try {
    const issues = verifyPresetDatabaseMemory(srcDb)
    if (issues.length) {
      throw new Error(
        `The selected file is not a valid ExifMod preset database:\n\n${issues.join('\n')}`
      )
    }

    const readStmt = srcDb.prepare(
      `SELECT category, name, payload_json, lens_system, lens_mount, lens_adaptable FROM presets ORDER BY id`
    )
    try {
      while (readStmt.step()) {
        rows.push({ ...(readStmt.getAsObject() as Record<string, unknown>) })
      }
    } finally {
      readStmt.free()
    }
  } finally {
    srcDb.close()
  }

  await ensureDatabaseInitialized(destPaths)
  const dest = await openDb(destPaths)
  try {
    for (const row of rows) {
      const rawCategory = String(row['category'] ?? '')
      const name = String(row['name'] ?? '').trim()
      const payload_json = String(row['payload_json'] ?? '')

      if (!name) {
        skipped.push({
          category: rawCategory || '(unknown)',
          name: '(empty name)',
          reason: 'Skipped: preset name is empty.'
        })
        continue
      }

      let category: string
      try {
        category = normalizeCategory(rawCategory)
      } catch (e) {
        skipped.push({
          category: rawCategory,
          name,
          reason: e instanceof Error ? e.message : String(e)
        })
        continue
      }

      let payload: Record<string, unknown>
      try {
        const parsed = JSON.parse(payload_json) as unknown
        if (typeof parsed !== 'object' || parsed === null) throw new Error('payload is not an object')
        payload = parsed as Record<string, unknown>
      } catch (e) {
        skipped.push({
          category,
          name,
          reason: `Skipped: invalid payload JSON (${e instanceof Error ? e.message : String(e)}).`
        })
        continue
      }

      const existing = dest.get('SELECT id FROM presets WHERE category = ? AND name = ?', [category, name])
      if (existing) {
        skipped.push({
          category,
          name,
          reason: `A preset named "${name}" already exists in category "${category}".`
        })
        continue
      }

      try {
        const payloadNorm = normalizePayloadJson(payload)
        const ls = normalizeLensSystem(row['lens_system'] as string | null, category)
        const lm = normalizeLensMount(row['lens_mount'] as string | null, category)
        const la = normalizeLensAdaptable(row['lens_adaptable'] as boolean | number | null, category)
        dest.runOnly(
          `INSERT INTO presets (category, name, payload_json, lens_system, lens_mount, lens_adaptable) VALUES (?, ?, ?, ?, ?, ?)`,
          [category, name, payloadNorm, ls, lm, la]
        )
        imported++
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.includes('UNIQUE constraint failed')) {
          skipped.push({
            category,
            name,
            reason: `A preset named "${name}" already exists in category "${category}".`
          })
        } else {
          skipped.push({
            category,
            name,
            reason: `Skipped: ${msg}`
          })
        }
      }
    }
    dest.persist()
  } finally {
    dest.close()
  }

  return { imported, skipped }
}

export function isSupportedImagePath(filePath: string): boolean {
  const lower = filePath.toLowerCase()
  const dot = lower.lastIndexOf('.')
  if (dot < 0) return false
  return IMAGE_EXTENSIONS.has(lower.slice(dot))
}

export function normalizePathsDedup(paths: string[], existing?: string[]): string[] {
  const existingSet = new Set(existing ?? [])
  const normalized: string[] = []
  for (const value of paths) {
    const p = value
    if (!existingSet.has(p)) {
      normalized.push(p)
      existingSet.add(p)
    }
  }
  return normalized
}
