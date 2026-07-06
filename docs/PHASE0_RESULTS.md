# VoltEdge — Phase 0 Spike Results

> **Date:** 2026-07-05 · **Status:** ✅ All five spikes passed — Phase 1 is unblocked.
> **Companion docs:** [SPEC.md](./SPEC.md) · [PLAN.md](./PLAN.md) · [TASKS.md](./TASKS.md) · [PACKAGES.md](./PACKAGES.md)

Phase 0 exists to de-risk the assumptions the rest of the build depends on. Every spike was
run empirically in this environment. Verified toolchain: **Node 22.22**, **npm 10.9**,
**Python 3.14.4**, **bun 1.3.14** (required by `tsci`), **tscircuit `tsci` 0.0.2001**,
**@tscircuit/runframe 0.0.2160**, **claude-agent-sdk 0.2.110**.

---

## P0-1 — tscircuit toolchain & version parity ✅

- `npm install -g tscircuit` installs `tsci` **0.0.2001**, but its launcher has a `#!/usr/bin/env bun`
  shebang — **`bun` is a hard runtime requirement** for the CLI, not just Node.
- `tsci init -y` scaffolds `index.circuit.tsx`, `package.json`, `tsconfig.json`,
  `tscircuit.config.json`. **The scaffold pins `"tscircuit": "latest"`** in devDependencies — must
  be rewritten to the locked version on scaffold (parity, NFR-1).
- `tsci build` produces Circuit JSON at **`dist/<entrypoint>/circuit.json`** (e.g.
  `dist/index/circuit.json`) — *not* `dist/circuit.json`. The export/workspace services must use
  this path.
- The full `tsci check` chain exists: `netlist`, `schematic-placement`, `placement`,
  `routing-difficulty`, `trace-length`, `pin_specification`.

**Impact:** PLAN/PACKAGES updated — `bun` is a prerequisite; scaffold must rewrite the version pin;
circuit.json path corrected.

## P0-2 — Non-interactive JLCPCB import ✅

- `tsci import C14877 --jlcpcb < /dev/null` imports the **exact LCSC part with no interactive
  picker** → writes `imports/ATMEGA328P_AU.tsx` (exit 0). The `--jlcpcb` flag + exact part# is the
  non-interactive path.
- The imported component carries `supplierPartNumbers={{ jlcpcb: ["C14877"] }}`, a footprint,
  `pinLabels`, and 3D-model URLs (`modelcdn.tscircuit.com/...step|.obj`).
- Import also materializes `node_modules/` + `bun.lock` in the workspace (first dependency pull).
- Caveat: imported `pinLabels` are often generic (`pin1…`), so the skill's "define pinLabels from
  datasheet" step still matters before wiring.

**Impact:** Resolves OQ-2 / Risk 3. Tiered sourcing tier 2 is confirmed scriptable.

## P0-3 — Headless fabrication zip ✅ (biggest de-risk)

- `tsci export <file> -f gerbers -o out.zip` produces a **complete fab zip, non-interactively**:
  `F_Cu/B_Cu/F_Mask/B_Mask/F_Paste/B_Paste/F_SilkScreen/B_SilkScreen/Edge_Cuts` Gerbers,
  `drill.drl` + `drill_npth.drl`, **`bom.csv`**, and **`pick_and_place.csv`** — all in one archive.
- `tsci export -f` also supports `schematic-svg`, `pcb-svg`, `gltf`/`glb`, `readable-netlist`,
  `specctra-dsn`, `kicad_pcb`/`kicad_sch`/`kicad_zip`, `assembly-svg`, `step`, `srj`.

**Impact:** Resolves OQ-1 / Risk 1 completely. **No programmatic `circuit-json-to-gerber` fallback
is needed** — the Export Service is a thin wrapper around `tsci export -f gerbers`.

## P0-4 — Browser rendering ✅ (engine proven; integration path decided)

- **Render engine works:** the same circuit exports to `schematic-svg`, `pcb-svg`, and `gltf`
  cleanly server-side — all three views render.
- **runframe API:** `RunFrame({fsMap, entrypoint})` from `/runner` compiles `.tsx` in a webworker;
  `CircuitJsonPreview({circuitJson})` from `/preview` renders a **pre-built circuit.json** (no eval).
- **Bundling runframe from source is impractical.** The published package externalizes a long tail
  of **undeclared** dependencies. Bundling `/runner` surfaced, in sequence: `ky`,
  `react-error-boundary`, `@radix-ui/*` (dialog, popover, tabs, tooltip, dropdown-menu, checkbox,
  alert-dialog, icons), `cmdk`, `debug`, `fuse.js`, `lucide-react`, `minimatch`, `comlink`, then
  `@tscircuit/core` → `calculate-elbow`, etc. The `/preview` path needs the viewer packages
  (`@tscircuit/pcb-viewer`, `schematic-viewer`, `3d-viewer`) + `@tscircuit/create-snippet-url`.
- **React 19 required:** `@tscircuit/3d-viewer@0.0.574` pins `react@19.1.0` (peer). The frontend
  must be **React 19**, not React 18, and install with `--legacy-peer-deps` if mixing.
