import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import initSqlJs, { type Database } from 'sql.js'
import type { DataPaths } from '../../shared/types.js'

let sqlJsFactory: Promise<typeof initSqlJs> | null = null
let wasmPathOverride: string | null = null

/** Call from Electron main before opening DB (packaged vs dev wasm location). */
export function setSqlWasmPath(absolutePath: string): void {
  wasmPathOverride = absolutePath
}

function resolveWasmPath(): string {
  if (wasmPathOverride) return wasmPathOverride
  const here = dirname(fileURLToPath(import.meta.url))
  return join(here, '../../../node_modules/sql.js/dist/sql-wasm.wasm')
}

export async function getSqlJs(): Promise<typeof initSqlJs> {
  if (!sqlJsFactory) {
    sqlJsFactory = (async () => {
      const wasmPath = resolveWasmPath()
      const wasmBinary = readFileSync(wasmPath)
      return initSqlJs({ wasmBinary })
    })()
  }
  return sqlJsFactory
}

export class PersistedDatabase {
  constructor(
    readonly db: Database,
    private readonly filePath: string
  ) {}

  persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    const data = this.db.export()
    writeFileSync(this.filePath, Buffer.from(data))
  }

  run(sql: string, params?: unknown[]): void {
    this.db.run(sql, params)
    this.persist()
  }

  runOnly(sql: string, params?: unknown[]): void {
    if (params && params.length) this.db.run(sql, params)
    else this.db.run(sql)
  }

  get(sql: string, params?: unknown[]): Record<string, unknown> | undefined {
    const stmt = this.db.prepare(sql)
    if (params && params.length) stmt.bind(params)
    if (!stmt.step()) {
      stmt.free()
      return undefined
    }
    const row = stmt.getAsObject() as Record<string, unknown>
    stmt.free()
    return row
  }

  all(sql: string, params?: unknown[]): Record<string, unknown>[] {
    const stmt = this.db.prepare(sql)
    if (params && params.length) stmt.bind(params)
    const out: Record<string, unknown>[] = []
    while (stmt.step()) {
      out.push({ ...(stmt.getAsObject() as Record<string, unknown>) })
    }
    stmt.free()
    return out
  }

  /** PRAGMA / introspection — no persist. */
  execRaw(sql: string): { columns: string[]; values: unknown[][] }[] {
    return this.db.exec(sql)
  }

  close(): void {
    this.db.close()
  }
}

export async function openPersistedDb(paths: DataPaths): Promise<PersistedDatabase> {
  const SQL = await getSqlJs()
  mkdirSync(paths.dataDir, { recursive: true })
  if (existsSync(paths.dbPath)) {
    const filebuffer = readFileSync(paths.dbPath)
    const db = new SQL.Database(filebuffer)
    return new PersistedDatabase(db, paths.dbPath)
  }
  const db = new SQL.Database()
  return new PersistedDatabase(db, paths.dbPath)
}
