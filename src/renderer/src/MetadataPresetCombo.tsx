import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type Ref
} from 'react'
import { filterOptionsByDisplayQuery } from './metadataPresetFilter.js'

export interface MetadataPresetComboProps {
  options: string[]
  /** Internal preset id name for the current selection (e.g. "None"). */
  valueInternal: string
  /** Localized label shown when the list is closed. */
  valueDisplay: string
  toDisplay: (internal: string) => string
  onPickDisplay: (displayLabel: string) => void
  disabled?: boolean
  neutralValue?: boolean
  pendingHighlight?: boolean
  /** App Tab roving handler (only reacts to Tab). */
  onKeyDownTabChain: (e: KeyboardEvent<HTMLInputElement>) => void
  noMatchesLabel: string
  /** Accessible name for the combobox input. */
  ariaLabel: string
}

export const MetadataPresetCombo = forwardRef(function MetadataPresetCombo(
  props: MetadataPresetComboProps,
  ref: Ref<HTMLInputElement>
): ReactElement {
  const {
    options,
    valueInternal,
    valueDisplay,
    toDisplay,
    onPickDisplay,
    disabled = false,
    neutralValue = false,
    pendingHighlight = false,
    onKeyDownTabChain,
    noMatchesLabel,
    ariaLabel
  } = props

  const listId = useId()
  const [open, setOpen] = useState(false)
  const [filterText, setFilterText] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const highlightIndexRef = useRef(0)

  const setRefs = useCallback(
    (el: HTMLInputElement | null) => {
      inputRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el
    },
    [ref]
  )

  const filtered = useMemo(
    () => filterOptionsByDisplayQuery(options, open ? filterText : '', toDisplay),
    [options, open, filterText, toDisplay]
  )

  const indexOfCurrentInFullList = useMemo(() => {
    const all = filterOptionsByDisplayQuery(options, '', toDisplay)
    const i = all.findIndex((o) => o === valueInternal)
    return i >= 0 ? i : 0
  }, [options, valueInternal, toDisplay])

  const filterTextPrev = useRef<string | null>(null)
  useEffect(() => {
    if (!open) {
      filterTextPrev.current = null
      return
    }
    if (filterTextPrev.current !== null && filterTextPrev.current !== filterText) {
      setHighlightIndex(0)
    }
    filterTextPrev.current = filterText
  }, [filterText, open])

  useEffect(() => {
    if (!open || filtered.length === 0) return
    setHighlightIndex((h) => Math.min(Math.max(h, 0), filtered.length - 1))
  }, [filtered.length, open])

  useEffect(() => {
    highlightIndexRef.current = highlightIndex
  }, [highlightIndex])

  useEffect(() => {
    if (!open || filtered.length === 0) return
    const listEl = listRef.current
    if (!listEl) return
    const optId = `${listId}-opt-${highlightIndex}`
    const optEl = listEl.querySelector(`#${CSS.escape(optId)}`)
    optEl?.scrollIntoView({ block: 'nearest' })
  }, [highlightIndex, open, filtered.length, listId])

  const close = useCallback(() => {
    setOpen(false)
    setFilterText('')
  }, [])

  const pick = useCallback(
    (internal: string) => {
      onPickDisplay(toDisplay(internal))
      close()
      inputRef.current?.focus()
    },
    [close, onPickDisplay, toDisplay]
  )

  useEffect(() => {
    if (!open) return
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (containerRef.current?.contains(t)) return
      close()
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [open, close])

  const inputValue = open ? filterText : valueDisplay

  const onInputChange = (v: string) => {
    if (!open) {
      filterTextPrev.current = null
      setOpen(true)
      setFilterText(v)
      setHighlightIndex(0)
      return
    }
    setFilterText(v)
  }

  const onInputClick = () => {
    if (disabled || open) return
    filterTextPrev.current = null
    setFilterText('')
    setOpen(true)
    setHighlightIndex(indexOfCurrentInFullList)
  }

  const onInputFocus = () => {
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (el && document.activeElement === el) el.select()
    })
  }

  const toggleOpen = () => {
    if (disabled) return
    if (open) close()
    else {
      filterTextPrev.current = null
      setFilterText('')
      setOpen(true)
      setHighlightIndex(indexOfCurrentInFullList)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab') {
      if (open) close()
      onKeyDownTabChain(e)
      return
    }
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault()
        e.stopPropagation()
        close()
      }
      return
    }
    if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      e.stopPropagation()
      if (filtered.length === 0) return
      const delta = e.key === 'ArrowDown' ? 1 : -1
      setHighlightIndex((h) => {
        const next = h + delta
        if (next < 0) return filtered.length - 1
        if (next >= filtered.length) return 0
        return next
      })
      return
    }
    if (open && e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      const hi = highlightIndexRef.current
      const opt = filtered[hi]
      if (opt != null) pick(opt)
      return
    }
  }

  const activeId =
    open && filtered.length > 0 ? `${listId}-opt-${highlightIndex}` : undefined

  return (
    <div ref={containerRef} className="metadata-preset-combo">
      <div className="metadata-preset-combo-input-row">
        <input
          ref={setRefs}
          type="text"
          tabIndex={-1}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-label={ariaLabel}
          disabled={disabled}
          className={[
            neutralValue ? 'input input--neutral-value' : 'input',
            pendingHighlight ? 'meta-value-pending' : ''
          ]
            .filter(Boolean)
            .join(' ')}
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onClick={onInputClick}
          onFocus={onInputFocus}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          tabIndex={-1}
          className="metadata-preset-combo-toggle"
          aria-hidden
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleOpen}
        >
          <span className={`metadata-preset-combo-chevron ${open ? 'metadata-preset-combo-chevron-open' : ''}`}>
            <svg viewBox="0 0 10 10" width="10" height="10" focusable="false" aria-hidden>
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
        </button>
      </div>
      {open ? (
        <ul
          ref={listRef}
          id={listId}
          className="metadata-preset-combo-list"
          role="listbox"
          aria-label={ariaLabel}
        >
          {filtered.length === 0 ? (
            <li className="metadata-preset-combo-empty" role="presentation">
              {noMatchesLabel}
            </li>
          ) : (
            filtered.map((opt, i) => {
              const id = `${listId}-opt-${i}`
              const selected = opt === valueInternal
              return (
                <li
                  key={opt}
                  id={id}
                  role="option"
                  aria-selected={selected}
                  className={[
                    'metadata-preset-combo-option',
                    i === highlightIndex ? 'metadata-preset-combo-option-active' : '',
                    selected ? 'metadata-preset-combo-option-selected' : ''
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlightIndex(i)}
                  onClick={() => pick(opt)}
                >
                  {toDisplay(opt)}
                </li>
              )
            })
          )}
        </ul>
      ) : null}
    </div>
  )
})
