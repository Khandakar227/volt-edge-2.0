# VoltEdge — Task Breakdown

> **Companion docs:** [SPEC.md](./SPEC.md) · [PLAN.md](./PLAN.md) · [PACKAGES.md](./PACKAGES.md)
>
> Ordered, checkbox-tracked work items. Each task links back to the requirement it satisfies
> (`FR-n`/`NFR-n` from the SPEC). Do phases in order — Phase 0 gates everything.

## Legend
- `[ ]` todo · `[~]` in progress · `[x]` done
- **DoD** = Definition of Done for the task.

---

## Phase 0 — Spikes (de-risk before building) 🔴 blocking

- [ ] **P0-1 — Pin & verify tscircuit version parity.** *(NFR-1, Risk 2)*
  Install `tscircuit` globally at a pinned version; record it. Confirm `@tscircuit/runframe`
  resolves the *same* compiler version. **DoD:** a documented pinned version used by both
  backend `tsci` and frontend runframe; a startup assertion plan.
- [ ] **P0-2 — Non-interactive `tsci import` by exact LCSC part#.** *(FR-11, Risk 3)*
  Verify `tsci import "C14877"` (or equivalent) imports without the interactive picker in a
  scripted context. **DoD:** a reproducible command (or documented scripted fallback) that
  imports a known part headlessly.
- [ ] **P0-3 — Headless fabrication-zip path.** *(FR-17, Risk 1)*
  Determine how to produce Gerbers/BOM/PnP from `circuit.json` without the interactive export UI
  (confirmed CLI command **or** programmatic `circuit-json-to-gerber` + BOM/PnP). **DoD:** a
  script that turns a built `circuit.json` into a valid fab zip.
- [ ] **P0-4 — Runframe in-browser render spike.** *(FR-15, Risk 6)*
  Stand up a minimal Vite page that mounts `@tscircuit/runframe` with a hand-written fsMap and
  renders schematic + PCB, resolving `@tsci/*`/JLCPCB imports from the CDN. **DoD:** a fixture
  fsMap renders all three views in the browser.
- [ ] **P0-5 — Claude Agent SDK smoke.** *(FR-5)*
  Minimal Python script: construct a streaming `ClaudeSDKClient` with `cwd` + mounted skill,
  send one message, print the message stream. **DoD:** a turn completes and the tscircuit skill
  activates against a scaffolded workspace.

---

## Phase 1 — Vertical slice (create → prompt → render)

### Backend
- [ ] **P1-1 — Project scaffold.** Repo layout per PLAN §2; `pyproject.toml`; FastAPI app boots. *(setup)*
- [ ] **P1-2 — SQLite + models.** `projects/sessions/messages/checkpoints` via SQLModel. *(FR-4)*
- [ ] **P1-3 — Workspace service.** `scaffold()` (`tsci init -y` + pinned install), `read_fsmap()`. *(FR-1, FR-3)*
- [ ] **P1-4 — `POST /projects` + `GET /projects`.** Create/list; scaffold on create. *(FR-1, FR-2)*
- [ ] **P1-5 — `GET /projects/{id}/fsmap`.** Serve source fsMap for the renderer. *(FR-3)*
- [ ] **P1-6 — Session Manager (single active).** One streaming `ClaudeSDKClient` per project. *(FR-5, decision 7)*
- [ ] **P1-7 — Agent wiring.** `ClaudeAgentOptions`: cwd, skill in `setting_sources`, default Sonnet. *(FR-10)*
- [ ] **P1-8 — Event mapper + SSE relay.** SDK stream → `thinking`/`assistant_text`/`tool_use`/`tool_result`/`checkpoint`/`done`. *(FR-6)*
- [ ] **P1-9 — `POST /projects/{id}/message` + `GET /events`.** Drive a turn; stream events. *(FR-5, FR-6)*
- [ ] **P1-10 — Checkpoint on build success.** Detect a clean `tsci build`; emit `checkpoint`; persist metadata. *(FR-13)*

### Frontend
- [ ] **P1-11 — Vite app + layout.** Chat left, canvas right. *(setup)*
- [ ] **P1-12 — API + EventSource client.** POST message; consume SSE. *(FR-6)*
- [ ] **P1-13 — Chat stream (minimal).** Render `thinking` (collapsible), `assistant_text`, tool chips. *(FR-6)*
- [ ] **P1-14 — Runframe canvas.** Mount fsMap; re-fetch + re-render on `checkpoint`; Schematic tab. *(FR-15, FR-16)*

