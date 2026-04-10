/** Mirrors Python ConfigCatalog / preset maps for IPC. */

export interface CameraMetadata {
  lens_system: string | null
  lens_mount: string | null
  lens_adaptable: boolean
  fixed_lens_display?: string
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
}

export interface CreatePresetInput {
  category: string
  name: string
  payload: Record<string, unknown>
  lens_system?: string | null
  lens_mount?: string | null
  lens_adaptable?: boolean | number | null
}

export interface UpdatePresetInput {
  id: number
  name: string
  payload: Record<string, unknown>
  lens_system?: string | null
  lens_mount?: string | null
  lens_adaptable?: boolean | number | null
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
