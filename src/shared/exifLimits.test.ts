import { describe, expect, it } from 'vitest'
import {
  fitKeywordsForExif,
  IMAGEDESCRIPTION_MAX_UTF8_BYTES,
  KEYWORDS_MERGED_SUM_MAX_UTF8_BYTES,
  mergeImageDescriptionAppend,
  remainingUtf8BytesForAiDescription,
  utf8ByteLength
} from './exifLimits.js'

describe('remainingUtf8BytesForAiDescription', () => {
  it('is full budget when Notes are empty', () => {
    expect(remainingUtf8BytesForAiDescription('')).toBe(IMAGEDESCRIPTION_MAX_UTF8_BYTES)
    expect(remainingUtf8BytesForAiDescription('   ')).toBe(IMAGEDESCRIPTION_MAX_UTF8_BYTES)
  })

  it('reserves space for newline separator when appending', () => {
    const twenty = 'a'.repeat(20)
    expect(remainingUtf8BytesForAiDescription(twenty)).toBe(
      IMAGEDESCRIPTION_MAX_UTF8_BYTES - 20 - utf8ByteLength('\n\n')
    )
  })
})

describe('mergeImageDescriptionAppend', () => {
  it('returns addition alone when existing is empty', () => {
    const add = 'a'.repeat(100)
    expect(utf8ByteLength(mergeImageDescriptionAppend('', add))).toBeLessThanOrEqual(IMAGEDESCRIPTION_MAX_UTF8_BYTES)
  })

  it('keeps existing under limit when no room for append', () => {
    const head = 'x'.repeat(IMAGEDESCRIPTION_MAX_UTF8_BYTES)
    expect(mergeImageDescriptionAppend(head, 'NEW TEXT')).toBe(head)
  })

  it('appends up to remaining UTF-8 budget after separator', () => {
    const head = 'a'.repeat(900)
    const tail = 'b'.repeat(500)
    const out = mergeImageDescriptionAppend(head, tail)
    expect(utf8ByteLength(out)).toBeLessThanOrEqual(IMAGEDESCRIPTION_MAX_UTF8_BYTES)
    expect(out.startsWith(head)).toBe(true)
    expect(out).toContain('\n\n')
  })
})

describe('fitKeywordsForExif', () => {
  it('drops trailing tokens when sum exceeds budget', () => {
    const chunk = 'a'.repeat(200)
    const many = Array.from({ length: 400 }, () => chunk)
    const out = fitKeywordsForExif(many)
    let sum = 0
    for (const t of out) sum += utf8ByteLength(t)
    expect(sum).toBeLessThanOrEqual(KEYWORDS_MERGED_SUM_MAX_UTF8_BYTES)
    expect(out.length).toBeLessThan(many.length)
    expect(out[0]).toBe(chunk)
  })

  it('preserves order and clamps a single long token', () => {
    const long = 'z'.repeat(3000)
    const out = fitKeywordsForExif([long, 'a', 'b'])
    expect(out[0]!.length).toBeLessThanOrEqual(1024)
  })
})
