import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { exiftoolHasSettingsMeansAdobeCrsDevelop } from '../shared/adobeDevelop.js'
import { getExiftoolPathCandidates } from './exifCore/constants.js'
import { isRawImagePath, sidecarXmpPath } from './exifCore/imagePaths.js'

export function resolveExiftoolPath(): string | null {
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which'
    const out = execFileSyncSafe(cmd, ['exiftool'])
    const first = out.split(/\r?\n/).map((s) => s.trim()).find(Boolean)
    if (first && existsSync(first)) return first
  } catch {
    /* */
  }
  for (const c of getExiftoolPathCandidates()) {
    if (existsSync(c)) return c
  }
  return null
}

function execFileSyncSafe(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: 'utf8' }) as string
}

export function validateExiftool(exiftoolPath?: string): string | null {
  const path = exiftoolPath ?? resolveExiftoolPath()
  if (!path) {
    return 'exiftool not found.\nInstall exiftool and ensure it is available in PATH or one of the common install locations.'
  }
  try {
    execFileSyncSafe(path, ['-ver'])
  } catch (e) {
    return `exiftool cannot be executed from '${path}': ${e}`
  }
  return null
}

function parseExifJsonFirstRow(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text) as unknown
  if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
    return parsed[0] as Record<string, unknown>
  }
  return {}
}

export function readExifMetadata(exiftoolPath: string, filePath: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const errChunks: Buffer[] = []
    const child = spawn(exiftoolPath, ['-charset', 'EXIF=utf8', '-j', filePath], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    child.stdout?.on('data', (d) => chunks.push(d))
    child.stderr?.on('data', (d) => errChunks.push(d))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(Buffer.concat(errChunks).toString('utf8') || `exiftool exited ${code}`))
        return
      }
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve(parseExifJsonFirstRow(text))
      } catch (e) {
        reject(e)
      }
    })
  })
}

/** Merge companion `.xmp` tags on top of RAW container read; keeps `SourceFile` as the main image path. */
function mergeRawWithSidecar(
  primary: Record<string, unknown>,
  sidecar: Record<string, unknown>,
  mainSourceFile: string
): Record<string, unknown> {
  const out = { ...primary, ...sidecar }
  out['SourceFile'] = mainSourceFile
  return out
}

/**
 * Read metadata for one path. For RAW files, if a same-basename `.xmp` exists, merge its tags after the RAW read
 * so Lightroom/Camera Raw edits stored only in the sidecar appear in the UI.
 */
export async function readExifMetadataMerged(exiftoolPath: string, filePath: string): Promise<Record<string, unknown>> {
  const primary = await readExifMetadata(exiftoolPath, filePath)
  if (!isRawImagePath(filePath)) return primary
  const xmp = sidecarXmpPath(filePath)
  if (!existsSync(xmp)) return primary
  try {
    const sidecar = await readExifMetadata(exiftoolPath, xmp)
    return mergeRawWithSidecar(primary, sidecar, String(primary['SourceFile'] ?? filePath))
  } catch {
    return primary
  }
}

const READ_METADATA_BATCH_CHUNK = 48

/**
 * One ExifTool `-j` invocation per chunk; returns a map keyed by requested paths (and merges RAW+xmp when needed).
 */
export async function readExifMetadataBatchMerged(
  exiftoolPath: string,
  filePaths: string[],
  onProgress?: (done: number, total: number) => void
): Promise<Record<string, Record<string, unknown>>> {
  const out: Record<string, Record<string, unknown>> = {}
  const total = filePaths.length
  let done = 0
  for (let i = 0; i < filePaths.length; i += READ_METADATA_BATCH_CHUNK) {
    const chunk = filePaths.slice(i, i + READ_METADATA_BATCH_CHUNK)
    const partial = await readExifMetadataBatchChunk(exiftoolPath, chunk)
    for (const p of chunk) {
      const row = partial[p]
      if (row) out[p] = row
    }
    done += chunk.length
    onProgress?.(Math.min(done, total), total)
  }
  return out
}

