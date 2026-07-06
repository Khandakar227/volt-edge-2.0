# VoltEdge — Technical Implementation Plan

> **Companion docs:** [SPEC.md](./SPEC.md) · [TASKS.md](./TASKS.md) · [PACKAGES.md](./PACKAGES.md) · [AGENTIC_PLAN.md](../AGENTIC_PLAN.md)

This plan operationalizes the [SPEC](./SPEC.md). It expands the architecture in
[AGENTIC_PLAN.md](../AGENTIC_PLAN.md) into concrete modules, contracts, and a build sequence.

> **Phase 0 is complete** ([PHASE0_RESULTS.md](./PHASE0_RESULTS.md)) — the spikes changed several
> assumptions below. Key deltas baked into this plan: (a) render **backend-built `circuit.json`**
> via `CircuitJsonPreview` (or standalone/iframe), **not** browser `.tsx` re-compilation — this
> eliminates the two-compiler drift risk; (b) `tsci export -f gerbers` is the whole fab-zip path;
> (c) the frontend is **React 19**; (d) the Agent SDK **bundles its own CLI** and has native budget
> controls; (e) `tsci` requires **bun**.

## 1. Architecture overview

```
┌───────────────────────── Browser (React + Vite) ──────────────────────────┐
│  Chat sidekick (SSE consumer)      │  Circuit canvas — Schematic│PCB│3D     │
│  thinking · plan card · questions  │  @tscircuit/runframe compiles fsMap    │
│  tool chips · interrupt · banners  │  re-renders on `checkpoint`            │
└──────────▲──────────────────┬──────┴───────────────────────▲───────────────┘
   SSE (server→client events) │ POST (message/answer/interrupt)│ GET fsMap
┌──────────┴──────────────────┴──────────────────────────────┴───────────────┐
│                              FastAPI backend                                │
│  Session Mgr │ SSE Relay/Event Bus │ Guardrails │ Export Svc │ Workspace Svc │
│        │ Claude Agent SDK (streaming ClaudeSDKClient, resume=session_id)     │
│  ┌─────▼──────────────────────────────────────────────────────────────────┐ │
│  │ Claude Code (local auth), cwd = project workspace                        │ │
│  │  tools: Read/Write/Edit (auto in cwd) · Bash (allowlisted) · WebFetch    │ │
│  │  skill: ../skill (tscircuit) mounted via setting_sources                 │ │
│  └─────────────────────────────┬───────────────────────────────────────────┘ │
│                                │ runs `tsci` (validation only)                │
│  Per-project workspace: index.circuit.tsx · parts/*.tsx · package.json ·      │
│  tscircuit.config.json · node_modules · dist/ (circuit.json, fab outputs)     │
│  SQLite: projects · sessions · messages · checkpoints                         │
└───────────────────────────────────────────────────────────────────────────────┘
```

**One compiler, one artifact (revised after Phase 0):** backend `tsci` compiles `.tsx` →
`circuit.json` for both the agent's verification loop **and** display. The browser renders that
`circuit.json` via `CircuitJsonPreview` (no in-browser eval), so there is no second compiler to
drift against. (The `RunFrame(fsMap)` browser-recompile path remains available if live in-browser
code editing is ever wanted, but is not used in v1.) The backend still pins `tscircuit`/`tsci` and
the frontend pins the matching runframe viewer set (NFR-1).

## 2. Repository layout (target)

