import { describe, expect, it } from 'vitest'
import { validatePresetEditorInput } from './presetEditorValidation.js'

const basePayload = { Make: 'X', Model: 'Y' }

describe('validatePresetEditorInput', () => {
  it('rejects empty preset name for any category', () => {
    expect(
      validatePresetEditorInput({
        category: 'Camera',
        name: '  ',
        payload: basePayload,
        lensSystem: 'interchangeable',
        lensMount: 'M'
      })
    ).toBe('presetEditor.validationPresetNameRequired')
  })

  it('Camera: requires Make, Model, and lens mount when interchangeable', () => {
    expect(
      validatePresetEditorInput({
        category: 'Camera',
        name: 'N',
        payload: { Make: '', Model: 'Y' },
        lensSystem: 'interchangeable',
        lensMount: 'M'
      })
    ).toBe('presetEditor.validationCameraMakeRequired')
    expect(
      validatePresetEditorInput({
        category: 'Camera',
        name: 'N',
        payload: { Make: 'X', Model: '' },
        lensSystem: 'interchangeable',
        lensMount: 'M'
      })
    ).toBe('presetEditor.validationCameraModelRequired')
    expect(
      validatePresetEditorInput({
        category: 'Camera',
        name: 'N',
        payload: basePayload,
        lensSystem: 'interchangeable',
        lensMount: ''
      })
    ).toBe('presetEditor.validationCameraLensMountRequired')
  })

  it('Camera: fixed lens does not require lens mount or lens fields', () => {
    expect(
      validatePresetEditorInput({
        category: 'Camera',
        name: 'N',
        payload: { ...basePayload, LensMake: '', LensModel: '' },
        lensSystem: 'fixed',
        lensMount: ''
      })
    ).toBeNull()
  })

  it('Lens: requires LensMake and LensModel; mount optional', () => {
    expect(
      validatePresetEditorInput({
        category: 'Lens',
        name: 'N',
        payload: { LensMake: '', LensModel: '50mm' },
        lensSystem: 'interchangeable',
        lensMount: ''
      })
    ).toBe('presetEditor.validationLensMakeRequired')
    expect(
      validatePresetEditorInput({
        category: 'Lens',
        name: 'N',
        payload: { LensMake: 'Leica', LensModel: '' },
        lensSystem: 'interchangeable',
        lensMount: ''
      })
    ).toBe('presetEditor.validationLensModelRequired')
    expect(
      validatePresetEditorInput({
        category: 'Lens',
        name: 'N',
        payload: { LensMake: 'Leica', LensModel: '50mm' },
        lensSystem: 'interchangeable',
        lensMount: ''
      })
    ).toBeNull()
  })

  it('Film: requires film stock display', () => {
    expect(
      validatePresetEditorInput({
        category: 'Film',
        name: 'N',
        payload: { Keywords: ['film'], ISO: '400' },
        lensSystem: 'interchangeable',
        lensMount: ''
      })
    ).toBe('presetEditor.validationFilmStockRequired')
    expect(
      validatePresetEditorInput({
        category: 'Film',
        name: 'N',
        payload: { Keywords: ['film', 'Kodak Portra 400 Film Stock'], ISO: '400' },
        lensSystem: 'interchangeable',
        lensMount: ''
      })
    ).toBeNull()
  })

  it('Author: requires identity', () => {
    expect(
      validatePresetEditorInput({
        category: 'Author',
        name: 'N',
        payload: { Artist: '', Creator: '' },
        lensSystem: 'interchangeable',
        lensMount: ''
      })
    ).toBe('presetEditor.validationAuthorIdentityRequired')
    expect(
      validatePresetEditorInput({
        category: 'Author',
        name: 'N',
        payload: { Artist: 'Jane', Creator: 'Jane' },
        lensSystem: 'interchangeable',
        lensMount: ''
      })
    ).toBeNull()
  })
})
