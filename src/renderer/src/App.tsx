import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { anyStagedClear, mergeRemoveTriState, type RemoveTriState } from './metaRemoveTriState.js'
import { useTranslation } from 'react-i18next'
import { withCopyrightAsWrittenToExif } from '@shared/copyrightFormat.js'
import { applyCategoryClears } from '@shared/exifClearTags.js'
import {
  formatKeywordsField,
  mergeKeywordsDeduped,
  parseKeywordsField,
  stripFilmIdentityFromKeywords
} from '@shared/filmKeywords.js'
import {
  fitKeywordsForExif,
  mergeImageDescriptionAppend,
  remainingUtf8BytesForAiDescription
} from '@shared/exifLimits.js'
import { isOllamaTransportFailureError } from '@shared/ollamaNetErrors.js'
import { OLLAMA_ERROR_EMPTY_SOFT } from '@shared/ollamaResultCodes.js'
import type { CameraMetadata, ConfigCatalog } from '@shared/types.js'
import { filterLensValues } from '@shared/lensFilter.js'
import {
  formatExposureTimeForUi,
  formatFnumberForUi,
  inferCategoryValues,
  exposureTimeRawFromMetadata,
  fnumberRawFromMetadata,
  imageDescriptionFromMetadata,
  keywordsFieldFromMetadata
} from './exif/infer.js'
import {
  diffToAttributeHighlights,
  diffWritePayloadFromMetadata,
  emptyDiffAttributeHighlights,
  mergeDiffAttributeHighlights
} from './exif/payloadDiff.js'
import {
  clampUtf8ByBytes,
  validateExposureTimeForExif,
  validateFnumberForExif,
  validateImageDescriptionForExif
} from './exif/validate.js'
import { MetadataPresetCombo } from './MetadataPresetCombo.js'
import { PresetEditorModal } from './PresetEditor.js'
import { ManagePresetsPanel } from './ManagePresetsPanel.js'
import { TutorialModal } from './TutorialModal.js'
import type { Cat } from './categories.js'
import { truncateMiddle } from './format/truncateMiddle.js'

const CATS: Cat[] = ['Camera', 'Lens', 'Film', 'Author']

const CAT_I18N: Record<Cat, 'category.camera' | 'category.lens' | 'category.film' | 'category.author'> = {
  Camera: 'category.camera',
  Lens: 'category.lens',
  Film: 'category.film',
  Author: 'category.author'
}

/** Main window tab order is only: file list → metadata fields (one roving group) → Clear pending → Write pending (see tab handlers). */
const MAIN_TAB_INDEX = 0

interface PendingState {
  cameraId: number | null
  lensId: number | null
  filmId: number | null
  authorId: number | null
  exposureTime: string
  fNumberText: string
  notesText: string
  notesBaseline: string
  keywordsText: string
  keywordsBaseline: string
  clearCamera: boolean
  clearLens: boolean
  clearFilm: boolean
  clearAuthor: boolean
  clearShutter: boolean
  clearAperture: boolean
  clearNotes: boolean
  clearKeywords: boolean
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
    notesBaseline: '',
    keywordsText: '',
    keywordsBaseline: '',
    clearCamera: false,
    clearLens: false,
    clearFilm: false,
    clearAuthor: false,
    clearShutter: false,
    clearAperture: false,
    clearNotes: false,
    clearKeywords: false
  }
}

function keywordsFromMergedPayloadField(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
  if (typeof v === 'string') return v.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
  return []
}

function pathKey(p: string): string {
  return p
}

function fileBaseName(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i < 0 ? p : p.slice(i + 1)
}

function parentDir(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i <= 0 ? p : p.slice(0, i)
}

/** Compare paths for matching an opened file to listImagesInDir entries (macOS may vary separators). */
function pathsEqualForList(a: string, b: string): boolean {
  return a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase()
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

function cameraMetaForPending(catalog: ConfigCatalog | null, cameraId: number | null): CameraMetadata | null {
  if (!catalog || cameraId == null) return null
  const name = presetNameForId(catalog, 'Camera', cameraId)
  if (name === 'None') return null
  return catalog.camera_metadata_map[name] ?? null
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

function categoryToClearKey(cat: Cat): 'clearCamera' | 'clearLens' | 'clearFilm' | 'clearAuthor' {
  return cat === 'Camera' ? 'clearCamera' : cat === 'Lens' ? 'clearLens' : cat === 'Film' ? 'clearFilm' : 'clearAuthor'
}

/** Values shown in New Value controls: when multiple files are staged, only show a pending value if it is identical on every staged file. */
function mergePendingStateForNewValueUi(
  paths: string[],
  pendingByPath: Record<string, PendingState>
): PendingState {
  if (paths.length === 0) return emptyPending()
  if (paths.length === 1) {
    return pendingByPath[pathKey(paths[0]!)] ?? emptyPending()
  }
  const states = paths.map((p) => pendingByPath[pathKey(p)] ?? emptyPending())
  const mergeId = (key: 'cameraId' | 'lensId' | 'filmId' | 'authorId'): number | null => {
    const vals = states.map((s) => s[key])
    return new Set(vals).size === 1 ? vals[0]! : null
  }
  const expTrim = states.map((s) => s.exposureTime.trim())
  const expSame = new Set(expTrim).size === 1
  const fnTrim = states.map((s) => s.fNumberText.trim())
  const fnSame = new Set(fnTrim).size === 1
  const notesVals = states.map((s) => s.notesText)
  const notesSame = new Set(notesVals).size === 1
  const baselineVals = states.map((s) => s.notesBaseline)
  const baselineSame = new Set(baselineVals).size === 1
  const kwVals = states.map((s) => s.keywordsText)
  const kwSame = new Set(kwVals).size === 1
  const kwBaselineVals = states.map((s) => s.keywordsBaseline)
  const kwBaselineSame = new Set(kwBaselineVals).size === 1
  const mergeBool = (key: keyof Pick<PendingState, 'clearCamera' | 'clearLens' | 'clearFilm' | 'clearAuthor' | 'clearShutter' | 'clearAperture' | 'clearNotes' | 'clearKeywords'>): boolean => {
    const vals = states.map((s) => s[key])
    return new Set(vals).size === 1 ? Boolean(vals[0]) : false
  }
  return {
    cameraId: mergeId('cameraId'),
    lensId: mergeId('lensId'),
    filmId: mergeId('filmId'),
    authorId: mergeId('authorId'),
    exposureTime: expSame ? states[0]!.exposureTime : '',
    fNumberText: fnSame ? states[0]!.fNumberText : '',
    notesText: notesSame ? states[0]!.notesText : '',
    notesBaseline: baselineSame ? states[0]!.notesBaseline : '',
    keywordsText: kwSame ? states[0]!.keywordsText : '',
    keywordsBaseline: kwBaselineSame ? states[0]!.keywordsBaseline : '',
    clearCamera: mergeBool('clearCamera'),
    clearLens: mergeBool('clearLens'),
    clearFilm: mergeBool('clearFilm'),
    clearAuthor: mergeBool('clearAuthor'),
    clearShutter: mergeBool('clearShutter'),
    clearAperture: mergeBool('clearAperture'),
    clearNotes: mergeBool('clearNotes'),
    clearKeywords: mergeBool('clearKeywords')
  }
}

type StagedTextUniformity = 'empty' | 'uniform' | 'mixed'

type AiDescribeBusy = null | { mode: 'single' } | { mode: 'batch'; current: number; total: number }

type OllamaSession =
  | 'checking'
  | 'server_down'
  | 'launching'
  | 'ready'
  | 'declined'
  | 'failed'
  | 'no_install'

function classifyStagedTextField(
  paths: string[],
  pendingByPath: Record<string, PendingState>,
  field: 'notesText' | 'keywordsText'
): StagedTextUniformity {
  if (paths.length < 2) return 'uniform'
  const vals = paths.map((p) => (pendingByPath[pathKey(p)] ?? emptyPending())[field].trim())
  if (vals.every((v) => v === '')) return 'empty'
  if (new Set(vals).size === 1) return 'uniform'
  return 'mixed'
}

/** Notes New empty (Do Not Modify): use on-file description for AI room and append base. */
function effectiveDescriptionForAiRoom(st: PendingState, fileMeta: Record<string, unknown>): string {
  const t = st.notesText.trim()
  if (t) return t
  const fromMeta = imageDescriptionFromMetadata(fileMeta).trim()
  if (fromMeta) return fromMeta
  return st.notesBaseline.trim()
}

function MetaRemoveCheckbox(props: {
  tri: RemoveTriState
  disabled: boolean
  title: string
  ariaLabel: string
  ariaLabelMixed: string
  onCheckedChange: (checked: boolean) => void
}): ReactElement {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.indeterminate = props.tri === 'mixed'
  }, [props.tri])
  return (
    <input
      ref={ref}
      type="checkbox"
      className="meta-remove-checkbox"
      tabIndex={-1}
      checked={props.tri === 'allOn'}
      disabled={props.disabled}
      title={props.title}
      aria-label={props.tri === 'mixed' ? props.ariaLabelMixed : props.ariaLabel}
      onChange={(e) => props.onCheckedChange(e.target.checked)}
    />
  )
}

