import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildApplyCommand, sanitizeWritePayload } from './exifCore/pure.js'
import {
  probeHasSettingsBatch,
  readExifMetadata,
  resolveExiftoolPath,
  spawnExiftool,
  validateExiftool
} from './exiftoolRunner.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const FIXTURE_JPG = join(repoRoot, 'test', 'test_image.jpg')
/** Optional repo fixture with embedded Lightroom Classic / XMP-crs metadata (large; may be absent in CI). */
const FIXTURE_LRC_TIF = join(repoRoot, 'test', 'lrc', 'instamatic_lomo100_6-positive.tif')

function exiftoolSkipReason(): string | null {
  const p = resolveExiftoolPath()
  if (!p) return 'exiftool not found in PATH or common locations'
  return validateExiftool(p)
}

/**
 * Raw merge shape like `mergeSelectedPayloads` input before `sanitizeWritePayload`:
 * camera + lens + author + film preset payloads concatenated (later overwrites earlier for same key).
 * `Film` / `Film Maker` are stripped on write (WRITE_EXCLUDED_FIELDS).
 * UI-only keys (`LensSystem`, `LensMount`, `LensAdaptable`) are never present in merged apply payloads from the store.
 */
const RAW_MERGED_LIKE_CATALOG: Record<string, unknown> = {
  Make: 'EXIFmod Catalog Test',
  Model: 'Integration Body T1',
  LensMake: 'Catalog Lens Co',
  LensModel: 'CAT-35-14-A',
  FocalLength: 35,
  FNumber: 2.8,
  ExposureTime: '1/125',
  ISO: 400,
  Author: 'Person',
  Artist: 'Catalog Test Author',
  Copyright: 'EXIFmod catalog integration',
  ImageDescription: 'Merged preset catalog round-trip verification.',
  Keywords: ['catalog-test', 'exifmod'],
  Film: 'should-not-write',
  'Film Maker': 'should-not-write'
}

/** Values exiftool -j should match after writing `expected` (tag-for-tag, with normalizations). */
function assertMetadataMatchesRead(
  read: Record<string, unknown>,
  expectedWritten: Record<string, unknown>
): void {
  for (const [key, exp] of Object.entries(expectedWritten)) {
    const act = read[key]
    const ok = valuesEquivalent(exp, act)
    expect(ok, `Field "${key}": expected ${JSON.stringify(exp)}, read ${JSON.stringify(act)}`).toBe(true)
  }
}

function valuesEquivalent(expected: unknown, actual: unknown): boolean {
  if (expected === actual) return true
  if (expected == null || actual == null) return expected === actual

  if (typeof expected === 'number' && typeof actual === 'number') {
    return Math.abs(expected - actual) < 1e-9
  }
  if (typeof expected === 'number' && typeof actual === 'string') {
    const m = actual.match(/-?[\d.]+/)
    if (m) return Math.abs(parseFloat(m[0]) - expected) < 0.02
    return false
  }
  if (typeof expected === 'string' && typeof actual === 'string') {
    return expected === actual
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) return false
    return expected.every((e, i) => valuesEquivalent(e, actual[i]))
  }
  if (Array.isArray(expected) && typeof actual === 'string') {
    const parts = actual.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
    return valuesEquivalent(expected, parts)
  }
  return String(expected) === String(actual)
}

describe('exiftool integration (fixture: test/test_image.jpg)', () => {
  const skipReason = exiftoolSkipReason()

  beforeAll(() => {
    expect(
      existsSync(FIXTURE_JPG),
      `Missing ${FIXTURE_JPG}. Add the JPEG fixture under test/ (see README or generate with ffmpeg).`
    ).toBe(true)
  })

  let workDir: string | undefined
  afterEach(() => {
    if (workDir && existsSync(workDir)) {
      rmSync(workDir, { recursive: true, force: true })
      workDir = undefined
    }
  })

  it.skipIf(skipReason !== null)('reads baseline metadata from fixture via exiftool -j', async () => {
    const tool = resolveExiftoolPath()!
    const meta = await readExifMetadata(tool, FIXTURE_JPG)

    expect(meta.MIMEType).toBe('image/jpeg')
    expect(Number(meta.ImageWidth)).toBe(64)
    expect(Number(meta.ImageHeight)).toBe(64)
  })

  it.skipIf(skipReason !== null)(
    'writes merged catalog payload and reads back all mapped fields (preset structure)',
    async () => {
      const tool = resolveExiftoolPath()!

      const sanitized = sanitizeWritePayload(RAW_MERGED_LIKE_CATALOG)
      expect(sanitized.Film).toBeUndefined()
      expect(sanitized['Film Maker']).toBeUndefined()
      expect(Object.keys(sanitized)).not.toContain('Film')
      expect(Object.keys(sanitized)).not.toContain('Film Maker')

      workDir = mkdtempSync(join(tmpdir(), 'exifmod-exiftool-'))
      const copyPath = join(workDir, 'work.jpg')
      copyFileSync(FIXTURE_JPG, copyPath)

      const cmd = buildApplyCommand(tool, copyPath, RAW_MERGED_LIKE_CATALOG)
      expect(cmd).toContain('-P')
      const { code, stderr } = await spawnExiftool(cmd, { timeoutMs: 60_000 })
      expect(code, stderr || 'exiftool failed').toBe(0)

      const after = await readExifMetadata(tool, copyPath)

      assertMetadataMatchesRead(after, sanitized)

      expect(after.Film).toBeUndefined()
      expect((after as Record<string, unknown>)['Film Maker']).toBeUndefined()
    }
  )
})

describe('exiftool probe HasSettings (optional test/lrc fixtures)', () => {
  const skipReason = exiftoolSkipReason()

  it.skipIf(skipReason !== null)('probeHasSettingsBatch is false for baseline JPEG', async () => {
    const tool = resolveExiftoolPath()!
    const r = await probeHasSettingsBatch(tool, [FIXTURE_JPG])
    expect(r[FIXTURE_JPG]).toBe(false)
  })

  it.skipIf(skipReason !== null || !existsSync(FIXTURE_LRC_TIF))(
    'probeHasSettingsBatch is true for optional Lightroom TIFF fixture',
    async () => {
      const tool = resolveExiftoolPath()!
      const r = await probeHasSettingsBatch(tool, [FIXTURE_LRC_TIF])
      expect(r[FIXTURE_LRC_TIF]).toBe(true)
    }
  )

  it.skipIf(skipReason !== null || !existsSync(FIXTURE_LRC_TIF))(
    'probeHasSettingsBatch handles JPEG and TIFF in one invocation',
    async () => {
      const tool = resolveExiftoolPath()!
      const r = await probeHasSettingsBatch(tool, [FIXTURE_JPG, FIXTURE_LRC_TIF])
      expect(r[FIXTURE_JPG]).toBe(false)
      expect(r[FIXTURE_LRC_TIF]).toBe(true)
    }
  )
})
