import type { CameraMetadata, LensMetadata } from './types.js'

export function filterLensValues(
  allLensValues: string[],
  cameraSelection: string,
  cameraSelectionFilename: number | string | null | undefined,
  cameraMetadataMap: Record<string, CameraMetadata>,
  lensMetadataMap: Record<string, LensMetadata>
): { allowed: string[]; state: 'readonly' | 'disabled' } {
  const metadata = cameraMetadataMap[cameraSelection] ?? {
    lens_system: 'interchangeable',
    lens_mount: null,
    lens_adaptable: false
  }
  const lensSystem = metadata.lens_system
  const lensMount = metadata.lens_mount
  const lensAdaptable = metadata.lens_adaptable ?? false

  let allowed: string[]
  let state: 'readonly' | 'disabled'

  if (!cameraSelectionFilename) {
    allowed = allLensValues
    state = 'readonly'
  } else if (lensSystem === 'fixed') {
    const fixedLensDisplay = String(metadata.fixed_lens_display ?? '').trim()
    allowed =
      fixedLensDisplay && fixedLensDisplay !== 'None' ? [fixedLensDisplay] : ['None']
    state = 'disabled'
  } else if (lensAdaptable) {
    allowed = allLensValues
    state = 'readonly'
  } else {
    allowed = allLensValues.filter(
      (name) => (lensMetadataMap[name] ?? { lens_mount: null }).lens_mount === lensMount
    )
    state = 'readonly'
  }
  const merged = ['None', ...[...allowed].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))]
  return { allowed: merged, state }
}
