/**
 * Downscaled JPEG preview for the file list panel. Ollama uses a smaller max edge for speed.
 */
import { nativeImage } from 'electron'
import { i18next } from './i18n.js'
import { execFile as execFileCb, spawn } from 'node:child_process'
import { extname, join } from 'node:path'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { existsSync, statSync } from 'node:fs'
import { isRawImagePath } from './exifCore/imagePaths.js'
import { resolveExiftoolPath } from './exiftoolRunner.js'

/** Max longest edge (pixels) for the file list and metadata preview panel. */
export const PREVIEW_MAX_EDGE = 640
/** Smaller max edge for Ollama vision requests (faster, fewer image tokens). */
export const OLLAMA_PREVIEW_MAX_EDGE = 384
const PREVIEW_JPEG_QUALITY = 82
const LEGACY_PREVIEW_MAX_BYTES = 48 * 1024 * 1024

const LEGACY_DATA_URL_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])

function execFileAsync(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFileCb(command, args, (err) => (err ? reject(err) : resolve()))
  })
}

const RAW_PREVIEW_TAGS = ['PreviewImage', 'JpgFromRaw', 'JpgFromRaw2', 'ThumbnailImage', 'PreviewTIFF'] as const

function extractExiftoolBinaryTag(exiftoolPath: string, filePath: string, tag: string): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const child = spawn(exiftoolPath, ['-b', `-${tag}`, filePath], { stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout?.on('data', (d) => chunks.push(d))
    child.stderr?.on('data', () => {
      /* stderr ignored; exit code drives success */
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        resolve(null)
        return
      }
      const buf = Buffer.concat(chunks)
      if (buf.length < 32) {
        resolve(null)
        return
      }
      resolve(buf)
    })
  })
}

async function previewRawWithExiftool(
  filePath: string,
  maxEdge: number
): Promise<string | null> {
  const tool = resolveExiftoolPath()
  if (!tool) return null
  for (const tag of RAW_PREVIEW_TAGS) {
    try {
      const buf = await extractExiftoolBinaryTag(tool, filePath, tag)
      if (!buf) continue
      let image = nativeImage.createFromBuffer(buf)
      if (image.isEmpty()) continue
      const { width, height } = image.getSize()
      const maxE = Math.max(width, height)
      if (maxE > maxEdge) {
        const scale = maxEdge / maxE
        image = image.resize({
          width: Math.max(1, Math.round(width * scale)),
          height: Math.max(1, Math.round(height * scale)),
          quality: 'good'
        })
      }
      const jpeg = image.toJPEG(PREVIEW_JPEG_QUALITY)
      return `data:image/jpeg;base64,${jpeg.toString('base64')}`
    } catch {
      /* try next tag */
    }
  }
  return null
}

async function previewTiffWithSips(
  filePath: string,
  maxEdge: number
): Promise<string | null> {
  let dir: string | undefined
  try {
    dir = await mkdtemp(join(tmpdir(), 'exifmod-preview-'))
    const outJpg = join(dir, 'preview.jpg')
    await execFileAsync('sips', ['-s', 'format', 'jpeg', '-Z', String(maxEdge), filePath, '--out', outJpg])
    const buf = await readFile(outJpg)
    if (buf.length < 32) return null
    return `data:image/jpeg;base64,${buf.toString('base64')}`
  } catch {
    return null
  } finally {
    if (dir) {
      try {
        await rm(dir, { recursive: true, force: true })
      } catch {
        /* */
      }
    }
  }
}

/**
 * Build a JPEG data URL. `maxLongestEdge` caps the longest image dimension in pixels.
 */
export async function readImagePreviewDataUrlForMaxEdge(
  filePath: string,
  maxLongestEdge: number
): Promise<string> {
  const ext = extname(filePath).toLowerCase()
  const tiff = ext === '.tif' || ext === '.tiff'

  if (isRawImagePath(filePath)) {
    const fromExif = await previewRawWithExiftool(filePath, maxLongestEdge)
    if (fromExif) return fromExif
  }

  if (tiff && process.platform === 'darwin') {
    const fromSips = await previewTiffWithSips(filePath, maxLongestEdge)
    if (fromSips) return fromSips
  }

  const skipQuickLookThumb = tiff && process.platform === 'darwin'
  if (!skipQuickLookThumb && (process.platform === 'darwin' || process.platform === 'win32')) {
    try {
      const thumb = await nativeImage.createThumbnailFromPath(filePath, {
        width: maxLongestEdge,
        height: maxLongestEdge
      })
      if (!thumb.isEmpty()) {
        const buf = thumb.toJPEG(PREVIEW_JPEG_QUALITY)
        return `data:image/jpeg;base64,${buf.toString('base64')}`
      }
    } catch {
      /* fall through */
    }
  }

  let image = nativeImage.createFromPath(filePath)
  if (!image.isEmpty()) {
    const { width, height } = image.getSize()
    const maxE = Math.max(width, height)
    if (maxE > maxLongestEdge) {
      const scale = maxLongestEdge / maxE
      image = image.resize({
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
        quality: 'good'
      })
    }
    const buf = image.toJPEG(PREVIEW_JPEG_QUALITY)
    return `data:image/jpeg;base64,${buf.toString('base64')}`
  }

  if (!LEGACY_DATA_URL_EXTS.has(ext)) {
    throw new Error(i18next.t('preview.decodeFailed'))
  }
  const sz = statSync(filePath).size
  if (sz > LEGACY_PREVIEW_MAX_BYTES) {
    throw new Error(i18next.t('preview.tooLarge'))
  }
  const buf = await readFile(filePath)
  const mime =
    ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/jpeg'
  return `data:${mime};base64,${buf.toString('base64')}`
}

/**
 * Build a JPEG data URL the renderer can always show. Chromium does not decode TIFF in img tags;
 * use NativeImage / platform tools.
 */
export async function readImagePreviewDataUrl(filePath: string): Promise<string> {
  return readImagePreviewDataUrlForMaxEdge(filePath, PREVIEW_MAX_EDGE)
}

/** Raw base64 for Ollama `images` (no `data:` prefix) — file list / UI preview size. */
export async function readImagePreviewJpegBase64(filePath: string): Promise<string> {
  const dataUrl = await readImagePreviewDataUrl(filePath)
  const marker = 'base64,'
  const i = dataUrl.indexOf(marker)
  if (i === -1) throw new Error(i18next.t('preview.decodeFailed'))
  return dataUrl.slice(i + marker.length)
}

/** Raw base64 for Ollama (smaller max edge than the list panel for faster requests). */
export async function readImagePreviewJpegBase64Ollama(filePath: string): Promise<string> {
  const dataUrl = await readImagePreviewDataUrlForMaxEdge(filePath, OLLAMA_PREVIEW_MAX_EDGE)
  const marker = 'base64,'
  const i = dataUrl.indexOf(marker)
  if (i === -1) throw new Error(i18next.t('preview.decodeFailed'))
  return dataUrl.slice(i + marker.length)
}
