import { readFileSync } from 'node:fs'
import { i18next } from './i18n.js'
import type { FilmRollLogShotRow, FilmRollParsedLog } from '../shared/filmRollLog.js'
import {
  exposureSecondsToShutterString,
  filmRollPathMatchKey,
  filmRollSourceFileToMatchKey,
  isJsonLogPath,
  joinLensMakeModel,
  joinMakeModel,
  normalizeRequiredCellValue,
  pathFileStem
} from '../shared/filmRollLog.js'

type LogbookRow = Record<string, unknown>

function assertPlainObject(row: unknown, index: number): asserts row is LogbookRow {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error(i18next.t('filmRoll.importJsonRowNotObject', { index: index + 1 }))
  }
}

function imageNumberForSort(row: LogbookRow): number {
  const n = Number(row.ImageNumber)
  return Number.isFinite(n) ? n : 0
}

function logbookRowToShotRow(row: LogbookRow): FilmRollLogShotRow {
  const frameNumber = Number(row.ImageNumber)
  if (!Number.isFinite(frameNumber) || frameNumber <= 0) {
    throw new Error(i18next.t('filmRoll.importJsonInvalidImageNumber'))
  }
  const fnum = row.FNumber
  const aperture =
    typeof fnum === 'number' && Number.isFinite(fnum)
      ? String(fnum)
      : normalizeRequiredCellValue(fnum)
  return {
    frameNumber,
    cameraPresetName: joinMakeModel(row.Make, row.Model),
    lensPresetName: joinLensMakeModel(row.LensMake, row.LensModel),
    shutterSpeed: exposureSecondsToShutterString(row.ExposureTime),
    aperture,
    authorPresetName: null,
    description: normalizeRequiredCellValue(row.Notes),
    keywords: ''
  }
}

function logNameFromJsonPath(filePath: string): string {
  return pathFileStem(filePath)
}

/**
 * Parse Logbook-style JSON array; align rows to `imageFilePaths` by `SourceFile` stem match first,
 * then assign remaining rows in `ImageNumber` order to unmatched slots.
 */
export function parseFilmRollLogJson(filePath: string, imageFilePaths: string[]): FilmRollParsedLog {
  if (!isJsonLogPath(filePath)) {
    throw new Error(i18next.t('filmRoll.importInvalidFormat'))
  }
  const n = imageFilePaths.length
  if (n === 0) {
    throw new Error(i18next.t('filmRoll.importNoShotRows'))
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    throw new Error(i18next.t('filmRoll.importJsonParseError'))
  }
  if (!Array.isArray(parsed)) {
    throw new Error(i18next.t('filmRoll.importJsonNotArray'))
  }
  if (parsed.length === 0) {
    throw new Error(i18next.t('filmRoll.importJsonEmpty'))
  }
  if (parsed.length !== n) {
    throw new Error(
      i18next.t('filmRoll.importCountMismatch', {
        rows: parsed.length,
        images: n
      })
    )
  }

  const raw: LogbookRow[] = []
  for (let i = 0; i < parsed.length; i++) {
    const row = parsed[i]
    assertPlainObject(row, i)
    raw.push(row)
  }

  const folderStemSeen = new Set<string>()
  for (const p of imageFilePaths) {
    const k = filmRollPathMatchKey(p)
    if (folderStemSeen.has(k)) {
      throw new Error(i18next.t('filmRoll.importJsonDuplicateImageStem'))
    }
    folderStemSeen.add(k)
  }

  const sourceKeyToRowIndex = new Map<string, number>()
  for (let j = 0; j < raw.length; j++) {
    const key = filmRollSourceFileToMatchKey(raw[j]!.SourceFile)
    if (key == null) continue
    if (sourceKeyToRowIndex.has(key)) {
      throw new Error(i18next.t('filmRoll.importJsonDuplicateSourceFile'))
    }
    sourceKeyToRowIndex.set(key, j)
  }

  const assigned: Array<LogbookRow | null> = Array.from({ length: n }, () => null)
  const usedRowIndices = new Set<number>()

  for (let i = 0; i < n; i++) {
    const fileKey = filmRollPathMatchKey(imageFilePaths[i]!)
    const j = sourceKeyToRowIndex.get(fileKey)
    if (j !== undefined && !usedRowIndices.has(j)) {
      assigned[i] = raw[j]!
      usedRowIndices.add(j)
    }
  }

  const unmatchedFileIndices: number[] = []
  for (let i = 0; i < n; i++) {
    if (assigned[i] == null) unmatchedFileIndices.push(i)
  }
  const unusedRowIndices: number[] = []
  for (let j = 0; j < n; j++) {
    if (!usedRowIndices.has(j)) unusedRowIndices.push(j)
  }

  if (unmatchedFileIndices.length !== unusedRowIndices.length) {
    throw new Error(i18next.t('filmRoll.importJsonAlignmentMismatch'))
  }

  unusedRowIndices.sort((a, b) => {
    const da = imageNumberForSort(raw[a]!)
    const db = imageNumberForSort(raw[b]!)
    if (da !== db) return da - db
    return a - b
  })

  for (let t = 0; t < unmatchedFileIndices.length; t++) {
    assigned[unmatchedFileIndices[t]!] = raw[unusedRowIndices[t]!]!
  }

  const shots: FilmRollLogShotRow[] = []
  const filmTrimmed: string[] = []
  for (let i = 0; i < n; i++) {
    const row = assigned[i]!
    shots.push(logbookRowToShotRow(row))
    filmTrimmed.push(normalizeRequiredCellValue(row.DocumentName).trim())
  }

  const filmSet = new Set(filmTrimmed)
  if (filmSet.size > 1) {
    throw new Error(i18next.t('filmRoll.importJsonFilmInconsistent'))
  }

  const first = shots[0]!
  const filmPresetName = normalizeRequiredCellValue(assigned[0]!.DocumentName)

  return {
    logName: logNameFromJsonPath(filePath),
    cameraPresetName: first.cameraPresetName,
    lensPresetName: first.lensPresetName,
    filmPresetName,
    authorPresetName: null,
    shots
  }
}
