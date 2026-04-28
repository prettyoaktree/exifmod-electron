import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  parseFilmRollLogWorkbook,
  validateFilmRollLogRowsForImport,
  writeFilmRollLogWorkbook
} from './filmRollSpreadsheet.js'

describe('filmRollSpreadsheet', () => {
  it('writes and parses xlsx film roll logs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'film-roll-log-'))
    try {
      const path = join(dir, 'roll.xlsx')
      writeFilmRollLogWorkbook(path, {
        logName: 'Roll 7',
        cameraPresetName: 'Leica M6',
        lensPresetName: 'Summicron 35',
        filmPresetName: 'Portra 400',
        authorPresetName: 'Alice',
        frameCount: 12
      })
      const parsed = parseFilmRollLogWorkbook(path)
      expect(parsed.logName).toBe('Roll 7')
      expect(parsed.cameraPresetName).toBe('Leica M6')
      expect(parsed.shots).toHaveLength(12)
      expect(validateFilmRollLogRowsForImport(parsed, 12)).toEqual({ ok: true })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects non-xlsx imports', () => {
    expect(() => parseFilmRollLogWorkbook('/tmp/not-a-log.csv')).toThrow()
  })
})