- **Recommended integration (avoids all of the above):** use the **self-contained standalone
  bundle** (`@tscircuit/runframe/standalone*.min.js`, ~10 MB, React inlined) or the **hosted iframe**
  (`https://runframe.tscircuit.com/iframe.html` → HTTP 200) with postMessage. For the no-eval data
  path, feed backend-built `circuit.json` to `CircuitJsonPreview`.
- **CDNs are live:** iframe host `200`, `registry-api.tscircuit.com/health` `200`,
  `modelcdn.tscircuit.com` (3D assets) `200`.
- **Remaining manual step:** a live pixel-perfect render in a real browser (no browser was
  installed here; the Playwright cache was empty). This is a Phase 1 dev-server check, not a risk.

**Impact — architecture change:** rendering **backend-built `circuit.json` via `CircuitJsonPreview`**
(or standalone/iframe) is preferred over browser re-compilation. Since the backend already builds
`circuit.json` for validation, reusing it **eliminates the two-compiler drift risk (Risk 2)** and
removes the source-bundling dependency mess. Browser `.tsx` re-compilation via `RunFrame(fsMap)`
remains an option only if live in-browser code editing is later wanted.

## P0-5 — Claude Agent SDK smoke ✅ (real end-to-end turn)

- `claude-agent-sdk` **0.2.110 installs cleanly on Python 3.14**. Its transitive deps already
  include `sse-starlette`, `pydantic` + `pydantic-settings`, `uvicorn`, `starlette`, `httpx`,
  `anyio`, `mcp` — several backend deps come free.
- **The SDK bundles its own `claude` CLI** (`.../claude_agent_sdk/_bundled/claude`) — **no separate
  `@anthropic-ai/claude-code` install is needed**; `cli_path` can override it. Auth is inherited
  from the local Claude environment.
- **`ClaudeAgentOptions` exposes every field the wiring needs** and more: `cwd`, `permission_mode`
  (`acceptEdits` = auto-allow edits), `can_use_tool`, `resume`/`session_id`/`fork_session`
  (session resume), `model`/`fallback_model` (Sonnet→Opus), `add_dirs`, `hooks`, and a **dedicated
  `skills` field** (`list[str] | "all"`). Native budget controls exist: **`max_turns`,
  `max_budget_usd`, `task_budget`** — these can back the hard-caps requirement (FR-20).
- **Skill mounting confirmed:** placing `skill/` at `<cwd>/.claude/skills/tscircuit/` with
  `setting_sources=["project"]` + `skills=["tscircuit"]` makes the agent **activate the skill**
  (it invoked the `Skill` tool in the trace).
- **Real turn result:** the agent streamed
  `system → thinking → assistant_text → tool_use(Skill/Read/Write/Bash) → tool_result → done`,
  wrote the circuit, ran `tsci build`, and **produced `dist/index/circuit.json`**.
  `is_error=False`, `num_turns=6`, `total_cost_usd≈$0.18`. The event stream maps 1:1 to the SSE
  taxonomy in PLAN §4.
- **⚠ Allowlist caveat (must fix in Phase 2):** the `can_use_tool` callback **did not fire for
  Bash** because `Bash` was in `allowed_tools`, which pre-approves it and bypasses the callback. To
  enforce the Bash allowlist (FR-22), **keep `Bash` out of `allowed_tools`** and gate it in
  `can_use_tool` (or a `PreToolUse` hook). Verify this in P2-4.

**Impact:** Confirms the entire backend agent loop is feasible as designed. Cost/turn (~$0.18 for a
trivial board) validates the need for guardrails and gives a real budget baseline.

---

## Consolidated decisions & doc changes

| Finding | Action taken |
|---|---|
| `bun` required by `tsci` | Added to PACKAGES prerequisites |
| Scaffold pins `tscircuit: latest` | Workspace service must rewrite to locked version (PLAN §3.5) |
| circuit.json at `dist/<entry>/circuit.json` | Corrected in PLAN §3.5/3.6 |
| `tsci export -f gerbers` = full fab zip | Export Service simplified; Risk 1 closed (PLAN §3.6, §7) |
| `tsci import <part> --jlcpcb` non-interactive | Risk 3 closed; tier-2 sourcing confirmed |
| runframe source-bundling impractical; needs React 19 | Frontend uses standalone/iframe or `CircuitJsonPreview(circuit.json)`; React 19; Risk 2 closed |
| SDK bundles CLI; native budget fields; `skills` field | PACKAGES + PLAN §3.2/3.4 updated |
| `allowed_tools` bypasses `can_use_tool` | Enforce Bash allowlist via callback/hook, Bash NOT in `allowed_tools` (P2-4) |

## Residual open items for Phase 1
- **OQ-3/OQ-4** (model-escalation policy, idle-session TTL) — unchanged; decide during build.
- **Live browser render** — confirm in the Phase 1 dev server (P1-14), the one manual check P0-4
  could not automate headlessly.
- Pin exact versions (tscircuit, runframe + its React-19 viewer set, Python lockfile) before Phase 1
  integration begins.
</content>
