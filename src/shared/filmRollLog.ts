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

