import { i18next } from './i18n.js'

/** Map backend English issue lines to locale strings (preflight + catalog load issues). */
export function localizePreflightIssues(issues: string[]): string[] {
  return issues.map((s) => localizeOneIssue(s))
}

/** Single-line issue (e.g. exiftool validation). */
export function localizeIssueLine(s: string): string {
  return localizeOneIssue(s)
}

function localizeOneIssue(s: string): string {
  if (s === 'Preset database file is missing.') return i18next.t('preflight.dbFileMissing')
  if (s === 'No presets found in database.') return i18next.t('preflight.noPresets')
  if (s.startsWith('exiftool not found.')) return i18next.t('preflight.exiftoolNotFound')

  const execFail = s.match(/^exiftool cannot be executed from '([^']*)': (.*)$/)
  if (execFail) return i18next.t('preflight.exiftoolExecFailed', { path: execFail[1], detail: execFail[2] })

  if (s.startsWith('Preset database unavailable:')) {
    return i18next.t('preflight.dbUnavailable', { detail: s.slice('Preset database unavailable: '.length) })
  }

  const integ = s.match(/^Database integrity_check failed: (.+)$/)
  if (integ) return i18next.t('preflight.integrityFailed', { detail: integ[1] })

  const cat = s.match(/^Preset id=(\d+): invalid category (.+)\.$/)
  if (cat) return i18next.t('preflight.invalidCategory', { id: cat[1], category: cat[2] })

  const pj = s.match(/^Preset id=(\d+): invalid payload JSON: (.+)$/)
  if (pj) return i18next.t('preflight.invalidPayloadJson', { id: pj[1], detail: pj[2] })

  if (s.startsWith('Could not read database:')) {
    return i18next.t('preflight.couldNotReadDb', { detail: s.slice('Could not read database: '.length) })
  }

  if (s === 'Missing or invalid presets table.') return i18next.t('preflight.missingPresetsTable')

  return s
}