**Phase 1 exit:** SPEC §8 criteria 1–2 pass locally for one project.

---

## Phase 2 — Full agent loop

### Backend
- [ ] **P2-1 — Plan event.** Emit structured `plan{parts,nets,board,assumptions,sourcing}`; soft gate. *(FR-7)*
- [ ] **P2-2 — Question flow.** Emit `question`; block turn until `POST /message` answer. *(FR-8)*
- [ ] **P2-3 — Interrupt.** `POST /projects/{id}/interrupt` → `client.interrupt()`. *(FR-9)*
- [ ] **P2-4 — Bash allowlist (`can_use_tool`).** Enforce allowlist; confine Write/Edit to workspace. *(FR-22)*
- [ ] **P2-5 — Tiered sourcing wiring.** Ensure registry → JLCPCB exact part# → hand-model path works end-to-end (uses P0-2). *(FR-11)*
- [ ] **P2-6 — `build_status` events.** Surface `tsci check` phases + violations. *(FR-12)*
- [ ] **P2-7 — Guardrails.** Per-turn caps (wall-clock, `tsci` calls, tokens) → `paused`. *(FR-20, FR-21)*
- [ ] **P2-8 — `plan/approve` endpoint.** Soft-gate acknowledge/edit. *(FR-7)*

### Frontend
- [ ] **P2-9 — Plan card.** Render plan; soft-continue affordance. *(FR-7)*
- [ ] **P2-10 — Question prompt.** Options + free text → answer POST. *(FR-8)*
- [ ] **P2-11 — Interrupt button.** Always available during a turn. *(FR-9, NFR-2)*
- [ ] **P2-12 — PCB + 3D tabs.** All three runframe views. *(FR-16)*
- [ ] **P2-13 — `paused`/`error` banners.** Render guardrail + error states. *(FR-21)*
- [ ] **P2-14 — `build_status` display.** Show check phases/violations inline. *(FR-12)*

**Phase 2 exit:** SPEC §8 criteria 3–5 pass.

---

## Phase 3 — Export, persistence & polish

- [ ] **P3-1 — Export service (source zip).** fsMap + `circuit.json`. *(FR-18)*
- [ ] **P3-2 — Export service (fab zip).** From P0-3 path; `POST /export` → download URL. *(FR-17)*
- [ ] **P3-3 — Manufacturability caveat.** Surface at export in the UI. *(FR-19, NFR-5)*
- [ ] **P3-4 — Export UI.** Fab-zip + source-download buttons. *(FR-17, FR-18)*
- [ ] **P3-5 — Session resume.** Reconnect via stored `session_id` on project open. *(NFR-3, US-8)*
- [ ] **P3-6 — Idle teardown sweeper.** Close idle clients after `IDLE_TTL`. *(NFR-3, Risk 4)*
- [ ] **P3-7 — Project list UI.** Open/resume from a list. *(FR-2)*
- [ ] **P3-8 — Config surface.** `config.py` for caps, model policy, pins, timeouts. *(NFR-1, NFR-4)*

**Phase 3 exit:** SPEC §8 criteria 6–7 pass; full acceptance script green.

---

## Cross-cutting / ongoing
- [ ] **X-1 — Tests.** Event-mapper, guardrails, allowlist, fsMap, DB (PLAN §9).
- [ ] **X-2 — Toolchain smoke CI.** Scaffold → minimal `.tsx` → `tsci build` → `circuit.json`.
- [ ] **X-3 — Integration test.** Stubbed `ClaudeSDKClient` → assert SSE sequence.
- [ ] **X-4 — Dev ergonomics.** `docker-compose` (node/bun + backend + frontend); README run steps.
- [ ] **X-5 — `.gitignore`.** `workspaces/`, `data/`, `node_modules/`, `dist/`, `.venv/`.

## Suggested milestone ordering
`P0-* → P1-* → P2-* → P3-*`, with `X-*` folded in continuously. Phase 0 is strictly blocking:
do not start Phase 1 backend integration until P0-1/P0-5 pass, and defer the export tasks (P3-2)
until P0-3 resolves.
</content>
