import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { formatCopyrightForExif } from '@shared/copyrightFormat.js'
import { validateExposureTimeForExif, validateFnumberForExif } from './exif/validate.js'
import {
  filmStockDisplayFromKeywordsPayload,
  filmStockKeywordFromDisplayName,
  normalizeFilmPresetPayloadForMerge
} from '@shared/filmKeywords.js'
import type { Cat } from './categories.js'

type CatLower = 'camera' | 'lens' | 'author' | 'film'

const CAT_I18N: Record<Cat, 'category.camera' | 'category.lens' | 'category.film' | 'category.author'> = {
  Camera: 'category.camera',
  Lens: 'category.lens',
  Film: 'category.film',
  Author: 'category.author'
}

function catToLower(c: Cat): CatLower {
  return c === 'Camera' ? 'camera' : c === 'Lens' ? 'lens' : c === 'Film' ? 'film' : 'author'
}

/**
 * Promote legacy `Lens` → `LensMake`, legacy `LensID` → `LensModel` when model empty;
 * drop `Lens` / `LensID` so we only persist `LensMake` + `LensModel`.
 */
function migrateLegacyLensFromPayload(pl: Record<string, unknown>): Record<string, unknown> {
  const p = { ...pl }
  const legacy = p['Lens']
  if (legacy != null && String(legacy).trim() !== '') {
    const mk = p['LensMake']
    if (mk == null || String(mk).trim() === '') {
      p['LensMake'] = legacy
    }
  }
  delete p['Lens']

  const lid = p['LensID']
  if (lid != null && String(lid).trim() !== '') {
    const model = p['LensModel']
    if (model == null || String(model).trim() === '') {
      p['LensModel'] = lid
    }
  }
  delete p['LensID']
  return p
}

function normalizeLensPayloadForSave(pl: Record<string, unknown>, category: Cat): Record<string, unknown> {
  const p = { ...pl }
  delete p['Lens']
  delete p['LensID']
  if (category === 'Lens') {
    delete p['ExposureTime']
    delete p['FNumber']
  }
  return p
}

/** Camera: only persist lens / exposure tags when the corresponding fixed options are enabled. */
function normalizeCameraPayloadForSave(
  pl: Record<string, unknown>,
  lensSystem: 'fixed' | 'interchangeable',
  fixedShutter: boolean,
  fixedAperture: boolean
): Record<string, unknown> {
  const p = { ...pl }
  if (lensSystem === 'interchangeable') {
    delete p['LensMake']
    delete p['LensModel']
  }
  if (!fixedShutter) delete p['ExposureTime']
  if (!fixedAperture) delete p['FNumber']
  else if (p['FNumber'] != null && String(p['FNumber']).trim() !== '') {
    const n = Number(String(p['FNumber']).trim())
    if (Number.isFinite(n) && n > 0) p['FNumber'] = n
  }
  if (fixedShutter && p['ExposureTime'] != null) {
    p['ExposureTime'] = String(p['ExposureTime']).trim()
  }
  return p
}

/** Normalize legacy string/array Keywords and ensure `film` + single `… Film Stock` keyword when possible. */
function migrateFilmPayloadFromDb(pl: Record<string, unknown>): Record<string, unknown> {
  const p = { ...pl }
  const kw = p['Keywords']
  let vals: string[] = []
  if (typeof kw === 'string') {
    vals = kw.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
  } else if (Array.isArray(kw)) {
    vals = kw.map((v) => String(v).trim()).filter(Boolean)
  }
  const parts = vals.filter((v) => v.toLowerCase() !== 'film')
  if (parts.length === 0) {
    p['Keywords'] = ['film']
    return p
  }
  const display = filmStockDisplayFromKeywordsPayload(p)
  const stockKw = filmStockKeywordFromDisplayName(display)
  p['Keywords'] = stockKw ? ['film', stockKw] : ['film']
  return p
}

function normalizeFilmPayloadForSave(pl: Record<string, unknown>): Record<string, unknown> {
  return normalizeFilmPresetPayloadForMerge(pl)
}

function authorIdentityFromPayload(pl: Record<string, unknown>): string {
  return String(pl['Artist'] ?? pl['Creator'] ?? '').trim()
}

