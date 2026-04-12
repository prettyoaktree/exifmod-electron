import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatCopyrightForExif } from '@shared/copyrightFormat.js'
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
        }
      } else {
        setName('')
        setPayload({})
        setLensSystem('interchangeable')
        setLensMount('')
        setLensAdaptable(false)
      }
    })()
  }, [mode, editId, category])

  const save = async () => {
    setErr(null)
    try {
      const cat = catToLower(category)
      let toSave = normalizeLensPayloadForSave(payload, category)
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
          lens_adaptable: category === 'Camera' ? lensAdaptable : null
        })
      } else if (editId != null) {
        await window.exifmod.updatePreset({
          id: editId,
          name,
          payload: toSave,
          lens_system: category === 'Camera' ? lensSystem : null,
          lens_mount: category === 'Camera' || category === 'Lens' ? lensMount || null : null,
          lens_adaptable: category === 'Camera' ? lensAdaptable : null
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
          <div className="form-row">
            <label>{t('presetEditor.name')}</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        {category === 'Camera' && (
          <>
            <div className="form-row">
              <label>{t('presetEditor.lensSystem')}</label>
              <select
                className="input"
                value={lensSystem}
                onChange={(e) => setLensSystem(e.target.value as 'fixed' | 'interchangeable')}
              >
                <option value="interchangeable">{t('presetEditor.interchangeable')}</option>
                <option value="fixed">{t('presetEditor.fixedLens')}</option>
              </select>
            </div>
            {lensSystem === 'interchangeable' && (
              <>
                <div className="form-row">
                  <label>{t('presetEditor.lensMount')}</label>
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
                </div>
              </>
            )}
            <div className="form-row">
              <label>{t('presetEditor.make')}</label>
              <input className="input" value={String(payload['Make'] ?? '')} onChange={(e) => setField('Make', e.target.value)} />
            </div>
            <div className="form-row">
              <label>{t('presetEditor.model')}</label>
              <input className="input" value={String(payload['Model'] ?? '')} onChange={(e) => setField('Model', e.target.value)} />
            </div>
            {lensSystem === 'fixed' && (
              <>
                <div className="form-row">
                  <label>{t('presetEditor.lensMakeOptional')}</label>
                  <input
                    className="input"
                    value={String(payload['LensMake'] ?? '')}
                    onChange={(e) => setField('LensMake', e.target.value)}
                  />
                </div>
                <div className="form-row">
                  <label>{t('presetEditor.lensModelOptional')}</label>
                  <input
                    className="input"
                    value={String(payload['LensModel'] ?? '')}
                    onChange={(e) => setField('LensModel', e.target.value)}
                  />
                </div>
              </>
            )}
          </>
        )}
        {category === 'Lens' && (
          <>
            <div className="form-row">
              <label>{t('presetEditor.lensMount')}</label>
              <input className="input" list="mount-list-l" value={lensMount} onChange={(e) => setLensMount(e.target.value)} />
              <datalist id="mount-list-l">
                {mounts.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
            <div className="form-row">
              <label>{t('presetEditor.lens')}</label>
              <input
                className="input"
                value={String(payload['LensMake'] ?? '')}
                onChange={(e) => setField('LensMake', e.target.value)}
              />
            </div>
            <div className="form-row">
              <label>{t('presetEditor.lensModel')}</label>
              <input
                className="input"
                value={String(payload['LensModel'] ?? '')}
                onChange={(e) => setField('LensModel', e.target.value)}
              />
            </div>
          </>
        )}
        {category === 'Author' && (
          <>
            <div className="form-row">
              <label>{t('presetEditor.authorIdentity')}</label>
              <input
                className="input"
                value={authorIdentityFromPayload(payload)}
                onChange={(e) => {
                  const v = e.target.value
                  setPayload((prev) => ({ ...prev, Artist: v, Creator: v }))
                }}
              />
            </div>
            <div className="form-row">
              <label>{t('presetEditor.copyrightOptional')}</label>
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
          </>
        )}
        {category === 'Film' && (
          <>
            <div className="form-row">
              <label>{t('presetEditor.filmStockName')}</label>
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
            </div>
            <div className="form-row">
              <label>{t('presetEditor.iso')}</label>
              <input className="input" value={String(payload['ISO'] ?? '')} onChange={(e) => setField('ISO', e.target.value)} />
            </div>
          </>
        )}
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
