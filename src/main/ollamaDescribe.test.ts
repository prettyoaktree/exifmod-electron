import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./previewImage.js', () => ({
  readImagePreviewJpegBase64Ollama: async () => 'dGVzdA=='
}))

vi.mock('./ollamaDescribePromptPrefs.js', () => ({
  getCustomDescribeSystemPromptTemplate: vi.fn(() => null),
  setCustomDescribeSystemPromptTemplate: vi.fn()
}))

import { IMAGEDESCRIPTION_MAX_UTF8_BYTES } from '../shared/exifLimits.js'
import {
  getCustomDescribeSystemPromptTemplate,
  setCustomDescribeSystemPromptTemplate
} from './ollamaDescribePromptPrefs.js'
import {
  DESCRIBE_SYSTEM_PROMPT_MAX_BYTES_PLACEHOLDER,
  formatDescribeSystemPromptTemplate,
  ollamaDescribeImage,
  ollamaWarmup,
  setDescribeSystemPromptFromUser
} from './ollamaDescribe.js'

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

  beforeEach(() => {
    vi.mocked(getCustomDescribeSystemPromptTemplate).mockReturnValue(null)
  })

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
    expect(String(body.messages[0].content)).toContain(String(IMAGEDESCRIPTION_MAX_UTF8_BYTES))
  })

  it('sends the user-stored system prompt in message content, not the built-in default', async () => {
    const custom = `CUSTOM_OLLAMA_SYSTEM_PROMPT_LINE ${DESCRIBE_SYSTEM_PROMPT_MAX_BYTES_PLACEHOLDER} end.`
    vi.mocked(getCustomDescribeSystemPromptTemplate).mockReturnValue(custom)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: { content: '{"description":"X","keywords":[]}' } })
      })
    )
    const r = await ollamaDescribeImage('/tmp/fake.jpg', { model: 'm1' })
    expect(r.ok).toBe(true)
    const init = vi.mocked(fetch).mock.calls[0]![1]!
    const body = JSON.parse(String(init.body))
    const content = String(body.messages[0].content)
    expect(content).toContain('CUSTOM_OLLAMA_SYSTEM_PROMPT_LINE')
    expect(content).toContain(' end.')
    expect(content).toContain(String(IMAGEDESCRIPTION_MAX_UTF8_BYTES))
    expect(content).not.toContain('You label a photograph for EXIF ImageDescription')
  })
})

describe('formatDescribeSystemPromptTemplate', () => {
  it('replaces all placeholder occurrences with the byte cap', () => {
    const out = formatDescribeSystemPromptTemplate(
      `a ${DESCRIBE_SYSTEM_PROMPT_MAX_BYTES_PLACEHOLDER} b ${DESCRIBE_SYSTEM_PROMPT_MAX_BYTES_PLACEHOLDER}`,
      42
    )
    expect(out).toBe('a 42 b 42')
  })
})

describe('setDescribeSystemPromptFromUser', () => {
  beforeEach(() => {
    vi.mocked(setCustomDescribeSystemPromptTemplate).mockClear()
  })

  it('returns missing_placeholder when token is absent', () => {
    const r = setDescribeSystemPromptFromUser('no token here')
    expect(r).toEqual({ ok: false, error: 'missing_placeholder' })
    expect(setCustomDescribeSystemPromptTemplate).not.toHaveBeenCalled()
  })

  it('persists when token is present', () => {
    const r = setDescribeSystemPromptFromUser(
      `x ${DESCRIBE_SYSTEM_PROMPT_MAX_BYTES_PLACEHOLDER} y`
    )
    expect(r).toEqual({ ok: true })
    expect(setCustomDescribeSystemPromptTemplate).toHaveBeenCalledWith(
      `x ${DESCRIBE_SYSTEM_PROMPT_MAX_BYTES_PLACEHOLDER} y`
    )
  })

  it('clears custom when empty', () => {
    const r = setDescribeSystemPromptFromUser('   ')
    expect(r).toEqual({ ok: true })
    expect(setCustomDescribeSystemPromptTemplate).toHaveBeenCalledWith(null)
  })
})
