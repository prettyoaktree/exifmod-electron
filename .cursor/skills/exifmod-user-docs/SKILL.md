---
name: exifmod-user-docs
description: >-
  Maintains EXIFmod user documentation under docs/user and website/docs.
  Use when editing user-guide pages, release notes, doc voice/style, chapter
  ordering, or rebuilding docs with npm run site:build.
---

# EXIFmod user docs

Use this skill for changes to:
- `docs/user/*.md`
- `website/docs/*.html` generated output
- user-guide docs conventions in `STYLEGUIDE.md` §5

## Required workflow

1. Edit Markdown first under `docs/user/`.
2. Keep release notes in `docs/user/release-notes.md` sorted newest to oldest within each version line (for example, under `## 1.7.x`: `1.7.6`, then `1.7.5`, then `1.7.1–1.7.3`, then `1.7.0`).
3. Run `npm run site:build` after any Markdown change.
4. Verify generated HTML in `website/docs/` reflects Markdown ordering/content (especially `website/docs/release-notes.html`).
5. Commit Markdown and generated HTML together.

## Voice and style

- Follow `STYLEGUIDE.md` §5 for `docs/user/` tone and formatting.
- Use `STYLEGUIDE.md` §3 only when it does not conflict with §5.
- Keep user-facing docs free of internal implementation details (`src/...`, IPC names, build internals).

## Quick checks before shipping

- [ ] User-guide page ordering and links are correct in `docs/user/`.
- [ ] Release notes entries are newest -> oldest.
- [ ] `npm run site:build` completed successfully.
- [ ] `website/docs/*.html` updates are included in the same commit as Markdown.
