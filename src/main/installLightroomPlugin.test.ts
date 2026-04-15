import { describe, expect, it } from 'vitest'
import {
  escapePathForLuaSingleQuotedString,
  patchOpenInExifmodDevLua,
  resolveDevElectronAppBundle
} from './installLightroomPlugin.js'

describe('installLightroomPlugin helpers', () => {
  it('escapePathForLuaSingleQuotedString escapes backslash and quote', () => {
    expect(escapePathForLuaSingleQuotedString('/a/b')).toBe('/a/b')
    expect(escapePathForLuaSingleQuotedString("/a'b")).toBe("/a\\'b")
    expect(escapePathForLuaSingleQuotedString('/a\\b')).toBe('/a\\\\b')
  })

  it('resolveDevElectronAppBundle points at node_modules electron app', () => {
    const p = resolveDevElectronAppBundle('/Users/me/proj')
    expect(p).toBe('/Users/me/proj/node_modules/electron/dist/Electron.app')
  })

  it('patchOpenInExifmodDevLua replaces Electron.app and repo placeholders', () => {
    const src =
      "local DEFAULT_ELECTRON_APP = '__EXIFMOD_DEV_ELECTRON_APP__'\n" +
      "local DEFAULT_REPO_ROOT = '__EXIFMOD_DEV_REPO_ROOT__'\n"
    const out = patchOpenInExifmodDevLua(
      src,
      '/Users/me/proj/node_modules/electron/dist/Electron.app',
      '/Users/me/proj'
    )
    expect(out).toBe(
      "local DEFAULT_ELECTRON_APP = '/Users/me/proj/node_modules/electron/dist/Electron.app'\n" +
        "local DEFAULT_REPO_ROOT = '/Users/me/proj'\n"
    )
  })

  it('patchOpenInExifmodDevLua leaves source unchanged if no placeholder', () => {
    const src = 'local x = 1'
    expect(patchOpenInExifmodDevLua(src, '/x', '/y')).toBe(src)
  })
})
