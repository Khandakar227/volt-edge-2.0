# Design: Correct part authoring from datasheets

**Date:** 2026-07-16
**Status:** Approved (design) — pending implementation plan
**Scope:** Approach A (correctness core) + richer inline confirmation

## Problem

When a required component is found in none of the existing sourcing tiers (local
`./parts/` library → tscircuit registry → `@tscircuit/common` → JLCPCB/LCSC), the agent
must model the part itself. Today it does this **from model memory alone** — the agent
has no web/datasheet access (`allowed_tools = Read, Write, Edit, Glob, Grep`; Bash is
prefix-gated) — so pin numbers, pin ordering, body dimensions, and footprints are
frequently hallucinated. This is the tracked "datasheet hallucination in the hand-model
tier" risk (Risk 5).

The goal: when the agent has to make a part, it should get **everything correct** —
body dimensions, footprint geometry, and the pinout (physical pin number → signal, in
the right sequence) — grounded in the real datasheet, verified, and confirmed by the
user before it is wired into the board.

## Non-goals

- Modeling a part with no obtainable datasheet by guessing — the agent must stop and ask
  instead (honest failure, not a hallucinated one).
- Promoting created parts into the shared `component-kb/parts` catalog for cross-project
  reuse (deferred — was "Approach C").
- True mid-turn pause/resume of a live SDK turn (see Confirmation, below — we use a
  turn-boundary gate instead).

## Where this fits

This is **tier 5** of the sourcing flow, reached only when tiers 1–4 all miss. Lifecycle
inside a turn:

```
miss on tiers 1–4
  → research:  WebSearch part → WebFetch datasheet → extract pinout table + body dims
  → author:    write ./parts/<slug>.tsx  (one <chip>: pinLabels, pinAttributes, footprint)
  → verify:    run scripts/verify_part.sh  (pin↔pad count, pitch, outline, build + render)
  → confirm:   write .voltedge/pending-part.json → backend emits part_review → turn ends
  → user acts: Confirm / Edit / Reject  →  POST /answer  →  next turn
  → use:       agent wires the confirmed part into index.circuit.tsx
```

## Component 1 — Gated web access

Enable the SDK built-in tools **`WebSearch`** and **`WebFetch`**, allowed via the
`can_use_tool` callback and **NOT** listed in `allowed_tools` (listing pre-approves and
bypasses the gate — the same P0-5 lesson that keeps Bash out).

- **Confirmed (Agent SDK ≥ 0.2.110):** both tools need no special entitlement beyond the
  existing auth; tool name strings are exactly `"WebSearch"` and `"WebFetch"`.
- `WebFetch` supports domain allowlisting (`WebFetch(domain:…)`) but we keep it
  callback-gated-and-open because datasheets are scattered across manufacturer and
  aggregator domains. Routing through the callback preserves a single chokepoint for
  future per-domain limits or logging.
- `WebSearch` is all-or-nothing (no domain filter) and may fan out to ~8 backend searches
  per call — a cost reason to search deliberately (see the budget below).

The `can_use_tool` callback allows `WebSearch`/`WebFetch` unconditionally for v1 (both are
read-only). Write/Edit confinement and the Bash allowlist are unchanged.

## Component 2 — The part-authoring skill

New doc **`component-kb/AUTHORING.md`**, surfaced through the existing `components` skill
(which already owns "how parts are shaped"), with a pointer added from
`component-kb/SKILL.md`. It codifies the procedure:

**Research — preferred source order (check central sources first, stop early):**
1. **Manufacturer datasheet PDF** for the exact part № — ground truth for pinout +
   mechanical dimensions (TI, ST, NXP, Microchip, …).
2. **Central aggregators** to locate it fast: **Octopart**, **DigiKey**, **Mouser**
   (datasheet links + parametric tables).
3. **SnapEDA** — structured symbol/footprint/pinout data, often HTML (easier to parse
   than a PDF).
4. **General web search** — only if 1–3 miss.

**Search budget:** aim for ~1–2 searches, then fetch and read; do not keep searching once
a datasheet is in hand. Reinforced by the existing 3-round iteration budget.

**Extract & author:**
- Extract the **pinout table** (physical pin № → primary signal + aliases), the
  **package type**, and **body dimensions** (+ pin pitch for header modules).
- Map to **`pinLabels`** keyed by physical pin (`pin1`, `pin2`, …) exactly as the
  datasheet numbers them — never renumber.
- Tag **`pinAttributes`** (`requiresPower` / `providesPower` / `mustBeConnected`).
- Author **one `<chip>`** matching the existing library file shape: header comment with
  dims + full pinout + "verify against silkscreen" caveats, a named export, and a
  standalone `default` board preview.
- Record the **datasheet URL** in the header comment as provenance.

## Component 3 — Footprint strategy (the correctness lever)

- **Standard IC package** (SOIC / SOT / QFN / QFP / DIP / TSSOP / …): express as a
  **footprinter string** (e.g. `soic8_p1.27mm`, `sot23_5`, `qfn32_p0.5mm`). Geometry is
  generated correctly; the agent only needs the package name + pin count. **No
  hand-placed pads.**
