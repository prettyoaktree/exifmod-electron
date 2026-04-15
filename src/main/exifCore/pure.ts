import {
  IMAGEDESCRIPTION_MAX_UTF8_BYTES,
  LEGACY_LENS_MOUNT_TO_DISPLAY,
  WRITE_EXCLUDED_FIELDS
} from './constants.js'
import { clampUtf8ByBytes, utf8ByteLength } from '../../shared/exifLimits.js'
import { formatCopyrightForExif } from '../../shared/copyrightFormat.js'
import type { CameraMetadata, ConfigCatalog, LensMetadata } from '../../shared/types.js'

export { clampUtf8ByBytes, utf8ByteLength }

/** Drop keys that must never enter merged preview / apply from preset JSON (`Film`, `Film Maker`). */
export function stripWriteExcludedFields(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(payload)) {
    if (!WRITE_EXCLUDED_FIELDS.has(k)) out[k] = v
  }
  return out
}

/** Final payload before ExifTool: strip excluded keys and format Copyright for write. */
export function sanitizeWritePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out = stripWriteExcludedFields(payload)
  if (Object.prototype.hasOwnProperty.call(out, 'Copyright')) {
    const c = out['Copyright']
    /** Empty string = explicit delete from file (preserve through formatting). */
    if (c === '') out['Copyright'] = ''
    else {
      const formatted = formatCopyrightForExif(String(c ?? ''))
      if (formatted === null) delete out['Copyright']
      else out['Copyright'] = formatted
    }
  }
  return out
}

export function validateImageDescriptionForExif(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const n = utf8ByteLength(trimmed)
  if (n > IMAGEDESCRIPTION_MAX_UTF8_BYTES) {
    return `Notes (ImageDescription): ${n} UTF-8 bytes exceeds maximum ${IMAGEDESCRIPTION_MAX_UTF8_BYTES}.`
  }
  return null
}

export function buildApplyCommand(exiftoolPath: string, filePath: string, exifData: Record<string, unknown>): string[] {
  const data = sanitizeWritePayload(exifData)
  /** `-P`: preserve filesystem modification time (helps external tools / catalogs). */
  const cmd = [exiftoolPath, '-overwrite_original', '-P', '-charset', 'EXIF=utf8']
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      if (value.length === 0 && key === 'Keywords') {
        cmd.push(`-${key}=`)
      } else {
        for (const item of value) {
          cmd.push(`-${key}=${item}`)
        }
      }
    } else {
      cmd.push(`-${key}=${value}`)
    }
  }
  cmd.push('-DigitalSourceType=', '-DigitalSourceFileType=', filePath)
  return cmd
}

export function filterLensValues(
  allLensValues: string[],
  cameraSelection: string,
  cameraSelectionFilename: number | string | null | undefined,
  cameraMetadataMap: Record<string, CameraMetadata>,
  lensMetadataMap: Record<string, LensMetadata>
): { allowed: string[]; state: 'readonly' | 'disabled' } {
  const metadata = cameraMetadataMap[cameraSelection] ?? {
    lens_system: 'interchangeable',
    lens_mount: null,
    lens_adaptable: false
  }
  const lensSystem = metadata.lens_system
  const lensMount = metadata.lens_mount
  const lensAdaptable = metadata.lens_adaptable ?? false

  let allowed: string[]
  let state: 'readonly' | 'disabled'

  if (!cameraSelectionFilename) {
    allowed = allLensValues
    state = 'readonly'
  } else if (lensSystem === 'fixed') {
    const fixedLensDisplay = String(metadata.fixed_lens_display ?? '').trim()
    allowed =
      fixedLensDisplay && fixedLensDisplay !== 'None' ? [fixedLensDisplay] : ['None']
    state = 'disabled'
  } else if (lensAdaptable) {
    allowed = allLensValues
    state = 'readonly'
  } else {
    allowed = allLensValues.filter(
      (name) => (lensMetadataMap[name] ?? { lens_mount: null }).lens_mount === lensMount
    )
    state = 'readonly'
  }
  const merged = ['None', ...[...allowed].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))]
  return { allowed: merged, state }
}

export function normalizeLegacyLensMount(value: string | null | undefined): string | null {
  if (value == null || value === '') return null
  const legacy = LEGACY_LENS_MOUNT_TO_DISPLAY[value]
  return legacy ?? value
}

/** Sort unique strings like Python sorted() */
export function sortedStrings(items: Iterable<string>): string[] {
  return [...new Set(items)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

export type { CameraMetadata, ConfigCatalog, LensMetadata }
