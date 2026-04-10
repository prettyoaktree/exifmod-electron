import type { MergeImportSkip } from '../shared/types.js'
import { i18next } from './i18n.js'
import { localizePreflightIssues } from './localizePreflight.js'

export function localizeSkipReason(skip: MergeImportSkip): string {
  const r = skip.reason
  if (r === 'Skipped: preset name is empty.') return i18next.t('mergeImport.skipEmptyName')

  const inv = r.match(/^Skipped: invalid payload JSON \((.+)\)\.$/)
  if (inv) return i18next.t('mergeImport.skipInvalidPayload', { detail: inv[1] })

  const dup = r.match(/^A preset named "([^"]*)" already exists in category "([^"]*)"\.$/)
  if (dup) return i18next.t('mergeImport.skipDuplicate', { name: dup[1], category: dup[2] })

  if (r.startsWith('Unsupported preset category:')) {
    return i18next.t('mergeImport.unsupportedCategory', {
      category: r.slice('Unsupported preset category: '.length)
    })
  }

  if (r.startsWith('Skipped:')) {
    return i18next.t('mergeImport.skipGeneric', { detail: r.replace(/^Skipped:\s*/i, '') })
  }

  return r
}

const INVALID_DB_PREFIX = 'The selected file is not a valid ExifMod preset database:\n\n'

/** Localize thrown Error message from merge/import preset flows. */
export function localizeMergeErrorMessage(message: string): string {
  if (message.startsWith('File not found:')) {
    const path = message.slice('File not found: '.length)
    return i18next.t('mergeImport.fileNotFound', { path })
  }
  if (message.startsWith(INVALID_DB_PREFIX)) {
    const body = message.slice(INVALID_DB_PREFIX.length)
    const localized = localizePreflightIssues(body.split('\n')).join('\n')
    return i18next.t('mergeImport.invalidDb', { detail: localized })
  }
  return message
}

export function localizeExportErrorMessage(message: string): string {
  if (message === 'Preset database not found.') return i18next.t('importExport.exportDbNotFound')
  const m = message.match(/^Cannot export: preset database is invalid:\n([\s\S]*)$/)
  if (m) {
    const lines = m[1].split('\n').filter((line) => line.length > 0)
    return i18next.t('importExport.exportInvalid', { detail: localizePreflightIssues(lines).join('\n') })
  }
  return message
}
