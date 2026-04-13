import { useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { ConfigCatalog } from '@shared/types.js'
import type { Cat } from './categories.js'
import { filterOptionsByDisplayQuery } from './metadataPresetFilter.js'

const CATS: Cat[] = ['Camera', 'Lens', 'Film', 'Author']

const CAT_I18N: Record<Cat, 'category.camera' | 'category.lens' | 'category.film' | 'category.author'> = {
  Camera: 'category.camera',
  Lens: 'category.lens',
  Film: 'category.film',
  Author: 'category.author'
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

export function ManagePresetsPanel(props: {
  catalog: ConfigCatalog
  onClose: () => void
  onAdd: (cat: Cat) => void
  onEdit: (cat: Cat, editId: number) => void
}): ReactElement {
  const { t } = useTranslation()
  const { catalog, onClose, onAdd, onEdit } = props
  const catLabel = (cat: Cat): string => t(CAT_I18N[cat])
  const [catOpen, setCatOpen] = useState<Record<Cat, boolean>>(collapsedCats)
  const [filterByCat, setFilterByCat] = useState<Record<Cat, string>>({
    Camera: '',
    Lens: '',
    Film: '',
    Author: ''
  })

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
        </div>
      </aside>
    </div>
  )
}
