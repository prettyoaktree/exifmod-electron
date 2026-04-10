import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { withCopyrightAsWrittenToExif } from '@shared/copyrightFormat.js'
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
import { ManagePresetsPanel } from './ManagePresetsPanel.js'
import type { Cat } from './categories.js'
import { truncateMiddle } from './format/truncateMiddle.js'

const CATS: Cat[] = ['Camera', 'Lens', 'Film', 'Author']

const CAT_I18N: Record<Cat, 'category.camera' | 'category.lens' | 'category.film' | 'category.author'> = {
  Camera: 'category.camera',
  Lens: 'category.lens',
  Film: 'category.film',
  Author: 'category.author'
}

/** Tab order: Open Folder / folder row / Select All|None controls, then this scrollable list (see Commit ↹ handoff). */
const FILE_LIST_TAB_INDEX = 0

interface PendingState {
  cameraId: number | null
  lensId: number | null
  filmId: number | null
  authorId: number | null
  exposureTime: string
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
    exposureTime: '',
    fNumberText: '',
    notesText: '',
    notesBaseline: ''
  }
}

function pathKey(p: string): string {
  return p
}

function parentDir(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i <= 0 ? p : p.slice(0, i)
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

const META_FIELD_COUNT = 7

export function App(): React.ReactElement {
  const { t } = useTranslation()
  const noneDisplay = t('ui.doNotModify')
  const internalToDisplay = (name: string): string => (name === 'None' ? noneDisplay : name)
  const displayToInternal = (text: string): string => (text === noneDisplay ? 'None' : text)
  const catLabel = (cat: Cat): string => t(CAT_I18N[cat])

  const [preflight, setPreflight] = useState<string[]>([])
  const [catalog, setCatalog] = useState<ConfigCatalog | null>(null)
  const [catalogIssues, setCatalogIssues] = useState<string[]>([])
  const [files, setFiles] = useState<string[]>([])
  /** `null` = user has not chosen a folder yet; non-null = folder session (list may be empty). */
  const [openedFolderPath, setOpenedFolderPath] = useState<string | null>(null)
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const [currentIndex, setCurrentIndex] = useState<number | null>(null)
  const [pendingByPath, setPendingByPath] = useState<Record<string, PendingState>>({})
  const [metadataByPath, setMetadataByPath] = useState<Record<string, Record<string, unknown>>>({})
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('')
  const [presetEditor, setPresetEditor] = useState<{
    mode: 'new' | 'edit'
    category: Cat
    editId: number | null
  } | null>(null)
  const [managePresetsOpen, setManagePresetsOpen] = useState(false)
  const [exifPreviewOpen, setExifPreviewOpen] = useState(false)
  const [exifPreviewBody, setExifPreviewBody] = useState('')
  const [exifPreviewLoading, setExifPreviewLoading] = useState(false)

  const fileListRef = useRef<HTMLUListElement>(null)
  const openFolderPrimaryRef = useRef<HTMLButtonElement>(null)
  const rowRefs = useRef<(HTMLLIElement | null)[]>([])
  const selectionAnchorRef = useRef<number | null>(null)
  const metaFieldRefs = useRef<Array<HTMLElement | null>>(Array.from({ length: META_FIELD_COUNT }, () => null))

  const bindMetaRef = useCallback((index: number) => (el: HTMLElement | null) => {
    metaFieldRefs.current[index] = el
  }, [])

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
        const folder = list.length > 0 ? parentDir(list[0]!) : parentDir(p)
        setOpenedFolderPath(folder)
        setFiles(list)
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

  const buildMergedPayloadForState = useCallback(
    async (st: PendingState): Promise<{ payload: Record<string, unknown> | null; err: string | null }> => {
      const api = window.exifmod
      if (!api) return { payload: null, err: t('ui.preloadUnavailable') }
      try {
        let merged = await api.mergePayloads({
          camera: st.cameraId,
          lens: st.lensId,
          author: st.authorId,
          film: st.filmId
        })
        if (st.exposureTime.trim()) {
          const e = validateExposureTimeForExif(st.exposureTime)
          if (e) return { payload: null, err: e }
          merged = { ...merged, ExposureTime: st.exposureTime.trim() }
        }
        if (st.fNumberText.trim()) {
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
    },
    [t]
  )

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        if (!catalog) {
          if (!cancelled) {
            setExifPreviewBody('')
            setExifPreviewLoading(false)
          }
          return
        }
        setExifPreviewLoading(true)
        const parts: string[] = []
        for (const path of files) {
          if (cancelled) return
          const st = pendingByPath[pathKey(path)]
          if (!st) continue
          const { payload, err } = await buildMergedPayloadForState(st)
          if (cancelled) return
          const previewPayload = withCopyrightAsWrittenToExif(payload)
          if (err || !previewPayload || Object.keys(previewPayload).length === 0) continue
          parts.push(`// ${path}\n${JSON.stringify(previewPayload, null, 2)}`)
        }
        if (!cancelled) {
          setExifPreviewBody(parts.join('\n\n'))
          setExifPreviewLoading(false)
        }
      })()
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [files, pendingByPath, catalog, buildMergedPayloadForState])

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

  const selectAllFiles = useCallback(() => {
    setSelectedIndices(new Set(files.map((_, i) => i)))
    if (files.length) setCurrentIndex(0)
  }, [files])

  const selectNoneFiles = useCallback(() => {
    setSelectedIndices(new Set())
    setCurrentIndex(null)
  }, [])

  useEffect(() => {
    if (!managePresetsOpen) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (presetEditor) {
        setPresetEditor(null)
        return
      }
      setManagePresetsOpen(false)
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [managePresetsOpen, presetEditor])

  useEffect(() => {
    const onDocKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const tgt = e.target as HTMLElement | null
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) return

      const key = e.key.toLowerCase()
      if (key === 'a') {
        if (!openedFolderPath || !files.length) return
        e.preventDefault()
        selectAllFiles()
      } else if (key === 'd') {
        if (!openedFolderPath || !files.length) return
        e.preventDefault()
        selectNoneFiles()
      }
    }
    document.addEventListener('keydown', onDocKeyDown)
    return () => document.removeEventListener('keydown', onDocKeyDown)
  }, [openedFolderPath, files.length, selectAllFiles, selectNoneFiles])

  const onOpenFolder = async () => {
    const api = window.exifmod
    if (!api) return
    const dir = await api.openFolder()
    if (!dir) return
    const list = await api.listImagesInDir(dir)
    setOpenedFolderPath(dir)
    setFiles(list)
    setSelectedIndices(new Set(list.length ? [0] : []))
    setCurrentIndex(list.length ? 0 : null)
    setMetadataByPath({})
    setPendingByPath({})
  }

  const folderTitle = useMemo(() => {
    if (!openedFolderPath) return ''
    const parts = openedFolderPath.split(/[/\\]/)
    return parts[parts.length - 1] || openedFolderPath
  }, [openedFolderPath])

  const onRowClick = (i: number, ev: React.MouseEvent) => {
    if (ev.shiftKey) {
      const anchor = selectionAnchorRef.current ?? currentIndex ?? i
      const lo = Math.min(anchor, i)
      const hi = Math.max(anchor, i)
      const range = new Set<number>()
      for (let j = lo; j <= hi; j++) range.add(j)
      setSelectedIndices(range)
      setCurrentIndex(i)
      return
    }
    if (ev.ctrlKey || ev.metaKey) {
      setSelectedIndices((prev) => {
        const n = new Set(prev)
        if (n.has(i)) n.delete(i)
        else n.add(i)
        return n
      })
      setCurrentIndex(i)
      selectionAnchorRef.current = i
      return
    }
    selectionAnchorRef.current = i
    setCurrentIndex(i)
    setSelectedIndices(new Set([i]))
  }

  const onFileListKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    const n = files.length
    if (!n) return
    e.preventDefault()
    setCurrentIndex((cur) => {
      let next: number
      if (cur == null) {
        next = e.key === 'ArrowDown' ? 0 : n - 1
      } else if (e.key === 'ArrowDown') {
        next = Math.min(cur + 1, n - 1)
      } else {
        next = Math.max(cur - 1, 0)
      }
      requestAnimationFrame(() => {
        rowRefs.current[next]?.scrollIntoView({ block: 'nearest' })
      })
      return next
    })
  }

  const onMetaFieldsKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    const tEl = e.target as Node
    const refs = metaFieldRefs.current
    const idx = refs.findIndex((r) => r && (r === tEl || r.contains(tEl)))
    if (idx < 0) return
    e.preventDefault()
    const next = e.key === 'ArrowDown' ? Math.min(idx + 1, META_FIELD_COUNT - 1) : Math.max(idx - 1, 0)
    refs[next]?.focus()
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
      const { payload, err } = await buildMergedPayloadForState(st)
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
      <header className="app-header">
        <h1>{t('app.title')}</h1>
      </header>
      <div className="app-body">
        <div className="file-panel">
          {openedFolderPath == null ? (
            <div className="file-panel-empty">
              <button
                ref={openFolderPrimaryRef}
                type="button"
                className="btn btn-primary file-panel-open-folder"
                onClick={() => void onOpenFolder()}
              >
                {t('ui.openFolder')}
              </button>
            </div>
          ) : (
            <>
              <div className="file-panel-folder-row">
                <span className="file-panel-folder-name" title={openedFolderPath}>
                  {truncateMiddle(folderTitle, 28)}
                </span>
                <button
                  type="button"
                  className="btn btn-icon"
                  title={t('ui.changeFolder')}
                  aria-label={t('ui.changeFolder')}
                  onClick={() => void onOpenFolder()}
                >
                  …
                </button>
              </div>
              <ul
                ref={fileListRef}
                className="file-list"
                tabIndex={FILE_LIST_TAB_INDEX}
                role="listbox"
                aria-label={t('app.title')}
                onKeyDown={onFileListKeyDown}
              >
                {files.map((f, i) => {
                  const base = f.split(/[/\\]/).pop() ?? f
                  const displayName = truncateMiddle(base, 36)
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
                      pend.exposureTime.trim() !== '' ||
                      pend.fNumberText.trim() !== '' ||
                      (pend.notesText.trim() !== pend.notesBaseline.trim() && pend.notesText.trim() !== ''))
                  return (
                    <li
                      key={f}
                      ref={(el) => {
                        rowRefs.current[i] = el
                      }}
                      className={`file-list-row ${sel ? 'selected' : ''} ${cur ? 'current' : ''}`}
                      role="option"
                      aria-selected={sel}
                      onClick={(e) => onRowClick(i, e)}
                    >
                      <span className="file-list-name" title={base}>
                        {displayName}
                      </span>
                      {hasPend ? <span className="badge">{t('ui.pending')}</span> : null}
                    </li>
                  )
                })}
              </ul>
              <div className="file-panel-actions">
                <button type="button" className="btn" onClick={selectAllFiles} disabled={!files.length}>
                  {t('ui.selectAll')}
                </button>
                <button type="button" className="btn" onClick={selectNoneFiles} disabled={!files.length}>
                  {t('ui.deselectAll')}
                </button>
              </div>
            </>
          )}
        </div>
        <div className="preview-panel" tabIndex={-1}>
          {previewDataUrl ? (
            <img src={previewDataUrl} alt={t('ui.previewAlt')} />
          ) : (
            <div className="preview-placeholder">{t('ui.previewPlaceholder')}</div>
          )}
        </div>
        <div className="meta-panel">
          <div className="meta-section">
            <div className="meta-section-head">
              <h2>{t('ui.metadata')}</h2>
              <button
                type="button"
                className="btn-meta-gear"
                aria-label={t('ui.managePresets')}
                title={t('ui.managePresets')}
                onClick={() => setManagePresetsOpen(true)}
              >
                <svg
                  className="btn-meta-gear-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  aria-hidden
                  focusable="false"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.213-1.281z"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
            {catalogIssues.length > 0 && (
              <p style={{ fontSize: '0.75rem', color: '#b45309' }}>{catalogIssues.join(' ')}</p>
            )}
            <div className="meta-roving-block" onKeyDown={onMetaFieldsKeyDown}>
              <table className="mapping mapping-slim">
                <thead>
                  <tr>
                    <th>{t('ui.attribute')}</th>
                    <th>{t('ui.current')}</th>
                    <th>{t('ui.newValue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {CATS.map((cat, idx) => {
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
                            ref={bindMetaRef(idx)}
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
                      </tr>
                    )
                  })}
                  <tr>
                    <td>{t('ui.shutterSpeed')}</td>
                    <td>{exposureCurrentDisplay}</td>
                    <td>
                      <input
                        ref={bindMetaRef(4)}
                        className="input"
                        placeholder={noneDisplay}
                        disabled={!staging.length}
                        value={st.exposureTime}
                        onChange={(e) =>
                          updatePendingForPaths(staging, (s) => ({ ...s, exposureTime: e.target.value }))
                        }
                      />
                    </td>
                  </tr>
                  <tr>
                    <td>{t('ui.apertureFStop')}</td>
                    <td>{fnCurrentDisplay}</td>
                    <td>
                      <input
                        ref={bindMetaRef(5)}
                        className="input"
                        placeholder={noneDisplay}
                        disabled={!staging.length}
                        value={st.fNumberText}
                        onChange={(e) =>
                          updatePendingForPaths(staging, (s) => ({ ...s, fNumberText: e.target.value }))
                        }
                      />
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="meta-notes-wrap">
                <h2>{t('ui.notesImageDescription')}</h2>
                <textarea
                  ref={bindMetaRef(6)}
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
            </div>
          </div>

          <div className="meta-section exif-preview-section" tabIndex={-1}>
            <button
              type="button"
              className="exif-preview-toggle"
              aria-expanded={exifPreviewOpen}
              onClick={() => setExifPreviewOpen((o) => !o)}
            >
              <span className={`exif-preview-chevron ${exifPreviewOpen ? 'exif-preview-chevron-open' : ''}`} aria-hidden>
                <svg viewBox="0 0 10 10" width="10" height="10" focusable="false">
                  <path
                    d="M2 3.5L5 6.5L8 3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              {t('ui.previewExifChanges')}
            </button>
            {exifPreviewOpen ? (
              <pre className="preview-json exif-preview-pre">
                {exifPreviewLoading ? t('ui.previewExifLoading') : exifPreviewBody || '—'}
              </pre>
            ) : null}
          </div>

          <div className="meta-section meta-section-commit">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void onCommit()}
              onKeyDown={(e) => {
                if (e.key === 'Tab' && !e.shiftKey) {
                  e.preventDefault()
                  if (openedFolderPath != null) fileListRef.current?.focus()
                  else openFolderPrimaryRef.current?.focus()
                }
              }}
            >
              {t('ui.commitChanges')}
            </button>
          </div>
        </div>
      </div>
      <div className="status-bar">{status}</div>
      {managePresetsOpen && catalog && (
        <ManagePresetsPanel
          catalog={catalog}
          onClose={() => setManagePresetsOpen(false)}
          onAdd={(cat) => {
            setPresetEditor({ mode: 'new', category: cat, editId: null })
          }}
          onEdit={(cat, editId) => {
            setPresetEditor({ mode: 'edit', category: cat, editId })
          }}
        />
      )}
      {presetEditor && catalog && (
        <PresetEditorModal
          mode={presetEditor.mode}
          category={presetEditor.category}
          editId={presetEditor.mode === 'edit' ? presetEditor.editId : null}
          onClose={() => setPresetEditor(null)}
          onSaved={() => void reloadCatalog()}
        />
      )}
    </div>
  )
}