```
volt-edge-2.0/
├── docs/                      # SPEC / PLAN / TASKS / PACKAGES (this set)
├── skill/                     # tscircuit Claude skill (exists) — mounted into the agent
├── backend/                   # FastAPI app
│   ├── app/
│   │   ├── main.py            # FastAPI app + routes
│   │   ├── config.py          # settings (pydantic-settings): caps, model, paths, pins
│   │   ├── db.py              # SQLite (SQLModel) engine + models
│   │   ├── models.py          # Project, Session, Message, Checkpoint
│   │   ├── schemas.py         # request/response + SSE event pydantic models
│   │   ├── sessions.py        # Session Manager (project_id → ClaudeSDKClient)
│   │   ├── agent.py           # ClaudeAgentOptions wiring, can_use_tool, event mapping
│   │   ├── events.py          # SSE relay / async event bus per project
│   │   ├── guardrails.py      # per-turn hard caps + interrupt
│   │   ├── workspace.py       # tsci init, fsMap read, file exposure
│   │   ├── export.py          # fab zip + source zip
│   │   └── routes/            # projects, events, message, interrupt, export
│   ├── tests/
│   └── pyproject.toml
├── frontend/                  # React + Vite
│   ├── src/
│   │   ├── main.tsx / App.tsx
│   │   ├── api/               # fetch client + EventSource wrapper
│   │   ├── state/             # session/event store
│   │   ├── components/chat/   # ThinkingBlock, PlanCard, QuestionPrompt, ToolChip, Banners
│   │   ├── components/canvas/ # RunframeCanvas + Schematic/PCB/3D tabs
│   │   └── components/export/ # export buttons
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── workspaces/                # per-project tscircuit workspaces (gitignored)
├── data/                      # volt-edge.db (gitignored)
└── docker-compose.yml         # optional: node/bun toolchain + backend + frontend
```

## 3. Backend design

### 3.1 Session Manager (`sessions.py`)
- Owns a map `project_id → {client: ClaudeSDKClient, session_id, cwd, last_active, lock}`.
- One **streaming-input** `ClaudeSDKClient` per *active* project (SPEC decision 7).
- `get_or_create(project_id)`: reuse live client; else construct with `resume=session_id`
  (from SQLite) so an existing project reconnects to its Claude session.
- **Idle teardown:** background sweeper closes clients idle > `IDLE_TTL`; next access resumes.
- Per-project `asyncio.Lock` serializes turns (no concurrent turns on one project).

### 3.2 Agent wiring (`agent.py`) — validated in P0-5
- Build `ClaudeAgentOptions`:
  - `cwd` = project workspace.
  - `permission_mode="acceptEdits"` auto-allows Write/Edit; a `can_use_tool` callback enforces the
    **Bash allowlist** (`tsci *`, `npm`/`bun`, `git`, `ls`/`cat`/`grep`/`find`) and confines
    Write/Edit paths to the workspace. **⚠ `Bash` must be kept OUT of `allowed_tools`** — listing a
    tool there pre-approves it and bypasses `can_use_tool` (confirmed in P0-5). Gate Bash only via
    the callback (or a `PreToolUse` hook).
  - **Skill mount:** copy `skill/` into `<cwd>/.claude/skills/tscircuit/`, set
    `setting_sources=["project"]` and `skills=["tscircuit"]`. Confirmed to auto-activate (the agent
    invoked the `Skill` tool in the P0-5 trace).
  - `model`: default **Sonnet**; `fallback_model`/config escalation to **Opus** for hard
    routing/placement turns.
  - `resume` = stored `session_id` (also `fork_session`, `continue_conversation` available).
  - **Native guardrails:** set `max_turns` and `max_budget_usd` (and/or `task_budget`) as a first
    line of defense, backing the custom per-turn caps in §3.4.
  - The SDK **bundles its own `claude` CLI** — no separate CLI install; override with `cli_path` if
    a specific Claude Code build is desired. Pass `env={"PATH": ...}` so `tsci`/`bun` are reachable.
- Feed user input via the streaming input queue; consume SDK messages async and hand each to the
  event mapper.

### 3.3 SSE relay / event bus (`events.py`)
- Per-project `asyncio.Queue`; `GET /projects/{id}/events` is an `EventSourceResponse`
  (sse-starlette) that drains it.
- **Event mapper** translates SDK message types → the SSE taxonomy (§4). Thinking blocks →
  `thinking`; assistant text → `assistant_text`; tool-use/results → `tool_use`/`tool_result`;
  structured plan/question markers emitted by the skill → `plan`/`question`; a successful build →
  `checkpoint`; `tsci check` output → `build_status`.
- Supports reconnect (client re-establishes EventSource; last events replayable from message log).

### 3.4 Guardrails (`guardrails.py`)
- Per-turn counters: wall-clock, Bash/`tsci` invocation count, token budget (from usage in SDK messages).
- Wraps each turn; on breach → `await client.interrupt()`, emit `paused{reason:"limit_reached"}`,
  await user. Complements the skill's **soft 3-round** budget (already in the skill).
