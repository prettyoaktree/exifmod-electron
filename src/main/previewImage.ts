/**
 * Downscaled JPEG preview for the file list panel and Ollama vision input (same pipeline).
 */
import { nativeImage } from 'electron'
import { i18next } from './i18n.js'
import { execFile as execFileCb } from 'node:child_process'
import { extname, join } from 'node:path'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { existsSync, statSync } from 'node:fs'

/** Max longest edge (pixels). Small preview panel + smaller Ollama payloads vs 2048. */
export const PREVIEW_MAX_EDGE = 640
const PREVIEW_JPEG_QUALITY = 82
const LEGACY_PREVIEW_MAX_BYTES = 48 * 1024 * 1024

const LEGACY_DATA_URL_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])

function execFileAsync(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFileCb(command, args, (err) => (err ? reject(err) : resolve()))
  })
}

async function previewTiffWithSips(filePath: string): Promise<string | null> {
  let dir: string | undefined
  try {
    dir = await mkdtemp(join(tmpdir(), 'exifmod-preview-'))
    const outJpg = join(dir, 'preview.jpg')
    await execFileAsync('sips', ['-s', 'format', 'jpeg', '-Z', String(PREVIEW_MAX_EDGE), filePath, '--out', outJpg])
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
 * Build a JPEG data URL the renderer can always show. Chromium does not decode TIFF in img tags;
 * use NativeImage / platform tools.
 */
export async function readImagePreviewDataUrl(filePath: string): Promise<string> {
  const ext = extname(filePath).toLowerCase()
  const tiff = ext === '.tif' || ext === '.tiff'

  if (tiff && process.platform === 'darwin') {
    const fromSips = await previewTiffWithSips(filePath)
    if (fromSips) return fromSips
  }

  const skipQuickLookThumb = tiff && process.platform === 'darwin'
  if (!skipQuickLookThumb && (process.platform === 'darwin' || process.platform === 'win32')) {
    try {
      const thumb = await nativeImage.createThumbnailFromPath(filePath, {
        width: PREVIEW_MAX_EDGE,
        height: PREVIEW_MAX_EDGE
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
    const maxEdge = Math.max(width, height)
    if (maxEdge > PREVIEW_MAX_EDGE) {
      const scale = PREVIEW_MAX_EDGE / maxEdge
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

/** Raw base64 for Ollama `images` (no `data:` prefix). */
export async function readImagePreviewJpegBase64(filePath: string): Promise<string> {
  const dataUrl = await readImagePreviewDataUrl(filePath)
  const marker = 'base64,'
  const i = dataUrl.indexOf(marker)
  if (i === -1) throw new Error(i18next.t('preview.decodeFailed'))
  return dataUrl.slice(i + marker.length)
}
