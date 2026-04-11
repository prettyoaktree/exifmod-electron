import { describe, expect, it } from 'vitest'
import { isOllamaTransportFailureError } from './ollamaNetErrors.js'

describe('isOllamaTransportFailureError', () => {
  it('returns true for typical undici/node fetch failure text', () => {
    expect(isOllamaTransportFailureError('fetch failed')).toBe(true)
    expect(isOllamaTransportFailureError('TypeError: fetch failed')).toBe(true)
  })

  it('returns false for model/parsing errors', () => {
    expect(isOllamaTransportFailureError('Could not parse JSON from model response')).toBe(false)
    expect(isOllamaTransportFailureError('Ollama HTTP 500')).toBe(false)
  })
})
