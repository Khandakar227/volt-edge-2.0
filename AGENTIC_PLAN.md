# Agentic Circuit Design System — Comprehensive Plan

An agentic dashboard where a chat "sidekick" (Claude Agent SDK + local Claude Code)
turns natural-language prompts into tscircuit designs, rendered live as
**Schematic / PCB / 3D**, with fabrication export.

---

## 1. Locked design decisions

| # | Area | Decision |
|---|------|----------|
| 1 | Render boundary | Browser compiles `.tsx` in-browser via `@tscircuit/runframe`/`eval` |
| 2 | Agent feedback | Backend also runs Node + `tsci` for **validation only** |
| 3 | Workspace | One persisted tscircuit project per user-project; one bound Claude session each |
| 4 | Tenancy | Single-user / self-hosted first (local Claude Code auth) |
| 5 | Plan gate | Soft — plan shown, auto-proceeds unless interrupted |
| 6 | Clarifying questions | Proceed on stated assumptions; hard-block only on high-cost ambiguity |
| 7 | Session liveness | Long-lived streaming session per active project (`ClaudeSDKClient`) |
| 8 | Render refresh | Re-render on validated checkpoints; sync full project fsMap |
| 9 | Parts sourcing | Tiered: registry → JLCPCB by exact part# → hand-model from datasheet last |
| 10 | Agent autonomy | Auto-allow edits in workspace; Bash restricted to an allowlist |
| 11 | Runaway guard | Both: skill soft budget + backend hard caps (interrupt on breach) |
| 12 | Versioning | None in v1 (latest state only) |
| 13 | Export | Full fabrication export (Gerber/BOM/PnP zip) + source download |

---

## 2. High-level architecture

```
┌────────────────────────── Browser (React) ──────────────────────────┐
│  Chat sidekick        │  Circuit canvas (tabs)                        │
│  - prompt input       │  - Schematic  - PCB  - 3D                     │
│  - streamed thinking  │  - runframe/eval compiles fsMap (.tsx) → views│
│  - plan card          │  - "Export fab zip" / "Download source"       │
│  - question prompts   │                                               │
│  - interrupt button   │                                               │
└───────▲───────────────┴───────────────────────▲──────────────────────┘
        │ SSE (server→client: thinking/tools/plan/question/checkpoint)  │
        │ POST (client→server: message / answer / approve / interrupt)  │ fsMap fetch
┌───────┴───────────────────────────────────────┴──────────────────────┐
│                         FastAPI backend                               │
│  ┌────────────┐  ┌──────────────┐  ┌───────────────┐  ┌────────────┐  │
│  │ Session mgr│  │ SSE relay    │  │ Guardrails    │  │ Export svc │  │
│  │ (1/project)│  │ (event bus)  │  │ (hard caps)   │  │ (fab zip)  │  │
│  └─────┬──────┘  └──────▲───────┘  └───────┬───────┘  └─────┬──────┘  │
│        │ Claude Agent SDK (streaming)      │ .interrupt()   │         │
│  ┌─────▼──────────────────────────────────▼────────────────▼──────┐  │
│  │ Claude Code (local auth) — cwd = project workspace              │  │
│  │  tools: Read/Write/Edit (auto), Bash (allowlisted), WebFetch    │  │
│  │  skill: tscircuit-skill (mounted)                               │  │
│  └────────────────────────────┬───────────────────────────────────┘  │
│                                │ runs tsci                             │
│  ┌─────────────────────────────▼──────────────────────────────────┐  │
│  │ Project workspace (per project):                                │  │
│  │   index.circuit.tsx, custom parts/*.tsx, package.json, config   │  │
│  │   node_modules, dist/ (circuit.json, fab outputs)               │  │
│  └─────────────────────────────────────────────────────────────────┘ │
│  SQLite: projects, sessions, messages, checkpoints                    │
└───────────────────────────────────────────────────────────────────────┘
```

