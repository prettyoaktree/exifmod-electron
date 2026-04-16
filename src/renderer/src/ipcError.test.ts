import { describe, expect, it } from 'vitest'
import { unwrapIpcErrorMessage } from './ipcError.js'

describe('unwrapIpcErrorMessage', () => {
  it('strips Electron ipc invoke wrapper', () => {
    const e = new Error(
      "Error invoking remote method 'presets:create': Error: Preset name is required."
    )
    expect(unwrapIpcErrorMessage(e)).toBe('Preset name is required.')
  })

  it('peels nested Error: prefixes', () => {
    const e = new Error(
      "Error invoking remote method 'presets:update': Error: Error: Something went wrong."
    )
    expect(unwrapIpcErrorMessage(e)).toBe('Something went wrong.')
  })

  it('passes through non-ipc messages', () => {
    expect(unwrapIpcErrorMessage(new Error('Plain failure'))).toBe('Plain failure')
  })
})
