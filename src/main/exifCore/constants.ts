import { homedir } from 'node:os'
import { join } from 'node:path'

export const CONTROL_FIELDS = new Set([
  'LensSystem',
  'LensMount',
  'LensAdaptable',
  'FixedShutter',
  'FixedAperture'
])
export const WRITE_EXCLUDED_FIELDS = new Set(['Film', 'Film Maker'])

export {
  IMAGEDESCRIPTION_MAX_UTF8_BYTES,
  KEYWORD_TOKEN_MAX_UTF8_BYTES,
  KEYWORDS_MERGED_SUM_MAX_UTF8_BYTES
} from '../../shared/exifLimits.js'

/** JPEG/TIFF — metadata written in-file via ExifTool `-overwrite_original`. */
export const RASTER_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.tif', '.tiff'])

/**
 * Camera RAW and similar — metadata writes go to XMP sidecar only (never rewrite the container).
 * Conservative ExifTool-native set (see ExifTool `-listr` / docs).
 */
export const RAW_IMAGE_EXTENSIONS = new Set([
  '.3fr',
  '.arw',
  '.cr2',
  '.cr3',
  '.dng',
  '.erf',
  '.fff',
  '.iiq',
  '.k25',
  '.kdc',
  '.mef',
  '.mos',
  '.mrw',
  '.nef',
  '.nrw',
  '.orf',
  '.pef',
  '.raf',
  '.raw',
  '.rw2',
  '.rwl',
  '.sr2',
  '.srf',
  '.srw',
  '.x3f'
])

/** All formats EXIFmod lists, opens, and batch-processes. */
export const SUPPORTED_IMAGE_EXTENSIONS = new Set([...RASTER_IMAGE_EXTENSIONS, ...RAW_IMAGE_EXTENSIONS])

/** Electron `filters.extensions` entries (no leading dot). */
export const SUPPORTED_IMAGE_DIALOG_EXTENSIONS: readonly string[] = [...SUPPORTED_IMAGE_EXTENSIONS].map((e) =>
  e.slice(1)
)

const EXIFTOOL_CANDIDATES_MAC = [
  '/opt/homebrew/bin/exiftool',
  '/usr/local/bin/exiftool',
  '/usr/bin/exiftool'
]

/** Common install locations when `which` / `where` does not resolve (e.g. GUI launch with a minimal PATH). */
export function getExiftoolPathCandidates(): readonly string[] {
  if (process.platform === 'win32') {
    const pf = process.env.ProgramFiles
    const pf86 = process.env['ProgramFiles(x86)']
    const local = process.env.LocalAppData
    const out: string[] = []
    if (pf) {
      out.push(join(pf, 'exiftool', 'exiftool.exe'))
      out.push(join(pf, 'ExifTool', 'exiftool.exe'))
    }
    if (pf86) {
      out.push(join(pf86, 'exiftool', 'exiftool.exe'))
    }
    if (local) {
      out.push(join(local, 'Programs', 'exiftool', 'exiftool.exe'))
    }
    out.push(join(homedir(), 'scoop', 'shims', 'exiftool.exe'))
    out.push('C:\\ProgramData\\chocolatey\\bin\\exiftool.exe')
    return out
  }
  return EXIFTOOL_CANDIDATES_MAC
}

export const DB_FILENAME = 'presets.sqlite3'
export const DB_BACKUP_FILENAME = 'presets.sqlite3.good'
/** Written once the preset catalog has ever been non-empty; prevents re-importing bundled defaults after the user deletes all presets. */
export const PRESET_CATALOG_INITIALIZED_FLAG = 'preset-catalog-initialized.txt'
export const LENS_MOUNT_DEFAULTS_FILENAME = 'lens_mount_defaults.json'

export const FALLBACK_LENS_MOUNT_NAMES: readonly string[] = [
  'Canon EF',
  'Canon FD',
  'Canon RF',
  'Contaflex',
  'Exakta',
  'Fuji X',
  'Leica LTM',
  'Leica M',
  'Micro Four Thirds',
  'Minolta MD',
  'Nikon F',
  'Nikon Z',
  'Olympus OM',
  'Pentax K',
  'Sony A',
  'Sony E'
]

/** Legacy DB values → display labels (Python _LEGACY_LENS_MOUNT_TO_DISPLAY) */
export const LEGACY_LENS_MOUNT_TO_DISPLAY: Record<string, string> = {
  LTM_M39: 'Leica LTM',
  LEICA_LTM: 'Leica LTM',
  CANON_EF: 'Canon EF',
  CANON_FD: 'Canon FD',
  CANON_RF: 'Canon RF',
  CONTAFLEX: 'Contaflex',
  EXAKTA: 'Exakta',
  FUJI_X: 'Fuji X',
  LEICA_M: 'Leica M',
  MICRO_FOUR_THIRDS: 'Micro Four Thirds',
  MINOLTA_MD: 'Minolta MD',
  NIKON_F: 'Nikon F',
  NIKON_Z: 'Nikon Z',
  OLYMPUS_OM: 'Olympus OM',
  PENTAX_K: 'Pentax K',
  SONY_A: 'Sony A',
  SONY_E: 'Sony E'
}
