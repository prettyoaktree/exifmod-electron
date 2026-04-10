import { useEffect, useState } from 'react'
import type { Cat } from './categories.js'

type CatLower = 'camera' | 'lens' | 'author' | 'film'

function catToLower(c: Cat): CatLower {
  return c === 'Camera' ? 'camera' : c === 'Lens' ? 'lens' : c === 'Film' ? 'film' : 'author'
}

export function PresetEditorModal(props: {
  mode: 'new' | 'edit'
  category: Cat
  editId: number | null
  onClose: () => void
  onSaved: () => void
}): React.ReactElement {
  const { mode, category, editId, onClose, onSaved } = props
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
          setPayload({ ...rec.payload })
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
      if (mode === 'new') {
        await window.exifmod.createPreset({
          category: cat,
          name,
          payload,
          lens_system: category === 'Camera' ? lensSystem : null,
          lens_mount: category === 'Camera' || category === 'Lens' ? lensMount || null : null,
          lens_adaptable: category === 'Camera' ? lensAdaptable : null
        })
      } else if (editId != null) {
        await window.exifmod.updatePreset({
          id: editId,
          name,
          payload,
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
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3>
          {mode === 'new' ? 'New' : 'Edit'} {category} preset
        </h3>
        {err && <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{err}</p>}
        <div className="form-row">
          <label>Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {category === 'Camera' && (
          <>
            <div className="form-row">
              <label>Lens system</label>
              <select
                className="input"
                value={lensSystem}
                onChange={(e) => setLensSystem(e.target.value as 'fixed' | 'interchangeable')}
              >
                <option value="interchangeable">Interchangeable</option>
                <option value="fixed">Fixed lens</option>
              </select>
            </div>
            {lensSystem === 'interchangeable' && (
              <>
                <div className="form-row">
                  <label>Lens mount</label>
                  <input className="input" list="mount-list" value={lensMount} onChange={(e) => setLensMount(e.target.value)} />
                  <datalist id="mount-list">
                    {mounts.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>
                <div className="form-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={lensAdaptable}
                      onChange={(e) => setLensAdaptable(e.target.checked)}
                    />{' '}
                    Lens adaptable
                  </label>
                </div>
              </>
            )}
            <div className="form-row">
              <label>Make</label>
              <input className="input" value={String(payload['Make'] ?? '')} onChange={(e) => setField('Make', e.target.value)} />
            </div>
            <div className="form-row">
              <label>Model</label>
              <input className="input" value={String(payload['Model'] ?? '')} onChange={(e) => setField('Model', e.target.value)} />
            </div>
            {lensSystem === 'fixed' && (
              <>
                <div className="form-row">
                  <label>Lens (optional)</label>
                  <input className="input" value={String(payload['Lens'] ?? '')} onChange={(e) => setField('Lens', e.target.value)} />
                </div>
                <div className="form-row">
                  <label>LensModel</label>
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
              <label>Lens mount</label>
              <input className="input" list="mount-list-l" value={lensMount} onChange={(e) => setLensMount(e.target.value)} />
              <datalist id="mount-list-l">
                {mounts.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
            <div className="form-row">
              <label>Lens</label>
              <input className="input" value={String(payload['Lens'] ?? '')} onChange={(e) => setField('Lens', e.target.value)} />
            </div>
            <div className="form-row">
              <label>LensModel</label>
              <input
                className="input"
                value={String(payload['LensModel'] ?? '')}
                onChange={(e) => setField('LensModel', e.target.value)}
              />
            </div>
            <div className="form-row">
              <label>Shutter speed (ExposureTime)</label>
              <input
                className="input"
                value={String(payload['ExposureTime'] ?? '')}
                onChange={(e) => setField('ExposureTime', e.target.value)}
              />
            </div>
            <div className="form-row">
              <label>Aperture (FNumber)</label>
              <input
                className="input"
                value={String(payload['FNumber'] ?? '')}
                onChange={(e) => {
                  const t = e.target.value.trim()
                  if (!t) {
                    setPayload((p) => {
                      const c = { ...p }
                      delete c['FNumber']
                      return c
                    })
                  } else {
                    const n = Number(t)
                    setPayload((p) => ({ ...p, FNumber: Number.isFinite(n) ? n : t }))
                  }
                }}
              />
            </div>
          </>
        )}
        {category === 'Author' && (
          <>
            <div className="form-row">
              <label>Creator</label>
              <input className="input" value={String(payload['Creator'] ?? '')} onChange={(e) => setField('Creator', e.target.value)} />
            </div>
            <div className="form-row">
              <label>Artist</label>
              <input className="input" value={String(payload['Artist'] ?? '')} onChange={(e) => setField('Artist', e.target.value)} />
            </div>
          </>
        )}
        {category === 'Film' && (
          <>
            <div className="form-row">
              <label>ISO</label>
              <input className="input" value={String(payload['ISO'] ?? '')} onChange={(e) => setField('ISO', e.target.value)} />
            </div>
            <div className="form-row">
              <label>Keywords (comma-separated, include Film and stock name)</label>
              <input
                className="input"
                value={Array.isArray(payload['Keywords']) ? (payload['Keywords'] as string[]).join(', ') : String(payload['Keywords'] ?? '')}
                onChange={(e) =>
                  setPayload((p) => ({
                    ...p,
                    Keywords: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                  }))
                }
              />
            </div>
          </>
        )}
        <div className="actions-row" style={{ marginTop: '0.75rem' }}>
          <button type="button" className="btn btn-primary" onClick={() => void save()}>
            Save
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
