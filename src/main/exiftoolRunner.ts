import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { EXIFTOOL_CANDIDATES } from './exifCore/constants.js'

export function resolveExiftoolPath(): string | null {
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which'
    const out = execFileSyncSafe(cmd, ['exiftool'])
    const first = out.split(/\r?\n/).map((s) => s.trim()).find(Boolean)
    if (first && existsSync(first)) return first
  } catch {
    /* */
  }
  for (const c of EXIFTOOL_CANDIDATES) {
    if (existsSync(c)) return c
  }
  return null
}

function execFileSyncSafe(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: 'utf8' }) as string
}

export function validateExiftool(exiftoolPath?: string): string | null {
  const path = exiftoolPath ?? resolveExiftoolPath()
  if (!path) {
    return 'exiftool not found.\nInstall exiftool and ensure it is available in PATH or one of the common install locations.'
  }
  try {
    execFileSyncSafe(path, ['-ver'])
  } catch (e) {
    return `exiftool cannot be executed from '${path}': ${e}`
  }
  return null
}

export function readExifMetadata(exiftoolPath: string, filePath: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const errChunks: Buffer[] = []
    const child = spawn(exiftoolPath, ['-charset', 'EXIF=utf8', '-j', filePath], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    child.stdout?.on('data', (d) => chunks.push(d))
    child.stderr?.on('data', (d) => errChunks.push(d))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(Buffer.concat(errChunks).toString('utf8') || `exiftool exited ${code}`))
        return
      }
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        const parsed = JSON.parse(text) as unknown
        if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
          resolve(parsed[0] as Record<string, unknown>)
        } else {
          resolve({})
        }
      } catch (e) {
        reject(e)
      }
    })
  })
}

export function spawnExiftool(
  args: string[],
  opts: { timeoutMs?: number } = {}
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const exe = args[0]!
  const rest = args.slice(1)
  return new Promise((resolve, reject) => {
    const child = spawn(exe, rest, { stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    const errChunks: Buffer[] = []
    let done = false
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          if (!done) {
            child.kill('SIGTERM')
            reject(new Error('exiftool timed out'))
          }
        }, opts.timeoutMs)
      : null
    child.stdout?.on('data', (d) => chunks.push(d))
    child.stderr?.on('data', (d) => errChunks.push(d))
    child.on('error', (e) => {
      done = true
      if (timer) clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      done = true
      if (timer) clearTimeout(timer)
      resolve({
        stdout: Buffer.concat(chunks).toString('utf8'),
        stderr: Buffer.concat(errChunks).toString('utf8'),
        code
      })
    })
  })
}
