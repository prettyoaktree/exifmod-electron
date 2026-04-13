/**
 * EXIF tag names cleared by metadata-pane "remove from image" per row.
 * Values are written as empty strings for ExifTool `-Tag=` deletion.
 */

export const CLEAR_CAMERA_TAGS = ['Make', 'Model'] as const
export const CLEAR_LENS_TAGS = ['LensModel', 'LensMake', 'Lens'] as const
export const CLEAR_AUTHOR_TAGS = ['Artist', 'Creator', 'Copyright', 'Author'] as const
export const CLEAR_SHUTTER_TAGS = ['ExposureTime', 'ShutterSpeedValue'] as const
export const CLEAR_APERTURE_TAGS = ['FNumber', 'ApertureValue'] as const

export function applyCategoryClears(
  out: Record<string, unknown>,
  flags: {
    clearCamera?: boolean
    clearLens?: boolean
    clearAuthor?: boolean
    clearShutter?: boolean
    clearAperture?: boolean
  }
): Record<string, unknown> {
  let m = out
  if (flags.clearCamera) {
    for (const t of CLEAR_CAMERA_TAGS) m = { ...m, [t]: '' }
  }
  if (flags.clearLens) {
    for (const t of CLEAR_LENS_TAGS) m = { ...m, [t]: '' }
  }
  if (flags.clearAuthor) {
    for (const t of CLEAR_AUTHOR_TAGS) m = { ...m, [t]: '' }
  }
  if (flags.clearShutter) {
    for (const t of CLEAR_SHUTTER_TAGS) m = { ...m, [t]: '' }
  }
  if (flags.clearAperture) {
    for (const t of CLEAR_APERTURE_TAGS) m = { ...m, [t]: '' }
  }
  return m
}
