import { useEffect, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { ConfigCatalog } from '@shared/types.js'
import type { Cat } from './categories.js'
import { filterOptionsByDisplayQuery } from './metadataPresetFilter.js'

const CATS: Cat[] = ['Camera', 'Lens', 'Film', 'Author']

const CAT_I18N: Record<
  Cat,
  | 'ui.managePresetsCategory.camera'
  | 'ui.managePresetsCategory.lens'
  | 'ui.managePresetsCategory.film'
  | 'ui.managePresetsCategory.author'
> = {
  Camera: 'ui.managePresetsCategory.camera',
  Lens: 'ui.managePresetsCategory.lens',
  Film: 'ui.managePresetsCategory.film',
  Author: 'ui.managePresetsCategory.author'
}

function valuesForCategory(catalog: ConfigCatalog, cat: Cat): string[] {
  const raw =
    cat === 'Camera'
      ? catalog.camera_values
      : cat === 'Lens'
        ? catalog.lens_values
        : cat === 'Film'
          ? catalog.film_values
          : catalog.author_values
  return (raw ?? []).filter((n) => n !== 'None')
}

function mapForCategory(catalog: ConfigCatalog, cat: Cat): Record<string, number> {
  return cat === 'Camera'
    ? catalog.camera_file_map
    : cat === 'Lens'
      ? catalog.lens_file_map
      : cat === 'Film'
        ? catalog.film_file_map
        : catalog.author_file_map
}

function collapsedCats(): Record<Cat, boolean> {
  return { Camera: false, Lens: false, Film: false, Author: false }
}

function PresetChevron(props: { open: boolean }): ReactElement {
  const { open } = props
  return (
    <span className={`exif-preview-chevron ${open ? 'exif-preview-chevron-open' : ''}`} aria-hidden>
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
  )
}

function IconPlus(): ReactElement {
  return (
    <svg
      className="preset-slideout-icon-svg"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden
      focusable="false"
    >
      <path
        d="M8 3v10M3 8h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconPencil(): ReactElement {
  return (
    <svg
      className="preset-slideout-icon-svg preset-slideout-icon-svg-sm"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function IconTrash(): ReactElement {
  return (
    <svg
      className="preset-slideout-icon-svg preset-slideout-icon-svg-sm"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6" />
    </svg>
  )
}

export function ManagePresetsPanel(props: {
  catalog: ConfigCatalog
  onClose: () => void
  onAdd: (cat: Cat) => void
  onEdit: (cat: Cat, editId: number) => void
  onClone: (cat: Cat, sourcePresetId: number) => void
  onDeleteRequest: (cat: Cat, presetId: number, displayName: string) => void
  onClearUnusedLensMountRequest: (mount: string) => void
}): ReactElement {
  const { t } = useTranslation()
  const { catalog, onClose, onAdd, onEdit, onClone, onDeleteRequest, onClearUnusedLensMountRequest } = props
  const catLabel = (cat: Cat): string => t(CAT_I18N[cat])
  const [catOpen, setCatOpen] = useState<Record<Cat, boolean>>(collapsedCats)
  const [filterByCat, setFilterByCat] = useState<Record<Cat, string>>({
    Camera: '',
    Lens: '',
    Film: '',
    Author: ''
  })
  const [unusedLensMounts, setUnusedLensMounts] = useState<string[]>([])
  const [unusedLensMountsLoading, setUnusedLensMountsLoading] = useState(true)
  const [unusedLensMountsError, setUnusedLensMountsError] = useState<string | null>(null)
  const [unusedMountsOpen, setUnusedMountsOpen] = useState(false)

  useEffect(() => {
    const api = window.exifmod
    if (!api?.unusedLensMounts) {
      setUnusedLensMountsLoading(false)
      setUnusedLensMountsError(null)
      return
    }
    setUnusedLensMountsLoading(true)
    setUnusedLensMountsError(null)
    void api
      .unusedLensMounts()
      .then((list) => {
        setUnusedLensMounts(list)
        setUnusedLensMountsLoading(false)
      })
      .catch((e: unknown) => {
        setUnusedLensMountsError(String(e))
        setUnusedLensMountsLoading(false)
      })
  }, [catalog])

  const showUnusedLensMountsSection =
    unusedLensMountsLoading || unusedLensMountsError != null || unusedLensMounts.length > 0

  useEffect(() => {
    if (!showUnusedLensMountsSection) {
      setUnusedMountsOpen(false)
    }
  }, [showUnusedLensMountsSection])

  return (
    <div className="preset-slideout-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside
        className="preset-slideout-panel"
        role="dialog"
        aria-labelledby="manage-presets-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="preset-slideout-head">
          <h2 id="manage-presets-title">{t('ui.managePresets')}</h2>
          <button
            type="button"
            className="preset-slideout-close"
            aria-label={t('ui.closePanel')}
            title={t('ui.closePanel')}
            onClick={onClose}
          >
            <svg
              className="preset-slideout-close-icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="preset-slideout-body">
          {CATS.map((cat) => {
            const names = valuesForCategory(catalog, cat)
            const map = mapForCategory(catalog, cat)
            const open = catOpen[cat]
            const filterQ = filterByCat[cat]
            const filteredNames = filterOptionsByDisplayQuery(names, filterQ, (n) => n)
            return (
              <section key={cat} className="preset-slideout-section">
                <div className="preset-slideout-cat-row">
                  <button
                    type="button"
                    className="preset-slideout-cat-toggle"
                    aria-expanded={open}
                    onClick={() =>
                      setCatOpen((o) => {
                        if (o[cat]) {
                          setFilterByCat((f) => ({ ...f, [cat]: '' }))
                        }
                        return { ...o, [cat]: !o[cat] }
                      })
                    }
                  >
                    <PresetChevron open={open} />
                    <span className="preset-slideout-cat-title">{catLabel(cat)}</span>
                  </button>
                  <button
                    type="button"
                    className="preset-slideout-icon-btn"
                    aria-label={t('ui.addPreset')}
                    title={t('ui.addPreset')}
                    onClick={() => onAdd(cat)}
                  >
                    <IconPlus />
                  </button>
                </div>
                {open ? (
                  <>
                    <div className="preset-slideout-filter-row">
                      <input
                        type="search"
                        className="input preset-slideout-filter"
                        value={filterQ}
                        placeholder={t('ui.filterPresetsPlaceholder')}
                        aria-label={t('ui.filterPresetsAria', { category: catLabel(cat) })}
                        onChange={(e) => setFilterByCat((f) => ({ ...f, [cat]: e.target.value }))}
                      />
                    </div>
                    <ul className="preset-slideout-list">
                      {filteredNames.length === 0 ? (
                        <li className="preset-slideout-list-empty" role="presentation">
                          {t('ui.presetListNoMatches')}
                        </li>
                      ) : (
                        filteredNames.map((name) => {
                          const id = map[name]
                          return (
                            <li key={name}>
                              <span className="preset-slideout-name">{name}</span>
                              <div className="preset-slideout-list-actions">
                                <button
                                  type="button"
                                  className="preset-slideout-icon-btn preset-slideout-icon-btn-row"
                                  aria-label={t('ui.edit')}
                                  title={t('ui.edit')}
                                  disabled={id == null}
                                  onClick={() => id != null && onEdit(cat, id)}
                                >
                                  <IconPencil />
                                </button>
                                <button
                                  type="button"
                                  className="preset-slideout-icon-btn preset-slideout-icon-btn-row preset-slideout-clone-btn"
                                  aria-label={t('ui.clonePresetAria', { name })}
                                  title={t('ui.clonePreset')}
                                  disabled={id == null}
                                  onClick={() => id != null && onClone(cat, id)}
                                >
                                  <span className="preset-slideout-clone-glyph" aria-hidden>
                                    ⧉
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  className="preset-slideout-icon-btn preset-slideout-icon-btn-row preset-slideout-icon-btn-danger"
                                  aria-label={t('ui.deletePresetAria', { name })}
                                  title={t('ui.deletePreset')}
                                  disabled={id == null}
                                  onClick={() => id != null && onDeleteRequest(cat, id, name)}
                                >
                                  <IconTrash />
                                </button>
                              </div>
                            </li>
                          )
                        })
                      )}
                    </ul>
                  </>
                ) : null}
              </section>
            )
          })}
          {showUnusedLensMountsSection ? (
            <section className="preset-slideout-section" aria-labelledby="unused-lens-mounts-heading">
              <div className="preset-slideout-cat-row">
                <button
                  type="button"
                  className="preset-slideout-cat-toggle preset-slideout-cat-toggle--unused-mounts"
                  aria-expanded={unusedMountsOpen}
                  onClick={() => setUnusedMountsOpen((o) => !o)}
                >
                  <PresetChevron open={unusedMountsOpen} />
                  <span id="unused-lens-mounts-heading" className="preset-slideout-cat-title">
                    {t('ui.unusedLensMountsSection')}
                  </span>
                </button>
                <div className="preset-slideout-cat-row-spacer" aria-hidden />
              </div>
              {unusedMountsOpen ? (
                <>
                  <p className="preset-slideout-unused-hint">{t('ui.unusedLensMountsHint')}</p>
                  {unusedLensMountsLoading ? (
                    <p className="preset-slideout-list-empty" role="status">
                      {t('ui.unusedLensMountsLoading')}
                    </p>
                  ) : unusedLensMountsError ? (
                    <p className="preset-slideout-list-empty" role="alert">
                      {unusedLensMountsError}
                    </p>
                  ) : (
                    <ul className="preset-slideout-list">
                      {unusedLensMounts.map((mount) => (
                        <li key={mount}>
                          <span className="preset-slideout-name">{mount}</span>
                          <div className="preset-slideout-list-actions">
                            <button
                              type="button"
                              className="preset-slideout-icon-btn preset-slideout-icon-btn-row preset-slideout-icon-btn-danger"
                              aria-label={t('ui.clearUnusedLensMountAria', { mount })}
                              title={t('ui.clearUnusedLensMountTitle')}
                              onClick={() => onClearUnusedLensMountRequest(mount)}
                            >
                              <IconTrash />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : null}
            </section>
          ) : null}
        </div>
      </aside>
    </div>
  )
}