const META_FIELD_COUNT = 8

const FILES_PANE_WIDTH_MIN_PCT = 12
const FILES_PANE_WIDTH_MAX_PCT = 88
const FILE_LIST_AREA_MIN_PCT = 18
const FILE_LIST_AREA_MAX_PCT = 82

export function App(): React.ReactElement {
  const { t } = useTranslation()
  const noneDisplay = t('ui.doNotModify')
  const emptyCurrentDisplay = t('ui.currentValueEmpty')
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
  const [commitModal, setCommitModal] = useState<
    null | { phase: 'writing'; current: number; total: number; fileBase: string } | { phase: 'done'; ok: number; total: number }
  >(null)
  const [presetEditor, setPresetEditor] = useState<{
    mode: 'new' | 'edit'
    category: Cat
    editId: number | null
  } | null>(null)
  const [managePresetsOpen, setManagePresetsOpen] = useState(false)
  const [exifPreviewOpen, setExifPreviewOpen] = useState(false)
  const [exifPreviewBody, setExifPreviewBody] = useState('')
  const [exifPreviewLoading, setExifPreviewLoading] = useState(false)
  /** True when at least one file would change on write vs last read (matches EXIF preview / Write). */
  const [hasPendingToWrite, setHasPendingToWrite] = useState(false)
  /** Per pathKey: tags that would change (same diff as preview); drives row highlights and file-list badge. */
  const [writeDiffByPath, setWriteDiffByPath] = useState<Record<string, Record<string, unknown>>>({})
  const [writeConfirmTodo, setWriteConfirmTodo] = useState<
    { path: string; payload: Record<string, unknown> }[] | null
  >(null)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [aiDescribeBusy, setAiDescribeBusy] = useState<AiDescribeBusy>(null)
  const [ollamaSession, setOllamaSession] = useState<OllamaSession>('checking')
  /** Shown next to the inline Start control when `ollamaTryStartServer` fails (user can retry). */
  const [ollamaStartError, setOllamaStartError] = useState<string | null>(null)
  /** When `server_down`, drawer next to AI: expanded vs collapsed strip (Not now collapses; user can expand again). */
  const [ollamaCtaCollapsed, setOllamaCtaCollapsed] = useState(false)
  const prevOllamaSessionForDrawerRef = useRef<OllamaSession | null>(null)
  const [aiBatchConfirmPaths, setAiBatchConfirmPaths] = useState<string[] | null>(null)
  const [aiBatchErrorsDialog, setAiBatchErrorsDialog] = useState<null | {
    failures: { path: string; message: string }[]
    total: number
  }>(null)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [tutorialFirstRun, setTutorialFirstRun] = useState(false)
  /** Horizontal split: files pane width as % of main content area (default 30%). */
  const [filesPaneWidthPct, setFilesPaneWidthPct] = useState(30)
  /** Vertical split within files pane: file list + actions region height % (default 60%). */
  const [fileListAreaPct, setFileListAreaPct] = useState(60)

  const appBodyRef = useRef<HTMLDivElement>(null)
  const filesPaneStackRef = useRef<HTMLDivElement>(null)
  const fileListRef = useRef<HTMLUListElement>(null)
  const clearPendingButtonRef = useRef<HTMLButtonElement>(null)
  const commitButtonRef = useRef<HTMLButtonElement>(null)
  const metaRovingBlockRef = useRef<HTMLDivElement>(null)
  const openFolderPrimaryRef = useRef<HTMLButtonElement>(null)
  const rowRefs = useRef<(HTMLLIElement | null)[]>([])
  const selectionAnchorRef = useRef<number | null>(null)
  const metaFieldRefs = useRef<Array<HTMLElement | null>>(Array.from({ length: META_FIELD_COUNT }, () => null))
  const pendingByPathRef = useRef(pendingByPath)
  pendingByPathRef.current = pendingByPath

  const bindMetaRef = useCallback((index: number) => (el: HTMLElement | null) => {
    metaFieldRefs.current[index] = el
  }, [])

  const focusFirstEnabledMetaField = useCallback((): boolean => {
    for (let i = 0; i < META_FIELD_COUNT; i++) {
      const el = metaFieldRefs.current[i] as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
      if (el && !el.disabled) {
        el.focus()
        return true
      }
    }
    return false
  }, [])

  const onMetaRovingBlockFocus = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return
      void focusFirstEnabledMetaField()
    },
    [focusFirstEnabledMetaField]
  )

  const onMetaFieldTabKeyDown = useCallback((fieldIndex: number) => (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Tab') return
    e.preventDefault()
    const refs = metaFieldRefs.current
    const nextEnabled = (from: number, delta: 1 | -1): void => {
      let i = from + delta
      while (i >= 0 && i < META_FIELD_COUNT) {
        const el = refs[i] as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
        if (el && !el.disabled) {
          el.focus()
          return
        }
        i += delta
      }
    }
    if (e.shiftKey) {
      if (fieldIndex === 0) {
        if (fileListRef.current) fileListRef.current.focus()
        else if (hasPendingToWrite) commitButtonRef.current?.focus()
        else metaRovingBlockRef.current?.focus()
      } else {
        nextEnabled(fieldIndex, -1)
      }
    } else {
      if (fieldIndex < META_FIELD_COUNT - 1) {
        nextEnabled(fieldIndex, 1)
      } else if (hasPendingToWrite) {
        clearPendingButtonRef.current?.focus()
      } else {
        fileListRef.current?.focus()
      }
    }
  }, [hasPendingToWrite])

  const onPaneResizeHorizontalStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const move = (ev: MouseEvent) => {
      const r = appBodyRef.current?.getBoundingClientRect()
      if (!r) return
      let pct = ((ev.clientX - r.left) / r.width) * 100
      pct = Math.min(FILES_PANE_WIDTH_MAX_PCT, Math.max(FILES_PANE_WIDTH_MIN_PCT, pct))
      setFilesPaneWidthPct(pct)
    }
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }, [])

  const onPaneResizeVerticalStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const move = (ev: MouseEvent) => {
      const r = filesPaneStackRef.current?.getBoundingClientRect()
      if (!r) return
      let pct = ((ev.clientY - r.top) / r.height) * 100
      pct = Math.min(FILE_LIST_AREA_MAX_PCT, Math.max(FILE_LIST_AREA_MIN_PCT, pct))
      setFileListAreaPct(pct)
    }
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
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
    if (!api?.ollamaStartupFlow) {
      setOllamaSession('failed')
      return
    }
    void api
      .ollamaStartupFlow()
      .then((r) => {
        if (r.status === 'ready') setOllamaSession('ready')
        else if (r.status === 'server_down') setOllamaSession('server_down')
        else if (r.status === 'no_cli') setOllamaSession('no_install')
        else setOllamaSession('failed')
      })
      .catch(() => setOllamaSession('failed'))
  }, [])

  useEffect(() => {
    const api = window.exifmod
    if (!api?.onOllamaLaunching) return
    return api.onOllamaLaunching(() => setOllamaSession('launching'))
  }, [])

  useEffect(() => {
    const prev = prevOllamaSessionForDrawerRef.current
    prevOllamaSessionForDrawerRef.current = ollamaSession
    if (ollamaSession === 'server_down' && prev !== 'server_down') {
      setOllamaCtaCollapsed(false)
    }
  }, [ollamaSession])

  useEffect(() => {
    const api = window.exifmod
    if (!api) return
    return api.onPresetsImported(() => void reloadCatalog())
  }, [reloadCatalog])

  const closeTutorial = useCallback(() => {
    setTutorialOpen(false)
    void window.exifmod?.markTutorialOnboardingSeen?.()
  }, [])

  useEffect(() => {
    const api = window.exifmod
    if (!api?.onTutorialStart) return
    return api.onTutorialStart((payload) => {
      setTutorialFirstRun(Boolean(payload?.firstRun))
      setTutorialOpen(true)
    })
  }, [])

  useEffect(() => {
    const api = window.exifmod
    if (!api) return
    return api.onStartupPath((p) => {
      void (async () => {
        let list: string[]
        let selectIndex = 0

        if (await api.isFile(p)) {
          const folder = parentDir(p)
          list = await api.listImagesInDir(folder)
          const idx = list.findIndex((f) => pathsEqualForList(f, p))
          selectIndex = idx >= 0 ? idx : 0
        } else {
          list = await api.resolveImageList(p)
          selectIndex = 0
        }

        const folder = list.length > 0 ? parentDir(list[0]!) : parentDir(p)
        setOpenedFolderPath(folder)
        setFiles(list)
        setSelectedIndices(list.length ? new Set([selectIndex]) : new Set())
        setCurrentIndex(list.length ? selectIndex : null)
        setMetadataByPath({})
        setPendingByPath({})
        setWriteDiffByPath({})
      })()
    })
  }, [])

  /** When a folder session starts, focus the file list so arrows / Space work without tabbing. */
  useEffect(() => {
    if (openedFolderPath == null) return
    const id = window.setTimeout(() => fileListRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [openedFolderPath])

  const stagingPaths = useMemo(
    () => getStagingPaths(files, selectedIndices, currentIndex),
    [files, selectedIndices, currentIndex]
  )

  const pendingAttributeHighlights = useMemo(() => {
    let acc = emptyDiffAttributeHighlights()
    for (const path of stagingPaths) {
      const diff = writeDiffByPath[pathKey(path)]
      if (!diff || Object.keys(diff).length === 0) continue
      acc = mergeDiffAttributeHighlights(acc, diffToAttributeHighlights(diff))
    }
    return acc
  }, [stagingPaths, writeDiffByPath])

  const formPending = useMemo(
    () => mergePendingStateForNewValueUi(stagingPaths, pendingByPath),
    [stagingPaths, pendingByPath]
  )

  type ClearKey = keyof Pick<
    PendingState,
    | 'clearCamera'
    | 'clearLens'
    | 'clearFilm'
    | 'clearAuthor'
    | 'clearShutter'
    | 'clearAperture'
    | 'clearNotes'
    | 'clearKeywords'
  >

  const removeTri = useMemo(
    () => ({
      clearCamera: mergeRemoveTriState(stagingPaths, (p) => Boolean((pendingByPath[pathKey(p)] ?? emptyPending()).clearCamera)),
      clearLens: mergeRemoveTriState(stagingPaths, (p) => Boolean((pendingByPath[pathKey(p)] ?? emptyPending()).clearLens)),
      clearFilm: mergeRemoveTriState(stagingPaths, (p) => Boolean((pendingByPath[pathKey(p)] ?? emptyPending()).clearFilm)),
      clearAuthor: mergeRemoveTriState(stagingPaths, (p) => Boolean((pendingByPath[pathKey(p)] ?? emptyPending()).clearAuthor)),
      clearShutter: mergeRemoveTriState(stagingPaths, (p) => Boolean((pendingByPath[pathKey(p)] ?? emptyPending()).clearShutter)),
      clearAperture: mergeRemoveTriState(stagingPaths, (p) => Boolean((pendingByPath[pathKey(p)] ?? emptyPending()).clearAperture)),
      clearNotes: mergeRemoveTriState(stagingPaths, (p) => Boolean((pendingByPath[pathKey(p)] ?? emptyPending()).clearNotes)),
      clearKeywords: mergeRemoveTriState(stagingPaths, (p) => Boolean((pendingByPath[pathKey(p)] ?? emptyPending()).clearKeywords))
    }),
    [stagingPaths, pendingByPath]
  )

  const anyClearFlags = useMemo(
    () => ({
      clearCamera: anyStagedClear(stagingPaths, (p) => Boolean((pendingByPath[pathKey(p)] ?? emptyPending()).clearCamera)),
      clearLens: anyStagedClear(stagingPaths, (p) => Boolean((pendingByPath[pathKey(p)] ?? emptyPending()).clearLens)),
      clearFilm: anyStagedClear(stagingPaths, (p) => Boolean((pendingByPath[pathKey(p)] ?? emptyPending()).clearFilm)),
      clearAuthor: anyStagedClear(stagingPaths, (p) => Boolean((pendingByPath[pathKey(p)] ?? emptyPending()).clearAuthor)),
      clearShutter: anyStagedClear(stagingPaths, (p) => Boolean((pendingByPath[pathKey(p)] ?? emptyPending()).clearShutter)),
      clearAperture: anyStagedClear(stagingPaths, (p) => Boolean((pendingByPath[pathKey(p)] ?? emptyPending()).clearAperture)),
      clearNotes: anyStagedClear(stagingPaths, (p) => Boolean((pendingByPath[pathKey(p)] ?? emptyPending()).clearNotes)),
      clearKeywords: anyStagedClear(stagingPaths, (p) => Boolean((pendingByPath[pathKey(p)] ?? emptyPending()).clearKeywords))
    }),
    [stagingPaths, pendingByPath]
  )

  const stagingKey = stagingPaths.join('\0')

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
          const desc = imageDescriptionFromMetadata(md)
          const kw = keywordsFieldFromMetadata(md)
          next[k] = { ...row, notesBaseline: desc, keywordsBaseline: kw }
        }
        return next
      })
    })()
    return () => {
      cancelled = true
    }
  }, [stagingKey])

  useEffect(() => {
    if (selectedIndices.size > 1) {
      setPreviewDataUrl(null)
      return
    }
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
  }, [currentIndex, files, stagingPaths, selectedIndices])

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
        const camMeta = cameraMetaForPending(catalog, st.cameraId)
        const lockShutter = Boolean(camMeta?.locks_shutter)
        const lockAperture = Boolean(camMeta?.locks_aperture)
        if (!lockShutter && !st.clearShutter && st.exposureTime.trim()) {
          const e = validateExposureTimeForExif(st.exposureTime)
          if (e) return { payload: null, err: e }
          merged = { ...merged, ExposureTime: st.exposureTime.trim() }
        }
        if (!lockAperture && !st.clearAperture && st.fNumberText.trim()) {
          const e = validateFnumberForExif(st.fNumberText)
          if (e) return { payload: null, err: e }
          merged = { ...merged, FNumber: Number(st.fNumberText.trim()) }
        }
        if (st.clearNotes) {
          merged = { ...merged, ImageDescription: '' }
        } else if (st.notesText.trim()) {
          const e = validateImageDescriptionForExif(st.notesText)
          if (e) return { payload: null, err: e }
          merged = { ...merged, ImageDescription: st.notesText.trim() }
        }
        if (st.clearFilm) {
          merged = { ...merged, ISO: '' }
        }
        if (st.clearKeywords) {
          merged = { ...merged, Keywords: '' }
        } else {
          const presetKw = keywordsFromMergedPayloadField(merged['Keywords'])
          const uiKw = parseKeywordsField(st.keywordsText)
          let kwCombined = mergeKeywordsDeduped(presetKw, uiKw)
          if (st.clearFilm) {
            kwCombined = stripFilmIdentityFromKeywords(kwCombined)
          }
          const finalKw = fitKeywordsForExif(kwCombined)
          if (finalKw.length > 0) {
            merged = { ...merged, Keywords: finalKw }
          } else {
            const { Keywords: _drop, ...rest } = merged
            merged = rest
            if (st.clearFilm) {
              merged = { ...merged, Keywords: '' }
            }
          }
        }
        merged = applyCategoryClears(merged, {
          clearCamera: st.clearCamera,
          clearLens: st.clearLens,
          clearAuthor: st.clearAuthor,
          clearShutter: st.clearShutter && !lockShutter,
          clearAperture: st.clearAperture && !lockAperture
        })
        if (Object.keys(merged).length === 0) return { payload: null, err: null }
        return { payload: merged, err: null }
      } catch (e) {
        return { payload: null, err: String(e) }
      }
    },
    [t, catalog]
  )

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        if (!catalog) {
          if (!cancelled) {
            setExifPreviewBody('')
            setExifPreviewLoading(false)
            setHasPendingToWrite(false)
            setWriteDiffByPath({})
          }
          return
        }
        setExifPreviewLoading(true)
        const parts: string[] = []
        const nextDiff: Record<string, Record<string, unknown>> = {}
        let anyWouldChange = false
        for (const path of files) {
          if (cancelled) return
          const st = pendingByPath[pathKey(path)]
          if (!st) continue
          const pk = pathKey(path)
          const { payload, err } = await buildMergedPayloadForState(st)
          if (cancelled) return
          const previewPayload = withCopyrightAsWrittenToExif(payload)
          if (err || !previewPayload || Object.keys(previewPayload).length === 0) {
            nextDiff[pk] = {}
            continue
          }
          const meta = metadataByPath[pk] ?? {}
          const diff = diffWritePayloadFromMetadata(previewPayload, meta)
          nextDiff[pk] = diff
          if (Object.keys(diff).length > 0) {
            anyWouldChange = true
            parts.push(`// ${path}\n${JSON.stringify(diff, null, 2)}`)
          }
        }
        if (!cancelled) {
          setExifPreviewBody(parts.join('\n\n'))
          setExifPreviewLoading(false)
          setHasPendingToWrite(anyWouldChange)
          setWriteDiffByPath(nextDiff)
        }
      })()
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [files, pendingByPath, metadataByPath, catalog, buildMergedPayloadForState])

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
    const camName = presetNameForId(catalog, 'Camera', formPending.cameraId)
    const camId = catalog.camera_file_map[camName]
    return filterLensValues(
      catalog.lens_values,
      camName,
      camId ?? null,
      catalog.camera_metadata_map,
      catalog.lens_metadata_map
    )
  }, [catalog, formPending])

  const cameraMetaForForm = useMemo(
    () => cameraMetaForPending(catalog, formPending.cameraId),
    [catalog, formPending.cameraId]
  )
  const shutterLocked = Boolean(cameraMetaForForm?.locks_shutter)
  const apertureLocked = Boolean(cameraMetaForForm?.locks_aperture)
  const shutterNewDisplay =
    shutterLocked && cameraMetaForForm?.fixed_shutter_display != null
      ? cameraMetaForForm.fixed_shutter_display
      : formPending.exposureTime
  const apertureNewDisplay =
    apertureLocked && cameraMetaForForm?.fixed_aperture_display != null
      ? cameraMetaForForm.fixed_aperture_display
      : formPending.fNumberText

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
    if (!commitModal || commitModal.phase !== 'done') return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setCommitModal(null)
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [commitModal])

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
    setSelectedIndices(new Set())
    setCurrentIndex(list.length ? 0 : null)
    setMetadataByPath({})
    setPendingByPath({})
    setWriteDiffByPath({})
  }

  const folderTitle = useMemo(() => {
    if (!openedFolderPath) return ''
    const parts = openedFolderPath.split(/[/\\]/)
    return parts[parts.length - 1] || openedFolderPath
  }, [openedFolderPath])

  const shortcutModifier = useMemo((): '⌘' | 'Ctrl' => {
    if (typeof navigator === 'undefined') return 'Ctrl'
    const p = navigator.platform ?? ''
    const ua = navigator.userAgent ?? ''
    if (/Mac|iPhone|iPod|iPad/.test(p)) return '⌘'
    if (/\bMac OS X\b/.test(ua) || /\bMacintosh\b/.test(ua)) return '⌘'
    return 'Ctrl'
  }, [])

  const fileListShortcutHint = shortcutModifier === '⌘' ? '\u2318 1' : 'Ctrl+1'
  const metadataShortcutHint = shortcutModifier === '⌘' ? '\u2318 2' : 'Ctrl+2'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.altKey || e.shiftKey) return
      if (e.key !== '1' && e.key !== '2') return
      e.preventDefault()
      e.stopPropagation()
      if (e.key === '1') fileListRef.current?.focus()
      else metaRovingBlockRef.current?.focus()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

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
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault()
      const n = files.length
      if (!n) return
      const i = currentIndex != null ? currentIndex : 0
      setSelectedIndices((prev) => {
        const next = new Set(prev)
        if (next.has(i)) next.delete(i)
        else next.add(i)
        return next
      })
      setCurrentIndex(i)
      selectionAnchorRef.current = i
      return
    }
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
    const clearKey =
      cat === 'Camera'
        ? 'clearCamera'
        : cat === 'Lens'
          ? 'clearLens'
          : cat === 'Film'
            ? 'clearFilm'
            : 'clearAuthor'
    updatePendingForPaths(stagingPaths, (s) => ({ ...s, [key]: id, [clearKey]: false }))
  }

  const setClearFlag = useCallback(
    (key: ClearKey, checked: boolean) => {
      updatePendingForPaths(stagingPaths, (s) => {
        const n = { ...s, [key]: checked }
        if (!checked) return n
        if (key === 'clearShutter') return { ...n, exposureTime: '' }
        if (key === 'clearAperture') return { ...n, fNumberText: '' }
        if (key === 'clearNotes') return { ...n, notesText: '' }
        if (key === 'clearKeywords') return { ...n, keywordsText: '' }
        return n
      })
    },
    [stagingPaths, updatePendingForPaths]
  )

  const runWritePending = useCallback(
    async (todo: { path: string; payload: Record<string, unknown> }[]) => {
      setWriteConfirmTodo(null)
      const api = window.exifmod
      if (!api) {
        alert(t('ui.preloadUnavailable'))
        return
      }
      const total = todo.length
      const successfulPaths: string[] = []
      let ok = 0
      for (let i = 0; i < todo.length; i++) {
        const { path, payload } = todo[i]!
        const fileBase = path.split(/[/\\]/).pop() ?? path
        setCommitModal({ phase: 'writing', current: i + 1, total, fileBase })
        try {
          await api.applyExif(path, payload)
          ok++
          successfulPaths.push(path)
        } catch (e) {
          alert(
            t('ui.applyError', {
              path,
              message: e instanceof Error ? e.message : String(e)
            })
          )
        }
      }
      if (successfulPaths.length > 0) {
        const metaUpdates: Record<string, Record<string, unknown>> = {}
        for (const path of successfulPaths) {
          try {
            metaUpdates[path] = await api.readMetadata(path)
          } catch {
            metaUpdates[path] = {}
          }
        }
        setMetadataByPath((prev) => ({ ...prev, ...metaUpdates }))
        setPendingByPath((prev) => {
          const next = { ...prev }
          for (const path of successfulPaths) {
            const md = metaUpdates[path] ?? {}
            const desc = imageDescriptionFromMetadata(md)
            const kw = keywordsFieldFromMetadata(md)
            next[pathKey(path)] = {
              ...emptyPending(),
              notesBaseline: desc,
              keywordsBaseline: kw
            }
          }
          return next
        })
      }
      setCommitModal({ phase: 'done', ok, total })
    },
    [t]
  )

  const openWriteConfirm = useCallback(async () => {
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
      if (!payload || Object.keys(payload).length === 0) continue
      const previewPayload = withCopyrightAsWrittenToExif(payload)
      const meta = metadataByPath[pathKey(path)] ?? {}
      if (Object.keys(diffWritePayloadFromMetadata(previewPayload, meta)).length === 0) continue
      todo.push({ path, payload })
    }
    if (!todo.length) {
      alert(t('ui.noStagedChanges'))
      return
    }
    setWriteConfirmTodo(todo)
  }, [files, pendingByPath, metadataByPath, buildMergedPayloadForState, t])

  const onClearPending = useCallback(() => {
    setPendingByPath((prev) => {
      const next = { ...prev }
      for (const path of files) {
        const k = pathKey(path)
        const md = metadataByPath[k] ?? {}
        const desc = imageDescriptionFromMetadata(md)
        const kw = keywordsFieldFromMetadata(md)
        next[k] = { ...emptyPending(), notesBaseline: desc, keywordsBaseline: kw }
      }
      return next
    })
  }, [files, metadataByPath])

  /** After describe `fetch failed`, re-check availability (uncached) and show drawer or no-install state. */
  const handleOllamaDescribeTransportFailure = useCallback(async (): Promise<boolean> => {
    const api = window.exifmod
    if (!api?.ollamaCheckAvailability) return false
    const ar = await api.ollamaCheckAvailability()
    if (ar.status === 'server_down') {
      setOllamaSession('server_down')
      setOllamaCtaCollapsed(false)
      setOllamaStartError(null)
      return true
    }
    if (ar.status === 'no_cli') {
      setOllamaSession('no_install')
      return true
    }
    return false
  }, [])

  const applyOllamaResultToPending = useCallback(
    (path: string, r: { description: string; keywords: string[] }) => {
      updatePendingForPaths([path], (s) => {
        let notesText = s.notesText
        if (r.description.trim()) {
          const base = s.notesText.trim() ? s.notesText : s.notesBaseline
          notesText = mergeImageDescriptionAppend(base, r.description)
        }
        const mergedKw = fitKeywordsForExif(mergeKeywordsDeduped(parseKeywordsField(s.keywordsText), r.keywords))
        return {
          ...s,
          notesText,
          keywordsText: formatKeywordsField(mergedKw),
          clearNotes: false,
          clearKeywords: false,
          clearFilm: false
        }
      })
    },
    [updatePendingForPaths]
  )

  const runAiDescribeSingle = useCallback(async () => {
    if (stagingPaths.length !== 1) return
    const api = window.exifmod
    if (!api?.ollamaDescribeImage) {
      alert(t('ui.preloadUnavailable'))
      return
    }
    const path = stagingPaths[0]!
    const st = pendingByPath[pathKey(path)]
    const md = metadataByPath[pathKey(path)] ?? {}
    const maxDescriptionUtf8Bytes = st ? remainingUtf8BytesForAiDescription(effectiveDescriptionForAiRoom(st, md)) : 0
    if (maxDescriptionUtf8Bytes <= 0) {
      alert(t('ui.aiDescribeNoRoom'))
      return
    }
    setAiDescribeBusy({ mode: 'single' })
    try {
      const r = await api.ollamaDescribeImage(path, { maxDescriptionUtf8Bytes })
      if (!r.ok) {
        if (r.error !== OLLAMA_ERROR_EMPTY_SOFT && isOllamaTransportFailureError(r.error)) {
          const handled = await handleOllamaDescribeTransportFailure()
          if (handled) return
        }
        const message =
          r.error === OLLAMA_ERROR_EMPTY_SOFT ? t('ui.ollamaEmptySoftFailure') : r.error
        alert(t('ui.ollamaError', { message }))
        return
      }
      applyOllamaResultToPending(path, r)
    } finally {
      setAiDescribeBusy(null)
    }
  }, [stagingPaths, pendingByPath, metadataByPath, t, applyOllamaResultToPending, handleOllamaDescribeTransportFailure])

  const runAiDescribeBatch = useCallback(
    async (paths: string[]) => {
      const api = window.exifmod
      if (!api?.ollamaDescribeImage) {
        alert(t('ui.preloadUnavailable'))
        return
      }
      const total = paths.length
      if (total === 0) return
      const failures: { path: string; message: string }[] = []
      setAiDescribeBusy({ mode: 'batch', current: 1, total })
      try {
        for (let i = 0; i < paths.length; i++) {
          const path = paths[i]!
          setAiDescribeBusy({ mode: 'batch', current: i + 1, total })
          const st = pendingByPathRef.current[pathKey(path)]
          const md = metadataByPath[pathKey(path)] ?? {}
          const maxDescriptionUtf8Bytes = st ? remainingUtf8BytesForAiDescription(effectiveDescriptionForAiRoom(st, md)) : 0
          if (maxDescriptionUtf8Bytes <= 0) continue
          const r = await api.ollamaDescribeImage(path, { maxDescriptionUtf8Bytes })
          if (!r.ok) {
            if (r.error !== OLLAMA_ERROR_EMPTY_SOFT && isOllamaTransportFailureError(r.error)) {
              const handled = await handleOllamaDescribeTransportFailure()
              if (handled) break
            }
            const message =
              r.error === OLLAMA_ERROR_EMPTY_SOFT ? t('ui.ollamaEmptySoftFailure') : r.error
            failures.push({ path, message })
            continue
          }
          applyOllamaResultToPending(path, r)
        }
      } finally {
        setAiDescribeBusy(null)
      }
      if (failures.length > 0) {
        setAiBatchErrorsDialog({ failures, total })
      }
    },
    [t, metadataByPath, applyOllamaResultToPending, handleOllamaDescribeTransportFailure]
  )

  const onAiButtonClick = useCallback(() => {
    const api = window.exifmod
    if (!api?.ollamaDescribeImage) {
      alert(t('ui.preloadUnavailable'))
      return
    }
    const targets = stagingPaths.filter((p) => {
      const st = pendingByPath[pathKey(p)]
      const md = metadataByPath[pathKey(p)] ?? {}
      return st && remainingUtf8BytesForAiDescription(effectiveDescriptionForAiRoom(st, md)) > 0
    })
    if (!targets.length) {
      alert(t('ui.aiDescribeNoRoom'))
      return
    }
    if (stagingPaths.length >= 2) {
      setAiBatchConfirmPaths(targets)
      return
    }
    void runAiDescribeSingle()
  }, [stagingPaths, pendingByPath, metadataByPath, t, runAiDescribeSingle])

  const onOllamaInlineStart = useCallback(async () => {
    const api = window.exifmod
    if (!api?.ollamaTryStartServer) {
      alert(t('ui.preloadUnavailable'))
      return
    }
    setOllamaStartError(null)
    const r = await api.ollamaTryStartServer()
    if (r.ok) {
      setOllamaSession('ready')
      return
    }
    setOllamaStartError(r.error)
  }, [t])

  const onOllamaInlineDismiss = useCallback(() => {
    setOllamaStartError(null)
    setOllamaCtaCollapsed(true)
  }, [])

  const staging = stagingPaths

  const aiDescribeHasAnyRoom = useMemo(
    () =>
      stagingPaths.some((p) => {
        const st = pendingByPath[pathKey(p)]
        const md = metadataByPath[pathKey(p)] ?? {}
        return st ? remainingUtf8BytesForAiDescription(effectiveDescriptionForAiRoom(st, md)) > 0 : false
      }),
    [stagingPaths, pendingByPath, metadataByPath]
  )

  const notesPlaceholderUi = useMemo(() => {
    if (stagingPaths.length < 2) return t('ui.notesPlaceholder')
    return classifyStagedTextField(stagingPaths, pendingByPath, 'notesText') === 'mixed'
      ? t('ui.notesPlaceholderMixed')
      : t('ui.notesPlaceholder')
  }, [stagingPaths, pendingByPath, t])

  const keywordsPlaceholderUi = useMemo(() => {
    if (stagingPaths.length < 2) return t('ui.keywordsPlaceholder')
    return classifyStagedTextField(stagingPaths, pendingByPath, 'keywordsText') === 'mixed'
      ? t('ui.keywordsPlaceholderMixed')
      : t('ui.keywordsPlaceholder')
  }, [stagingPaths, pendingByPath, t])

  const aiDescribeBusyLabel = useMemo(() => {
    if (!aiDescribeBusy) return ''
    if (aiDescribeBusy.mode === 'batch' && aiDescribeBusy.total > 1) {
      return t('ui.aiDescribeLoadingProgress', {
        current: aiDescribeBusy.current,
        total: aiDescribeBusy.total
      })
    }
    return t('ui.aiDescribeLoading')
  }, [aiDescribeBusy, t])

  const aiButtonDisabled = useMemo(() => {
    if (ollamaSession !== 'ready') return true
    return !stagingPaths.length || !!aiDescribeBusy || !aiDescribeHasAnyRoom
  }, [ollamaSession, stagingPaths.length, aiDescribeBusy, aiDescribeHasAnyRoom])

  const aiButtonTitle = useMemo(() => {
    if (aiDescribeBusy) return aiDescribeBusyLabel
    if (ollamaSession === 'launching') return t('ui.aiDescribeOllamaLaunching')
    if (ollamaSession === 'checking') return t('ui.aiDescribeOllamaChecking')
    if (ollamaSession === 'server_down') return t('ui.aiDescribeOllamaWaitingStart')
    if (ollamaSession === 'no_install') return t('ui.aiDescribeOllamaNotInstalled')
    if (ollamaSession === 'declined' || ollamaSession === 'failed') return t('ui.aiDescribeOllamaUnavailable')
    if (ollamaSession === 'ready' && stagingPaths.length === 0) return t('ui.aiDescribeSelectFilesTooltip')
    if (!aiDescribeHasAnyRoom) return t('ui.aiDescribeNoRoomTooltip')
    return t('ui.aiDescribeTooltip')
  }, [aiDescribeBusy, aiDescribeBusyLabel, ollamaSession, stagingPaths.length, aiDescribeHasAnyRoom, t])

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

  const notesCurrentLine = useMemo(() => {
    if (!stagingPaths.length) return ''
    const vals = stagingPaths.map((p) => imageDescriptionFromMetadata(metadataByPath[p] ?? {}))
    if (new Set(vals).size > 1) return t('ui.multiple')
    return vals[0] ?? ''
  }, [stagingPaths, metadataByPath, t])

  const keywordsCurrentLine = useMemo(() => {
    if (!stagingPaths.length) return ''
    const vals = stagingPaths.map((p) => keywordsFieldFromMetadata(metadataByPath[p] ?? {}))
    if (new Set(vals).size > 1) return t('ui.multiple')
    return vals[0] ?? ''
  }, [stagingPaths, metadataByPath, t])

  const removeTitle = t('ui.removeFromImage')

  const canRemoveCamera = useMemo(() => {
    if (!staging.length) return false
    if (inferredRow.Camera === 'Multiple') return true
    return String(inferredRow.Camera ?? '').trim() !== ''
  }, [staging.length, inferredRow.Camera])

  const canRemoveLens = useMemo(() => {
    if (!staging.length) return false
    if (inferredRow.Lens === 'Multiple') return true
    return String(inferredRow.Lens ?? '').trim() !== ''
  }, [staging.length, inferredRow.Lens])

  const canRemoveFilm = useMemo(() => {
    if (!staging.length) return false
    if (inferredRow.Film === 'Multiple') return true
    if (String(inferredRow.Film ?? '').trim() !== '') return true
    return stagingPaths.some((p) => {
      const m = metadataByPath[p] ?? {}
      return String(m['ISO'] ?? m['EXIF:ISO'] ?? '').trim() !== ''
    })
  }, [staging.length, inferredRow.Film, stagingPaths, metadataByPath])

  const canRemoveAuthor = useMemo(() => {
    if (!staging.length) return false
    if (inferredRow.Author === 'Multiple') return true
    return String(inferredRow.Author ?? '').trim() !== ''
  }, [staging.length, inferredRow.Author])

  const canRemoveCategory: Record<Cat, boolean> = {
    Camera: canRemoveCamera,
    Lens: canRemoveLens,
    Film: canRemoveFilm,
    Author: canRemoveAuthor
  }

  const canRemoveShutter = useMemo(() => {
    if (!staging.length || shutterLocked) return false
    if (exposureCurrentDisplay === t('ui.multiple')) return true
    return exposureCurrentDisplay.trim() !== ''
  }, [staging.length, shutterLocked, exposureCurrentDisplay, t])

  const canRemoveAperture = useMemo(() => {
    if (!staging.length || apertureLocked) return false
    if (fnCurrentDisplay === t('ui.multiple')) return true
    return fnCurrentDisplay.trim() !== ''
  }, [staging.length, apertureLocked, fnCurrentDisplay, t])

  const canRemoveNotes = useMemo(
    () =>
      stagingPaths.some((p) => imageDescriptionFromMetadata(metadataByPath[p] ?? {}).trim() !== ''),
    [stagingPaths, metadataByPath]
  )

  const canRemoveKeywords = useMemo(
    () =>
      stagingPaths.some((p) => keywordsFieldFromMetadata(metadataByPath[p] ?? {}).trim() !== ''),
    [stagingPaths, metadataByPath]
  )

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
      <div className="app-body" ref={appBodyRef}>
        <div
          className="file-panel"
          style={{
            flex: `0 0 ${filesPaneWidthPct}%`,
            maxWidth: `${FILES_PANE_WIDTH_MAX_PCT}%`
          }}
        >
          {openedFolderPath == null ? (
            <div className="file-panel-empty">
              <button
                ref={openFolderPrimaryRef}
                type="button"
                tabIndex={-1}
                className="btn btn-primary file-panel-open-folder"
                onClick={() => void onOpenFolder()}
              >
                {t('ui.openFolder')}
              </button>
            </div>
          ) : (
            <>
              <div className="file-panel-folder-row">
                <div className="panel-pane-title-stack">
                  <span className="panel-pane-title file-panel-folder-name" title={openedFolderPath}>
                    {truncateMiddle(folderTitle, 36)}
                  </span>
                  <p className="panel-pane-shortcut-hint">{fileListShortcutHint}</p>
                </div>
                <button
                  type="button"
                  tabIndex={-1}
                  className="btn btn-icon"
                  title={t('ui.changeFolder')}
                  aria-label={t('ui.changeFolder')}
                  onClick={() => void onOpenFolder()}
                >
                  …
                </button>
              </div>
              <div className="files-pane-stack" ref={filesPaneStackRef}>
                <div
                  className="files-pane-list-region"
                  style={{
                    flex: `0 0 ${fileListAreaPct}%`,
                    minHeight: 0
                  }}
                >
                  <ul
                    ref={fileListRef}
                    className="file-list"
                    tabIndex={MAIN_TAB_INDEX}
                    role="listbox"
                    aria-multiselectable="true"
                    aria-label={`${folderTitle} (${fileListShortcutHint})`}
                    onKeyDown={onFileListKeyDown}
                  >
                    {files.map((f, i) => {
                      const base = f.split(/[/\\]/).pop() ?? f
                      const displayName = truncateMiddle(base, 36)
                      const sel = selectedIndices.has(i)
                      const cur = currentIndex === i
                      const pk = pathKey(f)
                      const diffRow = writeDiffByPath[pk]
                      const hasPend = diffRow != null && Object.keys(diffRow).length > 0
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
                    <button type="button" tabIndex={-1} className="btn" onClick={selectAllFiles} disabled={!files.length}>
                      {t('ui.selectAll')}
                    </button>
                    <button type="button" tabIndex={-1} className="btn" onClick={selectNoneFiles} disabled={!files.length}>
                      {t('ui.deselectAll')}
                    </button>
                  </div>
                </div>
                <div
                  className="splitter splitter-h"
                  role="separator"
                  tabIndex={-1}
                  aria-orientation="horizontal"
                  aria-label={t('ui.resizeListPreview')}
                  onMouseDown={onPaneResizeVerticalStart}
                />
                <div className="preview-panel preview-panel--embedded" tabIndex={-1}>
                  {selectedIndices.size > 1 ? (
                    <div className="preview-placeholder preview-placeholder--multi">{t('ui.previewMultipleSelected')}</div>
                  ) : previewDataUrl ? (
                    <img src={previewDataUrl} alt={t('ui.previewAlt')} />
                  ) : (
                    <div className="preview-placeholder">{t('ui.previewPlaceholder')}</div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        <div
          className="splitter splitter-v"
          role="separator"
          tabIndex={-1}
          aria-orientation="vertical"
          aria-label={t('ui.resizeFilesMetadata')}
          onMouseDown={onPaneResizeHorizontalStart}
        />
        <div className="meta-panel">
          <div className="meta-section">
            <div className="meta-section-head">
              <div className="panel-pane-title-stack">
                <h2 className="panel-pane-title">
                  {selectedIndices.size > 0
                    ? selectedIndices.size === 1
                      ? t('ui.metadataOneFileSelected')
                      : t('ui.metadataFilesSelected', { count: selectedIndices.size })
                    : t('ui.metadata')}
                </h2>
                <p className="panel-pane-shortcut-hint">{metadataShortcutHint}</p>
              </div>
              <button
                type="button"
                tabIndex={-1}
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
            <div
              ref={metaRovingBlockRef}
              className="meta-roving-block"
              tabIndex={MAIN_TAB_INDEX}
              onFocus={onMetaRovingBlockFocus}
              onKeyDown={onMetaFieldsKeyDown}
            >
              <table className="mapping mapping-slim">
                <colgroup>
                  <col className="mapping-col-attribute" />
                  <col className="mapping-col-current" />
                  <col className="mapping-col-new" />
                  <col className="mapping-col-remove" />
                </colgroup>
                <thead>
                  <tr>
                    <th>{t('ui.attribute')}</th>
                    <th>{t('ui.currentValue')}</th>
                    <th>{t('ui.newValue')}</th>
                    <th className="mapping-col-remove-head">{t('ui.removeColumn')}</th>
                  </tr>
                </thead>
                <tbody>
                  {CATS.map((cat, idx) => {
                    const id = formPending[idKeyForCategory(cat)] as number | null
                    let name = catalog ? presetNameForId(catalog, cat, id) : 'None'
                    if (
                      cat === 'Lens' &&
                      lensFilter.state === 'disabled' &&
                      cameraMetaForForm?.locks_lens
                    ) {
                      const fd = String(cameraMetaForForm.fixed_lens_display ?? '').trim()
                      if (fd && fd !== 'None') name = fd
                    }
                    const options =
                      cat === 'Lens'
                        ? lensFilter.allowed
                        : cat === 'Camera'
                          ? catalog?.camera_values
                          : cat === 'Film'
                            ? catalog?.film_values
                            : catalog?.author_values
                    const ck = categoryToClearKey(cat)
                    return (
                      <tr key={cat}>
                        <td>{catLabel(cat)}</td>
                        <td>
                          <span
                            className={
                              inferredRow[cat] === 'Multiple' || !String(inferredRow[cat] ?? '').trim()
                                ? 'meta-current-value-muted'
                                : undefined
                            }
                          >
                            {inferredRow[cat] === 'Multiple'
                              ? t('ui.multiple')
                              : String(inferredRow[cat] ?? '').trim() || emptyCurrentDisplay}
                          </span>
                        </td>
                        <td className="mapping-col-new-combo-cell">
                          <MetadataPresetCombo
                            ref={bindMetaRef(idx)}
                            options={options ?? ['None']}
                            valueInternal={name}
                            valueDisplay={internalToDisplay(name)}
                            toDisplay={internalToDisplay}
                            onPickDisplay={(display) => setCategoryPreset(cat, display)}
                            disabled={
                              !staging.length ||
                              !catalog ||
                              (cat === 'Lens' && lensFilter.state === 'disabled') ||
                              anyClearFlags[ck]
                            }
                            neutralValue={
                              id == null || (cat === 'Lens' && lensFilter.state === 'disabled')
                            }
                            pendingHighlight={pendingAttributeHighlights[cat]}
                            onKeyDownTabChain={onMetaFieldTabKeyDown(idx)}
                            noMatchesLabel={t('ui.presetListNoMatches')}
                            ariaLabel={t('ui.presetPickerAria', { category: catLabel(cat) })}
                          />
                        </td>
                        <td className="mapping-col-remove-cell">
                          <MetaRemoveCheckbox
                            tri={removeTri[ck]}
                            disabled={!canRemoveCategory[cat] && removeTri[ck] === 'allOff'}
                            title={removeTitle}
                            aria-label={t('ui.removeFromImageAria', { row: catLabel(cat) })}
                            ariaLabelMixed={t('ui.removeMixed')}
                            onCheckedChange={(c) => setClearFlag(ck, c)}
                          />
                        </td>
                      </tr>
                    )
                  })}
                  <tr>
                    <td>{t('ui.shutterSpeed')}</td>
                    <td>
                      <span
                        className={
                          exposureCurrentDisplay === t('ui.multiple') || !exposureCurrentDisplay.trim()
                            ? 'meta-current-value-muted'
                            : undefined
                        }
                      >
                        {exposureCurrentDisplay === t('ui.multiple')
                          ? exposureCurrentDisplay
                          : exposureCurrentDisplay || emptyCurrentDisplay}
                      </span>
                    </td>
                    <td>
                      <input
                        ref={bindMetaRef(4)}
                        tabIndex={-1}
                        className={[
                          'input',
                          shutterLocked ? 'input--neutral-value' : '',
                          pendingAttributeHighlights.shutter ? 'meta-value-pending' : ''
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        placeholder={noneDisplay}
                        disabled={!staging.length || shutterLocked || anyClearFlags.clearShutter}
                        value={shutterNewDisplay}
                        onChange={(e) =>
                          updatePendingForPaths(staging, (s) => ({
                            ...s,
                            exposureTime: e.target.value,
                            clearShutter: false
                          }))
                        }
                        onKeyDown={onMetaFieldTabKeyDown(4)}
                      />
                    </td>
                    <td className="mapping-col-remove-cell">
                      <MetaRemoveCheckbox
                        tri={removeTri.clearShutter}
                        disabled={!canRemoveShutter && removeTri.clearShutter === 'allOff'}
                        title={removeTitle}
                        aria-label={t('ui.removeFromImageAria', { row: t('ui.shutterSpeed') })}
                        ariaLabelMixed={t('ui.removeMixed')}
                        onCheckedChange={(c) => setClearFlag('clearShutter', c)}
                      />
                    </td>
                  </tr>
                  <tr>
                    <td>{t('ui.apertureFStop')}</td>
                    <td>
                      <span
                        className={
                          fnCurrentDisplay === t('ui.multiple') || !fnCurrentDisplay.trim()
                            ? 'meta-current-value-muted'
                            : undefined
                        }
                      >
                        {fnCurrentDisplay === t('ui.multiple')
                          ? fnCurrentDisplay
                          : fnCurrentDisplay || emptyCurrentDisplay}
                      </span>
                    </td>
                    <td>
                      <input
                        ref={bindMetaRef(5)}
                        tabIndex={-1}
                        className={[
                          'input',
                          apertureLocked ? 'input--neutral-value' : '',
                          pendingAttributeHighlights.aperture ? 'meta-value-pending' : ''
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        placeholder={noneDisplay}
                        disabled={!staging.length || apertureLocked || anyClearFlags.clearAperture}
                        value={apertureNewDisplay}
                        onChange={(e) =>
                          updatePendingForPaths(staging, (s) => ({
                            ...s,
                            fNumberText: e.target.value,
                            clearAperture: false
                          }))
                        }
                        onKeyDown={onMetaFieldTabKeyDown(5)}
                      />
                    </td>
                    <td className="mapping-col-remove-cell">
                      <MetaRemoveCheckbox
                        tri={removeTri.clearAperture}
                        disabled={!canRemoveAperture && removeTri.clearAperture === 'allOff'}
                        title={removeTitle}
                        aria-label={t('ui.removeFromImageAria', { row: t('ui.apertureFStop') })}
                        ariaLabelMixed={t('ui.removeMixed')}
                        onCheckedChange={(c) => setClearFlag('clearAperture', c)}
                      />
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="meta-notes-wrap meta-notes-wrap--tables">
                <div className="meta-subsection-head">
                  <div className="meta-subsection-title-cell">
                    <h2 className="meta-subsection-title">{t('ui.descriptionAndKeywords')}</h2>
                  </div>
                  <div className="meta-subsection-ai-cell">
                    <div className="meta-subsection-ai-anchor">
                      <div className="meta-subsection-ai-drawer-slot">
                        {ollamaSession === 'server_down' && (
                          <div
                            className={[
                              'meta-notes-ollama-drawer',
                              ollamaCtaCollapsed ? 'meta-notes-ollama-drawer--collapsed' : ''
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            role="region"
                            aria-label={t('ui.ollamaDrawerRegionLabel')}
                          >
                            {!ollamaCtaCollapsed ? (
                              <p className="meta-notes-ollama-drawer-line">
                                <span className="meta-notes-ollama-drawer-msg">{t('ui.ollamaInlineHint')}</span>{' '}
                                <button
                                  type="button"
                                  tabIndex={-1}
                                  className="meta-notes-ollama-drawer-link meta-notes-ollama-drawer-link--start"
                                  onClick={() => void onOllamaInlineStart()}
                                >
                                  {t('ui.ollamaInlineStart')}
                                </button>{' '}
                                <button
                                  type="button"
                                  tabIndex={-1}
                                  className="meta-notes-ollama-drawer-link meta-notes-ollama-drawer-link--dismiss"
                                  onClick={onOllamaInlineDismiss}
                                >
                                  {t('dialog.ollamaButtonNotNow')}
                                </button>
                                {ollamaStartError ? (
                                  <span className="meta-notes-ollama-drawer-inline-error" title={ollamaStartError}>
                                    {' '}
                                    · {ollamaStartError}
                                  </span>
                                ) : null}
                              </p>
                            ) : (
                              <button
                                type="button"
                                tabIndex={-1}
                                className="meta-notes-ollama-drawer-expand"
                                onClick={() => setOllamaCtaCollapsed(false)}
                                title={t('ui.ollamaDrawerExpand')}
                                aria-label={t('ui.ollamaDrawerExpand')}
                                aria-expanded="false"
                              >
                                <svg
                                  className="meta-notes-ollama-drawer-expand-icon"
                                  viewBox="0 0 24 24"
                                  width="18"
                                  height="18"
                                  aria-hidden
                                  focusable="false"
                                >
                                  <path
                                    fill="currentColor"
                                    d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"
                                  />
                                </svg>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        tabIndex={-1}
                        className={[
                          'btn-ai-spark',
                          (ollamaSession === 'checking' || ollamaSession === 'launching') && !aiDescribeBusy
                            ? 'btn-ai-spark--ollama-launching'
                            : '',
                          ollamaSession === 'ready' && !aiDescribeBusy ? 'btn-ai-spark--ollama-ready' : '',
                          aiDescribeBusy ? 'btn-ai-spark--loading' : ''
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        aria-busy={
                          !!aiDescribeBusy || ollamaSession === 'checking' || ollamaSession === 'launching'
                        }
                        disabled={aiButtonDisabled}
                        title={aiButtonTitle}
                        aria-label={aiButtonTitle}
                        onClick={() => void onAiButtonClick()}
                      >
                        {aiDescribeBusy ? (
                          <span className="btn-ai-spark-loading">{aiDescribeBusyLabel}</span>
                        ) : (
                          <svg className="btn-ai-spark-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden focusable="false">
                            <path
                              fill="currentColor"
                              d="M12 2l1.2 4.2L17.4 7.4l-4.2 1.2L12 12.8l-1.2-4.2L6.6 7.4l4.2-1.2L12 2zm7 8l.8 2.8 2.8.8-2.8.8L19 17.4l-.8-2.8-2.8-.8 2.8-.8L19 10zM6 14l.6 2.2 2.2.6-2.2.6L6 19.8l-.6-2.2-2.2-.6 2.2-.6L6 14z"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
                <table className="mapping mapping-slim mapping-desc-kw">
                  <colgroup>
                    <col className="mapping-col-attribute" />
                    <col className="mapping-col-current" />
                    <col className="mapping-col-new" />
                    <col className="mapping-col-remove" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>{t('ui.attribute')}</th>
                      <th>{t('ui.currentValue')}</th>
                      <th>{t('ui.newValue')}</th>
                      <th className="mapping-col-remove-head">{t('ui.removeColumn')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{t('ui.notesImageDescription')}</td>
                      <td>
                        <span
                          className={
                            notesCurrentLine === t('ui.multiple') || !notesCurrentLine.trim()
                              ? 'meta-current-value-muted'
                              : undefined
                          }
                          title={notesCurrentLine !== t('ui.multiple') ? notesCurrentLine : undefined}
                        >
                          {notesCurrentLine === t('ui.multiple')
                            ? t('ui.multiple')
                            : notesCurrentLine.trim()
                              ? truncateMiddle(notesCurrentLine, 200)
                              : emptyCurrentDisplay}
                        </span>
                      </td>
                      <td>
                        <textarea
                          ref={bindMetaRef(6)}
                          tabIndex={-1}
                          className={['notes-area notes-area--in-table', pendingAttributeHighlights.notes ? 'meta-value-pending' : '']
                            .filter(Boolean)
                            .join(' ')}
                          readOnly={!staging.length}
                          rows={3}
                          placeholder={notesPlaceholderUi}
                          value={formPending.notesText}
                          disabled={!staging.length || anyClearFlags.clearNotes}
                          onChange={(e) => {
                            const nextNotes = clampUtf8ByBytes(e.target.value)
                            updatePendingForPaths(staging, (s) => ({ ...s, notesText: nextNotes, clearNotes: false }))
                          }}
                          onKeyDown={onMetaFieldTabKeyDown(6)}
                        />
                      </td>
                      <td className="mapping-col-remove-cell">
                        <MetaRemoveCheckbox
                          tri={removeTri.clearNotes}
                          disabled={!canRemoveNotes && removeTri.clearNotes === 'allOff'}
                          title={removeTitle}
                          aria-label={t('ui.removeFromImageAria', { row: t('ui.notesImageDescription') })}
                          ariaLabelMixed={t('ui.removeMixed')}
                          onCheckedChange={(c) => setClearFlag('clearNotes', c)}
                        />
                      </td>
                    </tr>
                    <tr>
                      <td>{t('ui.keywordsLabel')}</td>
                      <td>
                        <span
                          className={
                            keywordsCurrentLine === t('ui.multiple') || !keywordsCurrentLine.trim()
                              ? 'meta-current-value-muted'
                              : undefined
                          }
                          title={keywordsCurrentLine !== t('ui.multiple') ? keywordsCurrentLine : undefined}
                        >
                          {keywordsCurrentLine === t('ui.multiple')
                            ? t('ui.multiple')
                            : keywordsCurrentLine.trim()
                              ? truncateMiddle(keywordsCurrentLine, 200)
                              : emptyCurrentDisplay}
                        </span>
                      </td>
                      <td>
                        <textarea
                          ref={bindMetaRef(7)}
                          tabIndex={-1}
                          className={[
                            'notes-area notes-area--keywords notes-area--in-table',
                            pendingAttributeHighlights.keywords ? 'meta-value-pending' : ''
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          readOnly={!staging.length}
                          placeholder={keywordsPlaceholderUi}
                          rows={2}
                          value={formPending.keywordsText}
                          disabled={!staging.length || anyClearFlags.clearKeywords}
                          onChange={(e) =>
                            updatePendingForPaths(staging, (s) => ({
                              ...s,
                              keywordsText: e.target.value,
                              clearKeywords: false,
                              clearFilm: false
                            }))
                          }
                          onKeyDown={onMetaFieldTabKeyDown(7)}
                        />
                      </td>
                      <td className="mapping-col-remove-cell">
                        <MetaRemoveCheckbox
                          tri={removeTri.clearKeywords}
                          disabled={!canRemoveKeywords && removeTri.clearKeywords === 'allOff'}
                          title={removeTitle}
                          aria-label={t('ui.removeFromImageAria', { row: t('ui.keywordsLabel') })}
                          ariaLabelMixed={t('ui.removeMixed')}
                          onCheckedChange={(c) => setClearFlag('clearKeywords', c)}
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div
            className={`meta-section exif-preview-section${exifPreviewOpen ? ' exif-preview-section--expanded' : ''}`}
            tabIndex={-1}
          >
            <button
              type="button"
              tabIndex={-1}
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
              <pre
                className={[
                  'preview-json exif-preview-pre',
                  !exifPreviewLoading && !exifPreviewBody ? 'meta-current-value-muted' : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {exifPreviewLoading ? t('ui.previewExifLoading') : exifPreviewBody || emptyCurrentDisplay}
              </pre>
            ) : null}
          </div>

          <div className="meta-section meta-section-commit">
            <button
              ref={clearPendingButtonRef}
              type="button"
              tabIndex={MAIN_TAB_INDEX}
              className="btn btn-clear-pending"
              disabled={!hasPendingToWrite}
              onClick={() => setClearConfirmOpen(true)}
              onKeyDown={(e) => {
                if (e.key !== 'Tab') return
                e.preventDefault()
                if (e.shiftKey) {
                  let i = META_FIELD_COUNT - 1
                  while (i >= 0) {
                    const el = metaFieldRefs.current[i] as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
                    if (el && !el.disabled) {
                      el.focus()
                      return
                    }
                    i--
                  }
                  if (fileListRef.current) fileListRef.current.focus()
                  else metaRovingBlockRef.current?.focus()
                  return
                }
                if (hasPendingToWrite) commitButtonRef.current?.focus()
              }}
            >
              {t('ui.clearPendingChanges')}
            </button>
            <button
              ref={commitButtonRef}
              type="button"
              tabIndex={MAIN_TAB_INDEX}
              className="btn btn-pending-write"
              disabled={!hasPendingToWrite}
              onClick={() => void openWriteConfirm()}
              onKeyDown={(e) => {
                if (e.key !== 'Tab') return
                e.preventDefault()
                if (e.shiftKey) {
                  if (hasPendingToWrite) clearPendingButtonRef.current?.focus()
                  else {
                    let i = META_FIELD_COUNT - 1
                    while (i >= 0) {
                      const el = metaFieldRefs.current[i] as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
                      if (el && !el.disabled) {
                        el.focus()
                        return
                      }
                      i--
                    }
                    if (fileListRef.current) fileListRef.current.focus()
                    else metaRovingBlockRef.current?.focus()
                  }
                  return
                }
                if (fileListRef.current) fileListRef.current.focus()
                else metaRovingBlockRef.current?.focus()
              }}
            >
              {t('ui.writePendingChanges')}
            </button>
          </div>
        </div>
      </div>
      {writeConfirmTodo ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setWriteConfirmTodo(null)
          }}
        >
          <div
            className="modal modal-dialog-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="write-confirm-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 id="write-confirm-title" className="modal-confirm-heading">
              {t('ui.writeConfirmLead', { count: writeConfirmTodo.length })}
            </h3>
            <p className="modal-confirm-detail">{t('ui.writeConfirmDetail')}</p>
            <div className="modal-confirm-actions">
              <button type="button" className="btn" onClick={() => setWriteConfirmTodo(null)}>
                {t('dialog.buttonCancel')}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void runWritePending(writeConfirmTodo)}>
                {t('ui.writePendingChanges')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {clearConfirmOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setClearConfirmOpen(false)
          }}
        >
          <div
            className="modal modal-dialog-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-confirm-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 id="clear-confirm-title" className="modal-confirm-heading">
              {t('ui.clearConfirmLead')}
            </h3>
            <p className="modal-confirm-detail">{t('ui.clearConfirmDetail')}</p>
            <div className="modal-confirm-actions">
              <button type="button" className="btn" onClick={() => setClearConfirmOpen(false)}>
                {t('dialog.buttonCancel')}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  setClearConfirmOpen(false)
                  onClearPending()
                }}
              >
                {t('ui.clearPendingChanges')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {aiBatchConfirmPaths ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setAiBatchConfirmPaths(null)
          }}
        >
          <div
            className="modal modal-dialog-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-batch-confirm-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 id="ai-batch-confirm-title" className="modal-confirm-heading">
              {t('ui.aiBatchConfirmLead', { count: aiBatchConfirmPaths.length })}
            </h3>
            <p className="modal-confirm-detail">{t('ui.aiBatchConfirmDetail')}</p>
            <div className="modal-confirm-actions">
              <button type="button" className="btn" onClick={() => setAiBatchConfirmPaths(null)}>
                {t('dialog.buttonCancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const paths = aiBatchConfirmPaths
                  setAiBatchConfirmPaths(null)
                  void runAiDescribeBatch(paths)
                }}
              >
                {t('ui.aiBatchGenerate')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {aiBatchErrorsDialog ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setAiBatchErrorsDialog(null)
          }}
        >
          <div
            className="modal modal-dialog-confirm modal-ai-batch-errors"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-batch-errors-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 id="ai-batch-errors-title" className="modal-confirm-heading">
              {t('ui.aiBatchErrorsLead', {
                failed: aiBatchErrorsDialog.failures.length,
                total: aiBatchErrorsDialog.total
              })}
            </h3>
            <p className="modal-confirm-detail">{t('ui.aiBatchErrorsDetail')}</p>
            <ul className="ai-batch-error-list">
              {aiBatchErrorsDialog.failures.map(({ path, message }) => (
                <li key={path} className="ai-batch-error-item">
                  <span className="ai-batch-error-file" title={path}>
                    {truncateMiddle(fileBaseName(path), 42)}
                  </span>
                  <span className="ai-batch-error-msg">{message}</span>
                </li>
              ))}
            </ul>
            <div className="modal-confirm-actions">
              <button type="button" className="btn" onClick={() => setAiBatchErrorsDialog(null)}>
                {t('ui.closePanel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const retryPaths = aiBatchErrorsDialog.failures.map((f) => f.path)
                  setAiBatchErrorsDialog(null)
                  void runAiDescribeBatch(retryPaths)
                }}
              >
                {t('ui.aiBatchRetryFailed')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {commitModal ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (commitModal.phase !== 'done') return
            if (e.target === e.currentTarget) setCommitModal(null)
          }}
        >
          <div className="modal modal-commit" onMouseDown={(e) => e.stopPropagation()}>
            {commitModal.phase === 'writing' ? (
              <>
                <h3 className="modal-commit-title">{t('ui.commitModalWritingTitle')}</h3>
                <p className="modal-commit-progress-text">
                  {t('ui.commitModalProgress', { current: commitModal.current, total: commitModal.total })}
                </p>
                <p className="modal-commit-file-name" title={commitModal.fileBase}>
                  {truncateMiddle(commitModal.fileBase, 48)}
                </p>
                <div className="modal-commit-progress-track" aria-hidden>
                  <div
                    className="modal-commit-progress-fill"
                    style={{ width: `${(commitModal.current / Math.max(commitModal.total, 1)) * 100}%` }}
                  />
                </div>
              </>
            ) : (
              <>
                <h3 className="modal-commit-title">{t('ui.commitModalDoneTitle')}</h3>
                <p className="modal-commit-done-summary">{t('ui.commitModalDoneSummary', { ok: commitModal.ok, total: commitModal.total })}</p>
                <div className="modal-commit-actions">
                  <button type="button" className="btn btn-primary" onClick={() => setCommitModal(null)}>
                    {t('ui.closePanel')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
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
      <TutorialModal open={tutorialOpen} firstRun={tutorialFirstRun} onRequestClose={closeTutorial} />
    </div>
  )
}
