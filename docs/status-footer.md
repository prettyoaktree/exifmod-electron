# Status footer — specification

Authoritative mapping of **runtime conditions** → **status lights** → **popover copy** → **user actions** for the bottom **status footer** (`StatusFooter` and related UI). **Update this document whenever** you add or change:

- Anything that affects **metadata read/write readiness** (ExifTool, DB, preload).
- **Ollama** lifecycle or AI entry points.
- **Auto-update** behavior or IPC.
- A **new** persistent environment concern that belongs in the footer (add a row or a new segment table below).

User-facing prose for the in-app experience belongs in [`locales/`](../locales/) and the [user guide](https://prettyoaktree.github.io/exifmod/docs/) (source: [`docs/user/`](user/)). Keep this file aligned with those when status-bar behavior or copy changes.

---

## 1. Shared UI pattern (all segments)

Every footer **segment** uses the same structure:

| Element | Purpose |
| ------- | ------- |
| **Status light** | Small disc; color encodes **semantic state** (see §2). Same visual grammar for every segment. |
| **Label** | Short text (e.g. “Application”, “Ollama”, “Updates”). Truncate on narrow widths; full text in `title` if needed. |
| **Chevron** | Same affordance on every segment: “opens detail panel” **above** the bar. Collapsed: points **up**; when the panel is open: points **down** (collapse). |
| **Popover** | Anchored panel: **messages** (what is wrong or what is happening) + **actions** (buttons). Primary actions live **in the panel** unless product explicitly duplicates one on the bar for all segments consistently. |

**Interaction**

| Rule | Behavior |
| ---- | -------- |
| Open panel | Click / Enter / Space on segment trigger. |
| Close panel | Escape, outside click, or toggle trigger — **except** where a segment marks `dismissDisabled` (Application **`error`** only; see §3). |
| Single open panel | Opening one segment’s panel **closes** another’s — **except** when Application is in **`error`** with forced disclosure; then Application panel stays open per §3. |
| Keyboard | Segment triggers use `tabIndex={0}` where product requires footer to be reachable. Panel: `aria-expanded` on trigger, `role="region"` on panel, `aria-labelledby` to label. |
| Forced disclosure | **Only** Application phase **`error`**: auto-open panel, non-dismissible until phase becomes **`ok`**. |

---

## 2. Global status light semantics

Lights are **semantic**, not decorative. Use the same meaning across segments where applicable.

| Light | Meaning | Typical use |
| ----- | ------- | ----------- |
| **Gray (neutral)** | **Verifying / unknown** — work in progress; **not** a success or failure judgment. | **Application only:** startup or reload checklist not finished. |
| **Green** | Healthy, ready, or idle-with-no-problem for that domain. | Application OK, Ollama server reachable, updater idle / up-to-date. |
| **Amber** | Attention, optional degradation, or user-dismissible situation — **core metadata I/O may still work**. | Ollama down but not blocking file edits; update available but not downloaded. |
| **Red** | **Blocking or hard failure** for that domain **after** any required “verifying” phase for that domain has completed (where applicable). | Application critical failure; updater error; Ollama **start** failed after user action (if surfaced as segment-level failure). |
| **Blue / pulse** | **Long-running in-flight** operation (seconds+), distinct from Application’s short **gray** gate. | Ollama checking/launching; **AI describe** (single or batch) in progress; update downloading or explicit “checking for updates”. |

**Rules**

1. **Application** must **not** show **red** while phase is **`verifying`** — only **gray**, then **green** or **red**.
2. Do **not** use **gray** for “disabled feature” on non-Application segments; prefer **omitting** the segment (Updates when unsupported) or **green/amber** per tables below.
3. When adding a new segment, add a **column** to §2 or a footnote: which lights it uses and what they mean for **that** domain.

---

## 3. Application segment

**Scope:** Readiness for **core** EXIFmod behavior: **preload bridge**, **ExifTool**, **preset database / catalog** (and anything else explicitly included in the “required checklist” in code).

### 3.1 Phase model (source of truth for color)

| Phase | When (conditions) | Light | Panel auto-open | Panel dismissible |
| ----- | ----------------- | ----- | ----------------- | ----------------- |
| **`verifying`** | From start of checklist until **all** items below have settled (success or failure), including mid-session **reload** paths (e.g. catalog reload) that re-run checks. | **Gray** | **No** | **Yes** (normal rules) |
| **`ok`** | Checklist complete **and** no critical blocker (§3.2). | **Green** | **No** | **Yes** |
| **`error`** | Checklist complete **and** ≥1 critical blocker (§3.2). | **Red** | **Yes** (on transition into `error`) | **No** until phase → `ok` |

**Forced disclosure (only `error`):** On `verifying → error`, open the Application panel and set `dismissDisabled`. Escape and outside-click must not close it. On `error → ok`, clear `dismissDisabled`, default **close** panel, return to normal dismiss rules.

**Accessibility:** On auto-open for `error`, move focus into the panel and/or use `aria-live="assertive"` on the issue list. While `verifying`, do **not** use assertive live regions that imply failure.

**Optional manual open during `verifying`:** If the user opens the panel, show neutral copy (e.g. “Checking…”) / spinner — not error text.

### 3.2 Required checklist (implementations must list in code comments)

Keep this table synchronized with the actual `async` / IPC sequence in the renderer (or main). Any **new** prerequisite for “user can trust metadata I/O” should be **added here and in code**.

| # | Check | Contributes to `error` if |
| - | ----- | ------------------------- |
| A | `window.exifmod` present (preload loaded) | Preload missing or broken |
| B | `preflight()` | Returns any issue (includes ExifTool + on-disk DB validation from main) |
| C | `loadCatalog()` completed | `loadIssues` non-empty (merged with B for display; any issue → `error`) |

**Critical blocker** = any failed row that means the user cannot rely on normal **read/write metadata** flows (align with [`preflightIssues`](../src/main/exifCore/index.ts) + catalog load behavior today).

### 3.3 Popover content by phase

| Phase | Title / summary (examples; use i18n keys) | Body |
| ----- | ------------------------------------------ | ---- |
| `verifying` | “Checking Application…” | Short explanation + optional spinner; no red styling. |
| `ok` | “Application Ready” (or similar) | Optional one-line “ExifTool and catalog OK”; list resolved ExifTool path only if product wants power-user detail. |
| `error` | “Application cannot run” / “Fix Required” | Bulleted localized messages: preload, ExifTool, DB/catalog as applicable. |

### 3.4 Actions by phase

| Phase | Actions |
| ----- | ------- |
| `verifying` | None required; optional “Copy diagnostics” only if it does not imply failure. |
| `ok` | Optional: “Copy diagnostics”, link to docs — product decision. |
| `error` | Optional: “Copy diagnostics”, link to install docs; **no** fake “Continue” if metadata I/O is actually broken. |

---

## 4. Ollama segment

**Scope:** Local **Ollama** server / CLI for **optional** AI describe. **Does not** gate basic metadata editing.

Implementation today uses `OllamaSession` in [`App.tsx`](../src/renderer/src/App.tsx). Map session → footer as follows (adjust if session enum changes).

| Session / condition | Light | Panel default | Dismissible | Description (popover body) | Actions |
| ------------------- | ----- | ------------- | ----------- | ---------------------------- | ------- |
| `checking` | **Blue / pulse** | Closed | Yes | Explains AI availability is being checked. | None |
| `launching` | **Blue / pulse** | Optional: auto-open **not** required; user already chose Start | Yes | “Starting Ollama…” | None (wait) |
| `ready` | **Green** | Closed | Yes | AI available for describe when selection allows. The panel can include **Show system prompt** (editable describe instructions; must include `{{MAX_DESC_BYTES}}`; saved via main). A short hint explains the placeholder; keep custom text free of long sample JSON models might copy verbatim. | — |
| `server_down` | **Amber** | Closed (unless user opened) | Yes | Ollama CLI may exist but server not responding; explain **Start Ollama** / Terminal. | **Start Ollama** (dismiss the panel to defer—no separate “Not now” control) |
| `no_install` | **Amber** | Closed | Yes | Ollama not installed; link or text to install. | Optional: “Learn more” |
| `declined` | **Amber** or **Green** (product: “user skipped”) | Closed | Yes | User chose not to start server this session. | Optional: “Try again” → back to `server_down` flow |
| `failed` | **Amber** | Closed | Yes | Generic unreachable / startup failure copy. | Retry / Check install per product |
| `ollamaTryStartServer` error (after user click) | **Red** or **Amber** | Open with error detail | Yes | Show `ollamaStartError` string. | **Retry** (Start again), dismiss |
| **AI describe running** (`ollamaDescribeImage` single or batch) | **Blue / pulse** | **Closed by default** (do not auto-open when generation **starts**) | Yes | When opened: progress line (`ui.statusFooter.ollamaGeneratingProgress` for batch, or loading copy for single). | None (wait) |
| **AI describe finished successfully** | (returns to session row, e.g. **Green** when `ready`) | **Closed** by default (the panel is **not** auto-opened). If the user opens the Ollama panel, the completion line (`ui.statusFooter.ollamaGenerationComplete`) can show above the usual `ready` body until the panel is dismissed. | Yes | — | — |

**Note:** If Application is in **`error`**, Ollama panel may be secondary; do not steal focus from forced Application panel.

---

## 5. Updates segment

**Scope:** **Packaged macOS or Windows** app only; electron-updater flow. If unsupported (dev build, Linux, or unpackaged), **omit segment** entirely — do not use gray “N/A” stub.

| Condition / phase | Light | Panel default | Dismissible | Description | Actions |
| ------------------- | ----- | ------------- | ----------- | ----------- | ------- |
| Idle | **Green** | Closed | Yes | Hint to use Help or the button to check. | **Check for Updates…** (`updater:check` IPC — same as Help menu) |
| `upToDate` (after manual check) | **Green** | **Auto-opens** when the manual check completes unless the user already closed the Updates panel during that flow (then stays closed until the next manual check) | Yes | “You’re up to date” (version). | None |
| `checking` with `source: manual` (Help menu or footer **Check**) | **Blue / pulse** | **Auto-opens** immediately (confirms explicit user action) unless Application is in `error` | Yes | “Checking for updates…”; panel stays in sync with later phases until the user closes it. **If the user closes the panel** during this manual flow, it **does not auto-reopen** on `available` / `downloading` / `downloaded` / `upToDate` / `error` until the next manual `checking`. | None |
| `checking` with `source: auto` (delayed startup check) | **Blue / pulse** | **Closed** | Yes | Background check in progress; no popover. | None |
| No update after auto check | **Green** | Closed | Yes | Main returns to `idle`. | — |
| Update available | **Amber** | **Auto-opens** after a **background** check finds an update (unless Application is in `error`). After a **manual** check, opens with completion rules above. | Yes | New version string, release notes if available. | **Download**, **Later** |
| Downloading | **Blue / pulse** | Follows manual vs auto open rules above | Yes | Progress % + progress bar (`download-progress`). | Optional: **Cancel** if supported |
| Downloaded, pending restart | **Amber** | **Auto-opens** after background download completes if the panel was closed mid-download; manual flow respects user-closed flag | Yes | Explain restart installs update. | **Restart and install**, **Later** |
| Error (check or download) | **Red** | **Auto-opens** for manual check errors (unless user closed panel during that manual flow); background check failures reset to `idle` without a dedicated error row in typical networking cases | Yes | Error message string. | **Retry**, **Dismiss** per product |

**IPC:** Main pushes state via `updater:state`; renderer never assumes `autoUpdater` directly. **`checking`** includes `source: 'manual' | 'auto'`. **`updater:check`** invokes the same `manualCheckForUpdates` path as **Help → Check for Updates** (emits `checking` + `manual`, then `checkForUpdates`). Actions: `updater:download`, `updater:quitAndInstall`, `updater:dismiss`. Document new phases in this table when adding steps (e.g. staging).

---

## 6. Cross-segment priority

| Situation | Rule |
| --------- | ---- |
| Application `error` | Application panel **forced open**; other panels should not close it; opening Ollama/Updates can be disallowed or closes behind — product choice, but Application must remain visible. |
| Application `ok` or `verifying` | Normal single-panel rule: only one popover open at a time. |

---

## 7. Contributor checklist — new features

When you add a feature that touches runtime health, updates, or AI:

1. **Does it affect Application readiness?** → Extend §3.2 checklist in **code** and add a row to §3.2 here; define whether failure is **`error`** (blocks metadata) or informational only.
2. **Does it need persistent surfacing?** → Prefer an existing segment + new **row** in its table; only add a **new segment** if it is independent, always relevant, and fits the shared pattern (§1).
3. **Lights:** Assign **gray / green / amber / red / pulse** per §2; do not invent new colors without updating §2 and CSS variables.
4. **Copy:** Add `locales/en.json` + `fr.json`; link keys in this doc if helpful.
5. **User doc:** Update the [user guide](https://prettyoaktree.github.io/exifmod/docs/) source under [`docs/user/`](user/) (and run `npm run site:build`) for user-visible behavior outside the status bar.
6. **Tests:** Add or extend tests for any pure logic mapping phases → UI flags.

---

## 8. File references (implementation)

| Area | Files (typical) |
| ---- | ----------------- |
| Footer UI | [`src/renderer/src/StatusFooter.tsx`](../src/renderer/src/StatusFooter.tsx), [`App.tsx`](../src/renderer/src/App.tsx), [`App.css`](../src/renderer/src/App.css) |
| Preload | [`src/preload/index.ts`](../src/preload/index.ts), [`vite-env.d.ts`](../src/renderer/src/vite-env.d.ts) |
| Application health | [`src/main/index.ts`](../src/main/index.ts), [`src/main/exifCore/index.ts`](../src/main/exifCore/index.ts), [`localizePreflight.ts`](../src/main/localizePreflight.ts) |
| Ollama | [`src/main/ollamaLifecycle.ts`](../src/main/ollamaLifecycle.ts), [`ollamaDescribe.ts`](../src/main/ollamaDescribe.ts), [`ollamaConfig.ts`](../src/main/ollamaConfig.ts) |
| Updates | [`src/main/autoUpdate.ts`](../src/main/autoUpdate.ts) |

This document is normative for **footer behavior**; if code and doc diverge, **fix the code or update this doc** in the same change.
