# VoltEdge — Product Specification

> **Status:** Draft v1 · **Scope:** Single-user / self-hosted MVP
> **Companion docs:** [PLAN.md](./PLAN.md) · [TASKS.md](./TASKS.md) · [PACKAGES.md](./PACKAGES.md) · [AGENTIC_PLAN.md](../AGENTIC_PLAN.md)

## 1. Summary

VoltEdge is an agentic dashboard for electronics design. A chat "sidekick" powered by the
**Claude Agent SDK** (driving a local **Claude Code** session with the bundled `tscircuit`
skill) turns natural-language prompts into **tscircuit** (React/TypeScript) circuit code. The
design is compiled and rendered live in the browser across **Schematic**, **PCB**, and **3D**
views, and can be exported as a fabrication package (Gerbers / BOM / Pick-and-Place) or as
downloadable source.

The product's core bet: a designer describes intent in words ("an ESP32 dev board with USB-C
power, a status LED, and a reset button"), and the agent iterates a real, buildable board —
sourcing parts, wiring nets, validating placement and routing — while streaming its reasoning
so the user stays in control.

## 2. Goals & non-goals

### Goals (v1)
- Convert natural-language prompts into buildable tscircuit `.tsx` designs.
- Live in-browser rendering of Schematic / PCB / 3D from a single source of truth (the `.tsx` fsMap).
- Streamed agent transparency: thinking, tool calls, plan, questions, checkpoints.
- Tiered real-world part sourcing (registry → JLCPCB exact part# → hand-model from datasheet).
- Server-side validation loop (`tsci check`/`build`) that gates what the user sees.
- Full fabrication export (Gerber/BOM/PnP zip) plus source download.
- Guardrails: soft per-design iteration budget + hard backend caps with interrupt.

### Non-goals (v1)
- Multi-user tenancy, auth, or cloud multi-tenancy (self-hosted, single local Claude auth).
- Design versioning / history / revert (latest state only).
- Guaranteed manufacturability — DRC and fab-rule correctness remain **user-owned**.
- Ordering boards or publishing packages (`tsci push`) on the user's behalf.
- Offline operation (browser rendering depends on the tscircuit registry CDN).

## 3. Personas

| Persona | Need |
|---|---|
| **Maker / hobbyist** | Describe an idea, get a real board without learning full EDA. |
| **Firmware/embedded dev** | Prototype a breakout quickly, export fab files, iterate by chatting. |
| **Hardware reviewer** | Read the agent's plan and checks to trust/adjust the design. |

## 4. User stories

- **US-1 — Create project.** As a user, I create a named project so the agent has a persistent
  workspace and a bound Claude session.
- **US-2 — Prompt to design.** I type a natural-language request and the agent produces a plan,
  then a working circuit, streaming its reasoning and tool activity.
- **US-3 — See the design.** After each validated checkpoint, I see the updated Schematic, PCB,
  and 3D views rendered from the current source.
- **US-4 — Answer blocking questions.** When the agent hits high-cost ambiguity (power rail,
  board size, a must-have specific part), it asks; I answer and it continues.
- **US-5 — Interrupt.** I can stop a running turn at any time and redirect.
- **US-6 — Iterate.** I refine by chatting ("make it 2-layer", "swap the regulator for a
  3.3V LDO") and the design updates.
- **US-7 — Export.** I export a fabrication zip and/or download the source.
- **US-8 — Resume.** I reopen an existing project and continue where I left off.

## 5. Functional requirements

### 5.1 Projects & workspace
- **FR-1** Create a project → scaffold a tscircuit workspace (`tsci init -y`) at a per-project cwd.
- **FR-2** List projects; open one to bind/resume its Claude session.
- **FR-3** Expose the full source **fsMap** (`.tsx`, `package.json`, config, custom parts) to the browser renderer.
- **FR-4** Persist projects, sessions, messages, and checkpoint metadata (SQLite).

### 5.2 Agent conversation (SSE-driven)
- **FR-5** Accept a user message and drive one agent turn over a long-lived streaming session.
- **FR-6** Stream typed events to the client: `thinking`, `assistant_text`, `tool_use`,
  `tool_result`, `plan`, `question`, `checkpoint`, `build_status`, `paused`, `error`, `done`.
- **FR-7** **Soft plan gate:** show the plan (parts, nets, board, assumptions, sourcing) and
  auto-proceed unless the user interrupts.
- **FR-8** **Hard-block questions** only on high-cost ambiguity; the turn awaits the answer.
- **FR-9** Allow the user to **interrupt** the current turn (`client.interrupt()`).

### 5.3 Design authoring & validation
- **FR-10** The agent writes/edits `.tsx` using tscircuit primitives and the bundled skill.
- **FR-11** Tiered part sourcing: `tsci search --tscircuit` → `tsci add`; else
  `tsci search --jlcpcb` → import by **exact LCSC part#** (non-interactive); else hand-model
  from datasheet (WebFetch) with footprint + pin verification.
- **FR-12** Run the check chain within the iteration budget:
  `check netlist → check schematic-placement → check placement → check routing-difficulty → build`.
- **FR-13** Emit a `checkpoint` on a clean/best-effort build; client refetches fsMap and re-renders.
- **FR-14** On exhausted iteration budget (infeasible constraint) → stop and escalate with ranked
  relaxations; never silently change a user-specified constraint.

### 5.4 Rendering
- **FR-15** Render the fetched fsMap in-browser via `@tscircuit/runframe`, resolving `@tsci/*`
  and JLCPCB imports from the tscircuit CDN.
- **FR-16** Provide **Schematic | PCB | 3D** tabs; re-render on `checkpoint`.

### 5.5 Export
- **FR-17** Produce a fabrication zip (Gerbers/BOM/PnP) from `circuit.json`.
- **FR-18** Provide a source download (`.tsx` + `circuit.json`).
- **FR-19** Surface a clear "manufacturability is user-owned" caveat at export.

### 5.6 Guardrails
- **FR-20** Enforce **hard per-turn caps**: max wall-clock, max Bash/`tsci` invocations, token budget.
- **FR-21** On breach → `interrupt()` + `paused{reason:"limit_reached"}` + await user.
- **FR-22** Restrict Bash to an allowlist (`tsci *`, `npm`/`bun`, `git`, `ls`/`cat`/`grep`/`find`);
  auto-allow Write/Edit only within the workspace.

## 6. Non-functional requirements
- **NFR-1 — Version parity.** Backend `tsci` and browser runframe must run **pinned, matching**
  tscircuit versions to avoid render/validation drift.
- **NFR-2 — Responsiveness.** First `thinking` token streams within ~2s of a message; UI stays
  interactive during a turn (interrupt always available).
- **NFR-3 — Resource hygiene.** Idle project sessions torn down after a timeout; resumable via
  stored `session_id`.
- **NFR-4 — Cost control.** All Claude usage bills to the local account; hard caps bound per-turn cost.
- **NFR-5 — Safety.** No publish/order actions without explicit user request; electrical/regulatory
  safety is user-owned.
- **NFR-6 — Observability.** Every turn's tool calls and check results are inspectable in the chat log.

## 7. Locked design decisions

Carried from [AGENTIC_PLAN.md](../AGENTIC_PLAN.md) §1:

| # | Area | Decision |
|---|------|----------|
| 1 | Render boundary | Browser compiles `.tsx` in-browser via runframe |
| 2 | Agent feedback | Backend runs Node + `tsci` for **validation only** |
| 3 | Workspace | One persisted tscircuit project per user-project; one bound Claude session each |
| 4 | Tenancy | Single-user / self-hosted first (local Claude Code auth) |
| 5 | Plan gate | Soft — plan shown, auto-proceeds unless interrupted |
| 6 | Clarifying questions | Proceed on stated assumptions; hard-block only on high-cost ambiguity |
| 7 | Session liveness | Long-lived streaming session per active project |
| 8 | Render refresh | Re-render on validated checkpoints; sync full fsMap |
| 9 | Parts sourcing | Tiered: registry → JLCPCB exact part# → hand-model last |
| 10 | Agent autonomy | Auto-allow workspace edits; Bash allowlisted |
| 11 | Runaway guard | Skill soft budget + backend hard caps |
| 12 | Versioning | None in v1 (latest state only) |
| 13 | Export | Full fab export (Gerber/BOM/PnP) + source download |

## 8. Acceptance criteria (MVP "done")

1. Create a project; the workspace scaffolds and a Claude session binds.
2. Send "make a simple LED blinker board" → stream a plan → stream thinking/tools → reach a
   `checkpoint` → Schematic/PCB/3D render in-browser from the same source.
3. A high-cost ambiguity produces a `question` that blocks until answered.
4. Interrupt stops the running turn cleanly.
5. Exceeding a hard cap emits `paused` and halts the turn.
6. Export produces a downloadable fab zip and a source zip; the manufacturability caveat is shown.
7. Reopen the project after restart and continue the same session.

## 9. Risks (see PLAN §7 for mitigations)

Fab-zip headless path unproven · two-compiler version drift · `tsci import` interactivity ·
long-lived subprocess memory growth · datasheet hallucination in hand-model tier · CDN dependency ·
local-auth cost · manufacturability caveat.

## 10. Open questions

- **OQ-1** Headless fab-zip: confirmed CLI path, or programmatic generation from `circuit.json`? (Phase 0)
- **OQ-2** Non-interactive `tsci import` by exact LCSC part# — confirmed, or scripted fallback? (Phase 0)
- **OQ-3** Model policy: default Sonnet, escalate to Opus for hard routing/placement — config-tunable?
- **OQ-4** Idle-session timeout value and teardown/resume semantics.
</content>
</invoke>
