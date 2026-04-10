import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ConfigCatalog } from '@shared/types.js'
import { filterLensValues } from '@shared/lensFilter.js'
import {
  formatExposureTimeForUi,
  formatFnumberForUi,
  inferCategoryValues,
  exposureTimeRawFromMetadata,
  fnumberRawFromMetadata,
  imageDescriptionFromMetadata
} from './exif/infer.js'
import {
  clampUtf8ByBytes,
  validateExposureTimeForExif,
  validateFnumberForExif,
  validateImageDescriptionForExif
} from './exif/validate.js'
import { PresetEditorModal } from './PresetEditor.js'
import type { Cat } from './categories.js'

const CATS: Cat[] = ['Camera', 'Lens', 'Film', 'Author']

const CAT_I18N: Record<Cat, 'category.camera' | 'category.lens' | 'category.film' | 'category.author'> = {
  Camera: 'category.camera',
  Lens: 'category.lens',
  Film: 'category.film',
  Author: 'category.author'
}

interface PendingState {
  cameraId: number | null
  lensId: number | null
  filmId: number | null
  authorId: number | null
  exposureMode: 'none' | 'custom'
  exposureTime: string
  fNumberMode: 'none' | 'custom'
  fNumberText: string
  notesText: string
  notesBaseline: string
}

function emptyPending(): PendingState {
  return {
    cameraId: null,
    lensId: null,
    filmId: null,
    authorId: null,
    exposureMode: 'none',
    exposureTime: '',
    fNumberMode: 'none',
    fNumberText: '',
    notesText: '',
    notesBaseline: ''
  }
}

function pathKey(p: string): string {
  return p
}

function presetNameForId(catalog: ConfigCatalog, category: Cat, id: number | null): string {
  if (id == null) return 'None'
  const map =
    category === 'Camera'
      ? catalog.camera_file_map
      : category === 'Lens'
        ? catalog.lens_file_map
        : category === 'Film'
          ? catalog.film_file_map
          : catalog.author_file_map
  for (const [name, pid] of Object.entries(map)) {
    if (pid === id) return name
  }
  return 'None'
}

function getStagingPaths(files: string[], selectedIndices: Set<number>, currentIndex: number | null): string[] {
  const n = files.length
  const rows = [...selectedIndices].sort((a, b) => a - b)
  if (rows.length > 1) {
    return rows.filter((r) => r >= 0 && r < n).map((r) => files[r]!)
  }
  if (currentIndex != null && currentIndex >= 0 && currentIndex < n) {
    return [files[currentIndex]!]
  }
  if (rows.length === 1) {
    const r = rows[0]!
    if (r >= 0 && r < n) return [files[r]!]
  }
  return []
}

function idKeyForCategory(cat: Cat): keyof PendingState {
  return cat === 'Camera' ? 'cameraId' : cat === 'Lens' ? 'lensId' : cat === 'Film' ? 'filmId' : 'authorId'
}

