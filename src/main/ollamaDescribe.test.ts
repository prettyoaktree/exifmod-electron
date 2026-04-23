import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./previewImage.js', () => ({
  readImagePreviewJpegBase64Ollama: async () => 'dGVzdA=='
}))

import { ollamaDescribeImage, ollamaWarmup } from './ollamaDescribe.js'

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
    const body = JSON.parse(String(init?.body))
    expect(body).toMatchObject({
      stream: false,
      think: false,
      messages: [{ role: 'user', content: 'ping' }]
    })
    expect(body.options).toMatchObject({
      temperature: expect.any(Number),
      top_p: expect.any(Number),
      num_ctx: expect.any(Number),
      num_predict: 32
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

describe('ollamaDescribeImage', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    vi.unstubAllGlobals()
    globalThis.fetch = originalFetch
  })

  it('POSTs /api/chat with think false, options, and image', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          message: { content: '{"description":"A","keywords":["b"]}' }
        })
      })
    )
    const r = await ollamaDescribeImage('/tmp/fake.jpg', { model: 'm1' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.description).toBe('A')
      expect(r.keywords).toContain('b')
    }
    const [url, init] = vi.mocked(fetch).mock.calls[0]!
    expect(String(url)).toContain('/api/chat')
    const body = JSON.parse(String(init?.body))
    expect(body.model).toBe('m1')
    expect(body.think).toBe(false)
    expect(body.stream).toBe(false)
    expect(body.messages[0].images[0]).toBe('dGVzdA==')
    expect(body.options).toMatchObject({
      num_ctx: expect.any(Number),
      num_predict: expect.any(Number),
      temperature: expect.any(Number),
      top_p: expect.any(Number)
    })
  })
})
