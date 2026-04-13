import { useCallback, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'

const STEP_COUNT = 5

/** Same sparkles glyph as the main window AI control (decorative). */
function TutorialAiSparkIcon(): ReactElement {
  return (
    <svg className="tutorial-ai-spark-svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M12 2l1.2 4.2L17.4 7.4l-4.2 1.2L12 12.8l-1.2-4.2L6.6 7.4l4.2-1.2L12 2zm7 8l.8 2.8 2.8.8-2.8.8L19 17.4l-.8-2.8-2.8-.8 2.8-.8L19 10zM6 14l.6 2.2 2.2.6-2.2.6L6 19.8l-.6-2.2-2.2-.6 2.2-.6L6 14z"
      />
    </svg>
  )
}

/**
 * `Trans` overwrites children on void tags like `<icon></icon>`, which removed inline SVGs.
 * These wrappers ignore injected `children` and always render the icon.
 */
function TutorialTransAiSlot(_props: { children?: ReactNode }): ReactElement {
  return (
    <span className="tutorial-ref tutorial-ref--ai-chip" aria-hidden>
      <TutorialAiSparkIcon />
    </span>
  )
}

function TutorialTransGearSlot(_props: { children?: ReactNode }): ReactElement {
  const { t } = useTranslation()
  const label = t('ui.managePresets')
  return (
    <span className="tutorial-ref tutorial-ref--gear-wrap" title={label} aria-label={label}>
      <TutorialGearIcon />
    </span>
  )
}

/** Same gear paths as `btn-meta-gear` in the metadata header. */
function TutorialGearIcon(): ReactElement {
  return (
    <svg
      className="tutorial-gear-svg"
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
  )
}

export function TutorialModal(props: {
  open: boolean
  /** True when opened automatically on first launch (or simulate). */
  firstRun: boolean
  onRequestClose: () => void
}): ReactElement | null {
  const { t } = useTranslation()
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (props.open) setStep(0)
  }, [props.open])

  const close = useCallback(() => {
    props.onRequestClose()
  }, [props.onRequestClose])

  useEffect(() => {
    if (!props.open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props.open, close])

  const openFolder = t('ui.openFolder')
  const previewExif = t('ui.previewExifChanges')
  const writePending = t('ui.writePendingChanges')
  const pendingBadge = t('ui.pending')

  const bodyParams: Record<string, string> = {
    openFolder,
    previewExif,
    writePending,
    pendingBadge
  }

  const bodyKey = `tutorial.step${step + 1}Body` as const

  const transComponents = useMemo(
    () => ({
      blue: <span className="tutorial-ref tutorial-ref--blue" />,
      green: <span className="tutorial-ref tutorial-ref--green" />,
      red: <span className="tutorial-ref tutorial-ref--red" />,
      pending: <span className="tutorial-ref tutorial-ref--pending-badge" />,
      icon: <TutorialTransAiSlot />,
      gear: <TutorialTransGearSlot />
    }),
    []
  )

  if (!props.open) return null

  const isLast = step >= STEP_COUNT - 1
  const titleKey = `tutorial.step${step + 1}Title` as const

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div
        className="modal modal-dialog-confirm modal-tutorial"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-dialog-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {props.firstRun && step === 0 ? <p className="tutorial-first-run-lead">{t('tutorial.firstRunLead')}</p> : null}
        <h3 className="modal-confirm-heading" id="tutorial-dialog-title">
          {t(titleKey)}
        </h3>
        <div className="tutorial-step-meta">{t('tutorial.stepOf', { current: step + 1, total: STEP_COUNT })}</div>
        <div className="tutorial-body">
          <p className="tutorial-body-text">
            <Trans i18nKey={bodyKey} values={bodyParams} components={transComponents} />
          </p>
        </div>
        <div className="modal-confirm-actions tutorial-actions">
          <button type="button" className="btn" onClick={close}>
            {t('tutorial.close')}
          </button>
          <div className="tutorial-nav">
            <button
              type="button"
              className="btn"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              {t('tutorial.back')}
            </button>
            {!isLast ? (
              <button type="button" className="btn btn-primary tutorial-modal-btn-primary" onClick={() => setStep((s) => Math.min(STEP_COUNT - 1, s + 1))}>
                {t('tutorial.next')}
              </button>
            ) : (
              <button type="button" className="btn btn-primary tutorial-modal-btn-primary" onClick={close}>
                {t('tutorial.done')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
