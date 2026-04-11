import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ollamaWarmup } from './ollamaDescribe.js'

describe('ollamaWarmup', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: { content: 'pong' } })
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    globalThis.fetch = originalFetch
  })

  it('returns ok true when chat returns non-empty content', async () => {
    const r = await ollamaWarmup()
    expect(r.ok).toBe(true)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(fetch).mock.calls[0]!
    expect(String(url)).toContain('/api/chat')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toMatchObject({
      stream: false,
      messages: [{ role: 'user', content: 'ping' }]
    })
  })

  it('returns ok false when response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => ''
      })
    )
    const r = await ollamaWarmup()
    expect(r.ok).toBe(false)
  })

  it('returns ok false when message content is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: { content: '  ' } })
      })
    )
    const r = await ollamaWarmup()
    expect(r.ok).toBe(false)
  })

  it('returns ok false on fetch rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    const r = await ollamaWarmup()
    expect(r.ok).toBe(false)
  })
})
