/**
 * Re-exports shared EXIF write diff + UI highlight helpers for the renderer bundle.
 */

export {
  diffWritePayloadFromMetadata,
  diffToAttributeHighlights,
  emptyDiffAttributeHighlights,
  mergeDiffAttributeHighlights,
  writePayloadMatchesFile,
  type DiffAttributeHighlights
} from '@shared/exifPayloadDiff.js'
