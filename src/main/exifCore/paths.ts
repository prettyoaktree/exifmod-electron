import { join } from 'node:path'
import type { DataPaths } from '../../shared/types.js'
import { DB_BACKUP_FILENAME, DB_FILENAME, LENS_MOUNT_DEFAULTS_FILENAME } from './constants.js'

export function getPaths(userDataRoot: string): DataPaths {
  const dataDir = join(userDataRoot, 'data')
  return {
    dataDir,
    dbPath: join(dataDir, DB_FILENAME),
    backupPath: join(dataDir, DB_BACKUP_FILENAME),
    lensMountDefaultsPath: join(dataDir, LENS_MOUNT_DEFAULTS_FILENAME),
    configDir: join(userDataRoot, 'config')
  }
}