- Limits are config-driven (`config.py`): `MAX_TURN_SECONDS`, `MAX_TSCI_CALLS`, `MAX_TURN_TOKENS`.

### 3.5 Workspace service (`workspace.py`)
- `scaffold(cwd)`: `tsci init -y` in a fresh per-project dir, then **rewrite `package.json` to pin
  `tscircuit` to the locked version** (the scaffold writes `"latest"`). Requires `bun` on PATH.
- `read_fsmap(cwd)`: walk workspace source files (`.tsx`, `package.json`, `tscircuit.config.json`,
  `imports/*`) into `{ path: contents }`; exclude `node_modules`/`dist`.
- `latest_circuit_json(cwd)`: path is **`dist/<entrypoint>/circuit.json`** (e.g.
  `dist/index/circuit.json`) — per-entrypoint subdir, confirmed in P0-1.

### 3.6 Export service (`export.py`)
- **Fab zip (confirmed in P0-3):** `tsci export <entry>.circuit.tsx -f gerbers -o <out>.zip`
  emits one zip containing all Gerber layers, `drill.drl`/`drill_npth.drl`, **`bom.csv`**, and
  **`pick_and_place.csv`**. The service is a thin wrapper around this command — no programmatic
  `circuit-json-to-gerber` path needed. Emit the "manufacturability user-owned" caveat in the response.
- **Source zip:** stream the fsMap + `dist/<entrypoint>/circuit.json`.
- Other `tsci export -f` formats available if needed: `schematic-svg`, `pcb-svg`, `gltf`/`glb`,
  `kicad_zip`, `specctra-dsn`, `readable-netlist`, `step`, `assembly-svg`.

### 3.7 Persistence (`db.py`, `models.py`) — SQLite via SQLModel
```
projects(id, title, cwd, created_at)
sessions(project_id, claude_session_id, last_active)
messages(project_id, role, content, ts)
checkpoints(project_id, version, summary, ts)     # metadata only; no revert in v1
```

### 3.8 HTTP + SSE API
| Method | Route | Purpose |
|--------|-------|---------|
| `POST` | `/projects` | Create project → scaffold workspace |
| `GET`  | `/projects` | List projects |
| `GET`  | `/projects/{id}/fsmap` | Full source fsMap for the renderer |
| `GET`  | `/projects/{id}/events` | **SSE** stream of agent events |
| `POST` | `/projects/{id}/message` | User prompt / answer to a question |
| `POST` | `/projects/{id}/interrupt` | Interrupt the current turn |
| `POST` | `/projects/{id}/plan/approve` | Soft-gate acknowledge/edit |
| `POST` | `/projects/{id}/export` | Build fab zip → download URL |
| `GET`  | `/projects/{id}/download/source` | `.tsx` + `circuit.json` zip |

## 4. SSE event taxonomy (server → client)

```
thinking        { text }
assistant_text  { text }
tool_use        { tool, input }
tool_result     { tool, ok, summary }
plan            { parts[], nets[], board{}, assumptions[], sourcing[] }
question        { id, prompt, options?[] }        # blocks; awaits POST /message answer
checkpoint      { version, summary }              # client refetches fsMap & re-renders
build_status    { phase, violations[] }           # netlist/placement/routing/build
paused          { reason:"limit_reached", detail }
error           { message }
done            { turn_id }
```
Client → server (POST): `message`, `answer{question_id}`, `interrupt`, `approve`.

## 5. Frontend design (React 19 — required by the runframe viewer set, per P0-4)
- **Layout:** left chat sidekick, right canvas with `Schematic | PCB | 3D` tabs.
- **Chat stream:** `EventSource` consumer renders `thinking` (collapsible), `assistant_text`,
  `tool_use`/`tool_result` (activity chips), a **Plan card**, a **Question prompt** (options +
  free text), an **Interrupt** button, and `paused`/`error` banners.
