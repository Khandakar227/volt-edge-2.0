# Plan: Manual trace routing (draw copper paths in the editor)

## Goal

Let the user draw a trace's copper path on the PCB canvas and have it stick:
persist the drawn path as `pcbPath` on the matching `<trace>` in
`index.circuit.tsx`, so the next Run re-evaluates and the copper follows the
path (including layer crossings). Same source-as-truth model as the placement
feature (drag → rewrite `pcbX/pcbY`), applied to traces.

## Established facts (verified headlessly against the real eval engine)

- `<trace pcbPath={[{x,y}, {x,y,via:true,toLayer:"bottom"}, ...]}>` produces
  real manual copper with layer-crossing vias — no autorouter. Confirmed: a
  hand-authored path rendered as one trace with 2 vias (top→bottom→top).
- **`pcbPath` coordinates are relative to the trace's `from` component center**
  (not board-absolute; `pcbPathRelativeTo="group_center"` did NOT change this).
  Verified twice: points came out offset by exactly the `from` component's
  `pcbX/pcbY`. So capture must convert board coords → `board - fromComponentCenter`.
- Two cleanly hand-authored signal traces routed exactly as designed down a
  chosen corridor — the relative-coordinate transform works.
- **Partial manual routing can break autorouting of the rest**: pinning 2 traces
  through a corridor blocked the power/ground nets and produced 4
  `pcb_trace_error`s where full autorouting had 0. Implication: the UI must show
  DRC errors live, and ideally support routing ALL nets manually (or clearly
  scope which stay autorouted).
- The pcb-viewer (1.11.374) has an "edit trace" mode that emits
  `edit_trace_hint` events (`{ pcb_port_id, route: [...], in_progress }`). Our
  `onEditEvent` currently only handles component-location edits and drops these.
- Trace hints do NOT draw copper on their own — copper only appears after a
  re-eval with the path in source. (This is why the current UI "does nothing".)

## Biggest unknown → SPIKE FIRST (do this before committing to the design)

The pcb-viewer's edit-trace UX is half-built upstream (issue #38). Before
building the backend/persistence, confirm in a real browser:

1. Does completing a trace-draw emit an `edit_trace_hint` event whose `route`
   contains the **full set of waypoints the user drew**, in board coordinates?
   (The initial event has `route: []`, `in_progress: true` — need to capture the
   final, non-in_progress event and see the points.)
2. Can the user express a **layer change / via** in that mode, or only a flat
   top-layer path? If not, we need our own affordance (e.g. a modifier key or a
   "drop via" click) — otherwise "go over the other side" is impossible from the UI.

If the viewer can't emit usable waypoint+layer data, the fallback is our own
lightweight drawing overlay on the PCB canvas (bigger scope) — decide after the
spike. **Do not build persistence until the spike answers these.**

## Design (assuming the spike confirms usable events)

### 1. Capture (frontend, `onEditEvent`)
- Handle `edit_trace_hint` (completed, `in_progress === false`).
- Resolve `pcb_port_id` → `source_port` name → `{component, pin}` via the
  circuit JSON (already held in `circuitJsonRef`).
- Find the `<trace>` connecting that pin: match against `from`/`to` selectors
  (`.COMP > .PIN`). Traces have no `name`, so identity = the (from,to) selector
  pair. Handle the rare duplicate-endpoint case by first match + a warning.
- Convert each waypoint from board coords → relative to the `from` component's
  `pcb_component.center` (look it up in circuit JSON).

### 2. Persist (backend, new `PUT /projects/{id}/route`)
- Body: `{ from: string, to: string, pcbPath: [{x,y,via?,toLayer?}] }`.
- Find the `<... />`-or-`<trace>` element whose `from="..."` and `to="..."`
  match; insert/replace a `pcbPath={[...]}` prop (same regex-rewrite approach as
  `set_placement`, which is pytest-covered). Return updated source.
- Reuse the exact-precision number formatting from `set_placement` (avoid the
  rounding-deviation class of bug).

### 3. Apply + re-eval (frontend)
- Patch `fsMap["index.circuit.tsx"]` with returned source (no auto-eval;
  `showRunButton` gates it). User hits Run → copper follows the path.
- Reuse the post-Run viewer-remount guard (dragsSinceEvalRef / viewerEpoch) so
  stale edit-events don't deviate the render.

### 4. DRC feedback (frontend)
- Surface `pcb_trace_error` / `pcb_pad_trace_clearance_error` from the circuit
  JSON in the UI (count + which trace), so an invalid manual route is visible
  rather than silent — critical because manual routes can conflict.

### 5. Clearing / re-routing
- Re-drawing a trace replaces its `pcbPath`. Need a "clear route" affordance
  (remove the prop → back to autorouted).

## Verification (headless, before handing to the user)
- Simulate capture → `set_route` → re-eval on a real board: assert the trace's
  emitted `route` follows the requested waypoints, a via appears where
  requested, and no NEW DRC errors vs baseline.
- Backend: pytest for `set_route` (insert, replace, unknown trace 404, exact
  precision) mirroring `test_placement.py`.
- Full board: `tsc` + build clean.

## Open questions for the user
- **Scope of "manual"**: route only specific traces (rest autorouted, with DRC
  warnings when they conflict), or a mode to route the whole board by hand?
- **Single-layer intent**: true 1-layer (needs a physical jumper component —
  bigger modeling task) vs. 2-layer "cross on the back" (a via — already
  supported by `pcbPath`). The MG90 board suggests you mean the latter.
