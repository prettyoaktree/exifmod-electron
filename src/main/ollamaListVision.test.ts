import { afterEach, describe, expect, it, vi } from 'vitest'
import { ollamaListVisionModelNames } from './ollamaListVision.js'

describe('ollamaListVisionModelNames', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    vi.unstubAllGlobals()
    globalThis.fetch = originalFetch
  })

  it('keeps only models whose /api/show lists vision', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const u = String(input)
      if (u.includes('/api/tags')) {
        return {
          ok: true,
          json: async () => ({ models: [{ name: 'a' }, { name: 'b' }] })
        }
      }
      if (u.includes('/api/show') && init?.body) {
        const b = JSON.parse(String(init.body)) as { name?: string }
        if (b.name === 'a') {
          return { ok: true, json: async () => ({ capabilities: ['vision', 'completion'] }) }
        }
        return { ok: true, json: async () => ({ capabilities: ['completion'] }) }
      }
      return { ok: false, status: 500, text: async () => 'x' }
    }) as unknown as typeof fetch

    const r = await ollamaListVisionModelNames({ baseUrl: 'http://127.0.0.1:11434' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.models).toEqual(['a'])
    }
  })
})
