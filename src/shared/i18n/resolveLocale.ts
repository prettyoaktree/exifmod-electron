/** BCP 47 base language codes we ship resources for. */
const SUPPORTED = new Set(['en', 'fr'])

/**
 * Map OS / browser locale to a supported language (fallback `en`).
 */
export function resolveLocaleTag(locale: string | undefined | null): string {
  if (!locale || typeof locale !== 'string') return 'en'
  const base = locale.split(/[-_]/)[0]?.toLowerCase() ?? 'en'
  return SUPPORTED.has(base) ? base : 'en'
}
