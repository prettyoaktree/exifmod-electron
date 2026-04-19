import { describe, expect, it } from 'vitest'
import {
  buildApplyCommand,
  buildApplySidecarCommand,
  filterLensValues,
  sanitizeWritePayload,
  stripWriteExcludedFields
} from './pure.js'

describe('sanitizeWritePayload', () => {
  it('removes Film and Film Maker', () => {
    expect(sanitizeWritePayload({ Make: 'X', Film: 'y', 'Film Maker': 'z' })).toEqual({ Make: 'X' })
  })

  it('formats Copyright with ©, year, and user text', () => {
    const y = new Date().getFullYear()
    expect(sanitizeWritePayload({ Copyright: '  Acme Co  ' })).toEqual({ Copyright: `© ${y} Acme Co` })
  })

  it('drops blank Copyright', () => {
    expect(sanitizeWritePayload({ Make: 'X', Copyright: '  ' })).toEqual({ Make: 'X' })
  })

  it('preserves empty Copyright for explicit delete on file', () => {
    expect(sanitizeWritePayload({ Make: 'X', Copyright: '' })).toEqual({ Make: 'X', Copyright: '' })
  })

  it('does not double-prefix Copyright that already has © and year', () => {
    const y = new Date().getFullYear()
    const already = `© ${y} EXIFmod. All rights reserved.`
    expect(sanitizeWritePayload({ Copyright: already })).toEqual({ Copyright: already })
  })
})

describe('stripWriteExcludedFields', () => {
  it('removes Film keys but does not format Copyright', () => {
    expect(stripWriteExcludedFields({ Make: 'X', Film: 'y', Copyright: 'Acme' })).toEqual({
      Make: 'X',
      Copyright: 'Acme'
    })
  })
})

describe('buildApplyCommand', () => {
  it('builds exiftool argv with charset and clears DigitalSource*', () => {
    const cmd = buildApplyCommand('/bin/exiftool', '/tmp/a.jpg', { Make: 'M', Keywords: ['a', 'b'] })
    expect(cmd[0]).toBe('/bin/exiftool')
    expect(cmd).toContain('-overwrite_original')
    expect(cmd).toContain('-P')
    expect(cmd).toContain('-Make=M')
    expect(cmd).toContain('-Keywords=a')
    expect(cmd).toContain('-Keywords=b')
    expect(cmd).toContain('-DigitalSourceType=')
    expect(cmd[cmd.length - 1]).toBe('/tmp/a.jpg')
  })

  it('emits Keywords= when Keywords is an empty array (delete)', () => {
    const cmd = buildApplyCommand('/bin/exiftool', '/tmp/a.jpg', { Keywords: [] })
    expect(cmd).toContain('-Keywords=')
  })
})

describe('buildApplySidecarCommand', () => {
  it('writes to sidecar xmp without overwrite_original', () => {
    const cmd = buildApplySidecarCommand('/bin/exiftool', '/tmp/raw.nef', { Make: 'Nikon' })
    expect(cmd[0]).toBe('/bin/exiftool')
    expect(cmd).not.toContain('-overwrite_original')
    expect(cmd).toContain('-o')
    expect(cmd).toContain('/tmp/raw.xmp')
    expect(cmd[cmd.length - 1]).toBe('/tmp/raw.nef')
    expect(cmd).toContain('-Make=Nikon')
  })
})

describe('filterLensValues', () => {
  it('allows all lenses when no camera preset selected', () => {
    const r = filterLensValues(['None', 'L1', 'L2'], 'None', null, { None: { lens_system: null, lens_mount: null, lens_adaptable: false } }, { None: { lens_mount: null } })
    expect(r.state).toBe('readonly')
    expect(r.allowed[0]).toBe('None')
  })

  it('fixed camera restricts lens list', () => {
    const r = filterLensValues(['None', 'Other'], 'Cam', 1, {
      Cam: {
        lens_system: 'fixed',
        lens_mount: null,
        lens_adaptable: false,
        fixed_lens_display: 'Canon 35mm'
      }
    }, { None: { lens_mount: null } })
    expect(r.state).toBe('disabled')
    expect(r.allowed).toContain('Canon 35mm')
  })
})
