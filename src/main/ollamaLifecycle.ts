import { spawn, type ChildProcess } from 'node:child_process'
import { app } from 'electron'
import type { BrowserWindow } from 'electron'
import { i18next } from './i18n.js'
import { ollamaWarmup } from './ollamaDescribe.js'

export type OllamaStartupFlowResult =
  | { status: 'ready'; initialReachable: boolean }
  /** Warmup failed but `ollama` is on PATH — user can start the server from the inline control. */
  | { status: 'server_down' }
  /** `ollama` CLI not found on PATH after warmup failed — cannot start or use local install hints. */
  | { status: 'no_cli' }

const POLL_MS = 1500
/** After spawning `ollama serve`, poll until this deadline from the phase start. */
const SPAWN_PHASE_MS = 90_000
/** How long to wait for `ollama --version` when probing PATH. */
const OLLAMA_CLI_PROBE_MS = 5_000

/**
 * Whether the `ollama` executable is available (same resolution as `ollama serve`).
 * Used when warmup failed: without CLI we cannot start the server or meaningfully offer “start Ollama”.
 */
export function ollamaCliAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const done = (ok: boolean): void => {
      if (settled) return
      settled = true
      resolve(ok)
    }
    try {
      const child = spawn('ollama', ['--version'], { stdio: 'ignore' })
      const timer = setTimeout(() => {
        try {
          child.kill()
        } catch {
          /* */
        }
        done(false)
      }, OLLAMA_CLI_PROBE_MS)
      child.once('error', () => {
        clearTimeout(timer)
        done(false)
      })
      child.once('close', (code) => {
        clearTimeout(timer)
        done(code === 0)
      })
    } catch {
      done(false)
    }
  })
}

let ollamaLaunchedByApp = false
/** Child from `ollama serve` when ExifMod started the server after user opt-in (kill on quit). */
let ollamaServeChild: ChildProcess | null = null

/** Single flight for the whole session (React Strict Mode runs the renderer effect twice in dev). */
let startupFlowPromise: Promise<OllamaStartupFlowResult> | null = null

let tryStartInFlight: Promise<{ ok: true } | { ok: false; error: string }> | null = null

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function pollUntilWarmup(deadline: number): Promise<boolean> {
  while (Date.now() < deadline) {
    if ((await ollamaWarmup()).ok) return true
    await sleep(POLL_MS)
  }
  return (await ollamaWarmup()).ok
}

function spawnOllamaServe(): Promise<ChildProcess | null> {
  return new Promise((resolve) => {
    try {
      const child = spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' })
      let settled = false
      const finish = (c: ChildProcess | null): void => {
        if (settled) return
        settled = true
        resolve(c)
      }
      child.once('error', () => finish(null))
      child.once('spawn', () => {
        child.unref()
        finish(child)
      })
    } catch {
      resolve(null)
    }
  })
}

async function tryLaunchOllamaAndWait(): Promise<{ ok: true } | { ok: false; error: string }> {
  const errSpawn = i18next.t('dialog.ollamaSpawnFailed')
  const errUnreachable = i18next.t('dialog.ollamaStillUnreachable')

  const child = await spawnOllamaServe()
  if (!child) {
    return { ok: false, error: errSpawn }
  }
  ollamaServeChild = child

  const ok = await pollUntilWarmup(Date.now() + SPAWN_PHASE_MS)
  if (ok) {
    ollamaLaunchedByApp = true
    return { ok: true }
  }

  try {
    child.kill()
  } catch {
    /* */
  }
  ollamaServeChild = null
  ollamaLaunchedByApp = false
  return { ok: false, error: errUnreachable }
}

export function runOllamaStartupFlow(win: BrowserWindow | null): Promise<OllamaStartupFlowResult> {
  if (!startupFlowPromise) {
    startupFlowPromise = runOllamaStartupFlowOnce(win)
  }
  return startupFlowPromise
}

async function runOllamaStartupFlowOnce(_win: BrowserWindow | null): Promise<OllamaStartupFlowResult> {
  if ((await ollamaWarmup()).ok) {
    return { status: 'ready', initialReachable: true }
  }

  if (!(await ollamaCliAvailable())) {
    return { status: 'no_cli' }
  }

  return { status: 'server_down' }
}

/**
 * User chose “Start Ollama” from the inline control. Shows launching state via `ollama:launching` before polling.
 */
export function ollamaTryStartServer(win: BrowserWindow | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const run = async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    if ((await ollamaWarmup()).ok) {
      return { ok: true }
    }
    win?.webContents.send('ollama:launching')
    const launch = await tryLaunchOllamaAndWait()
    if (launch.ok) {
      return { ok: true }
    }
    return { ok: false, error: launch.error }
  }
  if (!tryStartInFlight) {
    tryStartInFlight = run().finally(() => {
      tryStartInFlight = null
    })
  }
  return tryStartInFlight
}

export function shutdownOllamaIfLaunchedByApp(): void {
  if (!ollamaLaunchedByApp || !ollamaServeChild) return
  try {
    ollamaServeChild.kill()
  } catch {
    /* */
  }
}

/** Register once; only shuts down Ollama when this session started it successfully after the user opted in. */
export function registerOllamaWillQuit(): void {
  app.on('will-quit', () => {
    shutdownOllamaIfLaunchedByApp()
  })
}