**Two compile paths, one source of truth (`.tsx`):**
- **Backend `tsci`** compiles for the agent's *verification loop* (netlist/placement/routing/build).
- **Browser runframe** compiles the same fsMap for *display*.
- They must run **pinned, matching tscircuit versions** to avoid drift (see Risks).

---

## 3. Backend (FastAPI)

### 3.1 Core services
- **Session Manager** — owns one long-lived `ClaudeSDKClient` (streaming-input mode)
  per *active* project. Maps `project_id → {session_id, client, cwd, last_active}`.
  Idle projects are torn down after a timeout and resumed later via `resume=session_id`.
- **SSE Relay / Event Bus** — bridges SDK message stream → typed SSE events to the client.
- **Guardrails** — per-turn hard ceilings; calls `client.interrupt()` on breach.
- **Export Service** — produces fabrication zip from `circuit.json`.
- **Workspace Service** — scaffolds (`tsci init`), reads fsMap, exposes files.

### 3.2 Claude Agent SDK wiring
- `ClaudeAgentOptions`:
  - `cwd` = project workspace
  - `permission_mode`: auto-allow Write/Edit; `can_use_tool` callback enforces Bash allowlist
    (`tsci *`, `npm`/`bun`, `git`, `ls`/`cat`/`grep`/`find`), deny others.
  - `setting_sources` includes the mounted **tscircuit-skill** so it auto-activates.
  - Model default **Sonnet**, escalate to **Opus** for hard routing/placement turns (config).
  - `resume` = stored `session_id` for reconnecting to an existing project.
- Feed user input via the streaming input queue; read messages async → relay as SSE.

### 3.3 HTTP + SSE API
| Method | Route | Purpose |
|--------|-------|---------|
| `POST` | `/projects` | Create project → `tsci init` workspace |
| `GET`  | `/projects` | List projects |
| `GET`  | `/projects/{id}/fsmap` | Full source fsMap for the browser renderer |
| `GET`  | `/projects/{id}/events` | **SSE** stream of agent events |
| `POST` | `/projects/{id}/message` | User prompt / answer to a question |
| `POST` | `/projects/{id}/interrupt` | Interrupt the current turn |
| `POST` | `/projects/{id}/plan/approve` | (soft-gate) acknowledge/edit plan |
| `POST` | `/projects/{id}/export` | Build fab zip → download URL |
| `GET`  | `/projects/{id}/download/source` | `.tsx` + `circuit.json` zip |

### 3.4 SSE event taxonomy (server → client)
```
thinking        { text }          # streamed reasoning
assistant_text  { text }          # user-facing chat message chunk
tool_use        { tool, input }   # e.g. Bash: tsci check placement
tool_result     { tool, ok, summary }
plan            { parts[], nets[], board{}, assumptions[], sourcing[] }
question        { id, prompt, options?[] }   # hard-block; awaits POST /message
checkpoint      { version, summary }         # → client refetches fsMap & re-renders
build_status    { phase, violations[] }      # netlist/placement/routing/build
paused          { reason: "limit_reached", detail }
error           { message }
done            { turn_id }
```
Client → server (POST): `message`, `answer{question_id}`, `interrupt`, `approve`.

### 3.5 Guardrails (hard caps, per turn)
- Max wall-clock (e.g. 5 min), max Bash/tsci invocations (e.g. 25), token budget.
- On breach → `interrupt()` + emit `paused{reason:"limit_reached"}` + await user.
- Complements the skill's **soft 3-round iteration budget** (already in the skill).

### 3.6 Persistence (SQLite)
`projects(id, title, cwd, created_at)` ·
`sessions(project_id, claude_session_id, last_active)` ·
`messages(project_id, role, content, ts)` ·
`checkpoints(project_id, version, summary, ts)` (metadata only; no revert in v1).

---

## 4. Agent behavior (driven by the tscircuit-skill)

Turn lifecycle under the **soft gate**:
1. **Understand + plan** → emit `plan` event (parts, nets, board, **stated assumptions**,
   sourcing choices). Continue automatically unless the user interrupts.
