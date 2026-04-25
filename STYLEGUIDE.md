# Documentation Style Guide

Rules for writing and editing docs across this workspace.

---

## 1. The two doc audiences

Every doc is written for one of two readers:


| Type                 | Reads it when                                                  | Examples                                                                                    |
| -------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **User-facing**      | Installing, using, or evaluating the software                  | `README.md`, [user guide on Pages](https://prettyoaktree.github.io/exifmod/docs/) (source `docs/user/`), `docs/product.md` (pointer) |
| **Internal / agent** | Building, changing, releasing, or reasoning about the software | `AGENTS.md`, `docs/architecture.md`, `docs/status-footer.md`, `maintainer.md`, `RELEASE.md` |


A doc should serve one audience. If it mixes both, either split it or clearly delimit the sections with headings (see §4).

---

## 2. How to identify a doc's type

**It is user-facing if:**

- It opens with "what this software does and who it is for"
- It is the first thing a new installer would read
- It contains install commands, download links, or upgrade steps
- It describes behavior from the user's point of view ("click X to do Y")
- It does not reference source file paths, class names, IPC channels, or build internals
- `README.md` at repo root is almost always user-facing

**It is internal / agent if:**

- It is named `AGENTS.md`, `CLAUDE.md`, `maintainer.md`, `architecture.md`, or similar
- It contains build/release procedures, CI secrets, or signing instructions
- It references source paths (`src/main/index.ts`), IPC handlers, preload APIs, or test commands
- It contains rules for agents in imperative form ("Do NOT run `npm run build`")
- It lives in `docs/` and describes implementation rather than user workflow
- It is a process doc: `RELEASE.md`, `BRANCH_PROTECTION.md`, skill files

**Ambiguous cases:** When a project is small enough that a separate `AGENTS.md` feels like overkill, a mixed `README.md` is acceptable — but the agent section must be clearly headed and isolated (see §4).

---

## 3. Style rules by type

### User-facing docs

**Voice and structure**

- Lead with the product value proposition, not architecture. First paragraph = what it does and who it is for.
- Write like a human, not a spec. "Requires **ExifTool** for reading and writing metadata." not "Metadata read/write uses ExifTool on your machine."
- Use plain prose. Avoid jargon, internal component names, and code paths.
- Installation before anything else. Users abandon if they cannot get started.
- Use code blocks only for commands the user will actually run (install, run, upgrade).
- Keep bullets short — one clear sentence each. If a bullet needs multiple sentences to explain a feature, that's a sign the detail belongs in a deeper doc. Collapse it to a single sentence and link out.
- Lead with the capability, not the tool. "Supports local AI models for generating image descriptions" not "Connect a local Ollama server for AI-suggested descriptions." Users care what it does, not what powers it.
- Let word choice carry nuance. "Supports X" implies optional without needing to say "Optional: …".
- Link to deeper docs rather than embedding long technical sections inline.
- Important technical details (file format support, write behavior, limits) deserve their own subsection rather than being appended to a workflow list.
- Never include "Agent guidance", "Maintainer notes", or build/release procedures.

**What to avoid**

- Internal file paths (`src/main/index.ts`) — users do not have the source open.
- Hardcoded absolute machine paths — they break on every other machine and expose local directory structure.
- CI details, secret names, signing procedures — these belong in `maintainer.md`.
- Agent-only constraints ("Do NOT run `npm run build`").
- "Wall of text" bullets: a single bullet that runs three sentences, names implementation details, and links to three places at once. Each bullet should make one point.
- Repeating in the overview what dedicated sections already cover — let each section own its content.
- Factual claims that are accidentally too narrow. "Works with a folder of images" excludes single-file use. Write for the full range of valid use.
- UI layout details in workflow steps ("dividers can be dragged to resize") — these are speccy and interrupt the flow.
- Implementation-consistency parentheticals ("same logic as commit", "same as the write path") — users don't think in those terms.
- Cross-references to stale or internal sections. Verify any "see X" link actually exists and is user-facing before publishing.

**Freshness rule:** When you change anything users see — UI copy, install steps, behavior, supported formats — update the user-facing doc in the same change.

---

### Internal / agent docs

**Voice and structure**

- State the audience at the top or in the first heading: "for AI coding agents", "maintainer-only", "contributors".
- Put the most important constraints first (build rules, IPC rules, "do not" rules).
- State rules as imperatives. "Do NOT run `npm run build` unless the user explicitly asks for a release." Not "it may be preferable to avoid…".
- Include **why** behind non-obvious rules so agents can reason about edge cases.
- Use tables for structured reference data: repo layout, doc index, command list, CI secrets list.
- Use relative links to source files (`[src/preload/index.ts](../src/preload/index.ts)`), not absolute paths.

**What to avoid**

- Hardcoded absolute machine paths. Use repo-relative paths or placeholder syntax.
- Real credentials, tokens, or key material — list secret *names* only.
- Stale cross-references. A broken link breaks an agent's ability to find authoritative context. Verify links when moving or renaming files.
- Duplicating user-facing prose. Internal docs should reference user-facing docs, not reproduce them.

**Freshness rule:** When you change anything that affects agent behavior — IPC surface, build commands, release workflow, architecture boundaries — update the internal doc in the same change.

---

## 4. Mixed docs — how to handle them

When a single doc genuinely needs to serve both audiences, use a clear section break:

```markdown
## Agent guidance

<!-- Everything below this heading is for AI agents and contributors, not end users. -->
```

Keep user-facing content first. Agent sections go at the end and must be clearly labeled.

**When to split instead:** Once the agent/internal section exceeds roughly 30–40 lines, create a separate `AGENTS.md`. This repository does that correctly: `README.md` is clean user-facing content, `AGENTS.md` holds all agent guidance.

---

## 5. User guide — `docs/user/` and GitHub Pages

The install-and-use story on **[the public site](https://prettyoaktree.github.io/exifmod/docs/)** is built from **Markdown in [`docs/user/`](docs/user/)** via `npm run site:build` (output: [`website/docs/`](website/docs/)). Treat this as its own product surface, not a dump of `README` paragraphs.

**Voice**

- **Conversational and nontechnical.** Write for photographers and editors, not implementers. Use direct address ("you") and plain language; avoid internal jargon (`src/…` paths, IPC names, merge-order internals).
- **Personality-forward is allowed.** Dry humor, playful asides, and mild sarcasm are acceptable in normal workflow text when instructions remain clear.
- **Safety first in risky moments.** For data loss, overwrite behavior, security prompts (SmartScreen, notarization, permissions), and restore/recovery steps: make the action explicit first; humor may follow, but must not obscure the instruction.
- **Commands and env vars** are fine when the user is the one typing them; frame optional tuning as clearly optional. Deep implementation detail belongs in **[`docs/exif-preset-mapping.md`](docs/exif-preset-mapping.md)** (GitHub) or the doc site footer link, not the middle of a how-to.

**Emphasis and readability**

- **Bold is a scan aid, not a quota.** Use bold for control names, key outcomes, and warnings. Repeated bolding across a section is fine when it improves scanning.
- **Avoid visual noise.** Do not bold full sentences, multiple adjacent fragments in the same sentence, or punctuation for effect.
- **Lists should still scan.** Prefer short bullets, but 2-3 sentence bullets are acceptable when they cover one coherent action or warning.
- **Break true walls of text.** Split bullets/paragraphs when they combine unrelated actions, safety notes, and examples in one block. Use a subheading if needed.

**Structure**

- **No “More help”** blocks that only duplicate the sidebar/TOC. Chapter-level navigation is the **In this guide** list; don’t add a second link farm to the same pages in the body.
- **No duplicate install guide** in multiple files: keep one clear install path in context (e.g. merged into **Getting started** as in this repo).
- **English** for `docs/user/` unless the project later adds a deliberate i18n pass for the static site.

**Examples (for consistency)**

- **Good (voice + clarity):** "SmartScreen may appear on first run. If you trust this release, choose **More info → Run anyway**. Yes, Windows is being dramatic."
- **Bad (clarity buried by joke):** "Windows will probably panic; click around until it works."
- **Good (bolding):** "Use **Manage Presets**, then choose **Camera** or **Lens**."
- **Bad (over-bolding):** "**Use** **Manage Presets** and **then** **choose** **Camera** **or** **Lens**."
- **Good (longer bullet allowed):** A two-sentence bullet that explains one workflow caveat and its immediate action.
- **Bad (wall bullet):** One bullet that mixes setup steps, troubleshooting, and three side notes.

**Rule precedence**

- For files under **`docs/user/`**, this section (**§5**) is authoritative for tone and presentation.
- Use **§3 (User-facing docs)** as baseline guidance when it does not conflict with §5.
- If §3 and §5 conflict, **follow §5** for `docs/user/`.

**Release notes** ([`docs/user/release-notes.md`](docs/user/release-notes.md))

- **Purpose:** A short, user-readable summary of **major** additions and fixes by version line — not a duplicate of every GitHub Release or every commit.
- **What to add:** Notable user-visible features, important bug classes, or workflow changes. **Omit** routine patches, internal refactors, dependency bumps, and doc-only nits unless they meaningfully change what users do or see.
- **When to update:** As part of shipping a **minor** or **major** release, or when a **patch** includes something users would actually look for in “what changed” (e.g. a big Ollama or Lightroom fix). When in doubt, use the [GitHub release notes](https://github.com/prettyoaktree/exifmod/releases) as the full source of truth and only mirror **headlines** here.
- **Link** to GitHub Releases at the top of the page for the complete list.

**Process**

- After you change any `docs/user/*.md`, run **`npm run site:build`** and commit the updated `website/docs/*.html` with the Markdown (the GitHub Pages workflow also runs the build, but the repo should stay consistent for local preview and diffs).
- The global user-facing rules in **§3 (User-facing docs)** still apply; this section adds **only** what’s specific to the `docs/user/` + Pages pipeline.

---

## 6. Known issues to fix when editing

- Any "Agent:" or "For agents:" section in a `README.md` that has grown beyond a few paragraphs should be refactored into a separate `AGENTS.md`.

---

## 7. Markdown hygiene

Use these rules in **internal / agent** docs (and anywhere links must render reliably):

- **Links:** use normal markdown links, `[label](relative-or-repo-path.md)`, in tables and bullets. Do **not** wrap an entire `[label](path)` link in backticks — many renderers treat it as literal text and the link will not work.
- **Bold + code:** wrap a normal code span in bold, for example **`window.exifmod`** or **`payload`**. Do not put markdown `**` markers *inside* one pair of code backticks (that yields broken rendering).
- **Commands:** use normal code spans (`npm test`, `npm run build`) and put emphasis outside them, for example: Do **not** run `npm run build` unless packaging is intended.

### Checklist before merge

- [ ] The doc’s audience (user vs internal) still matches sections 1–2.
- [ ] User-facing docs contain no `src/…` paths, IPC names, or agent-only build rules.
- [ ] Relative links resolve from the file that contains them (including `../` where needed).
- [ ] Tables use plain `[text](url)` links, not backtick-wrapped link markdown.
