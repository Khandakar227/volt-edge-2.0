# Playground-style PCB Editing + Fast Scaffolding — Implementation Plan

> **For agentic workers:** implement task-by-task; each task ends with an independently verifiable result. Steps use checkbox syntax.

**Goal:** (A) make new-workspace scaffolding near-instant via a shared template + hardlinked `node_modules`; (B) replace the render-only preview with the tscircuit **RunFrame** runner so editing works like the official playground — drag a part, hit **Run**, it re-autoroutes in-browser, and schematic wires follow moves.

**Architecture shift (B):** today the backend builds `circuit.json` and the browser renders it read-only (`CircuitJsonPreview`). RunFrame evals the workspace source (`fsMap`) and autoroutes *in the browser*. The backend stays the source of truth for files (agent edits) and persistence (manual-edits.json); the browser becomes the interactive editor. The awkward backend `/layout` re-route is retired.

**Tech stack:** FastAPI + SQLModel (backend); React 19 + Vite + `@tscircuit/runframe` (frontend).

## Global constraints
- Backend commands run from `backend/` via `.venv/bin/python`; tests via `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 .venv/bin/python -m pytest`.
- Filesystem is ext4 (no reflink) — use **hardlinks** for the shared store, never assume CoW.
- Don't break the existing agent turn / SSE / session flows.

---

## Part A — Fast scaffolding (template + hardlinked node_modules)

### Task A1: Template store + hardlink scaffold

**Files:** `backend/app/workspace.py` (modify `scaffold`, add helpers), `backend/app/config.py` (template path), `backend/tests/test_scaffold_fast.py` (create).

**Interfaces produced:**
- `workspace.ensure_template() -> Path` — returns the template dir, building it once (via the existing `tsci init` path) under `settings.workspaces_dir / ".template"`. Guarded by an asyncio lock so concurrent first-scaffolds don't race.
- `workspace.scaffold(cwd)` — new behavior: if a valid template exists, **fast path**: `mkdir cwd`, hardlink-copy `node_modules` (`cp -al template/node_modules cwd/node_modules`), copy `package.json`/`tsconfig.json`/`bun.lock`/`tscircuit.config.json`, rewrite `package.json` "name" to the project id, write a default `index.circuit.tsx`. Then `_mount_skills` + `_install_parts_library` as today. If no template, run the current `tsci init` path AND populate the template from it.

- [ ] **Step 1 — failing test** (`test_scaffold_fast.py`): given a fake template dir with a `node_modules/pkg/x.js` and base files, `workspace._fast_scaffold(cwd, template)` produces `cwd/node_modules/pkg/x.js` as a **hardlink** (same `st_ino`), copies `index.circuit.tsx`, and sets `package.json` name to the project id. (Pure filesystem test — no `tsci`.)
- [ ] **Step 2 — run, verify it fails** (`_fast_scaffold` undefined).
- [ ] **Step 3 — implement** `_fast_scaffold(cwd, template)` using `os.link` per file (walk template/node_modules, recreate dirs, hardlink files) or `subprocess cp -al`; copy base files; rewrite name; write default entry.
- [ ] **Step 4 — run, verify pass.**
- [ ] **Step 5 — wire `scaffold`**: template-exists → `_fast_scaffold`; else `tsci init` path then copy result to template. Add `ensure_template` lock.
- [ ] **Step 6 — integration check** (manual, not CI): delete `workspaces/.template`, call `scaffold` twice; first ~30 s (builds template), second < 1 s; `tsci build` succeeds in the fast-scaffolded dir. Confirm `du` shows shared inodes (near-zero extra disk).
- [ ] **Step 7 — commit** `feat(backend): template + hardlinked node_modules for near-instant scaffolds`.

**Note:** log clearly when falling back to full `tsci init` (template missing/corrupt).

---

## Part B — RunFrame in-browser editing (drag → Run → autoroute)

### Task B1: RunFrame bundling spike (DECISION GATE)

**Files:** throwaway (`frontend/src/_spike_runframe.tsx`), reverted after.

- [ ] **Step 1** — import `{ RunFrame }` from `@tscircuit/runframe/runner` in a scratch component, reference it, and run `npx tsc --noEmit && npm run build`.
- [ ] **Step 2 — decide:**
  - **Builds cleanly →** proceed with Tasks B2–B5 using the imported `RunFrame`.
  - **Fails (missing deps, as P0-4 warned) →** switch Tasks B3–B5 to load `@tscircuit/runframe/dist/standalone.min.js` in an `<iframe>` and drive it via `postMessage` (feed fsMap, receive circuit-json/edit events). Same data flow, different mounting.
