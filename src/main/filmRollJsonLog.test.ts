import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { beforeAll, describe, expect, it } from 'vitest'
import { i18next } from './i18n.js'
import en from '../../locales/en.json'
import { parseFilmRollLogJson } from './filmRollJsonLog.js'
import { validateFilmRollLogRowsForImport } from './filmRollSpreadsheet.js'

function baseRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ImageNumber: 1,
    SourceFile: './frame.tif',
    Make: 'Acme',
    Model: 'One',
    LensMake: '',
    LensModel: '',
    DocumentName: 'HP5 Plus',
    Notes: 'note',
    ExposureTime: 0.008,
    FNumber: 5.6,
    ...over
  }
}

describe('parseFilmRollLogJson', () => {
  beforeAll(async () => {
    if (i18next.isInitialized) return
    await i18next.init({
      lng: 'en',
      fallbackLng: 'en',
      resources: { en: { translation: en as Record<string, unknown> } },
      interpolation: { escapeValue: false }
    })
  })

  it('aligns by SourceFile stem to folder order', () => {
    const dir = mkdtempSync(join(tmpdir(), 'film-roll-json-'))
    try {
      const jsonPath = join(dir, 'MyRoll.json')
      const rows = [
        baseRow({
          ImageNumber: 2,
          SourceFile: './002.tif',
          Notes: 'second',
          DocumentName: 'HP5 Plus'
        }),
        baseRow({
          ImageNumber: 1,
          SourceFile: './001.tif',
          Notes: 'first',
          DocumentName: 'HP5 Plus'
        })
      ]
      writeFileSync(jsonPath, JSON.stringify(rows))
      const paths = [join(dir, '001.jpg'), join(dir, '002.jpg')]
      const parsed = parseFilmRollLogJson(jsonPath, paths)
      expect(parsed.logName).toBe('MyRoll')
      expect(parsed.shots).toHaveLength(2)
      expect(parsed.shots[0]!.description).toBe('first')
      expect(parsed.shots[1]!.description).toBe('second')
      expect(parsed.filmPresetName).toBe('HP5 Plus')
      expect(validateFilmRollLogRowsForImport(parsed, 2)).toEqual({ ok: true })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fills unmatched slots by ImageNumber order', () => {
    const dir = mkdtempSync(join(tmpdir(), 'film-roll-json-'))
    try {
      const jsonPath = join(dir, 'log.json')
      const rows = [
        baseRow({
          ImageNumber: 2,
          SourceFile: './scan_a.tif',
          Notes: 'matched a',
          DocumentName: 'HP5 Plus'
        }),
        baseRow({
          ImageNumber: 1,
          SourceFile: '',
          Notes: 'fallback b',
          DocumentName: 'HP5 Plus'
        })
      ]
      writeFileSync(jsonPath, JSON.stringify(rows))
      const paths = [join(dir, 'scan_a.jpg'), join(dir, 'scan_b.jpg')]
      const parsed = parseFilmRollLogJson(jsonPath, paths)
      expect(parsed.shots[0]!.description).toBe('matched a')
      expect(parsed.shots[1]!.description).toBe('fallback b')
      expect(validateFilmRollLogRowsForImport(parsed, 2)).toEqual({ ok: true })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('uses pure ImageNumber order when SourceFile is empty', () => {
    const dir = mkdtempSync(join(tmpdir(), 'film-roll-json-'))
    try {
      const jsonPath = join(dir, 'log.json')
      const rows = [
        baseRow({ ImageNumber: 2, SourceFile: '', Notes: 'im2', DocumentName: 'HP5 Plus' }),
        baseRow({ ImageNumber: 1, SourceFile: '', Notes: 'im1', DocumentName: 'HP5 Plus' })
      ]
      writeFileSync(jsonPath, JSON.stringify(rows))
      const paths = [join(dir, 'f1.jpg'), join(dir, 'f2.jpg')]
      const parsed = parseFilmRollLogJson(jsonPath, paths)
      expect(parsed.shots[0]!.description).toBe('im1')
      expect(parsed.shots[1]!.description).toBe('im2')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects inconsistent DocumentName across frames', () => {
    const dir = mkdtempSync(join(tmpdir(), 'film-roll-json-'))
    try {
      const jsonPath = join(dir, 'log.json')
      const rows = [
        baseRow({ ImageNumber: 1, SourceFile: './a.tif', DocumentName: 'Stock A', Notes: '1' }),
        baseRow({ ImageNumber: 2, SourceFile: './b.tif', DocumentName: 'Stock B', Notes: '2' })
      ]
      writeFileSync(jsonPath, JSON.stringify(rows))
      expect(() =>
        parseFilmRollLogJson(jsonPath, [join(dir, 'a.jpg'), join(dir, 'b.jpg')])
      ).toThrow(i18next.t('filmRoll.importJsonFilmInconsistent'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects duplicate SourceFile match keys', () => {
    const dir = mkdtempSync(join(tmpdir(), 'film-roll-json-'))
    try {
      const jsonPath = join(dir, 'log.json')
      const rows = [
        baseRow({ ImageNumber: 1, SourceFile: './same.tif', Notes: '1' }),
        baseRow({ ImageNumber: 2, SourceFile: './same.tif', Notes: '2' })
      ]
      writeFileSync(jsonPath, JSON.stringify(rows))
      expect(() =>
        parseFilmRollLogJson(jsonPath, [join(dir, 'a.jpg'), join(dir, 'b.jpg')])
      ).toThrow(i18next.t('filmRoll.importJsonDuplicateSourceFile'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects duplicate image stems in folder list', () => {
    const dir = mkdtempSync(join(tmpdir(), 'film-roll-json-'))
    try {
      const jsonPath = join(dir, 'log.json')
      const rows = [baseRow({ ImageNumber: 1 }), baseRow({ ImageNumber: 2, Notes: '2' })]
      writeFileSync(jsonPath, JSON.stringify(rows))
      expect(() =>
        parseFilmRollLogJson(jsonPath, [join(dir, 'dup.jpg'), join(dir, 'dup.tiff')])
      ).toThrow(i18next.t('filmRoll.importJsonDuplicateImageStem'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