- **Canvas:** on `checkpoint`, fetch the backend-built `circuit.json` and render it with
  `CircuitJsonPreview({ circuitJson, availableTabs:["pcb","schematic","cad"] })`. This needs no
  in-browser eval and no `.tsx` recompilation, so there is no compiler drift. The 3D viewer still
  pulls model assets from `modelcdn.tscircuit.com` (verified live). **Do not bundle
  `@tscircuit/runframe/runner` from source** — its undeclared-dependency tail makes that
  impractical (P0-4); use the `/preview` viewers (or the standalone bundle / hosted iframe).
- **Export:** buttons for fab zip + source download, with the manufacturability caveat.

## 6. Agent turn lifecycle (driven by the tscircuit skill)
1. **Understand + plan** → emit `plan` (parts, nets, board, stated assumptions, sourcing).
   Auto-continue unless interrupted (soft gate).
2. **Hard-block** only on high-cost ambiguity (power rail, board size/form-factor, must-have part)
   → emit `question`, await answer.
3. **Source parts (tiered):** registry (`tsci add`) → JLCPCB exact LCSC part# (non-interactive
   import) → hand-model from datasheet (WebFetch) with footprint + pin verification.
4. **Write `.tsx`**, run the check chain within the soft iteration budget:
   `check netlist → check schematic-placement → check placement → check routing-difficulty → build`;
   use wire-jumpers for single-layer crossings.
5. On clean/best-effort build → emit `checkpoint` → client re-renders.
6. On exhausted budget → stop and escalate with ranked relaxations (never silently change a
   user-specified constraint).

## 7. Risks & mitigations

| # | Risk | Status after Phase 0 | Phase |
|---|------|-----------|-------|
| 1 | Headless fab-zip path unproven | ✅ **Closed** — `tsci export -f gerbers` emits Gerbers+BOM+PnP zip | 0 |
| 2 | Two-compiler drift | ✅ **Eliminated** — render backend-built `circuit.json`; no browser recompile | 0 |
| 3 | `tsci import` interactivity | ✅ **Closed** — `tsci import <part> --jlcpcb` is non-interactive | 0 |
| 4 | Long-lived subprocess growth | Open — idle teardown + resume; per-project client lifecycle | 3 |
| 5 | Datasheet hallucination | Open — keep hand-model tier last-resort, verification-gated (skill) | 2 |
| 6 | CDN dependency | Open (accepted) — registry/model CDNs verified live; offline out of v1 scope | — |
| 7 | Local-auth cost | Open — native `max_budget_usd`/`max_turns` + hard caps + soft budget (~$0.18/simple turn baseline) | 2 |
| 8 | Manufacturability caveat | Open — surface clearly at export in UI | 3 |
| 9 | **runframe undeclared deps / React 19** (new) | Mitigated — use `/preview` viewers or standalone/iframe; pin React 19 + viewer set | 0/1 |

## 8. Build phases

- **Phase 0 — Spikes (de-risk first): ✅ COMPLETE** ([PHASE0_RESULTS.md](./PHASE0_RESULTS.md)) —
  non-interactive import, headless fab-zip, render engine + integration path, and a real Agent SDK
  turn all confirmed. Only residual: a live browser pixel-render (manual, folded into P1-14) and
  final version pinning before integration.
- **Phase 1 — Vertical slice:** create project → single prompt → agent builds a minimal board →
  SSE thinking stream → `checkpoint` → browser renders schematic. Local, one project.
- **Phase 2 — Full loop:** plan card, hard-block questions, interrupt, tiered sourcing, all three
  views, guardrails + soft budget integration.
- **Phase 3 — Export + polish:** fab zip, source download, project list/persistence, idle session
  teardown + resume, error/paused UX.

## 9. Testing & verification strategy
- **Backend unit:** event mapper (SDK message → SSE), guardrail counters, `can_use_tool`
  allowlist, workspace fsMap read, DB CRUD.
- **Integration:** mocked/stubbed `ClaudeSDKClient` driving a full turn → asserts the SSE sequence
  (`plan → thinking → tool_use → checkpoint → done`).
- **Toolchain smoke:** `skill/scripts/smoke_test.sh` + a scaffold-and-build test proving
  `tsci init` → minimal `.tsx` → `tsci build` yields `circuit.json`.
- **Frontend:** component tests for chat event rendering; a runframe render harness against a
  fixture fsMap.
- **E2E (manual, MVP):** the SPEC §8 acceptance script.
</content>
