/** Mirrors Python ConfigCatalog / preset maps for IPC. */

export interface CameraMetadata {
  lens_system: string | null
  lens_mount: string | null
  lens_adaptable: boolean
  fixed_lens_display?: string
  /** True when camera preset uses a fixed (built-in) lens. */
  locks_lens?: boolean
  /** True when camera preset pins EXIF ExposureTime from the preset only. */
  locks_shutter?: boolean
  /** True when camera preset pins EXIF FNumber from the preset only. */
  locks_aperture?: boolean
  fixed_shutter_display?: string
  fixed_aperture_display?: string
}

export interface LensMetadata {
  lens_mount: string | null
}

export interface ConfigCatalog {
  camera_values: string[]
  lens_values: string[]
  author_values: string[]
  film_values: string[]
  camera_file_map: Record<string, number | null | undefined>
  lens_file_map: Record<string, number | null | undefined>
  author_file_map: Record<string, number | null | undefined>
  film_file_map: Record<string, number | null | undefined>
  camera_metadata_map: Record<string, CameraMetadata>
  lens_metadata_map: Record<string, LensMetadata>
}

export interface PresetRecord {
  id: number
  category: string
  name: string
  payload: Record<string, unknown>
  lens_system: string | null
  lens_mount: string | null
  lens_adaptable: boolean | null
  /** Camera presets only: fixed mechanical shutter speed from preset. */
  fixed_shutter: boolean | null
  /** Camera presets only: fixed aperture from preset. */
  fixed_aperture: boolean | null
}

export interface CreatePresetInput {
  category: string
  name: string
  payload: Record<string, unknown>
  lens_system?: string | null
  lens_mount?: string | null
  lens_adaptable?: boolean | number | null
  fixed_shutter?: boolean | number | null
  fixed_aperture?: boolean | number | null
}

export interface UpdatePresetInput {
  id: number
  name: string
  payload: Record<string, unknown>
  lens_system?: string | null
  lens_mount?: string | null
  lens_adaptable?: boolean | number | null
  fixed_shutter?: boolean | number | null
  fixed_aperture?: boolean | number | null
}

export interface DataPaths {
  dataDir: string
  dbPath: string
  lensMountDefaultsPath: string
  backupPath: string
  configDir: string
}

/** One preset row skipped during merge import from another sqlite file. */
export interface MergeImportSkip {
  category: string
  name: string
  reason: string
}

export interface MergeImportResult {
  imported: number
  skipped: MergeImportSkip[]
}

/** AI describe in progress (footer status + Ollama panel copy). */
export type AiDescribeBusyState =
  | null
  | { mode: 'single' }
  | { mode: 'batch'; current: number; total: number }
