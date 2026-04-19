import { dirname, join } from 'node:path'
import { RAW_IMAGE_EXTENSIONS, RASTER_IMAGE_EXTENSIONS } from './constants.js'

function fileExtensionLower(filePath: string): string | null {
  const lower = filePath.toLowerCase()
  const dot = lower.lastIndexOf('.')
  if (dot < 0) return null
  return lower.slice(dot)
}

export function isRawImagePath(filePath: string): boolean {
  const ext = fileExtensionLower(filePath)
  return ext != null && RAW_IMAGE_EXTENSIONS.has(ext)
}

/** True for JPEG/TIFF paths where metadata is written into the file (not sidecar). */
export function isRasterInFileWritePath(filePath: string): boolean {
  const ext = fileExtensionLower(filePath)
  return ext != null && RASTER_IMAGE_EXTENSIONS.has(ext)
}

/** Sidecar path ExifTool uses for RAW-class files: same directory, basename `.xmp`. */
export function sidecarXmpPath(filePath: string): string {
  const d = dirname(filePath)
  const base = filePath.split(/[/\\]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  const stem = dot >= 0 ? base.slice(0, dot) : base
  return join(d, `${stem}.xmp`)
}
