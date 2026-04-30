import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { anyStagedClear, mergeRemoveTriState, type RemoveTriState } from './metaRemoveTriState.js'
import { useTranslation } from 'react-i18next'
import { withCopyrightAsWrittenToExif } from '@shared/copyrightFormat.js'
import { applyCategoryClears } from '@shared/exifClearTags.js'
import {
  buildMergedKeywordsForWrite,
  descriptiveSlicesEqual,
  extractFilmIdentityKeywords,
  formatDescriptiveKeywordsLine,
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
import { OLLAMA_ERROR_ECHO_TEMPLATE, OLLAMA_ERROR_EMPTY_SOFT } from '@shared/ollamaResultCodes.js'
import type { AiDescribeBusyState, CameraMetadata, ConfigCatalog } from '@shared/types.js'
import type { FilmRollLogCreateInput, FilmRollParsedLog, FilmRollPresetCategory } from '@shared/filmRollLog.js'
import type { PresetInitialDraft } from '@shared/presetDraftFromMetadata.js'
import {
  analyzeCameraFirstStaging,
  buildCameraPresetDraft,
  computeAutoFillPresetIds,
  filmCurrentDisplayForStaging,
  matchStateForAuthorCategory,
  matchStateForFilmCategory,
  matchStateForLensCategory
} from '@shared/presetDraftFromMetadata.js'
import { filterLensValues } from '@shared/lensFilter.js'
import {
  formatExposureTimeForUi,
  formatFnumberForUi,
  inferCategoryValues,
  multiSelectAutofillSkips,
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
import { unwrapIpcErrorMessage } from './ipcError.js'
import { truncateMiddle } from './format/truncateMiddle.js'
import { StatusFooter, type ApplicationPhase } from './StatusFooter.js'
import type { UpdaterUiPayload } from '@shared/updaterUi.js'
import { getStagingPaths } from '@shared/stagingPaths.js'
import { diffHighlightsToIconCategories } from '@shared/pendingIconCategories.js'
import { validateFilmRollAperture, validateFilmRollShutterSpeed } from '@shared/filmRollLog.js'
import { measureTextWidthCanvas, pickMetadataHeadingText } from './metadataHeading.js'
import { CategoryIcon, type MetaCategory } from './CategoryIcon.js'
import type { LrPluginInstallResult } from '@shared/lrPluginInstallResult.js'

const CATS: Cat[] = ['Camera', 'Lens', 'Film', 'Author']

/** Reserved internal name for the synthetic “new preset from metadata” combo row. */
const PRESET_OPTION_NEW_FROM_FILE = '\uE000__EXIFMOD_NEW_FROM_FILE__'

const CAT_I18N: Record<Cat, 'category.camera' | 'category.lens' | 'category.film' | 'category.author'> = {
  Camera: 'category.camera',
  Lens: 'category.lens',
  Film: 'category.film',
  Author: 'category.author'
}

function lrcPluginInstallModalCopy(
  t: (key: string, options?: Record<string, string>) => string,
  r: LrPluginInstallResult
): { title: string; detail: string } {
  if (r.ok) {
    return {
      title: t('dialog.installLrPluginSuccessTitle'),
      detail: r.isDev
        ? t('dialog.installLrPluginSuccessDetailDev', { pathRelease: r.pathRelease, pathDev: r.pathDev ?? '' })
        : t('dialog.installLrPluginSuccessDetail', { path: r.pathRelease })
    }
  }
  switch (r.error) {
    case 'unsupported':
      return {
        title: t('dialog.installLrPluginUnsupportedTitle'),
        detail: t('dialog.installLrPluginUnsupportedDetail')
      }
    case 'missing_bundle':
      return {
        title: t('dialog.installLrPluginMissingTitle'),
        detail: t('dialog.installLrPluginMissingDetail', { path: r.bundleName })
      }
    case 'missing_electron':
      return {
        title: t('dialog.installLrPluginMissingTitle'),
        detail: t('dialog.installLrPluginDevElectronBinaryMissing', { path: r.path })
      }
    case 'io':
      return {
        title: t('dialog.installLrPluginFailedTitle'),
        detail: t('dialog.installLrPluginFailedDetail', { message: r.message })
      }
  }
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

function pathKey(p: string): string {
  return p
}

/** JPEG/TIFF targets where metadata is written in-place (not RAW sidecar). */
function isRasterWriteInPlacePath(filePath: string): boolean {
  const lower = filePath.toLowerCase()
  return /\.(jpe?g|tif|tiff)$/.test(lower)
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

function idKeyForCategory(cat: Cat): keyof PendingState {
  return cat === 'Camera' ? 'cameraId' : cat === 'Lens' ? 'lensId' : cat === 'Film' ? 'filmId' : 'authorId'
}

function categoryToClearKey(cat: Cat): 'clearCamera' | 'clearLens' | 'clearFilm' | 'clearAuthor' {
  return cat === 'Camera' ? 'clearCamera' : cat === 'Lens' ? 'clearLens' : cat === 'Film' ? 'clearFilm' : 'clearAuthor'
}

interface FilmRollCreateFormState {
  logName: string
  cameraPresetName: string
  lensPresetName: string
  filmPresetName: string
  authorPresetName: string
  frameCount: 12 | 24 | 36 | 72
}

interface UnknownPresetResolutionState {
  filePath: string
  parsed: FilmRollParsedLog
  mappings: Record<FilmRollPresetCategory, Record<string, string>>
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

/** AI append scope is the pending New Description field only, not on-file Current Description. */
function effectiveDescriptionForAiRoom(st: PendingState): string {
  return st.notesText.trim()
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
  const newFromFileLabel = t('ui.newPresetFromMetadata')
  const emptyCurrentDisplay = t('ui.currentValueEmpty')
  const internalToDisplay = (name: string): string => {
    if (name === 'None') return noneDisplay
    if (name === PRESET_OPTION_NEW_FROM_FILE) return newFromFileLabel
    return name
  }
  const displayToInternal = (text: string): string => {
    if (text === newFromFileLabel) return PRESET_OPTION_NEW_FROM_FILE
    if (text === noneDisplay) return 'None'
    return text
  }
  const catLabel = (cat: Cat): string => t(CAT_I18N[cat])

  const catToIconCategory = (cat: Cat): MetaCategory => {
    if (cat === 'Camera') return 'camera'
    if (cat === 'Lens') return 'lens'
    if (cat === 'Film') return 'film'
    return 'author'
  }

  const showAppMessage = useCallback((variant: 'info' | 'error', detail: string) => {
    setAppMessageModal({ variant, detail })
  }, [])

  const labelForMetaCategory = (c: MetaCategory): string => {
    switch (c) {
      case 'camera':
        return t('category.camera')
      case 'lens':
        return t('category.lens')
      case 'film':
        return t('category.film')
      case 'author':
        return t('category.author')
      case 'shutter':
        return t('ui.shutterSpeed')
      case 'aperture':
        return t('ui.apertureFStop')
      case 'desc':
        return t('ui.notesImageDescription')
      case 'keywords':
      default:
        return t('ui.keywordsLabel')
    }
  }

  const [applicationPhase, setApplicationPhase] = useState<ApplicationPhase>('verifying')
  const [applicationMessages, setApplicationMessages] = useState<string[]>([])
  const [preloadMissing, setPreloadMissing] = useState(false)
  const [catalog, setCatalog] = useState<ConfigCatalog | null>(null)
  const [files, setFiles] = useState<string[]>([])
  /** `null` = user has not chosen a folder yet; non-null = folder session (list may be empty). */
  const [openedFolderPath, setOpenedFolderPath] = useState<string | null>(null)
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const [metadataHeadingFit, setMetadataHeadingFit] = useState('')
  const [currentIndex, setCurrentIndex] = useState<number | null>(null)
  const [pendingByPath, setPendingByPath] = useState<Record<string, PendingState>>({})
  const [metadataByPath, setMetadataByPath] = useState<Record<string, Record<string, unknown>>>({})
  const metadataByPathRef = useRef(metadataByPath)
  metadataByPathRef.current = metadataByPath
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null)
  const [commitModal, setCommitModal] = useState<
    null | { phase: 'writing'; current: number; total: number; fileBase: string } | { phase: 'done'; ok: number; total: number }
  >(null)
  const [presetEditor, setPresetEditor] = useState<{
    mode: 'new' | 'edit'
    category: Cat
    editId: number | null
    /** When creating a duplicate: load fields from this preset id; name stays empty. */
    cloneFromId?: number | null
    /** Prefill new preset from on-file metadata (Manage Presets / clone do not set this). */
    initialDraft?: PresetInitialDraft | null
    /**
     * Staged file paths when the editor was opened. On save, the new preset is applied to these paths
     * so selection/focus changes while the dialog is open do not redirect the assignment.
     */
    targetPaths?: string[]
  } | null>(null)
  const [suggestedLensMountsList, setSuggestedLensMountsList] = useState<string[]>([])
  const [recentlySavedPreset, setRecentlySavedPreset] = useState<{ id: number; category: Cat } | null>(null)
  const [managePresetsOpen, setManagePresetsOpen] = useState(false)
  const [deletePresetConfirm, setDeletePresetConfirm] = useState<null | { id: number; cat: Cat; name: string }>(null)
  const [clearUnusedLensMountConfirm, setClearUnusedLensMountConfirm] = useState<string | null>(null)
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
  const [preWriteBackupChoice, setPreWriteBackupChoice] = useState<'ask' | 'always' | 'never'>('ask')
  const [preWriteBackupPrefsLoaded, setPreWriteBackupPrefsLoaded] = useState(false)
  const [writeBackupRememberCheckbox, setWriteBackupRememberCheckbox] = useState(false)
  const [filmRollCreateOpen, setFilmRollCreateOpen] = useState(false)
  const [filmRollCreateError, setFilmRollCreateError] = useState<string | null>(null)
  const [filmRollCreateForm, setFilmRollCreateForm] = useState<FilmRollCreateFormState>({
    logName: '',
    cameraPresetName: 'None',
    lensPresetName: 'None',
    filmPresetName: 'None',
    authorPresetName: 'None',
    frameCount: 36
  })
  const [unknownPresetResolution, setUnknownPresetResolution] = useState<UnknownPresetResolutionState | null>(null)
  const [appMessageModal, setAppMessageModal] = useState<null | { variant: 'info' | 'error'; detail: string }>(null)
  const [metadataFolderReadProgress, setMetadataFolderReadProgress] = useState<{
    done: number
    total: number
  } | null>(null)
  const [fileListContextMenu, setFileListContextMenu] = useState<null | {
    clientX: number
    clientY: number
    rowIndex: number
  }>(null)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [quitConfirmOpen, setQuitConfirmOpen] = useState(false)
  const quitConfirmOpenRef = useRef(false)
  const [aiDescribeBusy, setAiDescribeBusy] = useState<AiDescribeBusyState>(null)
  const [ollamaGenerationCompleteMessage, setOllamaGenerationCompleteMessage] = useState<string | null>(null)
  const [ollamaSession, setOllamaSession] = useState<OllamaSession>('checking')
  /** Shown next to the inline Start control when `ollamaTryStartServer` fails (user can retry). */
  const [ollamaStartError, setOllamaStartError] = useState<string | null>(null)
  const [updaterSupported, setUpdaterSupported] = useState(false)
  const [updaterState, setUpdaterState] = useState<UpdaterUiPayload>({ kind: 'idle' })
  const [aiBatchConfirmPaths, setAiBatchConfirmPaths] = useState<string[] | null>(null)
  const [aiBatchErrorsDialog, setAiBatchErrorsDialog] = useState<null | {
    failures: { path: string; message: string }[]
    total: number
  }>(null)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [tutorialFirstRun, setTutorialFirstRun] = useState(false)
  /** Result of Help → Install Lightroom plug-in; shown as in-app modal (not a native message box). */
  const [lrcPluginInstallResult, setLrcPluginInstallResult] = useState<LrPluginInstallResult | null>(null)
  /** True when argv included `--exifmod-from-lrc` (official Lightroom plug-ins only). */
  const [sessionFromLrcPlugin, setSessionFromLrcPlugin] = useState(false)
  const [lrcSnapshotPrefsLoaded, setLrcSnapshotPrefsLoaded] = useState(false)
  const [lrcSnapshotModalSuppressedPersisted, setLrcSnapshotModalSuppressedPersisted] = useState(false)
  const [lrcSnapshotModalDismissedSession, setLrcSnapshotModalDismissedSession] = useState(false)
  const [lrcSnapshotDontShowAgain, setLrcSnapshotDontShowAgain] = useState(false)
  /** Horizontal split: files pane width as % of main content area (default 30%). */
  const [filesPaneWidthPct, setFilesPaneWidthPct] = useState(30)
  /** Vertical split within files pane: file list + actions region height % (default 60%). */
  const [fileListAreaPct, setFileListAreaPct] = useState(60)

  const showLrcDevelopSnapshotModal = useMemo(
    () =>
      lrcSnapshotPrefsLoaded &&
      sessionFromLrcPlugin &&
      !lrcSnapshotModalSuppressedPersisted &&
      !lrcSnapshotModalDismissedSession &&
      openedFolderPath != null &&
      !tutorialOpen,
    [
      lrcSnapshotPrefsLoaded,
      sessionFromLrcPlugin,
      lrcSnapshotModalSuppressedPersisted,
      lrcSnapshotModalDismissedSession,
      openedFolderPath,
      tutorialOpen
    ]
  )

  const prevLrcSnapshotModalRef = useRef(false)
  useEffect(() => {
    if (showLrcDevelopSnapshotModal && !prevLrcSnapshotModalRef.current) {
      setLrcSnapshotDontShowAgain(false)
    }
    prevLrcSnapshotModalRef.current = showLrcDevelopSnapshotModal
  }, [showLrcDevelopSnapshotModal])

  const appBodyRef = useRef<HTMLDivElement>(null)
  const filesPaneStackRef = useRef<HTMLDivElement>(null)
  const fileListRef = useRef<HTMLUListElement>(null)
  const clearPendingButtonRef = useRef<HTMLButtonElement>(null)
  const commitButtonRef = useRef<HTMLButtonElement>(null)
  const metaRovingBlockRef = useRef<HTMLDivElement>(null)
  const metaPaneTitleStackRef = useRef<HTMLDivElement>(null)
  const metaPaneTitleH2Ref = useRef<HTMLHeadingElement>(null)
  const openFolderPrimaryRef = useRef<HTMLButtonElement>(null)
  const rowRefs = useRef<(HTMLLIElement | null)[]>([])
  const selectionAnchorRef = useRef<number | null>(null)
  /** True after a row click changed selection; arrow keys then take ownership (collapse multi-select, sync single row). */
  const fileListSelectionFromPointerRef = useRef(false)
  /** True after Space toggled list selection; arrows only move focus until a row click or bulk select clears this. */
  const fileListKeyboardSpaceSelectionRef = useRef(false)
  const metaFieldRefs = useRef<Array<HTMLElement | null>>(Array.from({ length: META_FIELD_COUNT }, () => null))
  const pendingByPathRef = useRef(pendingByPath)
  pendingByPathRef.current = pendingByPath

  const catalogRef = useRef(catalog)
  catalogRef.current = catalog
  const suggestedLensMountsRef = useRef(suggestedLensMountsList)
  suggestedLensMountsRef.current = suggestedLensMountsList

  /** After `readMetadata` + pending baseline for the current `stagingKey` (avoids flashing "No change" before UI is ready). */
  const [metadataSyncedStagingKey, setMetadataSyncedStagingKey] = useState<string | null>(null)

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

  /**
   * Application health (see docs/status-footer.md §3.2):
   * A) preload `window.exifmod`
   * B) `preflight()` (DB on disk + ExifTool)
   * C) `loadCatalog()` (sql.js + preset rows)
   */
  const runApplicationHealthCheck = useCallback(async () => {
    setApplicationPhase('verifying')
    if (!window.exifmod) {
      setPreloadMissing(true)
      setApplicationMessages([t('ui.errorPreload')])
      setCatalog(null)
      setApplicationPhase('error')
      return
    }
    setPreloadMissing(false)
    const api = window.exifmod
    try {
      const preflightIssues = await api.preflight()
      const { catalog: c, loadIssues } = await api.loadCatalog()
      setCatalog(c)
      const merged: string[] = [...preflightIssues]
      for (const x of loadIssues) {
        if (!merged.includes(x)) merged.push(x)
      }
      setApplicationMessages(merged)
      setApplicationPhase(merged.length > 0 ? 'error' : 'ok')
    } catch (e) {
      setApplicationMessages([unwrapIpcErrorMessage(e)])
      setApplicationPhase('error')
    }
  }, [t])

  const reloadCatalog = useCallback(async () => {
    await runApplicationHealthCheck()
  }, [runApplicationHealthCheck])

  useEffect(() => {
    void runApplicationHealthCheck()
  }, [runApplicationHealthCheck])

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
    const api = window.exifmod
    if (!api) return
    return api.onPresetsImported(() => void reloadCatalog())
  }, [reloadCatalog])

  useEffect(() => {
    const api = window.exifmod
    if (!api?.suggestedLensMounts || !catalog) return
    void api.suggestedLensMounts().then(setSuggestedLensMountsList)
  }, [catalog])

  /**
   * After creating a preset, rematch files with no explicit assignment in that category.
   * This updates match highlighting immediately for files that already satisfy the new preset.
   */
  useEffect(() => {
    if (!recentlySavedPreset || !catalog || files.length === 0) return
    const { id, category } = recentlySavedPreset
    const idKey = idKeyForCategory(category)
    const clearKey = categoryToClearKey(category)
    setPendingByPath((prev) => {
      let changed = false
      const next = { ...prev }
      for (const path of files) {
        const pk = pathKey(path)
        const row = next[pk] ?? emptyPending()
        if ((row[idKey] as number | null) != null || row[clearKey]) continue
        const md = metadataByPath[pk] ?? {}
        const inferFilm = inferCategoryValues(md, catalog.film_values).Film ?? ''
        const suggested = computeAutoFillPresetIds(catalog, md, inferFilm, suggestedLensMountsList, {})
        if ((suggested[idKey] as number | null) !== id) continue
        next[pk] = { ...row, [idKey]: id, [clearKey]: false }
        changed = true
      }
      return changed ? next : prev
    })
    setRecentlySavedPreset(null)
  }, [recentlySavedPreset, catalog, files, metadataByPath, suggestedLensMountsList])

  useEffect(() => {
    const api = window.exifmod
    if (!api?.getUpdaterSupport || !api.onUpdaterState) return
    void api.getUpdaterSupport().then((r) => setUpdaterSupported(r.supported))
    return api.onUpdaterState((p) => setUpdaterState(p))
  }, [])

  const closeTutorial = useCallback(() => {
    setTutorialOpen(false)
    void window.exifmod?.markTutorialOnboardingSeen?.()
  }, [])

  const onLrcSnapshotModalContinue = useCallback(async () => {
    if (lrcSnapshotDontShowAgain) {
      const api = window.exifmod
      if (api?.setLrcSnapshotModalSuppressed) {
        await api.setLrcSnapshotModalSuppressed()
        setLrcSnapshotModalSuppressedPersisted(true)
      }
    }
    setLrcSnapshotModalDismissedSession(true)
  }, [lrcSnapshotDontShowAgain])

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
    if (!api?.getLaunchFromLrc || !api.getLrcSnapshotModalSuppressed) return
    void Promise.all([
      api.getLaunchFromLrc(),
      api.getLrcSnapshotModalSuppressed(),
      api.getPreWriteBackupChoice?.() ?? Promise.resolve('ask' as const)
    ]).then(([fromLrc, suppressed, backupPref]) => {
      setSessionFromLrcPlugin(fromLrc)
      setLrcSnapshotModalSuppressedPersisted(suppressed)
      setLrcSnapshotPrefsLoaded(true)
      setPreWriteBackupChoice(backupPref)
      setPreWriteBackupPrefsLoaded(true)
    })
  }, [])

  useEffect(() => {
    const api = window.exifmod
    if (!api?.onRememberedChoicesReset) return
    return api.onRememberedChoicesReset(() => {
      void api.getLrcSnapshotModalSuppressed?.().then((v) => setLrcSnapshotModalSuppressedPersisted(v))
      void api.getPreWriteBackupChoice?.().then((v) => setPreWriteBackupChoice(v))
    })
  }, [])

  useEffect(() => {
    const api = window.exifmod
    if (!api?.onLaunchFromLrc) return
    return api.onLaunchFromLrc((v) => {
      if (v) setSessionFromLrcPlugin(true)
    })
  }, [])

  useEffect(() => {
    const api = window.exifmod
    if (!api) return
    return api.onStartupPath((p) => {
      void (async () => {
        let list: string[]
        let selectIndex = 0
        let openedFolder: string

        if (await api.isFile(p)) {
          openedFolder = parentDir(p)
          list = await api.listImagesInDir(openedFolder)
          const idx = list.findIndex((f) => pathsEqualForList(f, p))
          selectIndex = idx >= 0 ? idx : 0
        } else {
          list = await api.resolveImageList(p)
          selectIndex = 0
          /** Directory with no images: keep `p` as the session folder (not its parent). */
          openedFolder = list.length > 0 ? parentDir(list[0]!) : p
        }

        setOpenedFolderPath(openedFolder)
        setFiles(list)
        fileListSelectionFromPointerRef.current = false
        fileListKeyboardSpaceSelectionRef.current = false
        setSelectedIndices(new Set())
        setCurrentIndex(list.length ? selectIndex : null)
        setMetadataByPath({})
        setPendingByPath({})
        setWriteDiffByPath({})
      })()
    })
  }, [])

  const filesSessionKey =
    openedFolderPath != null && files.length > 0 ? `${openedFolderPath}\n${files.join('\n')}` : ''

  /** Prefetch metadata for every file in the open folder (chunked ExifTool in main). */
  useEffect(() => {
    if (!filesSessionKey) {
      setMetadataFolderReadProgress(null)
      return
    }
    const api = window.exifmod
    if (!api?.readMetadataBatch) return
    let cancelled = false
    const list = files
    setMetadataFolderReadProgress({ done: 0, total: list.length })
    const off = api.onReadMetadataBatchProgress?.((p) => {
      if (!cancelled) setMetadataFolderReadProgress({ done: p.done, total: p.total })
    })
    void api.readMetadataBatch(list).then((map) => {
      if (cancelled) return
      setMetadataByPath((prev) => {
        const next = { ...prev }
        for (const p of list) {
          const k = pathKey(p)
          next[k] = map[p] ?? {}
        }
        return next
      })
      setMetadataFolderReadProgress(null)
    }).catch(() => {
      if (!cancelled) setMetadataFolderReadProgress(null)
    })
    return () => {
      cancelled = true
      off?.()
    }
  }, [filesSessionKey])

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

  const stagingHeadingBaseNames = useMemo(() => stagingPaths.map((p) => fileBaseName(p)), [stagingPaths])

  const metadataHeadingUncropped = useMemo(() => {
    if (stagingHeadingBaseNames.length === 0) return ''
    const prefix = `${t('ui.metadata')}: `
    if (stagingHeadingBaseNames.length === 1) return prefix + stagingHeadingBaseNames[0]!
    return prefix + stagingHeadingBaseNames.join(', ')
  }, [stagingHeadingBaseNames, t])

  const metadataPaneTitleWhenSelected = useMemo((): ReactNode => {
    if (stagingHeadingBaseNames.length === 0) return null
    const fit = metadataHeadingFit || metadataHeadingUncropped
    const prefixWithSpace = `${t('ui.metadata')}: `
    const compact = t('ui.metadataCompactSelection', { count: stagingHeadingBaseNames.length })
    if (fit === compact) {
      return <span className="panel-pane-title-compact">{fit}</span>
    }
    const rest = fit.startsWith(prefixWithSpace) ? fit.slice(prefixWithSpace.length) : fit
    return (
      <>
        <span className="panel-pane-title-prefix">{t('ui.metadata')}:</span>
        {' '}
        <span className="panel-pane-title-files">{rest}</span>
      </>
    )
  }, [metadataHeadingFit, metadataHeadingUncropped, stagingHeadingBaseNames, t])

  useLayoutEffect(() => {
    if (stagingHeadingBaseNames.length === 0) {
      setMetadataHeadingFit('')
      return
    }
    const stack = metaPaneTitleStackRef.current
    const h2 = metaPaneTitleH2Ref.current
    if (!stack || !h2) return

    const apply = (): void => {
      const w = stack.clientWidth
      const font = getComputedStyle(h2).font
      const available = w > 0 ? Math.max(0, w - 3) : Number.POSITIVE_INFINITY
      const measure = (s: string) => measureTextWidthCanvas(s, font)
      const fits = (line: string) => measure(line) <= available
      const prefix = `${t('ui.metadata')}: `
      setMetadataHeadingFit(
        pickMetadataHeadingText(stagingHeadingBaseNames, {
          prefix,
          moreLabel: (r) => ` ${t('ui.metadataMoreFiles', { count: r })}`,
          fits,
          compactFallback: (c) => t('ui.metadataCompactSelection', { count: c })
        })
      )
    }

    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(stack)
    return () => ro.disconnect()
  }, [stagingHeadingBaseNames, t])

  /** OR-merge write-diff highlights for the metadata staging set only (`stagingPaths`: current file(s) in the
   *  pane), so row pending styling matches per-file file-list chips. Multi-select: a row is highlighted if any
   *  staged file has a pending change for that attribute. */
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

  /** Hide New preset combobox labels until metadata + catalog are ready and baseline merge has run (matches autofill/layout pass). */
  const presetNewValueUiReady =
    stagingPaths.length > 0 && metadataSyncedStagingKey === stagingKey && catalog != null

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
    if (!stagingPaths.length) {
      setMetadataSyncedStagingKey(null)
      return
    }
    const api = window.exifmod
    if (!api) return
    let cancelled = false
    void (async () => {
      const meta: Record<string, Record<string, unknown>> = {}
      for (const path of stagingPaths) {
        const pk = pathKey(path)
        if (Object.prototype.hasOwnProperty.call(metadataByPathRef.current, pk)) {
          meta[path] = metadataByPathRef.current[pk] ?? {}
          continue
        }
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
          const shouldReseedKeywords =
            row.keywordsText.trim() === '' || descriptiveSlicesEqual(row.keywordsText, row.keywordsBaseline)
          const merged: PendingState = {
            ...row,
            notesBaseline: desc,
            keywordsBaseline: kw,
            keywordsText: shouldReseedKeywords ? '' : row.keywordsText
          }
          next[k] = merged
        }
        return next
      })
      setMetadataSyncedStagingKey(stagingKey)
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
    const path = stagingPaths[0]
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
  }, [stagingPaths, selectedIndices])

  const buildMergedPayloadForState = useCallback(
    async (
      st: PendingState,
      filePath: string
    ): Promise<{ payload: Record<string, unknown> | null; err: string | null }> => {
      const api = window.exifmod
      if (!api) return { payload: null, err: t('ui.preloadUnavailable') }
      try {
        let merged = await api.mergePayloads({
          camera: st.cameraId,
          lens: st.lensId,
          author: st.authorId,
          film: st.filmId
        })
        let effCam: number | null = st.cameraId
        if (effCam == null && catalog) {
          const md = metadataByPath[pathKey(filePath)] ?? {}
          const inferFilm = inferCategoryValues(md, catalog.film_values).Film ?? ''
          const sugg = computeAutoFillPresetIds(catalog, md, inferFilm, suggestedLensMountsList, {})
          effCam = sugg.cameraId
        }
        const camMeta = cameraMetaForPending(catalog, effCam)
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
          const finalKw = buildMergedKeywordsForWrite({
            mergedPresetKeywords: merged['Keywords'],
            keywordsText: st.keywordsText,
            keywordsBaseline: st.keywordsBaseline,
            clearKeywords: false,
            clearFilm: st.clearFilm
          })
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
    [t, catalog, metadataByPath, suggestedLensMountsList]
  )

  /** Same “would write change anything?” rule as the Write button / preview (not debounced). */
  const computeFolderHasPendingWrites = useCallback(async (): Promise<boolean> => {
    if (!catalog) return false
    for (const path of files) {
      const st = pendingByPath[pathKey(path)]
      if (!st) continue
      const { payload, err } = await buildMergedPayloadForState(st, path)
      if (err || !payload || Object.keys(payload).length === 0) continue
      const previewPayload = withCopyrightAsWrittenToExif(payload)
      const meta = metadataByPath[pathKey(path)] ?? {}
      const diff = diffWritePayloadFromMetadata(previewPayload, meta)
      if (Object.keys(diff).length > 0) return true
    }
    return false
  }, [catalog, files, pendingByPath, metadataByPath, buildMergedPayloadForState])

  useEffect(() => {
    const api = window.exifmod
    if (!api?.onAppCloseRequested || !api.confirmAppClose) return
    return api.onAppCloseRequested(() => {
      void (async () => {
        if (quitConfirmOpenRef.current) return
        const hasPending = await computeFolderHasPendingWrites()
        if (!hasPending) {
          api.confirmAppClose()
          return
        }
        quitConfirmOpenRef.current = true
        setQuitConfirmOpen(true)
      })()
    })
  }, [computeFolderHasPendingWrites])

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
          const { payload, err } = await buildMergedPayloadForState(st, path)
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

  const filmCurrentLine = useMemo(() => {
    if (!catalog || !stagingPaths.length) return ''
    const filmOpts = catalog.film_values
    const inferFilms = stagingPaths.map((p) => inferCategoryValues(metadataByPath[p] ?? {}, filmOpts).Film ?? '')
    const metas = stagingPaths.map((p) => metadataByPath[p] ?? {})
    return filmCurrentDisplayForStaging(metas, inferFilms)
  }, [catalog, stagingPaths, metadataByPath])

  /** Inferred catalog match from on-disk metadata (drives lens list + body locks when the user has not chosen an Assign preset). */
  const suggestedPresetIdsForForm = useMemo(() => {
    if (!catalog || !stagingPaths.length) {
      return {
        cameraId: null as number | null,
        lensId: null as number | null,
        filmId: null as number | null,
        authorId: null as number | null
      }
    }
    if (stagingPaths.length === 1) {
      const path = stagingPaths[0]!
      const md = metadataByPath[pathKey(path)] ?? {}
      const inferFilm = inferCategoryValues(md, catalog.film_values).Film ?? ''
      return computeAutoFillPresetIds(catalog, md, inferFilm, suggestedLensMountsList, {})
    }
    const autofillSkips = multiSelectAutofillSkips(catalog, stagingPaths, metadataByPath)
    const p0 = stagingPaths[0]!
    const md0 = metadataByPath[pathKey(p0)] ?? {}
    const inferFilm0 = inferCategoryValues(md0, catalog.film_values).Film ?? ''
    return computeAutoFillPresetIds(catalog, md0, inferFilm0, suggestedLensMountsList, autofillSkips)
  }, [catalog, stagingPaths, metadataByPath, suggestedLensMountsList])

  const lensFilter = useMemo(() => {
    if (!catalog) return { allowed: [] as string[], state: 'readonly' as const }
    const effCam = formPending.cameraId ?? suggestedPresetIdsForForm.cameraId
    const camName = presetNameForId(catalog, 'Camera', effCam)
    const camId = catalog.camera_file_map[camName]
    return filterLensValues(
      catalog.lens_values,
      camName,
      camId ?? null,
      catalog.camera_metadata_map,
      catalog.lens_metadata_map
    )
  }, [catalog, formPending, suggestedPresetIdsForForm])

  const metadataPresetFromFile = useMemo(() => {
    const show: Record<Cat, boolean> = { Camera: false, Lens: false, Film: false, Author: false }
    const draft: Partial<Record<Cat, PresetInitialDraft>> = {}
    if (!catalog || !stagingPaths.length) {
      return { show, draft }
    }
    const metas = stagingPaths.map((p) => metadataByPath[p] ?? {})
    const filmOpts = catalog.film_values
    const inferFilms = stagingPaths.map((p) => inferCategoryValues(metadataByPath[p] ?? {}, filmOpts).Film ?? '')

    const camFirst = analyzeCameraFirstStaging(catalog, metas)
    if (camFirst.cameraLine.kind === 'unmatched') {
      show.Camera = true
      draft.Camera = camFirst.cameraLine.draft
    } else if (camFirst.suggestCameraPresetFromMetadata) {
      show.Camera = true
      draft.Camera = buildCameraPresetDraft(metas[0]!)
    }

    if (!camFirst.skipLensCatalogMatch) {
      const lensState = matchStateForLensCategory(catalog, metas, suggestedLensMountsList)
      if (lensState.kind === 'unmatched' && lensFilter.state !== 'disabled') {
        show.Lens = true
        draft.Lens = lensState.draft
      }
    }

    const filmState = matchStateForFilmCategory(catalog, metas, inferFilms)
    if (filmState.kind === 'unmatched') {
      show.Film = true
      draft.Film = filmState.draft
    }

    const authorState = matchStateForAuthorCategory(catalog, metas)
    if (authorState.kind === 'unmatched') {
      show.Author = true
      draft.Author = authorState.draft
    }

    return { show, draft }
  }, [catalog, stagingPaths, metadataByPath, suggestedLensMountsList, lensFilter.state])

  const effectiveCameraIdForForm = formPending.cameraId ?? suggestedPresetIdsForForm.cameraId
  const cameraMetaForForm = useMemo(
    () => cameraMetaForPending(catalog, effectiveCameraIdForForm),
    [catalog, effectiveCameraIdForForm]
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
  const filmRollCreateLensFilter = useMemo(() => {
    if (!catalog) return { allowed: ['None'], state: 'readonly' as const }
    return filterLensValues(
      catalog.lens_values,
      filmRollCreateForm.cameraPresetName,
      filmRollCreateForm.cameraPresetName,
      catalog.camera_metadata_map,
      catalog.lens_metadata_map
    )
  }, [catalog, filmRollCreateForm.cameraPresetName])

  const selectAllFiles = useCallback(() => {
    fileListSelectionFromPointerRef.current = false
    fileListKeyboardSpaceSelectionRef.current = false
    setSelectedIndices(new Set(files.map((_, i) => i)))
    if (files.length) setCurrentIndex(0)
  }, [files])

  const selectNoneFiles = useCallback(() => {
    fileListSelectionFromPointerRef.current = false
    fileListKeyboardSpaceSelectionRef.current = false
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
    fileListSelectionFromPointerRef.current = false
    fileListKeyboardSpaceSelectionRef.current = false
    setSelectedIndices(new Set())
    setCurrentIndex(list.length ? 0 : null)
    setMetadataByPath({})
    setPendingByPath({})
    setWriteDiffByPath({})
  }

  const openFilmRollCreate = useCallback(() => {
    if (!catalog) return
    setFilmRollCreateError(null)
    setFilmRollCreateForm((prev) => ({
      ...prev,
      cameraPresetName: catalog.camera_values[0] ?? 'None',
      lensPresetName: catalog.lens_values[0] ?? 'None',
      filmPresetName: catalog.film_values[0] ?? 'None',
      authorPresetName: catalog.author_values[0] ?? 'None'
    }))
    setFilmRollCreateOpen(true)
  }, [catalog])

  const createFilmRollLog = useCallback(async () => {
    const api = window.exifmod
    if (!api) {
      showAppMessage('error', t('ui.preloadUnavailable'))
      return
    }
    if (!catalog) return
    const logName = filmRollCreateForm.logName.trim()
    if (!logName) {
      setFilmRollCreateError(t('presetEditor.validationPresetNameRequired'))
      return
    }
    setFilmRollCreateError(null)
    const payload: FilmRollLogCreateInput = {
      logName,
      cameraPresetName: filmRollCreateForm.cameraPresetName,
      lensPresetName: filmRollCreateForm.lensPresetName === 'None' ? null : filmRollCreateForm.lensPresetName,
      filmPresetName: filmRollCreateForm.filmPresetName,
      authorPresetName: filmRollCreateForm.authorPresetName === 'None' ? null : filmRollCreateForm.authorPresetName,
      frameCount: filmRollCreateForm.frameCount
    }
    try {
      const result = await api.createFilmRollLog(payload)
      if (!result.canceled) {
        setFilmRollCreateOpen(false)
        setFilmRollCreateError(null)
      }
    } catch (e) {
      showAppMessage('error', unwrapIpcErrorMessage(e))
    }
  }, [catalog, filmRollCreateForm, showAppMessage, t])

  const findUnknownPresetValues = useCallback(
    (parsed: FilmRollParsedLog): Record<FilmRollPresetCategory, string[]> => {
      if (!catalog) return { camera: [], lens: [], film: [], author: [] }
      const unknown: Record<FilmRollPresetCategory, Set<string>> = {
        camera: new Set<string>(),
        lens: new Set<string>(),
        film: new Set<string>(),
        author: new Set<string>()
      }
      const hasName = (category: FilmRollPresetCategory, value: string | null): boolean => {
        if (!value || value === 'None') return true
        if (category === 'camera') return catalog.camera_values.includes(value)
        if (category === 'lens') return catalog.lens_values.includes(value)
        if (category === 'film') return catalog.film_values.includes(value)
        return catalog.author_values.includes(value)
      }
      const collect = (category: FilmRollPresetCategory, value: string | null): void => {
        if (!value || value === 'None') return
        if (!hasName(category, value)) unknown[category].add(value)
      }
      collect('camera', parsed.cameraPresetName)
      collect('lens', parsed.lensPresetName)
      collect('film', parsed.filmPresetName)
      collect('author', parsed.authorPresetName)
      for (const shot of parsed.shots) {
        collect('camera', shot.cameraPresetName)
        collect('lens', shot.lensPresetName)
        collect('author', shot.authorPresetName)
      }
      return {
        camera: [...unknown.camera],
        lens: [...unknown.lens],
        film: [...unknown.film],
        author: [...unknown.author]
      }
    },
    [catalog]
  )

  const resolvePresetNameToId = useCallback(
    (category: FilmRollPresetCategory, name: string | null): number | null => {
      if (!catalog || !name || name === 'None') return null
      if (category === 'camera') return (catalog.camera_file_map[name] ?? null) as number | null
      if (category === 'lens') return (catalog.lens_file_map[name] ?? null) as number | null
      if (category === 'film') return (catalog.film_file_map[name] ?? null) as number | null
      return (catalog.author_file_map[name] ?? null) as number | null
    },
    [catalog]
  )

  const applyParsedFilmRoll = useCallback(
    (parsed: FilmRollParsedLog, mapping?: UnknownPresetResolutionState['mappings']) => {
      const nextPending: Record<string, PendingState> = {}
      for (let i = 0; i < files.length; i++) {
        const path = files[i]
        if (!path) continue
        const shot = parsed.shots[i]
        if (!shot) continue
        const cameraName = mapping?.camera[shot.cameraPresetName] ?? shot.cameraPresetName
        const lensName = shot.lensPresetName ? (mapping?.lens[shot.lensPresetName] ?? shot.lensPresetName) : null
        const filmName = mapping?.film[parsed.filmPresetName] ?? parsed.filmPresetName
        const authorSource = shot.authorPresetName ?? parsed.authorPresetName
        const authorName = authorSource ? (mapping?.author[authorSource] ?? authorSource) : null
        if (!validateFilmRollShutterSpeed(shot.shutterSpeed) || !validateFilmRollAperture(shot.aperture)) continue
        const current = pendingByPath[pathKey(path)] ?? emptyPending()
        nextPending[pathKey(path)] = {
          ...current,
          cameraId: resolvePresetNameToId('camera', cameraName),
          lensId: resolvePresetNameToId('lens', lensName),
          filmId: resolvePresetNameToId('film', filmName),
          authorId: resolvePresetNameToId('author', authorName),
          exposureTime: shot.shutterSpeed,
          fNumberText: shot.aperture,
          notesText: shot.description,
          keywordsText: shot.keywords,
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
      setPendingByPath((prev) => ({ ...prev, ...nextPending }))
      showAppMessage('info', t('filmRoll.importApplied'))
    },
    [files, pendingByPath, resolvePresetNameToId, showAppMessage, t]
  )

  const importFilmRollLog = useCallback(async () => {
    const api = window.exifmod
    if (!api) {
      showAppMessage('error', t('ui.preloadUnavailable'))
      return
    }
    if (!openedFolderPath || files.length === 0) {
      showAppMessage('error', t('filmRoll.importNoFolder'))
      return
    }
    const filePath = await api.openFilmRollLog()
    if (!filePath) {
      showAppMessage('error', t('filmRoll.importNoFileChosen'))
      return
    }
    try {
      const parsedResult = await api.parseFilmRollLog(filePath, files)
      if (!parsedResult.ok) {
        showAppMessage('error', parsedResult.message)
        return
      }
      const unknown = findUnknownPresetValues(parsedResult.parsed)
      const hasUnknown = unknown.camera.length || unknown.lens.length || unknown.film.length || unknown.author.length
      if (!hasUnknown) {
        applyParsedFilmRoll(parsedResult.parsed)
        return
      }
      const mappings: UnknownPresetResolutionState['mappings'] = {
        camera: {},
        lens: {},
        film: {},
        author: {}
      }
      for (const value of unknown.camera) mappings.camera[value] = catalog?.camera_values[0] ?? 'None'
      for (const value of unknown.lens) mappings.lens[value] = catalog?.lens_values[0] ?? 'None'
      for (const value of unknown.film) mappings.film[value] = catalog?.film_values[0] ?? 'None'
      for (const value of unknown.author) mappings.author[value] = catalog?.author_values[0] ?? 'None'
      setUnknownPresetResolution({ filePath, parsed: parsedResult.parsed, mappings })
    } catch (e) {
      showAppMessage('error', unwrapIpcErrorMessage(e))
    }
  }, [applyParsedFilmRoll, catalog, files, findUnknownPresetValues, openedFolderPath, showAppMessage, t])

  useEffect(() => {
    const api = window.exifmod
    if (!api?.onFilmRollMenuCreate) return
    return api.onFilmRollMenuCreate(() => {
      openFilmRollCreate()
    })
  }, [openFilmRollCreate])

  useEffect(() => {
    const api = window.exifmod
    if (!api?.onFilmRollMenuImport) return
    return api.onFilmRollMenuImport(() => {
      void importFilmRollLog()
    })
  }, [importFilmRollLog])

  useEffect(() => {
    const api = window.exifmod
    if (!api?.onMenuInstallLrPlugin || !api?.installLrPlugin) return
    return api.onMenuInstallLrPlugin(() => {
      void (async () => {
        setLrcPluginInstallResult(await api.installLrPlugin!())
      })()
    })
  }, [])

  useEffect(() => {
    if (!lrcPluginInstallResult) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setLrcPluginInstallResult(null)
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [lrcPluginInstallResult])

  useEffect(() => {
    if (!appMessageModal) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setAppMessageModal(null)
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [appMessageModal])

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
    fileListKeyboardSpaceSelectionRef.current = false
    if (ev.shiftKey) {
      const anchor = selectionAnchorRef.current ?? currentIndex ?? i
      const lo = Math.min(anchor, i)
      const hi = Math.max(anchor, i)
      const range = new Set<number>()
      for (let j = lo; j <= hi; j++) range.add(j)
      setSelectedIndices(range)
      setCurrentIndex(i)
      fileListSelectionFromPointerRef.current = true
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
      fileListSelectionFromPointerRef.current = true
      return
    }
    selectionAnchorRef.current = i
    setCurrentIndex(i)
    setSelectedIndices(new Set([i]))
    fileListSelectionFromPointerRef.current = true
  }

  const onFileListKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault()
      const n = files.length
      if (!n) return
      fileListSelectionFromPointerRef.current = false
      fileListKeyboardSpaceSelectionRef.current = true
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
    if (e.key === 'c' || e.key === 'C') {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      e.preventDefault()
      runFileListClearPending(null)
      return
    }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    const n = files.length
    if (!n) return
    e.preventDefault()
    const cur = currentIndex
    let next: number
    if (cur == null) {
      next = e.key === 'ArrowDown' ? 0 : n - 1
    } else if (e.key === 'ArrowDown') {
      next = Math.min(cur + 1, n - 1)
    } else {
      next = Math.max(cur - 1, 0)
    }
    const fromPointer = fileListSelectionFromPointerRef.current
    const spaceShaped = fileListKeyboardSpaceSelectionRef.current
    if (fromPointer) {
      setSelectedIndices(new Set([next]))
      selectionAnchorRef.current = next
      fileListSelectionFromPointerRef.current = false
    } else if (!spaceShaped) {
      if (selectedIndices.size <= 1) {
        setSelectedIndices(new Set([next]))
        selectionAnchorRef.current = next
      }
      // else: multi-select (e.g. Select all) — arrows only move current row
    }
    setCurrentIndex(next)
    requestAnimationFrame(() => {
      rowRefs.current[next]?.scrollIntoView({ block: 'nearest' })
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
    if (internal === PRESET_OPTION_NEW_FROM_FILE) {
      const draft = metadataPresetFromFile.draft[cat]
      if (draft) {
        setPresetEditor({
          mode: 'new',
          category: cat,
          editId: null,
          cloneFromId: null,
          initialDraft: draft,
          targetPaths: stagingPaths.length ? [...stagingPaths] : undefined
        })
      }
      return
    }
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
    async (
      todo: { path: string; payload: Record<string, unknown> }[],
      backupRaster: boolean
    ) => {
      setWriteConfirmTodo(null)
      setWriteBackupRememberCheckbox(false)
      const api = window.exifmod
      if (!api) {
        showAppMessage('error', t('ui.preloadUnavailable'))
        return
      }
      const total = todo.length
      const successfulPaths: string[] = []
      let ok = 0
      const items = todo.map(({ path, payload }) => ({
        path,
        payload,
        backupFirst: backupRaster && isRasterWriteInPlacePath(path)
      }))
      const firstBase = todo[0] ? todo[0].path.split(/[/\\]/).pop() ?? todo[0].path : ''
      setCommitModal({ phase: 'writing', current: 0, total, fileBase: firstBase })
      const stopBatchProgress = api.onApplyExifBatchProgress((p) => {
        const base = p.path.split(/[/\\]/).pop() ?? p.path
        setCommitModal((prev) =>
          prev && prev.phase === 'writing'
            ? { ...prev, current: p.done, total: p.total, fileBase: base }
            : prev
        )
      })
      try {
        const results = await api.applyExifBatch(items)
        const applyErrors: string[] = []
        for (const r of results) {
          if (r.ok) {
            ok++
            successfulPaths.push(r.path)
          } else {
            applyErrors.push(
              t('ui.applyError', {
                path: r.path,
                message: r.error ?? 'unknown'
              })
            )
          }
        }
        if (applyErrors.length) {
          showAppMessage('error', applyErrors.join('\n\n'))
        }
      } catch (e) {
        showAppMessage('error', unwrapIpcErrorMessage(e))
      } finally {
        stopBatchProgress()
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
              keywordsBaseline: kw,
              keywordsText: ''
            }
          }
          return next
        })
      }
      setCommitModal({ phase: 'done', ok, total })
    },
    [showAppMessage, t]
  )

  const openWriteConfirm = useCallback(async () => {
    const api = window.exifmod
    if (!api) {
      showAppMessage('error', t('ui.preloadUnavailable'))
      return
    }
    const todo: { path: string; payload: Record<string, unknown> }[] = []
    for (const path of files) {
      const st = pendingByPath[pathKey(path)]
      if (!st) continue
      const { payload, err } = await buildMergedPayloadForState(st, path)
      if (err) {
        showAppMessage('error', err)
        return
      }
      if (!payload || Object.keys(payload).length === 0) continue
      const previewPayload = withCopyrightAsWrittenToExif(payload)
      const meta = metadataByPath[pathKey(path)] ?? {}
      if (Object.keys(diffWritePayloadFromMetadata(previewPayload, meta)).length === 0) continue
      todo.push({ path, payload })
    }
    if (!todo.length) {
      showAppMessage('info', t('ui.noStagedChanges'))
      return
    }
    if (api.getPreWriteBackupChoice) {
      try {
        setPreWriteBackupChoice(await api.getPreWriteBackupChoice())
      } catch {
        /* keep current */
      }
    }
    setWriteBackupRememberCheckbox(false)
    setWriteConfirmTodo(todo)
  }, [files, pendingByPath, metadataByPath, buildMergedPayloadForState, showAppMessage, t])

  const onClearPending = useCallback(() => {
    setPendingByPath((prev) => {
      const next = { ...prev }
      for (const path of files) {
        const k = pathKey(path)
        const md = metadataByPath[k] ?? {}
        const desc = imageDescriptionFromMetadata(md)
        const kw = keywordsFieldFromMetadata(md)
        next[k] = {
          ...emptyPending(),
          notesBaseline: desc,
          keywordsBaseline: kw,
          keywordsText: formatDescriptiveKeywordsLine(kw)
        }
      }
      return next
    })
  }, [files, metadataByPath])

  const clearPendingForPaths = useCallback(
    (paths: string[]) => {
      if (!paths.length) return
      setPendingByPath((prev) => {
        const next = { ...prev }
        for (const path of paths) {
          const k = pathKey(path)
          const md = metadataByPath[k] ?? {}
          const desc = imageDescriptionFromMetadata(md)
          const kw = keywordsFieldFromMetadata(md)
          next[k] = {
            ...emptyPending(),
            notesBaseline: desc,
            keywordsBaseline: kw,
            keywordsText: formatDescriptiveKeywordsLine(kw)
          }
        }
        return next
      })
    },
    [metadataByPath]
  )

  /** Same scope rules as metadata staging: multi-select → all selected; one → that file; none → current row. Right-click passes row index so with no selection we clear that row. */
  const resolveFileListClearPendingPaths = useCallback(
    (contextRowIndex: number | null): string[] => {
      if (contextRowIndex != null) {
        if (selectedIndices.size > 1) {
          return [...selectedIndices]
            .filter((i) => i >= 0 && i < files.length)
            .sort((a, b) => a - b)
            .map((i) => files[i]!)
        }
        if (selectedIndices.size === 1) {
          const idx = [...selectedIndices][0]!
          return idx >= 0 && idx < files.length ? [files[idx]!] : []
        }
        return contextRowIndex >= 0 && contextRowIndex < files.length ? [files[contextRowIndex]!] : []
      }
      return getStagingPaths(files, selectedIndices, currentIndex)
    },
    [files, selectedIndices, currentIndex]
  )

  const runFileListClearPending = useCallback(
    (contextRowIndex: number | null) => {
      clearPendingForPaths(resolveFileListClearPendingPaths(contextRowIndex))
    },
    [clearPendingForPaths, resolveFileListClearPendingPaths]
  )

  useEffect(() => {
    if (!fileListContextMenu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setFileListContextMenu(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [fileListContextMenu])

  /** After describe `fetch failed`, re-check availability (uncached) and show drawer or no-install state. */
  const handleOllamaDescribeTransportFailure = useCallback(async (): Promise<boolean> => {
    const api = window.exifmod
    if (!api?.ollamaCheckAvailability) return false
    const ar = await api.ollamaCheckAvailability()
    if (ar.status === 'server_down') {
      setOllamaSession('server_down')
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
          notesText = mergeImageDescriptionAppend(s.notesText, r.description)
        }
        const md = metadataByPath[pathKey(path)] ?? {}
        const filmKeywordsFromCurrent = extractFilmIdentityKeywords(parseKeywordsField(keywordsFieldFromMetadata(md)))
        const descriptivePending = stripFilmIdentityFromKeywords(parseKeywordsField(s.keywordsText))
        const appendedKw = mergeKeywordsDeduped(descriptivePending, r.keywords)
        const mergedKw = fitKeywordsForExif(mergeKeywordsDeduped(filmKeywordsFromCurrent, appendedKw))
        return {
          ...s,
          notesText,
          keywordsText: formatDescriptiveKeywordsLine(formatKeywordsField(mergedKw)),
          clearNotes: false,
          clearKeywords: false,
          clearFilm: false
        }
      })
    },
    [updatePendingForPaths, metadataByPath]
  )

  const runAiDescribeSingle = useCallback(async () => {
    if (stagingPaths.length !== 1) return
    const api = window.exifmod
    if (!api?.ollamaDescribeImage) {
      showAppMessage('error', t('ui.preloadUnavailable'))
      return
    }
    const path = stagingPaths[0]!
    const st = pendingByPath[pathKey(path)]
    const maxDescriptionUtf8Bytes = st ? remainingUtf8BytesForAiDescription(effectiveDescriptionForAiRoom(st)) : 0
    if (maxDescriptionUtf8Bytes <= 0) {
      showAppMessage('error', t('ui.aiDescribeNoRoom'))
      return
    }
    setAiDescribeBusy({ mode: 'single' })
    let describeSucceeded = false
    try {
      const r = await api.ollamaDescribeImage(path, { maxDescriptionUtf8Bytes })
      if (!r.ok) {
        if (
          r.error !== OLLAMA_ERROR_EMPTY_SOFT &&
          r.error !== OLLAMA_ERROR_ECHO_TEMPLATE &&
          isOllamaTransportFailureError(r.error)
        ) {
          const handled = await handleOllamaDescribeTransportFailure()
          if (handled) return
        }
        const message =
          r.error === OLLAMA_ERROR_EMPTY_SOFT
            ? t('ui.ollamaEmptySoftFailure')
            : r.error === OLLAMA_ERROR_ECHO_TEMPLATE
              ? t('ui.ollamaEchoTemplateFailure')
              : r.error
        showAppMessage('error', t('ui.ollamaError', { message }))
        return
      }
      applyOllamaResultToPending(path, r)
      describeSucceeded = true
    } finally {
      setAiDescribeBusy(null)
    }
    if (describeSucceeded) {
      setOllamaGenerationCompleteMessage(t('ui.statusFooter.ollamaGenerationComplete'))
    }
  }, [
    stagingPaths,
    pendingByPath,
    metadataByPath,
    t,
    applyOllamaResultToPending,
    handleOllamaDescribeTransportFailure,
    showAppMessage
  ])

  const runAiDescribeBatch = useCallback(
    async (paths: string[]) => {
      const api = window.exifmod
      if (!api?.ollamaDescribeImage) {
        showAppMessage('error', t('ui.preloadUnavailable'))
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
          const maxDescriptionUtf8Bytes = st ? remainingUtf8BytesForAiDescription(effectiveDescriptionForAiRoom(st)) : 0
          if (maxDescriptionUtf8Bytes <= 0) continue
          const r = await api.ollamaDescribeImage(path, { maxDescriptionUtf8Bytes })
          if (!r.ok) {
            if (
              r.error !== OLLAMA_ERROR_EMPTY_SOFT &&
              r.error !== OLLAMA_ERROR_ECHO_TEMPLATE &&
              isOllamaTransportFailureError(r.error)
            ) {
              const handled = await handleOllamaDescribeTransportFailure()
              if (handled) break
            }
            const message =
              r.error === OLLAMA_ERROR_EMPTY_SOFT
                ? t('ui.ollamaEmptySoftFailure')
                : r.error === OLLAMA_ERROR_ECHO_TEMPLATE
                  ? t('ui.ollamaEchoTemplateFailure')
                  : r.error
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
      } else if (total > 0) {
        setOllamaGenerationCompleteMessage(t('ui.statusFooter.ollamaGenerationComplete'))
      }
    },
    [t, metadataByPath, applyOllamaResultToPending, handleOllamaDescribeTransportFailure, showAppMessage]
  )

  const onAiButtonClick = useCallback(() => {
    const api = window.exifmod
    if (!api?.ollamaDescribeImage) {
      showAppMessage('error', t('ui.preloadUnavailable'))
      return
    }
    const targets = stagingPaths.filter((p) => {
      const st = pendingByPath[pathKey(p)]
      const md = metadataByPath[pathKey(p)] ?? {}
      return st && remainingUtf8BytesForAiDescription(effectiveDescriptionForAiRoom(st)) > 0
    })
    if (!targets.length) {
      showAppMessage('error', t('ui.aiDescribeNoRoom'))
      return
    }
    if (stagingPaths.length >= 2) {
      setAiBatchConfirmPaths(targets)
      return
    }
    void runAiDescribeSingle()
  }, [stagingPaths, pendingByPath, metadataByPath, t, runAiDescribeSingle, showAppMessage])

  const onOllamaInlineStart = useCallback(async () => {
    const api = window.exifmod
    if (!api?.ollamaTryStartServer) {
      showAppMessage('error', t('ui.preloadUnavailable'))
      return
    }
    setOllamaStartError(null)
    const r = await api.ollamaTryStartServer()
    if (r.ok) {
      setOllamaSession('ready')
      return
    }
    setOllamaStartError(r.error)
  }, [showAppMessage, t])

  const onOllamaInlineDismiss = useCallback(() => {
    setOllamaStartError(null)
    setOllamaGenerationCompleteMessage(null)
  }, [])

  const onUpdaterDownload = useCallback(async () => {
    const api = window.exifmod
    if (!api?.updaterDownload) return
    try {
      await api.updaterDownload()
    } catch (e) {
      setUpdaterState({ kind: 'error', message: unwrapIpcErrorMessage(e) })
    }
  }, [])

  const onUpdaterRestart = useCallback(() => {
    void window.exifmod?.updaterQuitAndInstall?.()
  }, [])

  const onUpdaterLater = useCallback(() => {
    void window.exifmod?.updaterDismiss?.()
  }, [])

  const onUpdaterCheck = useCallback(async () => {
    const api = window.exifmod
    if (!api?.updaterCheck) return
    await api.updaterCheck()
  }, [])

  const staging = stagingPaths

  const aiDescribeHasAnyRoom = useMemo(
    () =>
      stagingPaths.some((p) => {
        const st = pendingByPath[pathKey(p)]
        const md = metadataByPath[pathKey(p)] ?? {}
        return st ? remainingUtf8BytesForAiDescription(effectiveDescriptionForAiRoom(st)) > 0 : false
      }),
    [stagingPaths, pendingByPath, metadataByPath]
  )

  const notesPlaceholderUi = useMemo(() => {
    if (stagingPaths.length < 2) return t('ui.notesPlaceholder')
    const pendingClass = classifyStagedTextField(stagingPaths, pendingByPath, 'notesText')
    const currentVals = stagingPaths.map((p) => imageDescriptionFromMetadata(metadataByPath[pathKey(p)] ?? {}).trim())
    const currentClass =
      currentVals.every((v) => v === '') ? 'empty' : new Set(currentVals).size === 1 ? 'uniform' : 'mixed'
    const useMixedPlaceholder = pendingClass === 'mixed' || currentClass === 'mixed'
    return useMixedPlaceholder ? t('ui.notesPlaceholderMixed') : t('ui.notesPlaceholder')
  }, [stagingPaths, pendingByPath, metadataByPath, t])

  const keywordsPlaceholderUi = useMemo(() => {
    if (stagingPaths.length < 2) return t('ui.keywordsPlaceholder')
    const pendingClass = classifyStagedTextField(stagingPaths, pendingByPath, 'keywordsText')
    const currentVals = stagingPaths.map((p) =>
      formatDescriptiveKeywordsLine(keywordsFieldFromMetadata(metadataByPath[pathKey(p)] ?? {})).trim()
    )
    const currentClass =
      currentVals.every((v) => v === '') ? 'empty' : new Set(currentVals).size === 1 ? 'uniform' : 'mixed'
    const useMixedPlaceholder = pendingClass === 'mixed' || currentClass === 'mixed'
    return useMixedPlaceholder ? t('ui.keywordsPlaceholderMixed') : t('ui.keywordsPlaceholder')
  }, [stagingPaths, pendingByPath, metadataByPath, t])

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
    const vals = stagingPaths.map((p) => formatDescriptiveKeywordsLine(keywordsFieldFromMetadata(metadataByPath[p] ?? {})))
    if (new Set(vals).size > 1) return t('ui.multiple')
    return vals[0] ?? ''
  }, [stagingPaths, metadataByPath, t])

  const writeModalHasRaster = useMemo(
    () =>
      writeConfirmTodo != null &&
      writeConfirmTodo.some((x) => isRasterWriteInPlacePath(x.path)),
    [writeConfirmTodo]
  )

  const writeModalShowBackupAsk = Boolean(
    writeConfirmTodo &&
      writeModalHasRaster &&
      (!preWriteBackupPrefsLoaded || preWriteBackupChoice === 'ask')
  )

  const persistPreWriteBackupChoiceIfNeeded = useCallback(
    async (choice: 'always' | 'never') => {
      const api = window.exifmod
      if (!writeBackupRememberCheckbox || !api?.setPreWriteBackupChoice) return
      await api.setPreWriteBackupChoice(choice)
      setPreWriteBackupChoice(choice)
    },
    [writeBackupRememberCheckbox]
  )

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
    if (filmCurrentLine === 'Multiple') return true
    if (String(filmCurrentLine ?? '').trim() !== '') return true
    return stagingPaths.some((p) => {
      const m = metadataByPath[p] ?? {}
      return String(m['ISO'] ?? m['EXIF:ISO'] ?? '').trim() !== ''
    })
  }, [staging.length, filmCurrentLine, stagingPaths, metadataByPath])

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
    <>
    <div className="app">
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
                  {metadataFolderReadProgress ? (
                    <p className="panel-pane-shortcut-hint" aria-live="polite">
                      {t('ui.readingMetadataProgress', {
                        current: metadataFolderReadProgress.done,
                        total: metadataFolderReadProgress.total
                      })}
                    </p>
                  ) : (
                    <p className="panel-pane-shortcut-hint">{fileListShortcutHint}</p>
                  )}
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
                      const pendingIconCategories = hasPend
                        ? diffHighlightsToIconCategories(diffToAttributeHighlights(diffRow))
                        : []
                      const pendingListLabel = pendingIconCategories.map((c) => labelForMetaCategory(c)).join(', ')
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
                          onContextMenu={(e) => {
                            e.preventDefault()
                            setFileListContextMenu({ clientX: e.clientX, clientY: e.clientY, rowIndex: i })
                          }}
                        >
                          <span className="file-list-name" title={base}>
                            {displayName}
                          </span>
                          {hasPend ? (
                            <div
                              className="file-pending-icons"
                              aria-label={t('ui.fileListPendingChangesAria', { list: pendingListLabel })}
                            >
                              {pendingIconCategories.map((c) => (
                                <span
                                  key={`${f}-${c}`}
                                  className="file-pending-icon-chip"
                                  title={labelForMetaCategory(c)}
                                >
                                  <CategoryIcon category={c} size={11} />
                                </span>
                              ))}
                            </div>
                          ) : null}
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
              <div ref={metaPaneTitleStackRef} className="panel-pane-title-stack">
                <h2
                  ref={metaPaneTitleH2Ref}
                  className="panel-pane-title"
                  title={stagingHeadingBaseNames.length ? stagingHeadingBaseNames.join('\n') : undefined}
                >
                  {stagingHeadingBaseNames.length === 0 ? t('ui.metadata') : metadataPaneTitleWhenSelected}
                </h2>
                <p className="panel-pane-shortcut-hint">{metadataShortcutHint}</p>
              </div>
              <button
                type="button"
                tabIndex={-1}
                className="btn-meta-gear meta-inline-icon-btn"
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
            <div
              ref={metaRovingBlockRef}
              className="meta-roving-block"
              tabIndex={MAIN_TAB_INDEX}
              onFocus={onMetaRovingBlockFocus}
              onKeyDown={onMetaFieldsKeyDown}
            >
              <table className="mapping mapping-slim mapping-desc-kw">
                <colgroup>
                  <col className="mapping-col-attribute" />
                  <col className="mapping-col-current" />
                  <col className="mapping-col-arrow" />
                  <col className="mapping-col-new" />
                  <col className="mapping-col-remove" />
                </colgroup>
                <thead>
                  <tr>
                    <th className="meta-mapping-floating-thead__attr" scope="col">
                      <span className="sr-only">{t('ui.attribute')}</span>
                    </th>
                    <th className="meta-mapping-strong-head" scope="col">{t('ui.currentValue')}</th>
                    <th className="mapping-col-arrow-head" aria-hidden>
                      <span className="sr-only">{t('ui.mappingArrowToNew')}</span>
                    </th>
                    <th className="meta-mapping-strong-head" scope="col">{t('ui.newValue')}</th>
                    <th className="mapping-col-remove-head meta-mapping-strong-head" scope="col">
                      {t('ui.removeColumn')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="meta-mapping-section-subhead">
                    <th scope="colgroup" colSpan={5}>
                      <div className="meta-mapping-subhead-cell">
                        <span className="meta-subsection-title">{t('ui.sectionPresets')}</span>
                      </div>
                    </th>
                  </tr>
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
                    const currentValueText = cat === 'Film' ? filmCurrentLine : inferredRow[cat]
                    const sk = idKeyForCategory(cat)
                    const suggestedId = suggestedPresetIdsForForm[sk]
                    const suggestedName =
                      catalog && suggestedId != null ? presetNameForId(catalog, cat, suggestedId) : 'None'
                    const lineStr = String(currentValueText ?? '').trim()
                    const isMulti = currentValueText === 'Multiple'
                    /** Catalog-suggested id is only set when file metadata already matches a preset; do not compare
                     *  raw on-disk line to the preset *display* name (e.g. "Alon Yaffe" vs "Me"). */
                    const inFileFullMatch =
                      !isMulti && lineStr.length > 0 && suggestedId != null
                    const baseOpts = (options ?? ['None']).filter((o) => o !== 'None')
                    const comboOptions =
                      metadataPresetFromFile.show[cat] && metadataPresetFromFile.draft[cat]
                        ? ['None', PRESET_OPTION_NEW_FROM_FILE, ...baseOpts]
                        : ['None', ...baseOpts]
                    return (
                      <tr
                        key={cat}
                        className={pendingAttributeHighlights[cat] ? 'metadata-text-row--pending' : undefined}
                      >
                        <td>
                          <span className="meta-row-label-with-icon">
                            <CategoryIcon category={catToIconCategory(cat)} size={13} />
                            {catLabel(cat)}
                          </span>
                        </td>
                        <td>
                          {isMulti ? (
                            <span className="meta-current-value-muted">{t('ui.multiple')}</span>
                          ) : !lineStr ? (
                            <span className="meta-current-value-muted">{emptyCurrentDisplay}</span>
                          ) : inFileFullMatch ? (
                            <span
                              className="in-file-chip in-file-chip--matched"
                              title={t('ui.presetMatchedLabel', { name: suggestedName })}
                            >
                              <span aria-hidden>✓ </span>
                              {suggestedName}
                            </span>
                          ) : (
                            <div
                              className="in-file-attrs"
                              title={t('ui.inFileRawAttrs', { summary: lineStr })}
                            >
                              <span className="in-file-attr-pill" title={lineStr}>
                                <span className="in-file-attr-val">{lineStr}</span>
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="mapping-col-arrow-cell" aria-hidden>
                          <span className="meta-mapping-arrow" title={t('ui.mappingArrowToNew')}>
                            →
                          </span>
                        </td>
                        <td className="mapping-col-new-combo-cell">
                          <MetadataPresetCombo
                            ref={bindMetaRef(idx)}
                            options={comboOptions}
                            valueInternal={name}
                            valueDisplay={presetNewValueUiReady ? internalToDisplay(name) : ''}
                            toDisplay={internalToDisplay}
                            onPickDisplay={(display) => setCategoryPreset(cat, display)}
                            disabled={
                              !presetNewValueUiReady ||
                              !staging.length ||
                              !catalog ||
                              (cat === 'Lens' && lensFilter.state === 'disabled') ||
                              anyClearFlags[ck]
                            }
                            neutralValue={
                              !presetNewValueUiReady ||
                              id == null ||
                              (cat === 'Lens' && lensFilter.state === 'disabled')
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
                </tbody>
                <tbody>
                  <tr className="meta-mapping-section-subhead">
                    <th scope="colgroup" colSpan={5}>
                      <div className="meta-mapping-subhead-cell">
                        <span className="meta-subsection-title">{t('ui.sectionExifFields')}</span>
                      </div>
                    </th>
                  </tr>
                  <tr
                    className={[
                      'mapping-row--exif-field',
                      pendingAttributeHighlights.shutter ? 'metadata-text-row--pending' : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <td>
                      <span className="meta-row-label-with-icon">
                        <CategoryIcon category="shutter" size={13} />
                        {t('ui.shutterSpeed')}
                      </span>
                    </td>
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
                    <td className="mapping-col-arrow-cell" aria-hidden>
                      <span className="meta-mapping-arrow" title={t('ui.mappingArrowToNew')}>
                        →
                      </span>
                    </td>
                    <td>
                      <input
                        ref={bindMetaRef(4)}
                        tabIndex={-1}
                        className={[
                          'input',
                          shutterLocked ? 'input--neutral-value' : '',
                          pendingAttributeHighlights.shutter && !shutterLocked ? 'meta-value-pending' : ''
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
                  <tr
                    className={[
                      'mapping-row--exif-field',
                      pendingAttributeHighlights.aperture ? 'metadata-text-row--pending' : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <td>
                      <span className="meta-row-label-with-icon">
                        <CategoryIcon category="aperture" size={13} />
                        {t('ui.apertureFStop')}
                      </span>
                    </td>
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
                    <td className="mapping-col-arrow-cell" aria-hidden>
                      <span className="meta-mapping-arrow" title={t('ui.mappingArrowToNew')}>
                        →
                      </span>
                    </td>
                    <td>
                      <input
                        ref={bindMetaRef(5)}
                        tabIndex={-1}
                        className={[
                          'input',
                          apertureLocked ? 'input--neutral-value' : '',
                          pendingAttributeHighlights.aperture && !apertureLocked ? 'meta-value-pending' : ''
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
                <tbody>
                  <tr className="meta-mapping-section-subhead meta-mapping-section-subhead--with-tools">
                    <th scope="colgroup" colSpan={5}>
                      <div className="meta-mapping-subhead-cell meta-mapping-subhead-cell--with-tools">
                        <div className="meta-mapping-subhead-tools">
                          <span className="meta-subsection-title">{t('ui.sectionTextFields')}</span>
                          <div className="meta-subsection-ai-anchor">
                            <button
                              type="button"
                              tabIndex={-1}
                              className={[
                                'btn-ai-spark meta-inline-icon-btn',
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
                                <svg className="btn-ai-spark-icon" viewBox="0 0 24 24" aria-hidden focusable="false">
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
                    </th>
                  </tr>
                  <tr
                    className={pendingAttributeHighlights.notes ? 'metadata-text-row--pending' : undefined}
                  >
                      <td>
                        <span className="meta-row-label-with-icon">
                          <CategoryIcon category="desc" size={13} />
                          {t('ui.notesImageDescription')}
                        </span>
                      </td>
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
                      <td className="mapping-col-arrow-cell" aria-hidden>
                        <span className="meta-mapping-arrow" title={t('ui.mappingArrowToNew')}>
                          →
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
                          rows={4}
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
                    <tr
                      className={pendingAttributeHighlights.keywords ? 'metadata-text-row--pending' : undefined}
                    >
                      <td>
                        <span className="meta-row-label-with-icon">
                          <CategoryIcon category="keywords" size={13} />
                          {t('ui.keywordsLabel')}
                        </span>
                      </td>
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
                      <td className="mapping-col-arrow-cell" aria-hidden>
                        <span className="meta-mapping-arrow" title={t('ui.mappingArrowToNew')}>
                          →
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
                          rows={4}
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
              className={['btn', 'btn-pending-write', hasPendingToWrite ? 'has-pending' : ''].filter(Boolean).join(' ')}
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
      <StatusFooter
        applicationPhase={applicationPhase}
        applicationMessages={applicationMessages}
        preloadMissing={preloadMissing}
        ollamaSession={ollamaSession}
        ollamaStartError={ollamaStartError}
        aiDescribeBusy={aiDescribeBusy}
        ollamaGenerationCompleteMessage={ollamaGenerationCompleteMessage}
        updaterSupported={updaterSupported}
        updaterState={updaterState}
        onOllamaStart={() => void onOllamaInlineStart()}
        onOllamaPanelDismiss={onOllamaInlineDismiss}
        onUpdaterDownload={() => void onUpdaterDownload()}
        onUpdaterRestart={onUpdaterRestart}
        onUpdaterLater={onUpdaterLater}
        onUpdaterCheck={updaterSupported ? () => void onUpdaterCheck() : undefined}
      />
      {filmRollCreateOpen ? (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setFilmRollCreateOpen(false)
          }}
        >
          <section className="modal modal-preset-editor modal-film-roll-editor">
            <h3 className="modal-preset-editor-title">{t('filmRoll.createTitle')}</h3>
            <div className="modal-preset-editor-content">
              {filmRollCreateError ? <p className="preset-editor-error">{filmRollCreateError}</p> : null}
              <section className="preset-editor-fields-section" aria-labelledby="film-roll-create-fields">
                <table className="mapping preset-modal-mapping">
                  <colgroup>
                    <col className="preset-modal-col-field" />
                    <col className="preset-modal-col-value" />
                  </colgroup>
                  <tbody>
                    <tr>
                      <td className="preset-modal-field-label">{t('filmRoll.logName')}</td>
                      <td className="preset-modal-field-control">
                        <input
                          id="film-roll-log-name"
                          className="input"
                          value={filmRollCreateForm.logName}
                          onChange={(e) => {
                            setFilmRollCreateError(null)
                            setFilmRollCreateForm((prev) => ({ ...prev, logName: e.target.value }))
                          }}
                        />
                      </td>
                    </tr>
                    <tr>
                      <td className="preset-modal-field-label">{t('filmRoll.cameraPreset')}</td>
                      <td className="preset-modal-field-control">
                        <select
                          id="film-roll-camera"
                          className="input"
                          value={filmRollCreateForm.cameraPresetName}
                          onChange={(e) =>
                            setFilmRollCreateForm((prev) => ({
                              ...prev,
                              cameraPresetName: e.target.value,
                              lensPresetName: 'None'
                            }))
                          }
                        >
                          {catalog?.camera_values.map((v) => (
                            <option key={`film-roll-camera-${v}`} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                    <tr>
                      <td className="preset-modal-field-label">{t('filmRoll.lensPresetOptional')}</td>
                      <td className="preset-modal-field-control">
                        <select
                          id="film-roll-lens"
                          className="input"
                          value={filmRollCreateForm.lensPresetName}
                          onChange={(e) => setFilmRollCreateForm((prev) => ({ ...prev, lensPresetName: e.target.value }))}
                          disabled={filmRollCreateLensFilter.state === 'disabled'}
                        >
                          {filmRollCreateLensFilter.allowed.map((v) => (
                            <option key={`film-roll-lens-${v}`} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                    <tr>
                      <td className="preset-modal-field-label">{t('filmRoll.filmPreset')}</td>
                      <td className="preset-modal-field-control">
                        <select
                          id="film-roll-film"
                          className="input"
                          value={filmRollCreateForm.filmPresetName}
                          onChange={(e) => setFilmRollCreateForm((prev) => ({ ...prev, filmPresetName: e.target.value }))}
                        >
                          {catalog?.film_values.map((v) => (
                            <option key={`film-roll-film-${v}`} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                    <tr>
                      <td className="preset-modal-field-label">{t('filmRoll.authorPresetOptional')}</td>
                      <td className="preset-modal-field-control">
                        <select
                          id="film-roll-author"
                          className="input"
                          value={filmRollCreateForm.authorPresetName}
                          onChange={(e) => setFilmRollCreateForm((prev) => ({ ...prev, authorPresetName: e.target.value }))}
                        >
                          {catalog?.author_values.map((v) => (
                            <option key={`film-roll-author-${v}`} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                    <tr>
                      <td className="preset-modal-field-label">{t('filmRoll.frameCount')}</td>
                      <td className="preset-modal-field-control">
                        <select
                          id="film-roll-frame-count"
                          className="input"
                          value={filmRollCreateForm.frameCount}
                          onChange={(e) =>
                            setFilmRollCreateForm((prev) => ({
                              ...prev,
                              frameCount: Number(e.target.value) as 12 | 24 | 36 | 72
                            }))
                          }
                        >
                          {[12, 24, 36, 72].map((count) => (
                            <option key={`film-roll-count-${count}`} value={count}>
                              {count}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p className="preset-editor-hint">{t('filmRoll.formatHint')}</p>
              </section>
            </div>
            <div className="modal-preset-editor-actions modal-confirm-actions">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setFilmRollCreateError(null)
                  setFilmRollCreateOpen(false)
                }}
              >
                {t('dialog.buttonCancel')}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void createFilmRollLog()}>
                {t('filmRoll.createAction')}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {unknownPresetResolution ? (
        <div className="modal-backdrop">
          <section className="modal modal-preset-editor modal-film-roll-editor">
            <h3 className="modal-preset-editor-title">{t('filmRoll.resolveUnknownTitle')}</h3>
            <div className="modal-preset-editor-content modal-film-roll-unknown-mapping">
              <p className="preset-editor-hint">{t('filmRoll.resolveUnknownDetail')}</p>
              {(['camera', 'lens', 'film', 'author'] as FilmRollPresetCategory[]).map((category) => {
                const unknownValues = Object.keys(unknownPresetResolution.mappings[category])
                if (!unknownValues.length) return null
                const options =
                  category === 'camera'
                    ? catalog?.camera_values ?? []
                    : category === 'lens'
                      ? catalog?.lens_values ?? []
                      : category === 'film'
                        ? catalog?.film_values ?? []
                        : catalog?.author_values ?? []
                const sectionTitle =
                  category === 'camera'
                    ? t('filmRoll.resolveCategoryCamera')
                    : category === 'lens'
                      ? t('filmRoll.resolveCategoryLens')
                      : category === 'film'
                        ? t('filmRoll.resolveCategoryFilm')
                        : t('filmRoll.resolveCategoryAuthor')
                const iconCategory: MetaCategory = category
                return (
                  <section key={`film-roll-unknown-${category}`} className="preset-editor-fields-section film-roll-map-section">
                    <p className="preset-editor-section-heading">{sectionTitle}</p>
                    <table className="mapping mapping-slim film-roll-unknown-mapping-table">
                      <colgroup>
                        <col className="mapping-col-attribute" />
                        <col className="mapping-col-current" />
                        <col className="mapping-col-arrow" />
                        <col className="mapping-col-new" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th scope="col" className="meta-mapping-floating-thead__attr">
                            <span className="sr-only">{t('ui.attribute')}</span>
                          </th>
                          <th scope="col">
                            <span className="sr-only">{t('ui.currentValue')}</span>
                          </th>
                          <th scope="col" className="mapping-col-arrow-head">
                            <span className="sr-only">{t('ui.mappingArrowToNew')}</span>
                          </th>
                          <th scope="col">
                            <span className="sr-only">{t('ui.newValue')}</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {unknownValues.map((value) => (
                          <tr key={`film-roll-map-${category}-${value}`}>
                            <td>
                              <span className="meta-row-label-with-icon film-roll-unknown-map-icon-cell" aria-label={labelForMetaCategory(iconCategory)}>
                                <CategoryIcon category={iconCategory} size={13} />
                              </span>
                            </td>
                            <td>
                              <div className="in-file-attrs">
                                <span className="in-file-attr-pill" title={value}>
                                  <span className="in-file-attr-val">{value}</span>
                                </span>
                              </div>
                            </td>
                            <td className="mapping-col-arrow-cell" aria-hidden>
                              <span className="meta-mapping-arrow" title={t('ui.mappingArrowToNew')}>
                                →
                              </span>
                            </td>
                            <td className="mapping-col-new-combo-cell">
                              <select
                                className="input"
                                aria-label={t('filmRoll.resolveUnknownRowAria', { value })}
                                value={unknownPresetResolution.mappings[category][value]}
                                onChange={(e) =>
                                  setUnknownPresetResolution((prev) => {
                                    if (!prev) return prev
                                    return {
                                      ...prev,
                                      mappings: {
                                        ...prev.mappings,
                                        [category]: {
                                          ...prev.mappings[category],
                                          [value]: e.target.value
                                        }
                                      }
                                    }
                                  })
                                }
                              >
                                {options.map((option) => (
                                  <option key={`film-roll-map-option-${category}-${value}-${option}`} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                )
              })}
            </div>
            <div className="modal-preset-editor-actions modal-confirm-actions">
              <button type="button" className="btn" onClick={() => setUnknownPresetResolution(null)}>
                {t('dialog.buttonCancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (!unknownPresetResolution) return
                  applyParsedFilmRoll(unknownPresetResolution.parsed, unknownPresetResolution.mappings)
                  setUnknownPresetResolution(null)
                }}
              >
                {t('filmRoll.resolveProceed')}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {showLrcDevelopSnapshotModal ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) void onLrcSnapshotModalContinue()
          }}
        >
          <div
            className="modal modal-dialog-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lrc-snapshot-modal-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 id="lrc-snapshot-modal-title" className="modal-confirm-heading">
              {t('ui.lrcSnapshotModalTitle')}
            </h3>
            <p className="modal-confirm-detail">{t('ui.lrcSnapshotModalBody')}</p>
            <div className="lrc-snapshot-modal-options">
              <label className="lrc-snapshot-dont-show-label" htmlFor="lrc-snapshot-dont-show-again">
                <input
                  id="lrc-snapshot-dont-show-again"
                  type="checkbox"
                  checked={lrcSnapshotDontShowAgain}
                  onChange={(e) => setLrcSnapshotDontShowAgain(e.target.checked)}
                />
                <span>{t('ui.lrcSnapshotModalDontShowAgain')}</span>
              </label>
            </div>
            <div className="modal-confirm-actions">
              <button type="button" className="btn btn-primary" onClick={() => void onLrcSnapshotModalContinue()}>
                {t('ui.lrcSnapshotModalContinue')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {writeConfirmTodo ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setWriteConfirmTodo(null)
              setWriteBackupRememberCheckbox(false)
            }
          }}
        >
          <div
            className={`modal modal-dialog-confirm${writeModalShowBackupAsk ? ' modal-write-confirm-backup' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="write-confirm-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 id="write-confirm-title" className="modal-confirm-heading">
              {t('ui.writeConfirmLead', { count: writeConfirmTodo.length })}
            </h3>
            {writeModalShowBackupAsk ? (
              <p className="modal-confirm-detail">{t('ui.writeBackupLead')}</p>
            ) : null}
            {writeModalShowBackupAsk ? (
              <div className="lrc-snapshot-modal-options">
                <label
                  className="lrc-snapshot-dont-show-label write-backup-remember-label"
                  htmlFor="write-backup-remember"
                >
                  <input
                    id="write-backup-remember"
                    type="checkbox"
                    checked={writeBackupRememberCheckbox}
                    onChange={(e) => setWriteBackupRememberCheckbox(e.target.checked)}
                  />
                  <span>{t('ui.writeBackupRemember')}</span>
                </label>
              </div>
            ) : null}
            {writeModalShowBackupAsk ? (
              <div className="modal-confirm-actions modal-confirm-actions-row">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setWriteConfirmTodo(null)
                    setWriteBackupRememberCheckbox(false)
                  }}
                >
                  {t('dialog.buttonCancel')}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    void (async () => {
                      await persistPreWriteBackupChoiceIfNeeded('never')
                      await runWritePending(writeConfirmTodo, false)
                    })()
                  }}
                >
                  {t('ui.writeWithoutBackup')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    void (async () => {
                      await persistPreWriteBackupChoiceIfNeeded('always')
                      await runWritePending(writeConfirmTodo, true)
                    })()
                  }}
                >
                  {t('ui.writeBackupAndWrite')}
                </button>
              </div>
            ) : (
              <div className="modal-confirm-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setWriteConfirmTodo(null)
                    setWriteBackupRememberCheckbox(false)
                  }}
                >
                  {t('dialog.buttonCancel')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() =>
                    void runWritePending(
                      writeConfirmTodo,
                      writeModalHasRaster && preWriteBackupChoice === 'always'
                    )
                  }
                >
                  {t('ui.writePendingChanges')}
                </button>
              </div>
            )}
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
      {quitConfirmOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              quitConfirmOpenRef.current = false
              setQuitConfirmOpen(false)
            }
          }}
        >
          <div
            className="modal modal-dialog-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quit-pending-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 id="quit-pending-title" className="modal-confirm-heading">
              {t('ui.quitPendingLead')}
            </h3>
            <p className="modal-confirm-detail">{t('ui.quitPendingDetail')}</p>
            <div className="modal-confirm-actions">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  quitConfirmOpenRef.current = false
                  setQuitConfirmOpen(false)
                }}
              >
                {t('dialog.buttonCancel')}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  quitConfirmOpenRef.current = false
                  setQuitConfirmOpen(false)
                  window.exifmod?.confirmAppClose()
                }}
              >
                {t('ui.quitPendingConfirm')}
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
      {deletePresetConfirm ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDeletePresetConfirm(null)
          }}
        >
          <div
            className="modal modal-dialog-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-preset-confirm-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 id="delete-preset-confirm-title" className="modal-confirm-heading">
              {t('ui.deletePresetConfirmTitle')}
            </h3>
            <p className="modal-confirm-detail">{t('ui.deletePresetConfirmDetail', { name: deletePresetConfirm.name })}</p>
            <p className="modal-confirm-detail">{t('ui.deletePresetConfirmNote')}</p>
            <div className="modal-confirm-actions">
              <button type="button" className="btn" onClick={() => setDeletePresetConfirm(null)}>
                {t('dialog.buttonCancel')}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  void (async () => {
                    const c = deletePresetConfirm
                    if (!c) return
                    const api = window.exifmod
                    if (!api) {
                      showAppMessage('error', t('ui.preloadUnavailable'))
                      return
                    }
                    try {
                      await api.deletePreset(c.id)
                    } catch (e) {
                      showAppMessage('error', unwrapIpcErrorMessage(e))
                      setDeletePresetConfirm(null)
                      return
                    }
                    setDeletePresetConfirm(null)
                    const idField = idKeyForCategory(c.cat)
                    const clearField = categoryToClearKey(c.cat)
                    setPendingByPath((prev) => {
                      const next = { ...prev }
                      for (const key of Object.keys(next)) {
                        const st = next[key]
                        if (!st) continue
                        if (st[idField] === c.id) {
                          next[key] = { ...st, [idField]: null, [clearField]: false }
                        }
                      }
                      return next
                    })
                    setPresetEditor((pe) => (pe?.mode === 'edit' && pe.editId === c.id ? null : pe))
                    await reloadCatalog()
                  })()
                }}
              >
                {t('ui.deletePreset')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {clearUnusedLensMountConfirm ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setClearUnusedLensMountConfirm(null)
          }}
        >
          <div
            className="modal modal-dialog-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-unused-mount-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 id="clear-unused-mount-title" className="modal-confirm-heading">
              {t('ui.clearUnusedLensMountConfirmTitle')}
            </h3>
            <p className="modal-confirm-detail">
              {t('ui.clearUnusedLensMountConfirmDetail', { mount: clearUnusedLensMountConfirm })}
            </p>
            <div className="modal-confirm-actions">
              <button type="button" className="btn" onClick={() => setClearUnusedLensMountConfirm(null)}>
                {t('dialog.buttonCancel')}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  void (async () => {
                    const mount = clearUnusedLensMountConfirm
                    if (!mount) return
                    const api = window.exifmod
                    if (!api?.clearUnusedLensMount) {
                      showAppMessage('error', t('ui.preloadUnavailable'))
                      return
                    }
                    try {
                      await api.clearUnusedLensMount(mount)
                    } catch (e) {
                      showAppMessage('error', unwrapIpcErrorMessage(e))
                      setClearUnusedLensMountConfirm(null)
                      return
                    }
                    setClearUnusedLensMountConfirm(null)
                    await reloadCatalog()
                  })()
                }}
              >
                {t('ui.clearUnusedLensMountConfirmButton')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {lrcPluginInstallResult
        ? (() => {
            const m = lrcPluginInstallModalCopy(t, lrcPluginInstallResult)
            return (
              <div
                className="modal-backdrop"
                role="presentation"
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) setLrcPluginInstallResult(null)
                }}
              >
                <div
                  className="modal modal-dialog-confirm"
                  role="alertdialog"
                  aria-modal="true"
                  aria-labelledby="lrc-plugin-install-modal-title"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <h3 id="lrc-plugin-install-modal-title" className="modal-confirm-heading">
                    {m.title}
                  </h3>
                  <p className="modal-confirm-detail lr-plugin-install-modal-detail">{m.detail}</p>
                  <div className="modal-confirm-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => setLrcPluginInstallResult(null)}
                    >
                      {t('ui.appMessageDismiss')}
                    </button>
                  </div>
                </div>
              </div>
            )
          })()
        : null}
      {appMessageModal ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setAppMessageModal(null)
          }}
        >
          <div
            className="modal modal-dialog-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-message-modal-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 id="app-message-modal-title" className="modal-confirm-heading">
              {appMessageModal.variant === 'error' ? t('ui.appMessageErrorTitle') : t('ui.appMessageInfoTitle')}
            </h3>
            <p className="modal-confirm-detail modal-app-message-detail">{appMessageModal.detail}</p>
            <div className="modal-confirm-actions">
              <button type="button" className="btn btn-primary" onClick={() => setAppMessageModal(null)}>
                {t('ui.appMessageDismiss')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {managePresetsOpen && catalog && (
        <ManagePresetsPanel
          catalog={catalog}
          onClose={() => setManagePresetsOpen(false)}
          onAdd={(cat) => {
            setPresetEditor({
              mode: 'new',
              category: cat,
              editId: null,
              cloneFromId: null,
              targetPaths: stagingPaths.length ? [...stagingPaths] : undefined
            })
          }}
          onEdit={(cat, editId) => {
            setPresetEditor({
              mode: 'edit',
              category: cat,
              editId,
              cloneFromId: null,
              targetPaths: stagingPaths.length ? [...stagingPaths] : undefined
            })
          }}
          onClone={(cat, sourceId) => {
            setPresetEditor({
              mode: 'new',
              category: cat,
              editId: null,
              cloneFromId: sourceId,
              targetPaths: stagingPaths.length ? [...stagingPaths] : undefined
            })
          }}
          onDeleteRequest={(cat, presetId, displayName) => {
            setDeletePresetConfirm({ id: presetId, cat, name: displayName })
          }}
          onClearUnusedLensMountRequest={(mount) => setClearUnusedLensMountConfirm(mount)}
        />
      )}
      {presetEditor && catalog && (
        <PresetEditorModal
          mode={presetEditor.mode}
          category={presetEditor.category}
          editId={presetEditor.mode === 'edit' ? presetEditor.editId : null}
          cloneFromId={presetEditor.mode === 'new' ? presetEditor.cloneFromId ?? null : null}
          initialDraft={presetEditor.mode === 'new' ? presetEditor.initialDraft ?? null : null}
          onClose={() => setPresetEditor(null)}
          onSaved={(payload) => {
            const cat = payload.category
            const key = idKeyForCategory(cat)
            const clearKey = categoryToClearKey(cat)
            const paths =
              presetEditor.targetPaths != null && presetEditor.targetPaths.length > 0
                ? presetEditor.targetPaths
                : stagingPaths
            updatePendingForPaths(paths, (s) => ({
              ...s,
              [key]: payload.id,
              [clearKey]: false
            }))
            setRecentlySavedPreset({ id: payload.id, category: payload.category })
            void reloadCatalog()
          }}
        />
      )}
      <TutorialModal open={tutorialOpen} firstRun={tutorialFirstRun} onRequestClose={closeTutorial} />
    </div>
    {typeof document !== 'undefined' && fileListContextMenu
      ? createPortal(
          <>
            <div
              className="file-list-context-menu-backdrop"
              role="presentation"
              onMouseDown={() => setFileListContextMenu(null)}
            />
            <div
              className="file-list-context-menu"
              role="menu"
              aria-label={t('ui.fileListContextMenu')}
              style={{ left: fileListContextMenu.clientX, top: fileListContextMenu.clientY }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                className="file-list-context-menu-item"
                onClick={() => {
                  runFileListClearPending(fileListContextMenu.rowIndex)
                  setFileListContextMenu(null)
                }}
              >
                {t('ui.clearPendingChanges')}
              </button>
            </div>
          </>,
          document.body
        )
      : null}
    </>
  )
}
