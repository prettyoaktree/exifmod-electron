/**
 * Result of Help → Install Lightroom Classic Plugin (main `performLrPluginInstall`).
 * The renderer shows an in-app modal; user-facing copy uses i18n from these fields.
 */
export type LrPluginInstallResult =
  | { ok: true; isDev: boolean; pathRelease: string; pathDev: string | null }
  | { ok: false; error: 'unsupported' }
  | { ok: false; error: 'missing_bundle'; bundleName: string }
  | { ok: false; error: 'missing_electron'; path: string }
  | { ok: false; error: 'io'; message: string }