/** Unify legacy Artist/Creator; migrate legacy `Author Name` into Artist/Creator; drop `Author Name`. */
function migrateAuthorPayloadFromDb(pl: Record<string, unknown>): Record<string, unknown> {
  const p = { ...pl }
  const legacyAuthorName = String(p['Author Name'] ?? '').trim()
  delete p['Author Name']

  const artist = String(p['Artist'] ?? '').trim()
  const creator = String(p['Creator'] ?? '').trim()
  let unified = artist || creator
  if (!unified && legacyAuthorName) {
    unified = legacyAuthorName
  }

  if (artist && creator && artist !== creator) {
    p['Artist'] = artist
    p['Creator'] = artist
  } else if (unified) {
    p['Artist'] = unified
    p['Creator'] = unified
  } else {
    delete p['Artist']
    delete p['Creator']
  }

  return p
}

/** Always set EXIF `Author` to Person; strip empty optional fields. */
function normalizeAuthorPayloadForSave(pl: Record<string, unknown>): Record<string, unknown> {
  const p = { ...pl }
  p['Author'] = 'Person'

  const copy = String(p['Copyright'] ?? '').trim()
  if (!copy) {
    delete p['Copyright']
  } else {
    p['Copyright'] = copy
  }

  delete p['Author Name']

  const identity = authorIdentityFromPayload(p)
  if (!identity) {
    delete p['Artist']
    delete p['Creator']
  } else {
    p['Artist'] = identity
    p['Creator'] = identity
  }
  return p
}

function PresetFieldRow(props: { label: ReactNode; children: ReactNode }): ReactElement {
  return (
    <tr>
      <td className="preset-modal-field-label">{props.label}</td>
      <td className="preset-modal-field-control">{props.children}</td>
    </tr>
  )
}

