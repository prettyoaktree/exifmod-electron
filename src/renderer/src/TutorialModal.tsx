import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

const STEP_COUNT = 5

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

  if (!props.open) return null

  const isLast = step >= STEP_COUNT - 1
  const titleKey = `tutorial.step${step + 1}Title` as const
  const bodyKey = `tutorial.step${step + 1}Body` as const

  const openFolder = t('ui.openFolder')
  const previewExif = t('ui.previewExifChanges')
  const writePending = t('ui.writePendingChanges')
  const clearPending = t('ui.clearPendingChanges')
  const managePresets = t('ui.managePresets')
  const importDb = t('menu.importPresetDatabase')
  const exportDb = t('menu.exportPresetDatabase')

  const bodyParams: Record<string, string> = {
    openFolder,
    previewExif,
    writePending,
    clearPending,
    managePresets,
    importDb,
    exportDb
  }

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
          <p className="tutorial-body-text">{t(bodyKey, bodyParams)}</p>
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
              <button type="button" className="btn btn-primary" onClick={() => setStep((s) => Math.min(STEP_COUNT - 1, s + 1))}>
                {t('tutorial.next')}
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={close}>
                {t('tutorial.done')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