- **Header / breakout module** (like the existing five library parts): a `<pinheader>` or
  `<platedhole>` grid at real pitch (2.54 mm typical), **centered on the origin** (the
  drag anchor — a documented gotcha in the current parts), body outline from datasheet
  dimensions.

## Component 4 — Self-verification: `skill/scripts/verify_part.sh`

A new script the agent runs on the authored part **before** confirmation. It builds the
part's standalone preview and checks:

- `pinLabels` count **==** footprint pad/hole count (catches a dropped/extra pin — the
  most common modeling error).
- Pitch and body dimensions within sane bounds (no zero / absurd values).
- Board outline encloses all pads with clearance.
- `tsci build` exits 0 and a `circuit.json` is produced.

Verify failures feed the **3-round iteration budget** (fix → re-verify, ≤ 3×, then stop
and report) — never an infinite loop.

## Component 5 — Richer inline confirmation (the part-review gate)

A structured UI gate, not a plain chat message:

- After verification passes, the agent writes a sentinel
  **`.voltedge/pending-part.json`** — `{ slug, manufacturer, part_number, package,
  dimensions, pinLabels, footprint, datasheet_url }`.
- The **backend detects it via mtime watch** (the same mechanism that already detects
  build checkpoints in `sessions.py`) and emits a new **`part_review`** SSE event
  carrying that payload; the turn then ends.
- The **frontend renders a `PartCard`** — pin map + dimensions + datasheet link + three
  actions: **Confirm** · **Edit** (inline-correct a pin/dimension) · **Reject**.
- The action calls a new **`POST /projects/{id}/answer`** endpoint, which starts the next
  turn with an injected instruction:
  - Confirm → *"User confirmed part `<slug>` — wire it into the board."*
  - Edit → *"User corrected: `<field>` = `<value>`. Fix `./parts/<slug>.tsx` then wire it in."*
  - Reject → *"User rejected the part — try a different source or ask the user."*

**Deliberate simplification — turn-boundary, not mid-turn pause.** The agent ends its
turn when the card is emitted; the user acts; the next turn continues. This reuses the
existing checkpoint-detection and message-turn machinery rather than the much heavier lift
of pausing/resuming a live SDK turn. From the user's seat the UX is identical — a card
with buttons.

## Component 6 — Persistence

The authored part lives in the **project workspace `./parts/`** — reusable within the
project, inside the sandbox, no cross-project machinery. (Promotion to the shared library
is deferred.)

## Guardrails & failure handling

- **Iteration budget** (existing, 3 rounds/failing check) governs verify-fix loops.
- **No datasheet found / ambiguous pinout** → the agent stops and asks the user rather
  than inventing pins.
- **Web tools are read-only**; edits remain workspace-confined; Bash allowlist unchanged
  (except a possible `curl` addition for PDF download — see risks).

## Known implementation risks (resolve in the plan)

- **PDF datasheets vs `WebFetch`.** `WebFetch` is strongest on HTML. Mitigations, in
  order of preference: prefer HTML pinout pages (SnapEDA / DigiKey); rely on `WebFetch`
  text extraction for PDFs; if needed, add `curl` to the Bash allowlist to download the
  PDF locally so the agent's `Read` (which handles PDFs) can ingest it. The chosen path
  affects the tool set, so decide it early in the plan.
- **`part_review` event shape** must round-trip cleanly through the persisted event log
  so a reload restores the pending card (consistent with the existing "event stream is
  the transcript" design).

## Testing

- **Unit** — `verify_part.sh` against a known-good part (passes) and a deliberately broken
  one: mismatched pin count, zero pitch (fails).
- **Backend** — `pending-part.json` detection emits a `part_review` event; `POST /answer`
  starts a follow-up turn with the correct injected instruction for each of
  Confirm / Edit / Reject.
- **Integration (manual)** — prompt the agent for a part in no tier (e.g. a specific shift
  register); confirm the produced `./parts/<slug>.tsx` has the correct pin count and a
  valid footprinter string and builds cleanly; confirm the part card renders and each
  action drives the expected next turn.

## Files touched

**Backend**
- `backend/app/agent.py` — gate `WebSearch`/`WebFetch` via `can_use_tool`; expand the
  tier-5 sourcing rule to point at the authoring procedure.
- `backend/app/sessions.py` — detect `.voltedge/pending-part.json` (mtime watch), emit
  `part_review`; handle the injected follow-up turn from `/answer`.
- `backend/app/routes.py` + `backend/app/schemas.py` — `POST /projects/{id}/answer`.

**Skill / knowledge**
- `component-kb/AUTHORING.md` (new) + pointer from `component-kb/SKILL.md`.
- `skill/scripts/verify_part.sh` (new).
- `skill/SKILL.md` / `skill/WORKFLOW.md` — reference the verify step in the tier-5 path.

**Frontend**
- `frontend/src/components/PartCard.tsx` (new) — the confirmation card.
- `frontend/src/components/EventRow.tsx` — dispatch `part_review`.
- `frontend/src/api.ts` — the `answer` call + `part_review` in the SSE event list.

**Docs**
- `docs/REPORT.md` — note the now-hardened hand-model tier and the mitigated
  datasheet-hallucination risk.