async function readExifMetadataBatchChunk(
  exiftoolPath: string,
  filePaths: string[]
): Promise<Record<string, Record<string, unknown>>> {
  if (filePaths.length === 0) return {}
  const text: string = await new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const errChunks: Buffer[] = []
    const args = ['-charset', 'EXIF=utf8', '-j', ...filePaths]
    const child = spawn(exiftoolPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout?.on('data', (d) => chunks.push(d))
    child.stderr?.on('data', (d) => errChunks.push(d))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(Buffer.concat(errChunks).toString('utf8') || `exiftool exited ${code}`))
        return
      }
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
  })
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch (e) {
    return {}
  }
  const out: Record<string, Record<string, unknown>> = {}
  const rows = Array.isArray(parsed) ? parsed : []
  for (let i = 0; i < filePaths.length; i++) {
    const p = filePaths[i]!
    const rawRow =
      i < rows.length && typeof rows[i] === 'object' && rows[i] !== null
        ? ({ ...(rows[i] as Record<string, unknown>) } as Record<string, unknown>)
        : {}
    rawRow['SourceFile'] = p
    let merged = rawRow
    if (isRawImagePath(p)) {
      const xmp = sidecarXmpPath(p)
      if (existsSync(xmp)) {
        try {
          const side = await readExifMetadata(exiftoolPath, xmp)
          merged = mergeRawWithSidecar(merged, side, p)
        } catch {
          /* keep container row only */
        }
      }
    }
    out[p] = merged
  }
  return out
}

/**
 * Single ExifTool invocation: whether each file has `HasSettings` (XMP-crs develop recipe) for LRC warning.
 * Paths in the result map match ExifTool's `SourceFile` (same strings as passed in).
 */
export function probeHasSettingsBatch(
  exiftoolPath: string,
  filePaths: string[]
): Promise<Record<string, boolean>> {
  if (filePaths.length === 0) return Promise.resolve({})
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const errChunks: Buffer[] = []
    const args = ['-charset', 'EXIF=utf8', '-j', '-HasSettings', ...filePaths]
    const child = spawn(exiftoolPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout?.on('data', (d) => chunks.push(d))
    child.stderr?.on('data', (d) => errChunks.push(d))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(Buffer.concat(errChunks).toString('utf8') || `exiftool exited ${code}`))
        return
      }
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        const parsed = JSON.parse(text) as unknown
        const out: Record<string, boolean> = {}
        if (!Array.isArray(parsed)) {
          resolve(out)
          return
        }
        for (const row of parsed) {
          if (typeof row !== 'object' || row === null) continue
          const o = row as Record<string, unknown>
          const sf = o['SourceFile']
          if (typeof sf !== 'string') continue
          out[sf] = exiftoolHasSettingsMeansAdobeCrsDevelop(o['HasSettings'])
        }
        resolve(out)
      } catch (e) {
        reject(e)
      }
    })
  })
}

export function spawnExiftool(
  args: string[],
  opts: { timeoutMs?: number } = {}
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const exe = args[0]!
  const rest = args.slice(1)
  return new Promise((resolve, reject) => {
    const child = spawn(exe, rest, { stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    const errChunks: Buffer[] = []
    let done = false
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          if (!done) {
            child.kill('SIGTERM')
            reject(new Error('exiftool timed out'))
          }
        }, opts.timeoutMs)
      : null
    child.stdout?.on('data', (d) => chunks.push(d))
    child.stderr?.on('data', (d) => errChunks.push(d))
    child.on('error', (e) => {
      done = true
      if (timer) clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      done = true
      if (timer) clearTimeout(timer)
      resolve({
        stdout: Buffer.concat(chunks).toString('utf8'),
        stderr: Buffer.concat(errChunks).toString('utf8'),
        code
      })
    })
  })
}