export function PresetEditorModal(props: {
  mode: 'new' | 'edit'
  category: Cat
  editId: number | null
  onClose: () => void
  onSaved: () => void
}): React.ReactElement {
  const { t } = useTranslation()
  const { mode, category, editId, onClose, onSaved } = props
  const categoryLabel = t(CAT_I18N[category])
  const [name, setName] = useState('')
  const [payload, setPayload] = useState<Record<string, unknown>>({})
  const [lensSystem, setLensSystem] = useState<'fixed' | 'interchangeable'>('interchangeable')
  const [lensMount, setLensMount] = useState('')
  const [lensAdaptable, setLensAdaptable] = useState(false)
  const [fixedShutter, setFixedShutter] = useState(false)
  const [fixedAperture, setFixedAperture] = useState(false)
  const [mounts, setMounts] = useState<string[]>([])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const m = await window.exifmod.suggestedLensMounts()
      setMounts(m)
    })()
  }, [])

  useEffect(() => {
    void (async () => {
      if (mode === 'edit' && editId != null) {
        const rec = await window.exifmod.getPreset(editId)
        if (rec) {
          setName(rec.name)
          let pl = { ...rec.payload }
          if (category === 'Lens') {
            delete pl['ExposureTime']
            delete pl['FNumber']
          }
          if (category === 'Camera' || category === 'Lens') {
            pl = migrateLegacyLensFromPayload(pl)
          }
          if (category === 'Film') {
            pl = migrateFilmPayloadFromDb(pl)
          }
          if (category === 'Author') {
            pl = migrateAuthorPayloadFromDb(pl)
          }
          setPayload(pl)
          if (rec.lens_system === 'fixed' || rec.lens_system === 'interchangeable') {
            setLensSystem(rec.lens_system)
          }
          setLensMount(rec.lens_mount ?? '')
          setLensAdaptable(Boolean(rec.lens_adaptable))
          setFixedShutter(rec.fixed_shutter === true)
          setFixedAperture(rec.fixed_aperture === true)
        }
      } else {
        setName('')
        setPayload({})
        setLensSystem('interchangeable')
        setLensMount('')
        setLensAdaptable(false)
        setFixedShutter(false)
        setFixedAperture(false)
      }
    })()
  }, [mode, editId, category])

  const save = async () => {
    setErr(null)
    try {
      const cat = catToLower(category)
      let toSave = normalizeLensPayloadForSave(payload, category)
      if (category === 'Camera') {
        if (fixedShutter) {
          const raw = String(payload['ExposureTime'] ?? '').trim()
          if (!raw) {
            setErr(t('presetEditor.fixedShutterValueRequired'))
            return
          }
          const ve = validateExposureTimeForExif(raw)
          if (ve) {
            setErr(ve)
            return
          }
        }
        if (fixedAperture) {
          const raw = String(payload['FNumber'] ?? '').trim()
          if (!raw) {
            setErr(t('presetEditor.fixedApertureValueRequired'))
            return
          }
          const vf = validateFnumberForExif(raw)
          if (vf) {
            setErr(vf)
            return
          }
        }
        toSave = normalizeCameraPayloadForSave(toSave, lensSystem, fixedShutter, fixedAperture)
      }
      if (category === 'Film') {
        toSave = normalizeFilmPayloadForSave(toSave)
      }
      if (category === 'Author') {
        toSave = normalizeAuthorPayloadForSave(toSave)
      }
      if (mode === 'new') {
        await window.exifmod.createPreset({
          category: cat,
          name,
          payload: toSave,
          lens_system: category === 'Camera' ? lensSystem : null,
          lens_mount: category === 'Camera' || category === 'Lens' ? lensMount || null : null,
          lens_adaptable: category === 'Camera' ? lensAdaptable : null,
          fixed_shutter: category === 'Camera' ? fixedShutter : undefined,
          fixed_aperture: category === 'Camera' ? fixedAperture : undefined
        })
      } else if (editId != null) {
        await window.exifmod.updatePreset({
          id: editId,
          name,
          payload: toSave,
          lens_system: category === 'Camera' ? lensSystem : null,
          lens_mount: category === 'Camera' || category === 'Lens' ? lensMount || null : null,
          lens_adaptable: category === 'Camera' ? lensAdaptable : null,
          fixed_shutter: category === 'Camera' ? fixedShutter : undefined,
          fixed_aperture: category === 'Camera' ? fixedAperture : undefined
        })
      }
      onSaved()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  const setField = (k: string, v: string) => {
    setPayload((p) => ({ ...p, [k]: v }))
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-preset-editor" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="modal-preset-editor-title">
          {mode === 'new'
            ? t('presetEditor.titleNew', { category: categoryLabel })
            : t('presetEditor.titleEdit', { category: categoryLabel })}
        </h3>
        <div className="modal-preset-editor-content">
          {err && <p className="preset-editor-error">{err}</p>}
          <table className="mapping preset-modal-mapping">
            <colgroup>
              <col className="preset-modal-col-field" />
              <col className="preset-modal-col-value" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">{t('ui.attribute')}</th>
                <th scope="col">{t('ui.newValue')}</th>
              </tr>
            </thead>
            <tbody>
              <PresetFieldRow label={t('presetEditor.name')}>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </PresetFieldRow>
              {category === 'Camera' && (
                <>
                  <PresetFieldRow label={t('presetEditor.make')}>
                    <input className="input" value={String(payload['Make'] ?? '')} onChange={(e) => setField('Make', e.target.value)} />
                  </PresetFieldRow>
                  <PresetFieldRow label={t('presetEditor.model')}>
                    <input className="input" value={String(payload['Model'] ?? '')} onChange={(e) => setField('Model', e.target.value)} />
                  </PresetFieldRow>
                  <PresetFieldRow label={t('presetEditor.lensSystem')}>
                    <select
                      className="input"
                      value={lensSystem}
                      onChange={(e) => setLensSystem(e.target.value as 'fixed' | 'interchangeable')}
                    >
                      <option value="interchangeable">{t('presetEditor.interchangeable')}</option>
                      <option value="fixed">{t('presetEditor.fixedLens')}</option>
                    </select>
                  </PresetFieldRow>
                  {lensSystem === 'interchangeable' && (
                    <PresetFieldRow label={t('presetEditor.lensMount')}>
                      <div className="modal-preset-editor-mount-row">
                        <input
                          className="input modal-preset-editor-mount-input"
                          list="mount-list"
                          value={lensMount}
                          onChange={(e) => setLensMount(e.target.value)}
                        />
                        <label className="form-label-inline modal-preset-editor-adapters-label">
                          <input
                            type="checkbox"
                            checked={lensAdaptable}
                            onChange={(e) => setLensAdaptable(e.target.checked)}
                          />
                          <span>{t('presetEditor.lensAdaptable')}</span>
                        </label>
                      </div>
                      <datalist id="mount-list">
                        {mounts.map((m) => (
                          <option key={m} value={m} />
                        ))}
                      </datalist>
                    </PresetFieldRow>
                  )}
                  {lensSystem === 'fixed' && (
                    <>
                      <PresetFieldRow label={t('presetEditor.lensMakeOptional')}>
                        <input
                          className="input"
                          value={String(payload['LensMake'] ?? '')}
                          onChange={(e) => setField('LensMake', e.target.value)}
                        />
                      </PresetFieldRow>
                      <PresetFieldRow label={t('presetEditor.lensModelOptional')}>
                        <input
                          className="input"
                          value={String(payload['LensModel'] ?? '')}
                          onChange={(e) => setField('LensModel', e.target.value)}
                        />
                      </PresetFieldRow>
                    </>
                  )}
                  <PresetFieldRow label={t('presetEditor.fixedShutter')}>
                    <div className="modal-preset-editor-combo-row">
                      <input
                        type="checkbox"
                        className="preset-modal-checkbox"
                        checked={fixedShutter}
                        onChange={(e) => {
                          const on = e.target.checked
                          setFixedShutter(on)
                          if (!on) {
                            setPayload((prev) => {
                              const n = { ...prev }
                              delete n['ExposureTime']
                              return n
                            })
                          }
                        }}
                        aria-label={t('presetEditor.fixedShutter')}
                      />
                      <input
                        className="input"
                        disabled={!fixedShutter}
                        value={String(payload['ExposureTime'] ?? '')}
                        onChange={(e) => setField('ExposureTime', e.target.value)}
                        aria-label={t('presetEditor.exposureTime')}
                      />
                    </div>
                  </PresetFieldRow>
                  <PresetFieldRow label={t('presetEditor.fixedAperture')}>
                    <div className="modal-preset-editor-combo-row">
                      <input
                        type="checkbox"
                        className="preset-modal-checkbox"
                        checked={fixedAperture}
                        onChange={(e) => {
                          const on = e.target.checked
                          setFixedAperture(on)
                          if (!on) {
                            setPayload((prev) => {
                              const n = { ...prev }
                              delete n['FNumber']
                              return n
                            })
                          }
                        }}
                        aria-label={t('presetEditor.fixedAperture')}
                      />
                      <input
                        className="input"
                        disabled={!fixedAperture}
                        value={String(payload['FNumber'] ?? '')}
                        onChange={(e) => setField('FNumber', e.target.value)}
                        aria-label={t('presetEditor.fNumber')}
                      />
                    </div>
                  </PresetFieldRow>
                </>
              )}
              {category === 'Lens' && (
                <>
                  <PresetFieldRow label={t('presetEditor.lensMount')}>
                    <>
                      <input className="input" list="mount-list-l" value={lensMount} onChange={(e) => setLensMount(e.target.value)} />
                      <datalist id="mount-list-l">
                        {mounts.map((m) => (
                          <option key={m} value={m} />
                        ))}
                      </datalist>
                    </>
                  </PresetFieldRow>
                  <PresetFieldRow label={t('presetEditor.lens')}>
                    <input
                      className="input"
                      value={String(payload['LensMake'] ?? '')}
                      onChange={(e) => setField('LensMake', e.target.value)}
                    />
                  </PresetFieldRow>
                  <PresetFieldRow label={t('presetEditor.lensModel')}>
                    <input
                      className="input"
                      value={String(payload['LensModel'] ?? '')}
                      onChange={(e) => setField('LensModel', e.target.value)}
                    />
                  </PresetFieldRow>
                </>
              )}
              {category === 'Author' && (
                <>
                  <PresetFieldRow label={t('presetEditor.authorIdentity')}>
                    <input
                      className="input"
                      value={authorIdentityFromPayload(payload)}
                      onChange={(e) => {
                        const v = e.target.value
                        setPayload((prev) => ({ ...prev, Artist: v, Creator: v }))
                      }}
                    />
                  </PresetFieldRow>
                  <PresetFieldRow label={t('presetEditor.copyrightOptional')}>
                    <div className="preset-modal-stack">
                      <input
                        className="input"
                        value={String(payload['Copyright'] ?? '')}
                        onChange={(e) => setField('Copyright', e.target.value)}
                      />
                      <p className="preset-editor-hint">
                        {formatCopyrightForExif(String(payload['Copyright'] ?? '')) ??
                          t('presetEditor.copyrightWrittenNone')}
                      </p>
                    </div>
                  </PresetFieldRow>
                </>
              )}
              {category === 'Film' && (
                <>
                  <PresetFieldRow label={t('presetEditor.filmStockName')}>
                    <input
                      className="input"
                      value={filmStockDisplayFromKeywordsPayload(payload)}
                      onChange={(e) => {
                        const stockKw = filmStockKeywordFromDisplayName(e.target.value)
                        setPayload((p) => ({
                          ...p,
                          Keywords: stockKw ? ['film', stockKw] : ['film']
                        }))
                      }}
                    />
                  </PresetFieldRow>
                  <PresetFieldRow label={t('presetEditor.iso')}>
                    <input className="input" value={String(payload['ISO'] ?? '')} onChange={(e) => setField('ISO', e.target.value)} />
                  </PresetFieldRow>
                </>
              )}
            </tbody>
          </table>
        </div>
        <div className="modal-preset-editor-actions actions-row">
          <button type="button" className="btn btn-primary" onClick={() => void save()}>
            {t('presetEditor.save')}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            {t('presetEditor.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