export function App(): React.ReactElement {
  const { t } = useTranslation()
  const noneDisplay = t('ui.doNotModify')
  const setValueDisplay = t('ui.setValue')
  const internalToDisplay = (name: string): string => (name === 'None' ? noneDisplay : name)
  const displayToInternal = (text: string): string => (text === noneDisplay ? 'None' : text)
  const catLabel = (cat: Cat): string => t(CAT_I18N[cat])

  const [preflight, setPreflight] = useState<string[]>([])
  const [catalog, setCatalog] = useState<ConfigCatalog | null>(null)
  const [catalogIssues, setCatalogIssues] = useState<string[]>([])
  const [files, setFiles] = useState<string[]>([])
  const [folderLabel, setFolderLabel] = useState<string>(() => t('ui.openFolder'))
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const [currentIndex, setCurrentIndex] = useState<number | null>(null)
  const [pendingByPath, setPendingByPath] = useState<Record<string, PendingState>>({})
  const [metadataByPath, setMetadataByPath] = useState<Record<string, Record<string, unknown>>>({})
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null)
  const [mergedPreview, setMergedPreview] = useState<Record<string, unknown>>({})
  const [status, setStatus] = useState<string>('')
  const [presetEditor, setPresetEditor] = useState<{ mode: 'new' | 'edit'; category: Cat } | null>(null)

  const reloadCatalog = useCallback(async () => {
    const api = window.exifmod
    if (!api) return
    const { catalog: c, loadIssues } = await api.loadCatalog()
    setCatalog(c)
    setCatalogIssues(loadIssues)
  }, [])

  useEffect(() => {
    const api = window.exifmod
    if (!api) return
    void (async () => {
      const issues = await api.preflight()
      setPreflight(issues)
      await reloadCatalog()
    })()
  }, [reloadCatalog])

  useEffect(() => {
    const api = window.exifmod
    if (!api) return
    return api.onPresetsImported(() => void reloadCatalog())
  }, [reloadCatalog])

  useEffect(() => {
    const api = window.exifmod
    if (!api) return
    return api.onStartupPath((p) => {
      void (async () => {
        const list = await api.resolveImageList(p)
        setFiles(list)
        setFolderLabel(p.split(/[/\\]/).pop() ?? p)
        setSelectedIndices(new Set(list.length ? [0] : []))
        setCurrentIndex(list.length ? 0 : null)
        setMetadataByPath({})
        setPendingByPath({})
      })()
    })
  }, [])

  const stagingPaths = useMemo(
    () => getStagingPaths(files, selectedIndices, currentIndex),
    [files, selectedIndices, currentIndex]
  )

  const stagingKey = stagingPaths.join('\0')

  const ensurePending = useCallback(
    (path: string): PendingState => {
      const k = pathKey(path)
      return pendingByPath[k] ?? emptyPending()
    },
    [pendingByPath]
  )

  const updatePendingForPaths = useCallback((paths: string[], updater: (p: PendingState) => PendingState) => {
    setPendingByPath((prev) => {
      const next = { ...prev }
      for (const path of paths) {
        const k = pathKey(path)
        next[k] = updater(next[k] ?? emptyPending())
      }
      return next
    })
  }, [])

  useEffect(() => {
    if (!stagingPaths.length) return
    const api = window.exifmod
    if (!api) return
    let cancelled = false
    void (async () => {
      const meta: Record<string, Record<string, unknown>> = {}
      for (const path of stagingPaths) {
        try {
          meta[path] = await api.readMetadata(path)
        } catch {
          meta[path] = {}
        }
      }
      if (cancelled) return
      setMetadataByPath((prev) => ({ ...prev, ...meta }))
      setPendingByPath((prev) => {
        const next = { ...prev }
        for (const path of stagingPaths) {
          const k = pathKey(path)
          const row = next[k] ?? emptyPending()
          const md = meta[path]!
          if (row.notesText === '' && row.notesBaseline === '') {
            const desc = imageDescriptionFromMetadata(md)
            next[k] = { ...row, notesText: desc, notesBaseline: desc }
          }
        }
        return next
      })
    })()
    return () => {
      cancelled = true
    }
  }, [stagingKey])

  useEffect(() => {
    const path = currentIndex != null && files[currentIndex!] != null ? files[currentIndex!] : stagingPaths[0]
    if (!path) {
      setPreviewDataUrl(null)
      return
    }
    const api = window.exifmod
    if (!api) return
    void (async () => {
      try {
        setPreviewDataUrl(await api.readImageDataUrl(path))
      } catch {
        setPreviewDataUrl(null)
      }
    })()
  }, [currentIndex, files, stagingPaths])

  const syncMappingFromPending = useCallback(() => {
    if (!catalog || !stagingPaths.length) return
    const api = window.exifmod
    if (!api) return
    const paths = stagingPaths
    const first = paths[0]!
    const st0 = ensurePending(first)

    const same = (getter: (s: PendingState) => number | null | string | undefined): boolean => {
      const vals = paths.map((p) => getter(ensurePending(p)))
      return new Set(vals).size <= 1
    }

    void (async () => {
      let merged = await api.mergePayloads({
        camera: same((s) => s.cameraId) ? st0.cameraId : null,
        lens: same((s) => s.lensId) ? st0.lensId : null,
        author: same((s) => s.authorId) ? st0.authorId : null,
        film: same((s) => s.filmId) ? st0.filmId : null
      })
      if (same((s) => s.exposureTime) && st0.exposureMode === 'custom' && st0.exposureTime.trim()) {
        merged = { ...merged, ExposureTime: st0.exposureTime.trim() }
      }
      if (same((s) => s.fNumberText) && st0.fNumberMode === 'custom' && st0.fNumberText.trim()) {
        const n = Number(st0.fNumberText.trim())
        if (Number.isFinite(n)) merged = { ...merged, FNumber: n }
      }
      if (same((s) => s.notesText)) {
        const notes = st0.notesText.trim()
        const base = st0.notesBaseline.trim()
        if (notes && notes !== base) {
          merged = { ...merged, ImageDescription: notes }
        }
      }
      setMergedPreview(merged)
    })()
  }, [catalog, stagingPaths, ensurePending, pendingByPath])

  useEffect(() => {
    syncMappingFromPending()
  }, [syncMappingFromPending])

  const inferredRow = useMemo(() => {
    if (!catalog || !stagingPaths.length) return { Camera: '', Lens: '', Film: '', Author: '' }
    const filmOpts = catalog.film_values
    const per = stagingPaths.map((p) => inferCategoryValues(metadataByPath[p] ?? {}, filmOpts))
    const keys: Cat[] = ['Camera', 'Lens', 'Film', 'Author']
    const out: Record<string, string> = {}
    for (const k of keys) {
      const vals = per.map((x) => x[k] ?? '')
      if (vals.length === 1) out[k] = vals[0]!
      else if (new Set(vals).size === 1) out[k] = vals[0]!
      else out[k] = 'Multiple'
    }
    return out
  }, [catalog, stagingPaths, metadataByPath])

  const lensFilter = useMemo(() => {
    if (!catalog) return { allowed: [] as string[], state: 'readonly' as const }
    const camName = presetNameForId(catalog, 'Camera', ensurePending(stagingPaths[0] ?? '').cameraId)
    const camId = catalog.camera_file_map[camName]
    return filterLensValues(
      catalog.lens_values,
      camName,
      camId ?? null,
      catalog.camera_metadata_map,
      catalog.lens_metadata_map
    )
  }, [catalog, stagingPaths, ensurePending])

  const onOpenFolder = async () => {
    const api = window.exifmod
    if (!api) return
    const dir = await api.openFolder()
    if (!dir) return
    const list = await api.listImagesInDir(dir)
    setFiles(list)
    setFolderLabel(dir.split(/[/\\]/).pop() ?? dir)
    setSelectedIndices(new Set(list.length ? [0] : []))
    setCurrentIndex(list.length ? 0 : null)
    setMetadataByPath({})
    setPendingByPath({})
  }

  const onRowClick = (i: number, ev: React.MouseEvent) => {
    if (ev.ctrlKey || ev.metaKey) {
      setSelectedIndices((prev) => {
        const n = new Set(prev)
        if (n.has(i)) n.delete(i)
        else n.add(i)
        return n
      })
      setCurrentIndex(i)
    } else {
      setCurrentIndex(i)
      setSelectedIndices(new Set([i]))
    }
  }

  const setCategoryPreset = (cat: Cat, displayName: string) => {
    if (!catalog) return
    const internal = displayToInternal(displayName)
    const map =
      cat === 'Camera'
        ? catalog.camera_file_map
        : cat === 'Lens'
          ? catalog.lens_file_map
          : cat === 'Film'
            ? catalog.film_file_map
            : catalog.author_file_map
    const id = (map[internal] ?? null) as number | null
    const key = idKeyForCategory(cat)
    updatePendingForPaths(stagingPaths, (s) => ({ ...s, [key]: id }))
  }

  const buildMergedForCommit = async (st: PendingState): Promise<{ payload: Record<string, unknown> | null; err: string | null }> => {
    const api = window.exifmod
    if (!api) return { payload: null, err: t('ui.preloadUnavailable') }
    try {
      let merged = await api.mergePayloads({
        camera: st.cameraId,
        lens: st.lensId,
        author: st.authorId,
        film: st.filmId
      })
      if (st.exposureMode === 'custom' && st.exposureTime.trim()) {
        const e = validateExposureTimeForExif(st.exposureTime)
        if (e) return { payload: null, err: e }
        merged = { ...merged, ExposureTime: st.exposureTime.trim() }
      }
      if (st.fNumberMode === 'custom' && st.fNumberText.trim()) {
        const e = validateFnumberForExif(st.fNumberText)
        if (e) return { payload: null, err: e }
        merged = { ...merged, FNumber: Number(st.fNumberText.trim()) }
      }
      const notes = st.notesText.trim()
      const base = st.notesBaseline.trim()
      if (notes !== base) {
        if (notes) {
          const e = validateImageDescriptionForExif(notes)
          if (e) return { payload: null, err: e }
          merged = { ...merged, ImageDescription: notes }
        }
      }
      if (Object.keys(merged).length === 0) return { payload: null, err: null }
      return { payload: merged, err: null }
    } catch (e) {
      return { payload: null, err: String(e) }
    }
  }

  const onCommit = async () => {
    const api = window.exifmod
    if (!api) {
      alert(t('ui.preloadUnavailable'))
      return
    }
    const todo: { path: string; payload: Record<string, unknown> }[] = []
    for (const path of files) {
      const st = pendingByPath[pathKey(path)]
      if (!st) continue
      const { payload, err } = await buildMergedForCommit(st)
      if (err) {
        alert(err)
        return
      }
      if (payload && Object.keys(payload).length > 0) {
        todo.push({ path, payload })
      }
    }
    if (!todo.length) {
      alert(t('ui.noStagedChanges'))
      return
    }
    if (!confirm(t('ui.commitConfirm', { count: todo.length }))) return
    setStatus(t('ui.statusWriting'))
    let ok = 0
    for (const { path, payload } of todo) {
      try {
        await api.applyExif(path, payload)
        ok++
      } catch (e) {
        alert(
          t('ui.applyError', {
            path,
            message: e instanceof Error ? e.message : String(e)
          })
        )
      }
    }
    setStatus(t('ui.statusCommitted', { ok, total: todo.length }))
  }

  const staging = stagingPaths
  const st = staging[0] ? ensurePending(staging[0]) : emptyPending()

  const exposureCurrent = staging.map((p) => formatExposureTimeForUi(exposureTimeRawFromMetadata(metadataByPath[p] ?? {})))
  const fnCurrent = staging.map((p) => formatFnumberForUi(fnumberRawFromMetadata(metadataByPath[p] ?? {})))

  const exposureCurrentDisplay =
    exposureCurrent.length === 0
      ? ''
      : new Set(exposureCurrent).size === 1
        ? exposureCurrent[0]!
        : t('ui.multiple')
  const fnCurrentDisplay =
    fnCurrent.length === 0
      ? ''
      : new Set(fnCurrent).size === 1
        ? fnCurrent[0]!
        : t('ui.multiple')

  const editIdForCategory = (cat: Cat): number | null => {
    const k = idKeyForCategory(cat)
    return st[k] as number | null
  }

  return (
    <div className="app">
      {!window.exifmod && (
        <div className="preflight-warn">
          <strong>{t('ui.errorPreload')}</strong>{' '}
          <span dangerouslySetInnerHTML={{ __html: t('ui.errorPreloadBody') }} />
        </div>
      )}
      {preflight.length > 0 && (
        <div className="preflight-warn">
          <strong>{t('ui.warningPrefix')}</strong> {preflight.join(' · ')}
        </div>
      )}
      <div className="app-toolbar">
        <h1>{t('app.title')}</h1>
        <button type="button" className="btn" onClick={() => void onOpenFolder()}>
          {t('ui.selectFolder')}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setSelectedIndices(new Set(files.map((_, i) => i)))
            if (files.length) setCurrentIndex(0)
          }}
        >
          {t('ui.selectAll')}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setSelectedIndices(new Set())
            setCurrentIndex(null)
          }}
        >
          {t('ui.deselectAll')}
        </button>
      </div>
      <div className="app-body">
        <div className="file-panel">
          <header>{folderLabel}</header>
          <ul className="file-list">
            {files.map((f, i) => {
              const base = f.split(/[/\\]/).pop() ?? f
              const sel = selectedIndices.has(i)
              const cur = currentIndex === i
              const pk = pathKey(f)
              const pend = pendingByPath[pk]
              const hasPend =
                pend &&
                (pend.cameraId != null ||
                  pend.lensId != null ||
                  pend.filmId != null ||
                  pend.authorId != null ||
                  pend.exposureMode === 'custom' ||
                  pend.fNumberMode === 'custom' ||
                  (pend.notesText.trim() !== pend.notesBaseline.trim() && pend.notesText.trim() !== ''))
              return (
                <li
                  key={f}
                  className={`${sel ? 'selected' : ''} ${cur ? 'current' : ''}`}
                  onClick={(e) => onRowClick(i, e)}
                >
                  <span>{base}</span>
                  {hasPend ? <span className="badge">{t('ui.pending')}</span> : null}
                </li>
              )
            })}
          </ul>
        </div>
        <div className="preview-panel">
          {previewDataUrl ? (
            <img src={previewDataUrl} alt={t('ui.previewAlt')} />
          ) : (
            <div className="preview-placeholder">{t('ui.previewPlaceholder')}</div>
          )}
        </div>
        <div className="meta-panel">
          <div className="meta-section">
            <h2>{t('ui.metadataMapping')}</h2>
            {catalogIssues.length > 0 && (
              <p style={{ fontSize: '0.75rem', color: '#b45309' }}>{catalogIssues.join(' ')}</p>
            )}
            <table className="mapping">
              <thead>
                <tr>
                  <th>{t('ui.category')}</th>
                  <th>{t('ui.current')}</th>
                  <th>{t('ui.preset')}</th>
                  <th>{t('ui.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {CATS.map((cat) => {
                  const id = st[idKeyForCategory(cat)] as number | null
                  const name = catalog ? presetNameForId(catalog, cat, id) : 'None'
                  const options =
                    cat === 'Lens'
                      ? lensFilter.allowed
                      : cat === 'Camera'
                        ? catalog?.camera_values
                        : cat === 'Film'
                          ? catalog?.film_values
                          : catalog?.author_values
                  return (
                    <tr key={cat}>
                      <td>{catLabel(cat)}</td>
                      <td>{inferredRow[cat] === 'Multiple' ? t('ui.multiple') : inferredRow[cat]}</td>
                      <td>
                        <select
                          className="input"
                          disabled={!staging.length || !catalog || (cat === 'Lens' && lensFilter.state === 'disabled')}
                          value={internalToDisplay(name)}
                          onChange={(e) => setCategoryPreset(cat, e.target.value)}
                        >
                          {(options ?? ['None']).map((opt) => (
                            <option key={opt} value={internalToDisplay(opt)}>
                              {internalToDisplay(opt)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="actions-row">
                        <button type="button" className="btn" onClick={() => setPresetEditor({ mode: 'new', category: cat })}>
                          {t('ui.new')}
                        </button>
                        <button
                          type="button"
                          className="btn"
                          disabled={!catalog || name === 'None'}
                          onClick={() => setPresetEditor({ mode: 'edit', category: cat })}
                        >
                          {t('ui.edit')}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="meta-section">
            <h2>{t('ui.shutterAndAperture')}</h2>
            <table className="mapping">
              <thead>
                <tr>
                  <th>{t('ui.attribute')}</th>
                  <th>{t('ui.current')}</th>
                  <th>{t('ui.newValue')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{t('ui.shutterSpeed')}</td>
                  <td>{exposureCurrentDisplay}</td>
                  <td>
                    <select
                      className="input"
                      value={st.exposureMode === 'custom' ? setValueDisplay : noneDisplay}
                      onChange={(e) => {
                        const v = e.target.value
                        updatePendingForPaths(staging, (s) => ({
                          ...s,
                          exposureMode: v === setValueDisplay ? 'custom' : 'none',
                          exposureTime: v === setValueDisplay ? s.exposureTime : ''
                        }))
                      }}
                    >
                      <option>{noneDisplay}</option>
                      <option>{setValueDisplay}</option>
                    </select>
                    {st.exposureMode === 'custom' ? (
                      <input
                        className="input"
                        value={st.exposureTime}
                        onChange={(e) =>
                          updatePendingForPaths(staging, (s) => ({ ...s, exposureTime: e.target.value }))
                        }
                      />
                    ) : null}
                  </td>
                </tr>
                <tr>
                  <td>{t('ui.apertureFStop')}</td>
                  <td>{fnCurrentDisplay}</td>
                  <td>
                    <select
                      className="input"
                      value={st.fNumberMode === 'custom' ? setValueDisplay : noneDisplay}
                      onChange={(e) => {
                        const v = e.target.value
                        updatePendingForPaths(staging, (s) => ({
                          ...s,
                          fNumberMode: v === setValueDisplay ? 'custom' : 'none',
                          fNumberText: v === setValueDisplay ? s.fNumberText : ''
                        }))
                      }}
                    >
                      <option>{noneDisplay}</option>
                      <option>{setValueDisplay}</option>
                    </select>
                    {st.fNumberMode === 'custom' ? (
                      <input
                        className="input"
                        value={st.fNumberText}
                        onChange={(e) =>
                          updatePendingForPaths(staging, (s) => ({ ...s, fNumberText: e.target.value }))
                        }
                      />
                    ) : null}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="meta-section">
            <h2>{t('ui.notesImageDescription')}</h2>
            <textarea
              className="notes-area"
              disabled={!staging.length}
              placeholder={t('ui.notesPlaceholder')}
              value={st.notesText}
              onChange={(e) => {
                const nextNotes = clampUtf8ByBytes(e.target.value)
                updatePendingForPaths(staging, (s) => ({ ...s, notesText: nextNotes }))
              }}
            />
          </div>

          <div className="meta-section">
            <h2>{t('ui.previewMergedPayload')}</h2>
            <pre className="preview-json">{JSON.stringify(mergedPreview, null, 2)}</pre>
          </div>

          <div className="meta-section actions-row">
            <button type="button" className="btn btn-primary" onClick={() => void onCommit()}>
              {t('ui.commitChanges')}
            </button>
          </div>
        </div>
      </div>
      <div className="status-bar">{status}</div>
      {presetEditor && catalog && (
        <PresetEditorModal
          mode={presetEditor.mode}
          category={presetEditor.category}
          editId={presetEditor.mode === 'edit' ? editIdForCategory(presetEditor.category) : null}
          onClose={() => setPresetEditor(null)}
          onSaved={() => void reloadCatalog()}
        />
      )}
    </div>
  )
}
