#!/usr/bin/env node
/**
 * Ensures locales/en.json and locales/fr.json share the same key tree, and that
 * every key is referenced from src/ (static t('a.b') / i18next.t('a.b') calls) or
 * is listed as a known dynamic/indirect reference.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

/** Leaf keys as dot paths (e.g. ui.openFolder). */
function flattenLeafKeys(obj, prefix = '') {
  const out = []
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...flattenLeafKeys(v, p))
    } else {
      out.push(p)
    }
  }
  return out
}

function walkSrcFiles(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walkSrcFiles(p, acc)
    else if (/\.(ts|tsx|js)$/.test(e.name)) acc.push(p)
  }
  return acc
}

/** Keys looked up via variables (t(titleKey), t(CAT_I18N[cat]), Trans i18nKey={bodyKey}). */
const IMPLICIT_REFERENCES = new Set([
  ...['camera', 'lens', 'film', 'author'].map((c) => `category.${c}`),
  ...Array.from({ length: 5 }, (_, i) => {
    const n = i + 1
    return [`tutorial.step${n}Title`, `tutorial.step${n}Body`]
  }).flat()
])

const T_CALL = /(?:^|[^\w.])(?:i18next\.)?t\(\s*['"]([^'"]+)['"]/g

function main() {
  const enPath = path.join(root, 'locales', 'en.json')
  const frPath = path.join(root, 'locales', 'fr.json')
  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'))
  const fr = JSON.parse(fs.readFileSync(frPath, 'utf8'))

  const enKeys = new Set(flattenLeafKeys(en))
  const frKeys = new Set(flattenLeafKeys(fr))

  const onlyEn = [...enKeys].filter((k) => !frKeys.has(k)).sort()
  const onlyFr = [...frKeys].filter((k) => !enKeys.has(k)).sort()
  if (onlyEn.length || onlyFr.length) {
    console.error('locales/en.json and locales/fr.json keys differ.')
    if (onlyEn.length) console.error('Only in en:', onlyEn.join(', '))
    if (onlyFr.length) console.error('Only in fr:', onlyFr.join(', '))
    process.exit(1)
  }

  const referenced = new Set(IMPLICIT_REFERENCES)
  const srcRoot = path.join(root, 'src')
  for (const file of walkSrcFiles(srcRoot)) {
    const text = fs.readFileSync(file, 'utf8')
    let m
    while ((m = T_CALL.exec(text)) !== null) {
      referenced.add(m[1])
    }
  }

  const unused = [...enKeys].filter((k) => !referenced.has(k)).sort()
  if (unused.length) {
    console.error('Locale keys with no static t("…") / i18next.t("…") reference (and not in IMPLICIT_REFERENCES):')
    for (const k of unused) console.error(`  ${k}`)
    process.exit(1)
  }

  console.log(`OK: ${enKeys.size} keys; en/fr parity; references cover all keys.`)
}

main()
