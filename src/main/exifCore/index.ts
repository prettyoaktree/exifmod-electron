export { getPaths } from './paths.js'
export {
  ensureDatabaseInitialized,
  mergeSelectedPayloads,
  loadCatalog,
  getPresetRecord,
  createPreset,
  updatePreset,
  suggestedLensMountCodes,
  validateConfigFiles,
  verifyPresetDatabase,
  importPresetDatabase,
  exportPresetDatabaseFile,
  mergePresetsFromSqliteFile,
  importJsonPresets,
  isSupportedImagePath,
  normalizePathsDedup,
  readConfigPayload
} from './store.js'
export {
  buildApplyCommand,
  sanitizeWritePayload,
  filterLensValues,
  utf8ByteLength,
  clampUtf8ByBytes,
  validateImageDescriptionForExif
} from './pure.js'
export { PresetStoreError } from './errors.js'
export { resolveExiftoolPath, validateExiftool, readExifMetadata } from '../exiftoolRunner.js'
export { setSqlWasmPath } from './sqlJs.js'
export type { DataPaths } from '../../shared/types.js'
export type {
  CreatePresetInput,
  UpdatePresetInput,
  PresetRecord,
  MergeImportResult,
  MergeImportSkip
} from '../../shared/types.js'

import type { DataPaths } from '../../shared/types.js'
import { validateConfigFiles } from './store.js'
import { validateExiftool } from '../exiftoolRunner.js'

export async function preflightIssues(paths: DataPaths): Promise<string[]> {
  const issues: string[] = []
  issues.push(...(await validateConfigFiles(paths)))
  const ex = validateExiftool()
  if (ex) issues.push(ex)
  return issues
}
