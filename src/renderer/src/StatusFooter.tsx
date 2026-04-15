import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { UpdaterUiPayload as UpdaterUiState } from '@shared/updaterUi.js'

export type ApplicationPhase = 'verifying' | 'ok' | 'error'

export type StatusLightKind = 'pending' | 'ok' | 'warn' | 'error' | 'progress'

type SegmentId = 'application' | 'ollama' | 'updates'

type OllamaSession =
  | 'checking'
  | 'server_down'
  | 'launching'
  | 'ready'
  | 'declined'
  | 'failed'
  | 'no_install'

type FooterSegmentProps = {
  segmentId: SegmentId
  light: StatusLightKind
  label: string
  panelTitle: string
  isOpen: boolean
  onToggle: () => void
  dismissDisabled: boolean
  /** When true, other segments cannot steal focus from this panel opening */
  blocksOtherPanels: boolean
  children: ReactNode
  /** Optional ref to the panel root (e.g. for focus management) */
  panelRef?: React.RefObject<HTMLDivElement | null>
}

function StatusFooterSegment({
  segmentId,
  light,
  label,
  panelTitle,
  isOpen,
  onToggle,
  dismissDisabled,
  blocksOtherPanels,
  children,
  panelRef
}: FooterSegmentProps): React.ReactElement {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const localPanelRef = useRef<HTMLDivElement>(null)
  const panelTitleId = useId()
  const setPanelDom = useCallback(
    (node: HTMLDivElement | null) => {
      ;(localPanelRef as React.MutableRefObject<HTMLDivElement | null>).current = node
      if (panelRef) {
        ;(panelRef as React.MutableRefObject<HTMLDivElement | null>).current = node
      }
    },
    [panelRef]
  )
  const panelEl = panelRef ?? localPanelRef
  const [panelPos, setPanelPos] = useState<{ left: number; bottom: number; width: number } | null>(null)

  const updatePosition = useCallback(() => {
    const el = triggerRef.current
    if (!el || !isOpen) {
      setPanelPos(null)
      return
    }
    const r = el.getBoundingClientRect()
    const w = Math.min(420, Math.max(280, window.innerWidth * 0.9))
    let left = r.left
    if (left + w > window.innerWidth - 8) left = window.innerWidth - 8 - w
    if (left < 8) left = 8
    setPanelPos({ left, bottom: window.innerHeight - r.top + 6, width: w })
  }, [isOpen])

  useLayoutEffect(() => {
    updatePosition()
    if (!isOpen) return
    const ro = () => updatePosition()
    window.addEventListener('resize', ro)
    window.addEventListener('scroll', ro, true)
    return () => {
      window.removeEventListener('resize', ro)
      window.removeEventListener('scroll', ro, true)
    }
  }, [isOpen, updatePosition])

  useEffect(() => {
    if (!isOpen || dismissDisabled) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onToggle()
    }
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || panelEl.current?.contains(t)) return
      onToggle()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [isOpen, dismissDisabled, onToggle, panelEl])

  const triggerLabelId = useId()

  const lightClass =
    light === 'pending'
      ? 'status-footer-light--pending'
      : light === 'ok'
        ? 'status-footer-light--ok'
        : light === 'warn'
          ? 'status-footer-light--warn'
          : light === 'error'
            ? 'status-footer-light--error'
            : 'status-footer-light--progress'

  const onTriggerKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (!dismissDisabled || !isOpen) onToggle()
    }
  }

  const panel =
    isOpen && panelPos ? (
      <div
        ref={setPanelDom}
        className="status-footer-panel"
        role="region"
        aria-labelledby={panelTitleId}
        style={{
          position: 'fixed',
          left: panelPos.left,
          bottom: panelPos.bottom,
          width: panelPos.width,
          zIndex: 10000
        }}
      >
        <div className="status-footer-panel-title" id={panelTitleId}>
          {panelTitle}
        </div>
        <div className="status-footer-panel-body">{children}</div>
      </div>
    ) : null

  return (
    <div className={`status-footer-segment ${blocksOtherPanels && isOpen ? 'status-footer-segment--blocking' : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className="status-footer-segment-trigger"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-controls={isOpen ? `status-footer-panel-${segmentId}` : undefined}
        id={triggerLabelId}
        onClick={() => {
          if (dismissDisabled && isOpen) return
          onToggle()
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span className={['status-footer-light', lightClass].join(' ')} aria-hidden />
        <span className="status-footer-segment-label">{label}</span>
        <span className={['status-footer-chevron', isOpen ? 'status-footer-chevron--open' : ''].filter(Boolean).join(' ')} aria-hidden>
          <svg className="status-footer-chevron-svg" viewBox="0 0 24 24" focusable="false">
            <path
              fill="currentColor"
              d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"
            />
          </svg>
        </span>
      </button>
      {panel
        ? createPortal(
            <div id={`status-footer-panel-${segmentId}`} className="status-footer-panel-portal-root">
              {panel}
            </div>,
            document.body
          )
        : null}
    </div>
  )
}

export type StatusFooterProps = {
  applicationPhase: ApplicationPhase
  applicationMessages: string[]
  preloadMissing: boolean
  ollamaSession: OllamaSession
  ollamaStartError: string | null
  updaterSupported: boolean
  updaterState: UpdaterUiState
  onOllamaStart: () => void
  onOllamaNotNow: () => void
  onUpdaterDownload: () => void
  onUpdaterRestart: () => void
  onUpdaterLater: () => void
  /** Help → Check for Updates and in-panel “Check” use the same IPC path when updates are supported. */
  onUpdaterCheck?: () => void
}

export function StatusFooter({
  applicationPhase,
  applicationMessages,
  preloadMissing,
  ollamaSession,
  ollamaStartError,
  updaterSupported,
  updaterState,
  onOllamaStart,
  onOllamaNotNow,
  onUpdaterDownload,
  onUpdaterRestart,
  onUpdaterLater,
  onUpdaterCheck
}: StatusFooterProps): React.ReactElement {
  const { t } = useTranslation()
  const [openSegment, setOpenSegment] = useState<SegmentId | null>(null)
  const applicationPanelRef = useRef<HTMLDivElement>(null)
  const prevPhaseRef = useRef<ApplicationPhase>(applicationPhase)

  const applicationDismissDisabled = applicationPhase === 'error'
  const applicationLight: StatusLightKind =
    applicationPhase === 'verifying' ? 'pending' : applicationPhase === 'ok' ? 'ok' : 'error'

  const ollamaLight: StatusLightKind = (() => {
    if (ollamaStartError) return 'error'
    if (ollamaSession === 'checking' || ollamaSession === 'launching') return 'progress'
    if (ollamaSession === 'ready') return 'ok'
    return 'warn'
  })()

  const updaterLight: StatusLightKind = (() => {
    if (updaterState.kind === 'error') return 'error'
    if (updaterState.kind === 'checking' || updaterState.kind === 'downloading') return 'progress'
    if (updaterState.kind === 'available' || updaterState.kind === 'downloaded') return 'warn'
    return 'ok'
  })()

  useEffect(() => {
    const prev = prevPhaseRef.current
    prevPhaseRef.current = applicationPhase
    if (prev !== 'error' && applicationPhase === 'error') {
      setOpenSegment('application')
    }
    if (prev === 'error' && applicationPhase === 'ok') {
      setOpenSegment(null)
    }
  }, [applicationPhase])

  useEffect(() => {
    if (applicationPhase !== 'error' || openSegment !== 'application') return
    const el = applicationPanelRef.current
    if (!el) return
    const live = el.querySelector('[data-application-issues]') as HTMLElement | null
    live?.focus?.()
  }, [applicationPhase, openSegment])

  /** Help → Check for Updates (and `updater:check`) push `checking` from main — surface it in the footer. */
  useEffect(() => {
    if (!updaterSupported) return
    if (updaterState.kind !== 'checking') return
    if (applicationPhase === 'error') return
    setOpenSegment('updates')
  }, [updaterSupported, updaterState.kind, applicationPhase])

  const setSegmentOpen = useCallback(
    (id: SegmentId, open: boolean): void => {
      if (applicationDismissDisabled && id !== 'application' && open) return
      if (open) {
        if (applicationDismissDisabled && openSegment === 'application' && id !== 'application') return
        setOpenSegment(id)
      } else {
        setOpenSegment((cur) => (cur === id ? null : cur))
      }
    },
    [applicationDismissDisabled, openSegment]
  )

  const toggle = (id: SegmentId): void => {
    setSegmentOpen(id, openSegment !== id)
  }

  const applicationTitle =
    applicationPhase === 'verifying'
      ? t('ui.statusFooter.applicationCheckingTitle')
      : applicationPhase === 'ok'
        ? t('ui.statusFooter.applicationOkTitle')
        : t('ui.statusFooter.applicationErrorTitle')

  const applicationBody = preloadMissing ? (
    <div
      className="status-footer-panel-message"
      dangerouslySetInnerHTML={{ __html: t('ui.errorPreloadBody') }}
    />
  ) : applicationPhase === 'verifying' ? (
    <p className="status-footer-panel-message">{t('ui.statusFooter.applicationCheckingBody')}</p>
  ) : applicationMessages.length ? (
    <ul
      className="status-footer-issue-list"
      data-application-issues
      tabIndex={applicationPhase === 'error' ? 0 : -1}
      aria-live={applicationPhase === 'error' ? 'assertive' : undefined}
    >
      {applicationMessages.map((msg, i) => (
        <li key={i}>{msg}</li>
      ))}
    </ul>
  ) : (
    <p className="status-footer-panel-message">{t('ui.statusFooter.applicationOkBody')}</p>
  )

  const ollamaBody = (() => {
    if (ollamaSession === 'checking') return <p className="status-footer-panel-message">{t('ui.aiDescribeOllamaChecking')}</p>
    if (ollamaSession === 'launching') return <p className="status-footer-panel-message">{t('ui.aiDescribeOllamaLaunching')}</p>
    if (ollamaSession === 'ready') return <p className="status-footer-panel-message">{t('ui.statusFooter.ollamaReadyBody')}</p>
    if (ollamaSession === 'no_install')
      return <p className="status-footer-panel-message">{t('ui.aiDescribeOllamaNotInstalled')}</p>
    if (ollamaSession === 'declined' || ollamaSession === 'failed')
      return <p className="status-footer-panel-message">{t('ui.aiDescribeOllamaUnavailable')}</p>
    if (ollamaSession === 'server_down') {
      return (
        <>
          <p className="status-footer-panel-message">{t('ui.ollamaInlineHint')}</p>
          {ollamaStartError ? (
            <p className="status-footer-panel-message status-footer-panel-message--error" title={ollamaStartError}>
              {ollamaStartError}
            </p>
          ) : null}
          <div className="status-footer-panel-actions">
            <button type="button" className="btn btn-primary" onClick={() => onOllamaStart()}>
              {t('ui.ollamaInlineStart')}
            </button>
            <button type="button" className="btn" onClick={() => onOllamaNotNow()}>
              {t('dialog.ollamaButtonNotNow')}
            </button>
          </div>
        </>
      )
    }
    return <p className="status-footer-panel-message">{t('ui.aiDescribeOllamaUnavailable')}</p>
  })()

  const updaterBody = (() => {
    if (!updaterSupported) return null
    switch (updaterState.kind) {
      case 'idle':
        return (
          <>
            <p className="status-footer-panel-message">{t('ui.statusFooter.updaterIdleBody')}</p>
            {onUpdaterCheck ? (
              <div className="status-footer-panel-actions">
                <button type="button" className="btn btn-primary" onClick={() => onUpdaterCheck()}>
                  {t('menu.checkForUpdates')}
                </button>
              </div>
            ) : null}
          </>
        )
      case 'checking':
        return <p className="status-footer-panel-message">{t('ui.statusFooter.updaterCheckingBody')}</p>
      case 'available':
        return (
          <>
            <p className="status-footer-panel-message">
              {t('updater.updateAvailableDetail', { version: updaterState.version })}
            </p>
            <div className="status-footer-panel-actions">
              <button type="button" className="btn btn-primary" onClick={() => onUpdaterDownload()}>
                {t('updater.downloadButton')}
              </button>
              <button type="button" className="btn" onClick={() => onUpdaterLater()}>
                {t('updater.laterButton')}
              </button>
            </div>
          </>
        )
      case 'downloading':
        return (
          <>
            <p className="status-footer-panel-message">
              {t('ui.statusFooter.updaterDownloading', { percent: Math.round(updaterState.percent) })}
            </p>
            <div className="status-footer-progress-track" aria-hidden>
              <div
                className="status-footer-progress-fill"
                style={{ width: `${Math.min(100, Math.max(0, updaterState.percent))}%` }}
              />
            </div>
          </>
        )
      case 'downloaded':
        return (
          <>
            <p className="status-footer-panel-message">{t('updater.downloadedDetail')}</p>
            <div className="status-footer-panel-actions">
              <button type="button" className="btn btn-primary" onClick={() => onUpdaterRestart()}>
                {t('updater.restartButton')}
              </button>
              <button type="button" className="btn" onClick={() => onUpdaterLater()}>
                {t('updater.laterButton')}
              </button>
            </div>
          </>
        )
      case 'error':
        return (
          <>
            <p className="status-footer-panel-message status-footer-panel-message--error">{updaterState.message}</p>
            <div className="status-footer-panel-actions">
              <button type="button" className="btn" onClick={() => onUpdaterLater()}>
                {t('ui.closePanel')}
              </button>
            </div>
          </>
        )
      case 'upToDate':
        return <p className="status-footer-panel-message">{t('updater.upToDateDetail', { version: updaterState.version })}</p>
    }
  })()

  return (
    <footer className="status-footer" role="contentinfo">
      <StatusFooterSegment
        segmentId="application"
        light={applicationLight}
        label={t('ui.statusFooter.applicationLabel')}
        panelTitle={applicationTitle}
        isOpen={openSegment === 'application'}
        dismissDisabled={applicationDismissDisabled}
        blocksOtherPanels={applicationDismissDisabled && openSegment === 'application'}
        onToggle={() => toggle('application')}
        panelRef={applicationPanelRef}
      >
        {applicationBody}
      </StatusFooterSegment>
      <StatusFooterSegment
        segmentId="ollama"
        light={ollamaLight}
        label={t('ui.statusFooter.ollamaLabel')}
        panelTitle={t('ui.statusFooter.ollamaPanelTitle')}
        isOpen={openSegment === 'ollama'}
        dismissDisabled={false}
        blocksOtherPanels={false}
        onToggle={() => toggle('ollama')}
      >
        {ollamaBody}
      </StatusFooterSegment>
      {updaterSupported ? (
        <StatusFooterSegment
          segmentId="updates"
          light={updaterLight}
          label={t('ui.statusFooter.updatesLabel')}
          panelTitle={t('ui.statusFooter.updatesPanelTitle')}
          isOpen={openSegment === 'updates'}
          dismissDisabled={false}
          blocksOtherPanels={false}
          onToggle={() => toggle('updates')}
        >
          {updaterBody}
        </StatusFooterSegment>
      ) : null}
    </footer>
  )
}