- [ ] **Step 3** — delete the scratch file; record the decision in this plan before continuing.

### Task B2: Serve the workspace fsMap to the frontend

**Files:** `backend/app/routes.py` (reuse/confirm `GET /projects/{id}/fsmap`), `frontend/src/api.ts`.

- The existing `GET /projects/{id}/fsmap` already returns `{files: {path: content}}` (source `.tsx/.ts/.json`, incl. `parts/` + `index.circuit.tsx` + `tscircuit.config.json`) — exactly RunFrame's `fsMap`. RunFrame evals with its **bundled** tscircuit, so `node_modules` is not needed client-side.
- [ ] **Step 1** — add `api.getFsMap(projectId) -> Promise<Record<string,string>>`.
- [ ] **Step 2** — verify (curl) fsmap includes `index.circuit.tsx` and `parts/*.tsx` for a real project.
- [ ] **Step 3 — commit** `feat(frontend): api.getFsMap for RunFrame source`.

### Task B3: Swap PreviewPane to RunFrame

**Files:** `frontend/src/components/PreviewPane.tsx`, `frontend/src/App.tsx`.

- [ ] **Step 1** — App fetches fsMap on load / session-switch / after `done`+`checkpoint` (agent turns change files); pass `fsMap` + `evalVersion` (bump to force re-eval) to `PreviewPane`.
- [ ] **Step 2** — render `RunFrame` (or standalone iframe) with `fsMap`, `availableTabs`, `defaultTab="pcb"`, `onEditEvent`, `onCircuitJsonChange`. Remove `CircuitJsonPreview`, the `/layout` toolbar, and the pending-edits/rotate/reroute UI (RunFrame provides Run + drag + rotate natively).
- [ ] **Step 3 — verify in browser** (user): drag a PCB part → Run → re-autoroutes; move a schematic part → wires follow. This is the acceptance test for issues 1 & 2.
- [ ] **Step 4 — commit** `feat(frontend): render with RunFrame (in-browser eval + autoroute)`.

### Task B4: Persist manual edits back to the workspace

**Files:** `backend/app/routes.py` (+ schema), `frontend/src/api.ts`, `frontend/src/App.tsx`.

- RunFrame maintains a `manual-edits.json` in its fsMap and emits changes (`onManualEditsFileContentChange` / edit events). Persist it so edits survive reload and the agent sees them.
- [ ] **Step 1** — backend `PUT /projects/{id}/files/manual-edits` writing `manual-edits.json` into the workspace (path validated inside cwd). Test: writes file, 404 unknown project.
- [ ] **Step 2** — frontend: on manual-edits change (debounced), `PUT` it.
- [ ] **Step 3** — ensure the entry applies it: scaffold's default `index.circuit.tsx` (and the agent-steering) import `./manual-edits.json` into `<board manualEdits>` so `tsci build` (agent turns, exports) stays consistent with in-browser edits. Update the agent system prompt accordingly.
- [ ] **Step 4 — commit** `feat: persist RunFrame manual edits to workspace`.

### Task B5: Retire the backend /layout re-route

**Files:** `backend/app/routes.py`, `backend/app/layout.py` (+ tests), `frontend` cleanup.

- [ ] **Step 1** — remove `POST /projects/{id}/layout`, `layout.py`, `test_layout.py`, and `api.applyLayout` (superseded by in-browser autoroute + manual-edits persistence). Keep `workspace.build`/`note_external_build` only if still used.
- [ ] **Step 2** — run full backend tests; commit `chore: remove backend layout re-route superseded by RunFrame`.

---

## Self-review notes
- **Spec coverage:** Issue 1 (Run→autoroute) & 2 (schematic wires) → Part B via RunFrame (B1–B3). Issue 3 (slow scaffold) → Part A. Manual-edit durability → B4.
- **Biggest risk:** B1 bundling. Gated with a spike + standalone fallback before any dependent work.
- **Reconciliation risk:** in-browser eval vs backend `tsci build` must agree on manual edits (B4 step 3) — the board must import `manual-edits.json` so both paths honor it.
- **Open question for the user:** with RunFrame evaluating in-browser, do we still want the backend `checkpoint`/`circuit.json` build per agent turn (for exports/validation), or only build on demand? Default: keep it (cheap, and needed for fab exports later).
