export const CONTROL_FIELDS = new Set(['LensSystem', 'LensMount', 'LensAdaptable'])
export const WRITE_EXCLUDED_FIELDS = new Set(['Film', 'Film Maker'])

export {
  IMAGEDESCRIPTION_MAX_UTF8_BYTES,
  KEYWORD_TOKEN_MAX_UTF8_BYTES,
  KEYWORDS_MERGED_SUM_MAX_UTF8_BYTES
} from '../../shared/exifLimits.js'

export const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.tif', '.tiff'])

export const EXIFTOOL_CANDIDATES = [
  '/opt/homebrew/bin/exiftool',
  '/usr/local/bin/exiftool',
  '/usr/bin/exiftool'
]

export const DB_FILENAME = 'presets.sqlite3'
export const DB_BACKUP_FILENAME = 'presets.sqlite3.good'
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
