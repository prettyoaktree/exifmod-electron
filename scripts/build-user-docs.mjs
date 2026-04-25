#!/usr/bin/env node
/**
 * Build static user guide HTML from docs/user/*.md into website/docs/
 * Links are relative to website/docs/ so the same files work on GitHub Pages
 * (…/exifmod/docs/…) and when serving the website/ folder locally.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { marked } from 'marked'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const USER = join(ROOT, 'docs', 'user')
const OUT = join(ROOT, 'website', 'docs')
/** Parent of website/docs/ — use relative URLs so /exifmod/docs/foo works and file:// is debuggable with a static server at website/ */
const R = '..'

marked.setOptions({ gfm: true })

const PAGES = [
  {
    slug: 'getting-started',
    file: 'getting-started.md',
    blurb: 'Overview, what you need, install (Releases, Homebrew, winget), and updates.'
  },
  {
    slug: 'workflow',
    file: 'workflow.md',
    blurb: 'Open a folder, edit metadata, write — plus supported file types.'
  },
  {
    slug: 'presets',
    file: 'presets.md',
    blurb: 'The preset catalog and the metadata table, explained in plain terms.'
  },
  {
    slug: 'ollama',
    file: 'ollama.md',
    blurb: 'Install Ollama, pull the default model, and optional tuning.'
  },
  {
    slug: 'lightroom',
    file: 'lightroom.md',
    blurb: 'Lightroom Classic plugin and how to keep your edits safe.'
  },
  {
    slug: 'release-notes',
    file: 'release-notes.md',
    blurb: 'Headline features and fixes by version — not every patch.'
  }
]

/**
 * @param {object} o
 * @param {string} o.title
 * @param {string} o.mainInner
 * @param {string} o.chaptersNavHtml
 */
function docShell({ title, mainInner, chaptersNavHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} — EXIFmod</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&amp;display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${R}/assets/site.css" />
</head>
<body class="docs-body">
  <nav>
    <a href="${R}/index.html" class="nav-logo">EXIF<span>mod</span></a>
    <ul class="nav-links">
      <li><a href="${R}/index.html#how-it-works">How it works</a></li>
      <li><a href="index.html" aria-current="page" aria-label="User guide (current page)">User guide</a></li>
      <li><a href="${R}/index.html#install" class="btn-nav">Download</a></li>
    </ul>
  </nav>
  <div class="docs-page">
  <aside class="docs-sidebar" aria-label="User guide table of contents">
    <p class="docs-toc-subtitle" id="guide-toc">In this guide</p>
    <nav class="docs-toc-chapters" aria-labelledby="guide-toc">
${chaptersNavHtml}
    </nav>
  </aside>
  ${mainInner}
  </div>
  <footer class="docs-foot">
    <a href="${R}/index.html">Home</a> ·
    <a href="https://github.com/prettyoaktree/exifmod" target="_blank" rel="noopener noreferrer">GitHub</a> ·
    <a href="https://github.com/prettyoaktree/exifmod/blob/main/docs/exif-preset-mapping.md" target="_blank" rel="noopener noreferrer">EXIF &amp; preset details (developers)</a>
  </footer>
</body>
</html>
`
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function readMarkdown(relFile) {
  const p = join(USER, relFile)
  if (!existsSync(p)) {
    throw new Error(`Missing user doc: ${p}`)
  }
  return readFileSync(p, 'utf8')
}

/**
 * @param {string} current
 * @param {Map<string, string>} chapterLabels - slug -> title
 */
function buildChaptersNav(current, chapterLabels) {
  const lines = [
    `      <a href="index.html"${
      current === 'index' ? ' class="is-active" aria-current="page"' : ''
    }>Overview</a>`
  ]
  for (const p of PAGES) {
    const label = chapterLabels.get(p.slug) ?? p.slug
    const isActive = current === p.slug
    lines.push(
      `      <a href="${p.slug}.html"${
        isActive ? ' class="is-active" aria-current="page"' : ''
      }>${escapeHtml(label)}</a>`
    )
  }
  return lines.join('\n')
}

function main() {
  mkdirSync(OUT, { recursive: true })
  const chapterLabels = new Map(
    PAGES.map((p) => {
      const m = readMarkdown(p.file).match(/^#\s+(.+)$/m)
      return [p.slug, m ? m[1].trim() : p.slug]
    })
  )

  for (const page of PAGES) {
    const raw = readMarkdown(page.file)
    const html = marked.parse(raw)
    const title = page.slug
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
    const m = raw.match(/^#\s+(.+)$/m)
    const pageTitle = m ? m[1].trim() : title
    const inner = `<main class="docs-wrap">
  <article class="md-content">
    ${html}
  </article>
</main>`
    const out = docShell({
      title: pageTitle,
      mainInner: inner,
      chaptersNavHtml: buildChaptersNav(page.slug, chapterLabels)
    })
    writeFileSync(join(OUT, `${page.slug}.html`), out, 'utf8')
  }

  const tocItems = PAGES.map((p) => {
    const raw = readMarkdown(p.file)
    const m = raw.match(/^#\s+(.+)$/m)
    const t = m ? m[1].trim() : p.slug
    return `    <li>
      <a href="${p.slug}.html">
        <span class="toc-title">${escapeHtml(t)}</span>
        <span class="blurb">${escapeHtml(p.blurb)}</span>
      </a>
    </li>`
  }).join('\n')

  const indexMain = `<main class="docs-wrap">
  <h1 class="doc-index-title">User guide</h1>
  <p class="doc-index-lead">Everything you need to install EXIFmod, work with folders and presets, and use local AI or Lightroom—without the engineer jargon.</p>
  <ol class="doc-toc" role="list">
${tocItems}
  </ol>
</main>`

  writeFileSync(
    join(OUT, 'index.html'),
    docShell({
      title: 'User guide',
      mainInner: indexMain,
      chaptersNavHtml: buildChaptersNav('index', chapterLabels)
    })
  )

  console.log(
    `build-user-docs: wrote ${PAGES.length + 1} pages to ${OUT.replace(ROOT + '/', '')}`
  )
}

main()
