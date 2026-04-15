/**
 * Adobe Camera Raw / Lightroom Classic embed develop settings under XMP `crs`.
 * In ExifTool's flattened `-j` output, `HasSettings` corresponds to `XMP-crs:HasSettings` when present.
 */
export function exiftoolHasSettingsMeansAdobeCrsDevelop(value: unknown): boolean {
  if (value === true) return true
  if (value === 1 || value === '1') return true
  if (typeof value === 'string' && value.toLowerCase() === 'true') return true
  return false
}
