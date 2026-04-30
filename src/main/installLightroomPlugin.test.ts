import { describe, expect, it } from 'vitest'
import {
  escapePathForLuaSingleQuotedString,
  patchOpenInExifmodDevLua,
  patchOpenInExifmodReleaseLua,
  resolveDevElectronAppBundle,
  resolveDevElectronBinary
} from './installLightroomPlugin.js'

describe('installLightroomPlugin helpers', () => {
  it('escapePathForLuaSingleQuotedString escapes backslash and quote', () => {
    expect(escapePathForLuaSingleQuotedString('/a/b')).toBe('/a/b')
    expect(escapePathForLuaSingleQuotedString("/a'b")).toBe("/a\\'b")
    expect(escapePathForLuaSingleQuotedString('/a\\b')).toBe('/a\\\\b')
  })

  it('resolveDevElectronBinary points at Electron.app (mac) or electron.exe (Windows)', () => {
    const root = process.platform === 'win32' ? 'C:\\Users\\me\\proj' : '/Users/me/proj'
    const p = resolveDevElectronBinary(root)
    if (process.platform === 'win32') {
      expect(p).toMatch(/electron[\\/]dist[\\/]electron\.exe$/)
    } else {
      expect(p).toBe('/Users/me/proj/node_modules/electron/dist/Electron.app')
    }
  })

  it('resolveDevElectronAppBundle is an alias of resolveDevElectronBinary', () => {
    const root = process.platform === 'win32' ? 'C:\\Users\\me\\proj' : '/Users/me/proj'
    expect(resolveDevElectronAppBundle(root)).toBe(resolveDevElectronBinary(root))
  })

  it('patchOpenInExifmodDevLua replaces dev Electron binary and repo placeholders', () => {
    const src =
      "local DEFAULT_ELECTRON_APP = '__EXIFMOD_DEV_ELECTRON_APP__'\n" +
      "local DEFAULT_REPO_ROOT = '__EXIFMOD_DEV_REPO_ROOT__'\n"
    if (process.platform === 'win32') {
      const out = patchOpenInExifmodDevLua(
        src,
        'C:\\me\\proj\\node_modules\\electron\\dist\\electron.exe',
        'C:\\me\\proj'
      )
      expect(out).toBe(
        "local DEFAULT_ELECTRON_APP = 'C:\\\\me\\\\proj\\\\node_modules\\\\electron\\\\dist\\\\electron.exe'\n" +
          "local DEFAULT_REPO_ROOT = 'C:\\\\me\\\\proj'\n"
      )
    } else {
      const out = patchOpenInExifmodDevLua(
        src,
        '/Users/me/proj/node_modules/electron/dist/Electron.app',
        '/Users/me/proj'
      )
      expect(out).toBe(
        "local DEFAULT_ELECTRON_APP = '/Users/me/proj/node_modules/electron/dist/Electron.app'\n" +
          "local DEFAULT_REPO_ROOT = '/Users/me/proj'\n"
      )
    }
  })

  it('patchOpenInExifmodDevLua leaves source unchanged if no placeholder', () => {
    const src = 'local x = 1'
    expect(patchOpenInExifmodDevLua(src, '/x', '/y')).toBe(src)
  })

  it('patchOpenInExifmodReleaseLua replaces install-time EXIF path placeholder', () => {
    const src = "local v = '__EXIFMOD_INSTALLED_EXIF__'\n"
    if (process.platform === 'win32') {
      expect(
        patchOpenInExifmodReleaseLua(
          src,
          'C:\\me\\exif\\EXIFmod.exe'
        )
      ).toBe("local v = 'C:\\\\me\\\\exif\\\\EXIFmod.exe'\n")
    } else {
      expect(
        patchOpenInExifmodReleaseLua(
          src,
          '/Me/EXIFmod.app'
        )
      ).toBe("local v = '/Me/EXIFmod.app'\n")
    }
  })
})
