import { describe, expect, it } from 'vitest'
import { buildApplyCommand, filterLensValues, sanitizeWritePayload } from './pure.js'

describe('sanitizeWritePayload', () => {
  it('removes Film and Film Maker', () => {
    expect(sanitizeWritePayload({ Make: 'X', Film: 'y', 'Film Maker': 'z' })).toEqual({ Make: 'X' })
  })
})

describe('buildApplyCommand', () => {
  it('builds exiftool argv with charset and clears DigitalSource*', () => {
    const cmd = buildApplyCommand('/bin/exiftool', '/tmp/a.jpg', { Make: 'M', Keywords: ['a', 'b'] })
    expect(cmd[0]).toBe('/bin/exiftool')
    expect(cmd).toContain('-overwrite_original')
    expect(cmd).toContain('-Make=M')
    expect(cmd).toContain('-Keywords=a')
    expect(cmd).toContain('-Keywords=b')
    expect(cmd).toContain('-DigitalSourceType=')
    expect(cmd[cmd.length - 1]).toBe('/tmp/a.jpg')
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