2. **Hard-block only** on high-cost ambiguity (power rail, board size/form-factor,
   must-have specific part) → emit `question`, await answer.
3. **Source parts (tiered):**
   - `tsci search --tscircuit --json` → `tsci add` if a registry package exists.
   - else `tsci search --jlcpcb --json` → import the **exact LCSC part#** (non-interactive).
   - else **hand-model from datasheet** (WebFetch), and verify footprint + every
     `pinLabel`/`pinAttributes` against the datasheet before wiring.
4. **Write `.tsx`**, then run the skill's check chain within the **soft iteration budget**:
   `check netlist → check schematic-placement → check placement → check routing-difficulty → build`.
   Single-layer crossings use the **wire-jumper** technique from the skill.
5. On a clean/best-effort build → emit `checkpoint{version}` → client re-renders.
6. If the iteration budget is exhausted (infeasible constraint) → stop and escalate
   with ranked relaxations (per the skill).

---

## 5. Frontend (React)

- **Layout:** left chat sidekick, right circuit canvas with `Schematic | PCB | 3D` tabs.
- **Chat stream:** consumes SSE; renders `thinking` (collapsible), `assistant_text`,
  `tool_use`/`tool_result` (activity chips), a **Plan card**, **Question prompt**
  (with options + free text), an **Interrupt** button, and `paused`/`error` banners.
- **Canvas:** `@tscircuit/runframe` mounted with the fetched fsMap; re-renders on
  `checkpoint`. runframe resolves `@tsci/*` + JLCPCB imports from the tscircuit CDN.
- **Export:** buttons for fab zip + source download.

---

## 6. Build phases

**Phase 0 — Spikes (de-risk first):**
- Confirm `tsci import` non-interactive path by exact LCSC part number.
- Confirm a **headless fab-zip** path (likely `circuit-json-to-gerber` +
  BOM/PnP generation from `circuit.json`, since the skill only documents the
  interactive export UI).
- Confirm runframe fsMap render + CDN import resolution in-browser.
- Pin matching tscircuit versions across backend `tsci` and browser runframe.

**Phase 1 — Vertical slice:** create project → single prompt → agent builds a minimal
board → SSE thinking stream → checkpoint → browser renders schematic. Local, one project.

**Phase 2 — Full loop:** plan card, hard-block questions, interrupt, tiered sourcing,
all three views, guardrails + soft budget integration.

**Phase 3 — Export + polish:** fab zip, source download, project list/persistence,
idle session teardown + resume, error/paused UX.

---

## 7. Risks & open items

1. **Fab-zip headless path** — not documented as a plain CLI in the skill; may need
   programmatic generation from `circuit.json`. **De-risk in Phase 0.**
2. **Two-compiler drift** — backend `tsci` vs browser runframe must be version-pinned;
   a valid server build could render differently in the browser otherwise.
3. **`tsci import` interactivity** — the picker must be bypassable with an exact part#;
   otherwise need a scripted import or registry-only fallback.
4. **Long-lived subprocess mgmt** — memory/handle growth with many open projects;
   enforce idle teardown + resume.
5. **Datasheet hallucination** — the hand-model tier is the least reliable; keep it
   last-resort and verification-gated (already in the skill).
6. **CDN dependency** — browser rendering needs the tscircuit registry CDN online;
   offline mode would require bundling.
7. **Local Claude auth cost** — all usage bills to your account; hard caps mitigate.
8. **Fab export ⇒ manufacturability caveat** — DRC/fab-rule correctness is user-owned;
   surface clearly in the UI.

---

## 8. Tech stack

- **Frontend:** React + Vite, `@tscircuit/runframe`, EventSource (SSE), fetch/POST.
- **Backend:** FastAPI, `claude-agent-sdk` (Python), `sse-starlette`, SQLite.
- **Circuit toolchain:** Node/Bun + `tscircuit` (`tsci`) in each workspace.
- **Agent:** local Claude Code auth; tscircuit-skill mounted via `setting_sources`.
