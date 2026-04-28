export type FilmRollPresetCategory = 'camera' | 'lens' | 'film' | 'author'

export interface FilmRollLogCreateInput {
  logName: string
  cameraPresetName: string
  lensPresetName: string | null
  filmPresetName: string
  authorPresetName: string | null
  frameCount: 12 | 24 | 36 | 72
}

export interface FilmRollLogShotRow {
  frameNumber: number
  cameraPresetName: string
  lensPresetName: string | null
  shutterSpeed: string
  aperture: string
  authorPresetName: string | null
  description: string
  keywords: string
}

export interface FilmRollParsedLog {
  logName: string
  cameraPresetName: string
  lensPresetName: string | null
  filmPresetName: string
  authorPresetName: string | null
  shots: FilmRollLogShotRow[]
}

export interface FilmRollUnknownPresetValue {
  category: FilmRollPresetCategory
  value: string
}

export const FILM_ROLL_XLSX_EXTENSION = '.xlsx'
export const FILM_ROLL_JSON_EXTENSION = '.json'

export const FILM_ROLL_HEADER_ROWS = {
  logName: 'Log Name',
  camera: 'Camera',
  lens: 'Lens',
  filmStock: 'Film Stock',
  author: 'Author'
} as const

export const FILM_ROLL_SHOT_COLUMNS = [
  'Frame #',
  'Camera Preset',
  'Lens Preset',
  'Shutter Speed',
  'Aperture',
  'Author',
  'Description',
  'Keywords'
] as const

export function isXlsxPath(path: string): boolean {
  return path.toLowerCase().endsWith(FILM_ROLL_XLSX_EXTENSION)
}

export function isJsonLogPath(path: string): boolean {
  return path.toLowerCase().endsWith(FILM_ROLL_JSON_EXTENSION)
}

/** Last path segment (works with `/` or `\\`). */
export function pathFileBaseName(filePath: string): string {
  const s = filePath.replace(/\\/g, '/')
  const i = s.lastIndexOf('/')
  return i >= 0 ? s.slice(i + 1) : s
}

/** Basename without the last extension segment. */
export function pathFileStem(filePath: string): string {
  const base = pathFileBaseName(filePath)
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(0, dot) : base
}

/** Normalized stem key for matching Logbook `SourceFile` to a folder image path (case-insensitive). */
export function filmRollPathMatchKey(filePath: string): string {
  return pathFileStem(filePath).trim().toLowerCase()
}

/**
 * Match key from Logbook `SourceFile` (e.g. `./001.tif`). Returns `null` if unmatchable (empty).
 * Uses stem so `001.tif` can align with folder file `001.jpg`.
 */
export function filmRollSourceFileToMatchKey(sourceFile: unknown): string | null {
  const raw = String(sourceFile ?? '')
    .trim()
    .replace(/^\.\//, '')
  if (!raw) return null
  return filmRollPathMatchKey(raw)
}

export function joinMakeModel(make: unknown, model: unknown): string {
  return [String(make ?? '').trim(), String(model ?? '').trim()].filter(Boolean).join(' ').trim()
}

export function joinLensMakeModel(lensMake: unknown, lensModel: unknown): string | null {
  const s = joinMakeModel(lensMake, lensModel)
  return s || null
}

/** Shutter string for pending state; decimals are accepted by `validateFilmRollShutterSpeed`. */
export function exposureSecondsToShutterString(seconds: unknown): string {
  if (typeof seconds === 'number' && Number.isFinite(seconds)) return String(seconds)
  if (typeof seconds === 'string' && seconds.trim()) {
    const n = Number(seconds)
    if (Number.isFinite(n)) return String(n)
  }
  return ''
}

export function normalizeOptionalCellValue(raw: unknown): string | null {
  const v = String(raw ?? '').trim()
  return v ? v : null
}

export function normalizeRequiredCellValue(raw: unknown): string {
  return String(raw ?? '').trim()
}

export function validateFilmRollShutterSpeed(value: string): boolean {
  const v = value.trim()
  if (!v) return true
  return /^(?:\d+\/\d+|\d+(?:\.\d+)?)$/.test(v)
}

export function validateFilmRollAperture(value: string): boolean {
  const v = value.trim()
  if (!v) return true
  return /^\d+(?:\.\d+)?$/.test(v)
}

