import { i18next } from './i18n.js'
import { createRequire } from 'node:module'
import type { WorkSheet } from 'xlsx'
import {
  FILM_ROLL_HEADER_ROWS,
  FILM_ROLL_SHOT_COLUMNS,
  type FilmRollLogCreateInput,
  type FilmRollLogShotRow,
  type FilmRollParsedLog,
  isXlsxPath,
  normalizeOptionalCellValue,
  normalizeRequiredCellValue,
  validateFilmRollAperture,
  validateFilmRollShutterSpeed
} from '../shared/filmRollLog.js'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx') as typeof import('xlsx')

function isoDateText(): string {
  return new Date().toISOString().slice(0, 10)
}

export function buildFilmRollDefaultFileName(logName: string): string {
  const safe = logName.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, '').replace(/\s+/g, ' ')
  const base = safe || 'Film Roll Log'
  return `${base} ${isoDateText()}.xlsx`
}

export function writeFilmRollLogWorkbook(path: string, input: FilmRollLogCreateInput): void {
  const rows: Array<Array<string | number>> = [
    [FILM_ROLL_HEADER_ROWS.logName, input.logName],
    [FILM_ROLL_HEADER_ROWS.camera, input.cameraPresetName],
    [FILM_ROLL_HEADER_ROWS.lens, input.lensPresetName ?? ''],
    [FILM_ROLL_HEADER_ROWS.filmStock, input.filmPresetName],
    [FILM_ROLL_HEADER_ROWS.author, input.authorPresetName ?? ''],
    [],
    [...FILM_ROLL_SHOT_COLUMNS]
  ]
  for (let i = 1; i <= input.frameCount; i++) {
    rows.push([i, input.cameraPresetName, input.lensPresetName ?? '', '', '', input.authorPresetName ?? '', '', ''])
  }
  const worksheet = XLSX.utils.aoa_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Film Roll Log')
  XLSX.writeFile(workbook, path, { bookType: 'xlsx' })
}

function parseShotRows(tableRows: Array<Record<string, unknown>>): FilmRollLogShotRow[] {
  const out: FilmRollLogShotRow[] = []
  for (const row of tableRows) {
    const frameRaw = row['Frame #']
    const frameNumber = Number(frameRaw)
    if (!Number.isFinite(frameNumber)) continue
    if (frameNumber <= 0) continue
    out.push({
      frameNumber,
      cameraPresetName: normalizeRequiredCellValue(row['Camera Preset']),
      lensPresetName: normalizeOptionalCellValue(row['Lens Preset']),
      shutterSpeed: normalizeRequiredCellValue(row['Shutter Speed']),
      aperture: normalizeRequiredCellValue(row['Aperture']),
      authorPresetName: normalizeOptionalCellValue(row['Author']),
      description: normalizeRequiredCellValue(row['Description']),
      keywords: normalizeRequiredCellValue(row['Keywords'])
    })
  }
  return out.sort((a, b) => a.frameNumber - b.frameNumber)
}

function requireRowValue(sheet: WorkSheet, address: string, label: string): string {
  const value = normalizeRequiredCellValue(sheet[address]?.v)
  if (!value) {
    throw new Error(i18next.t('filmRoll.importMissingHeaderValue', { label }))
  }
  return value
}

export function parseFilmRollLogWorkbook(path: string): FilmRollParsedLog {
  if (!isXlsxPath(path)) {
    throw new Error(i18next.t('filmRoll.importInvalidFormat'))
  }
  const workbook = XLSX.readFile(path)
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) throw new Error(i18next.t('filmRoll.importInvalidWorkbook'))
  const sheet = workbook.Sheets[firstSheetName]
  if (!sheet) throw new Error(i18next.t('filmRoll.importInvalidWorkbook'))
  const logName = requireRowValue(sheet, 'B1', FILM_ROLL_HEADER_ROWS.logName)
  const cameraPresetName = requireRowValue(sheet, 'B2', FILM_ROLL_HEADER_ROWS.camera)
  const lensPresetName = normalizeOptionalCellValue(sheet['B3']?.v)
  const filmPresetName = requireRowValue(sheet, 'B4', FILM_ROLL_HEADER_ROWS.filmStock)
  const authorPresetName = normalizeOptionalCellValue(sheet['B5']?.v)
  const tableRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    range: 6,
    defval: ''
  })
  const shots = parseShotRows(tableRows)
  if (shots.length === 0) {
    throw new Error(i18next.t('filmRoll.importNoShotRows'))
  }
  return {
    logName,
    cameraPresetName,
    lensPresetName,
    filmPresetName,
    authorPresetName,
    shots
  }
}

export function validateFilmRollLogRowsForImport(
  parsed: FilmRollParsedLog,
  expectedImageCount: number
): { ok: true } | { ok: false; message: string } {
  if (parsed.shots.length !== expectedImageCount) {
    return {
      ok: false,
      message: i18next.t('filmRoll.importCountMismatch', {
        rows: parsed.shots.length,
        images: expectedImageCount
      })
    }
  }
  for (const shot of parsed.shots) {
    if (!validateFilmRollShutterSpeed(shot.shutterSpeed)) {
      return {
        ok: false,
        message: i18next.t('filmRoll.importInvalidShutter', { frame: shot.frameNumber })
      }
    }
    if (!validateFilmRollAperture(shot.aperture)) {
      return {
        ok: false,
        message: i18next.t('filmRoll.importInvalidAperture', { frame: shot.frameNumber })
      }
    }
  }
  return { ok: true }
}

