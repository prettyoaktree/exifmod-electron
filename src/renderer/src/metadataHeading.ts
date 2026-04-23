export interface PickMetadataHeadingOptions {
  /** e.g. `Metadata: ` (colon + space) */
  prefix: string
  /** Remainder after listed names, e.g. `(n) => ' + ' + n + ' more'` */
  moreLabel: (remaining: number) => string
  fits: (line: string) => boolean
  /** When no name list fits (very narrow width), e.g. translated "Metadata — 5 files" */
  compactFallback: (fileCount: number) => string
}

/**
 * Builds a single-line metadata pane heading from full basenames (no mid-name truncation).
 * Lists as many leading names as fit, then `moreLabel(remaining)` when some are omitted.
 */
export function pickMetadataHeadingText(names: string[], options: PickMetadataHeadingOptions): string {
  const { prefix, moreLabel, fits, compactFallback } = options
  const n = names.length
  if (n === 0) return ''

  if (n === 1) {
    const line = prefix + names[0]!
    return fits(line) ? line : compactFallback(1)
  }

  for (let k = n; k >= 1; k--) {
    const joined = names.slice(0, k).join(', ')
    const line = k === n ? prefix + joined : prefix + joined + moreLabel(n - k)
    if (fits(line)) return line
  }

  return compactFallback(n)
}

let measureCanvas: HTMLCanvasElement | null = null

/** Width in CSS pixels for `text` using the given canvas `font` shorthand (from getComputedStyle). */
export function measureTextWidthCanvas(text: string, font: string): number {
  if (typeof document === 'undefined') return text.length * 8
  measureCanvas ??= document.createElement('canvas')
  const ctx = measureCanvas.getContext('2d')
  if (!ctx) return text.length * 8
  ctx.font = font
  return ctx.measureText(text).width
}
