# Part Authoring from Datasheets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a part is in no sourcing tier, the agent researches its real datasheet over the web, authors a correct tscircuit part (dimensions, footprint, pinout), self-verifies it, and gets a one-click user confirmation before wiring it in.

**Architecture:** Tier 5 of the existing sourcing flow. Gated `WebSearch`/`WebFetch` (via the `can_use_tool` callback, not `allowed_tools`) let the agent read datasheets; a new authoring skill doc + a `node` verifier script drive correctness; a sentinel file (`.voltedge/pending-part.json`) detected by the backend's existing mtime-watch pattern emits a new `part_review` SSE event; the frontend renders a Part Card whose Confirm/Edit/Reject action hits `POST /answer`, which starts the next agent turn.

**Tech Stack:** Python 3.10 / FastAPI / SQLModel / `claude-agent-sdk` (backend), Node 22 (verifier script + `node --test`), React 19 / Vite / Tailwind v4 (frontend), tscircuit `tsci` CLI.

## Global Constraints

- Model: `claude-sonnet-4-5`; `max_turns = 30` (unchanged).
- Bash tool stays OUT of `allowed_tools`; every non-preapproved tool is gated by `_make_can_use_tool`. Do NOT add `WebSearch`/`WebFetch` to `allowed_tools`.
- Never add `bash`/`sh`/`python` to `BASH_ALLOWED_PREFIXES` (a `bash -c` prefix would bypass the whole allowlist). Agent-run scripts must be invoked via already-allowlisted `node`.
- File edits by the agent remain confined to the workspace `cwd`.
- Backend runs on `:8787`; frontend on `:5173` proxying `/api`.
- Tests: backend uses `pytest` + `pytest-asyncio`; run with `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1` (a system ROS `launch_testing` plugin otherwise breaks collection). Node verifier uses the built-in `node --test`.
- No `Co-Authored-By` trailer on commits (repo preference).
- Part files live in the project workspace `./parts/` only (no shared-library promotion in this plan).

---

### Task 1: Enable gated web access + curl, and steer the agent to research

**Files:**
- Modify: `backend/app/agent.py` (BASH_ALLOWED_PREFIXES ~line 70-91; `_make_can_use_tool` ~line 94-111; `VOLTEDGE_SYSTEM_APPEND` tier-5 bullet ~line 37-42)
- Test: `backend/tests/test_agent_permissions.py` (create)

**Interfaces:**
- Consumes: `build_options(cwd)`, `_make_can_use_tool(cwd)` from `agent.py`.
- Produces: `_make_can_use_tool` returns a callback that returns `PermissionResultAllow` for `WebSearch`/`WebFetch`; `"curl"` is an allowed Bash prefix. No signature changes.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_agent_permissions.py
import asyncio
from pathlib import Path

from claude_agent_sdk import PermissionResultAllow, PermissionResultDeny
from app.agent import _make_can_use_tool, BASH_ALLOWED_PREFIXES


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_websearch_and_webfetch_are_allowed(tmp_path: Path):
    can_use = _make_can_use_tool(tmp_path)
    assert isinstance(_run(can_use("WebSearch", {"query": "ne555 datasheet"}, None)), PermissionResultAllow)
    assert isinstance(_run(can_use("WebFetch", {"url": "https://ti.com/x.pdf"}, None)), PermissionResultAllow)


def test_curl_is_allowlisted():
    assert "curl" in BASH_ALLOWED_PREFIXES


def test_curl_bash_command_allowed(tmp_path: Path):
    can_use = _make_can_use_tool(tmp_path)
    res = _run(can_use("Bash", {"command": "curl -sL https://example.com/ds.pdf -o ds.pdf"}, None))
    assert isinstance(res, PermissionResultAllow)


def test_unlisted_bash_still_denied(tmp_path: Path):
    can_use = _make_can_use_tool(tmp_path)
    res = _run(can_use("Bash", {"command": "rm -rf /"}, None))
    assert isinstance(res, PermissionResultDeny)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest tests/test_agent_permissions.py -q`
Expected: FAIL — `test_curl_is_allowlisted` fails (`"curl"` not in the tuple). The `WebSearch`/`WebFetch` tests may already pass (the callback's default branch allows them) — that is fine; the test locks the behavior in.

- [ ] **Step 3: Add `curl` to the Bash allowlist**

In `backend/app/agent.py`, add `"curl"` to `BASH_ALLOWED_PREFIXES` (after `"echo"`):

```python
    "mkdir",
    "pwd",
    "echo",
    "curl",  # download a datasheet PDF for hand-modeling (read-only fetch)
)
```

- [ ] **Step 4: Make the web-tool gating explicit in `can_use_tool`**

In `_make_can_use_tool`, add an explicit allow branch before the final `return` (documents intent and gives one place to tighten later):

```python
        if tool_name in ("WebSearch", "WebFetch"):
            # Read-only research for datasheets. Gated here (not pre-approved via
            # allowed_tools) so we keep a single chokepoint for future limits.
            return PermissionResultAllow()
        return PermissionResultAllow()
```

- [ ] **Step 5: Expand the tier-5 sourcing bullet in `VOLTEDGE_SYSTEM_APPEND`**

Replace the current source-5 line (the `ONLY if none of the above has it: model a breakout ...` bullet) with:

```python
  5. ONLY if none of the above has it, MODEL IT YOURSELF from the datasheet — follow the `components` skill's AUTHORING.md procedure: use WebSearch/WebFetch (check manufacturer datasheet, then Octopart/DigiKey/Mouser/SnapEDA; ~1-2 searches, then read) to get the real pinout and body dimensions; author one `<chip>` in `./parts/<slug>.tsx` (standard IC packages use a footprinter string like `soic8_p1.27mm`, header modules use a `<platedhole>` grid centered on the origin at real pitch); then run `node .claude/skills/tscircuit/scripts/verify_part.mjs parts/<slug>.tsx`, and once it passes write `.voltedge/pending-part.json` and STOP for the user to confirm before wiring it in. If no datasheet can be found, ask the user rather than guessing. A single-inline-header breakout is NOT a DIP. (USB-C is the exception: always `<connector standard="usb_c" />`.)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest tests/test_agent_permissions.py -q`
Expected: PASS (4 passed)

- [ ] **Step 7: Commit**

```bash
git add backend/app/agent.py backend/tests/test_agent_permissions.py
git commit -m "feat(agent): gate WebSearch/WebFetch + curl and steer tier-5 datasheet authoring"
```

---

### Task 2: The part-authoring skill doc

**Files:**
- Create: `component-kb/AUTHORING.md`
- Modify: `component-kb/SKILL.md` (add a pointer under `## Rule`)
- Modify: `skill/WORKFLOW.md` (reference the verify step in the "Model it yourself" source)

**Interfaces:**
- Consumes: nothing (documentation, mounted into each workspace under `.claude/skills/components/`).
- Produces: the procedure the tier-5 system-prompt bullet (Task 1) points at.

- [ ] **Step 1: Write `component-kb/AUTHORING.md`**

````markdown
---
name: components-authoring
description: How to author a NEW tscircuit part correctly from its datasheet when it is in no existing source. Dimensions, footprint, and pinout must match the real part.
---

# Authoring a new part from its datasheet

Reach this ONLY after the local library, tscircuit registry, `@tscircuit/common`,
and JLCPCB/LCSC have all been checked and missed. Getting a hand-modeled part right
means the pinout, body dimensions, and footprint all match the real datasheet.

## 1. Research (bounded)

Find the **exact part number's** datasheet. Preferred order, stop early:

1. Manufacturer datasheet PDF (TI, ST, NXP, Microchip, …) — ground truth for the
   pinout table and mechanical (body) dimensions.
2. Octopart / DigiKey / Mouser — to locate the datasheet + parametric data fast.
3. SnapEDA — structured symbol/footprint/pinout, often HTML (easier than a PDF).
4. General web search — only if 1–3 miss.

Budget: ~1–2 `WebSearch` calls, then `WebFetch` the best hit and read it. If a page
is a PDF that `WebFetch` cannot read well, download it with
`curl -sL "<url>" -o /tmp/ds.pdf` and `Read` the local file. Do not keep searching
once you have the datasheet. **If no datasheet can be found, STOP and ask the user.**

## 2. Extract

- The **pinout table**: physical pin № → primary signal (+ aliases). Never renumber.
- The **package** (e.g. SOIC-8, SOT-23-5, QFN-32, DIP-8) and **body dimensions** (mm),
  plus pin **pitch** for header modules.

## 3. Author one `<chip>` in `./parts/<slug>.tsx`

Match the shape of the existing library parts (see the catalog files):

- A header comment stating the part №, package, body dimensions, the full pinout, the
  **datasheet URL**, and any "verify against silkscreen" caveats for clone boards.
- `pinLabels` keyed by physical pin (`pin1`, `pin2`, …) exactly as the datasheet numbers.
- `pinAttributes` tagging power/ground/must-connect pins.
- A named export `(props) => <chip {...props} footprint=... pinLabels=... />`.
- A `default` export wrapping it in a standalone `<board>` for preview.

### Footprint

- **Standard IC package** → a **footprinter string**, never hand-placed pads:
  `soic8_p1.27mm`, `sot23_5`, `qfn32_p0.5mm`, `dip8`, `tssop20`, … The datasheet gives
  you the package + pin count; footprinter generates correct geometry.
- **Header / breakout module** → a `<platedhole>` grid at the real pitch (2.54 mm
  typical), **centered on the origin** (the origin is the drag anchor — an off-center
  footprint offsets every drag).

## 4. Verify before showing the user

Run:

```
node .claude/skills/tscircuit/scripts/verify_part.mjs parts/<slug>.tsx
```

It builds the part and checks pin-count vs pad-count, sane dimensions, and a clean
build. Fix any reported problem (within the 3-round iteration budget) and re-run.

## 5. Confirm with the user

Once verify passes, write `.voltedge/pending-part.json`:

```json
{
  "slug": "sn74hc595",
  "manufacturer": "Texas Instruments",
  "part_number": "SN74HC595",
  "package": "SOIC-16",
  "dimensions": "9.9 x 3.9 mm",
  "footprint": "soic16_p1.27mm",
  "datasheet_url": "https://www.ti.com/lit/ds/symlink/sn74hc595.pdf",
  "pinLabels": { "pin1": "QB", "pin2": "QC", "...": "..." }
}
```

Then STOP (end your turn). The user reviews a Part Card and confirms, edits, or
rejects; your next turn wires the confirmed part into `index.circuit.tsx`.
````

- [ ] **Step 2: Add a pointer in `component-kb/SKILL.md`**

Under `## Rule`, after the not-in-catalog bullet, add:

```markdown
- To author a brand-new part once every source has missed, follow
  [AUTHORING.md](./AUTHORING.md): research the datasheet, model dimensions +
  footprint + pinout, verify, then confirm with the user.
```

- [ ] **Step 3: Reference the verify step in `skill/WORKFLOW.md`**

In the "Source parts" section (source 5, "Model it yourself"), append:

```markdown
   After authoring, verify with `node .claude/skills/tscircuit/scripts/verify_part.mjs
   parts/<slug>.tsx`, then write `.voltedge/pending-part.json` and stop for the user to
   confirm (see the `components` skill's AUTHORING.md).
```

- [ ] **Step 4: Verify the doc is coherent**

Run: `grep -c "verify_part.mjs" component-kb/AUTHORING.md skill/WORKFLOW.md`
Expected: both files report ≥ 1.

- [ ] **Step 5: Commit**

```bash
git add component-kb/AUTHORING.md component-kb/SKILL.md skill/WORKFLOW.md
git commit -m "docs(skill): add datasheet part-authoring procedure"
```

---

### Task 3: The part verifier (`verify_part.mjs`)

**Files:**
- Create: `skill/scripts/verify_part.mjs`
- Test: `skill/scripts/verify_part.test.mjs`
- Fixture: `skill/scripts/fixtures/mpu6050.circuit.json` (captured from a real build)

**Interfaces:**
- Consumes: a built circuit-json array.
- Produces: an exported pure function `validateCircuitJson(circuitJson) -> { ok: boolean, problems: string[] }`, and a CLI entry that builds `parts/<slug>.tsx`, reads `dist/*/circuit.json`, and exits non-zero with the problems on failure.

- [ ] **Step 1: Capture a real circuit.json fixture (grounds the field names)**

Run (from repo root, with bun on PATH):

```bash
export PATH="$HOME/.bun/bin:$PATH"
cd workspaces/.template
cp ../../component-kb/parts/mpu6050-gy521.tsx _probe.circuit.tsx
tsci build _probe.circuit.tsx
mkdir -p ../../skill/scripts/fixtures
cp dist/_probe/circuit.json ../../skill/scripts/fixtures/mpu6050.circuit.json
rm -f _probe.circuit.tsx && rm -rf dist/_probe
```

Inspect the fixture for the exact element `type` strings and id fields:
`node -e "const j=require('./skill/scripts/fixtures/mpu6050.circuit.json'); console.log([...new Set(j.map(e=>e.type))])"` (run from repo root).
Confirm the pad type(s) (`pcb_plated_hole` / `pcb_smtpad`), `source_port`, `pcb_component`, and the `source_component_id` linkage before writing the validator. **If your build's field names differ from those used in Step 3, adjust Step 3 to match the fixture.**

- [ ] **Step 2: Write the failing test**

```javascript
// skill/scripts/verify_part.test.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { validateCircuitJson } from "./verify_part.mjs"

const mpu = JSON.parse(
  readFileSync(new URL("./fixtures/mpu6050.circuit.json", import.meta.url)),
)

test("a real, correct part passes", () => {
  const r = validateCircuitJson(mpu)
  assert.equal(r.ok, true, r.problems.join("; "))
})

test("empty circuit fails", () => {
  const r = validateCircuitJson([])
  assert.equal(r.ok, false)
  assert.match(r.problems.join(" "), /empty/i)
})

test("pin/pad mismatch fails", () => {
  // Drop one plated hole so pad count < source_port count.
  const padType = mpu.find((e) => e.type === "pcb_plated_hole") ? "pcb_plated_hole" : "pcb_smtpad"
  let dropped = false
  const broken = mpu.filter((e) => {
    if (!dropped && e.type === padType) { dropped = true; return false }
    return true
  })
  const r = validateCircuitJson(broken)
  assert.equal(r.ok, false)
  assert.match(r.problems.join(" "), /pin|pad/i)
})

test("component-creation error fails", () => {
  const withErr = [...mpu, { type: "source_failed_to_create_component_error", message: "bad" }]
  const r = validateCircuitJson(withErr)
  assert.equal(r.ok, false)
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test skill/scripts/verify_part.test.mjs`
Expected: FAIL — `Cannot find module ... verify_part.mjs` / `validateCircuitJson is not a function`.

- [ ] **Step 4: Write `verify_part.mjs`**

```javascript
// skill/scripts/verify_part.mjs
// Validate a freshly authored tscircuit part against its built circuit.json.
// Pure check: `validateCircuitJson`. CLI: build a part file then validate.
import { execFileSync } from "node:child_process"
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs"
import { join } from "node:path"

const PAD_TYPES = new Set(["pcb_plated_hole", "pcb_smtpad", "pcb_hole"])

export function validateCircuitJson(circuitJson) {
  const problems = []
  if (!Array.isArray(circuitJson) || circuitJson.length === 0) {
    return { ok: false, problems: ["circuit.json is empty — the part failed to build"] }
  }

  // Any explicit error element about the component itself is fatal.
  for (const el of circuitJson) {
    if (typeof el.type === "string" && el.type.includes("error") && !el.type.startsWith("pcb_trace")) {
      problems.push(`build error element: ${el.type}${el.message ? ` (${el.message})` : ""}`)
    }
  }

  // pad count (per pcb_component) must equal source_port count (per its source_component).
  const padsByPcb = new Map()
  for (const el of circuitJson) {
    if (PAD_TYPES.has(el.type) && el.pcb_component_id) {
      padsByPcb.set(el.pcb_component_id, (padsByPcb.get(el.pcb_component_id) || 0) + 1)
    }
  }
  const portsBySource = new Map()
  for (const el of circuitJson) {
    if (el.type === "source_port" && el.source_component_id) {
      portsBySource.set(el.source_component_id, (portsBySource.get(el.source_component_id) || 0) + 1)
    }
  }
  for (const el of circuitJson) {
    if (el.type === "pcb_component" && el.source_component_id) {
      const pads = padsByPcb.get(el.pcb_component_id) || 0
      const ports = portsBySource.get(el.source_component_id) || 0
      if (pads !== ports) {
        problems.push(`pin/pad mismatch: ${ports} schematic pins vs ${pads} footprint pads (component ${el.source_component_id})`)
      }
    }
  }

  return { ok: problems.length === 0, problems }
}

function main() {
  const partFile = process.argv[2]
  if (!partFile) {
    console.error("usage: node verify_part.mjs parts/<slug>.tsx")
    process.exit(2)
  }
  try {
    execFileSync("tsci", ["build", partFile], { stdio: "inherit" })
  } catch {
    console.error("FAIL: tsci build did not succeed")
    process.exit(1)
  }
  const distDir = "dist"
  let jsonPath = null
  if (existsSync(distDir)) {
    for (const sub of readdirSync(distDir)) {
      const p = join(distDir, sub, "circuit.json")
      if (existsSync(p) && (!jsonPath || statSync(p).mtimeMs > statSync(jsonPath).mtimeMs)) jsonPath = p
    }
  }
  if (!jsonPath) {
    console.error("FAIL: no dist/*/circuit.json produced")
    process.exit(1)
  }
  const { ok, problems } = validateCircuitJson(JSON.parse(readFileSync(jsonPath)))
  if (!ok) {
    console.error("FAIL:\n - " + problems.join("\n - "))
    process.exit(1)
  }
  console.log("OK: part verified (" + jsonPath + ")")
}

// Run main only when invoked as a CLI, not when imported by the test.
if (import.meta.url === `file://${process.argv[1]}`) main()
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test skill/scripts/verify_part.test.mjs`
Expected: PASS (4 tests). If `test("a real, correct part passes")` fails on a field-name mismatch, reconcile `PAD_TYPES` / id fields with the fixture from Step 1.

- [ ] **Step 6: Commit**

```bash
git add skill/scripts/verify_part.mjs skill/scripts/verify_part.test.mjs skill/scripts/fixtures/mpu6050.circuit.json
git commit -m "feat(skill): add verify_part.mjs (pin/pad + build check) with tests"
```

---

### Task 4: Backend — detect the sentinel and emit `part_review`

**Files:**
- Modify: `backend/app/workspace.py` (`_FSMAP_EXCLUDED_DIRS` ~line 33; add `pending_part_mtime` + `read_pending_part` near `circuit_json_mtime` ~line 292)
- Modify: `backend/app/sessions.py` (`ProjectSession` ~line 29-36; `get_or_create` seed ~line 61-66; add `_maybe_part_review`; call sites ~line 125-132)
- Test: `backend/tests/test_part_review.py` (create)

**Interfaces:**
- Consumes: `bus`, `_persist_event`, `ProjectSession`.
- Produces: `workspace.pending_part_mtime(cwd: Path) -> float`, `workspace.read_pending_part(cwd: Path) -> dict | None`; `ProjectSession.last_part_review_mtime: float`; `SessionManager._maybe_part_review(session) -> None` which publishes+persists a `part_review` event with the sentinel payload.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_part_review.py
import asyncio
import json

from app.sessions import SessionManager, ProjectSession
from app import workspace as ws


def test_pending_part_helpers(tmp_path):
    assert ws.pending_part_mtime(tmp_path) == 0.0
    assert ws.read_pending_part(tmp_path) is None
    d = tmp_path / ".voltedge"
    d.mkdir()
    (d / "pending-part.json").write_text(json.dumps({"slug": "sn74hc595", "package": "SOIC-16"}))
    assert ws.pending_part_mtime(tmp_path) > 0.0
    assert ws.read_pending_part(tmp_path)["slug"] == "sn74hc595"


def test_maybe_part_review_emits_once(tmp_path, monkeypatch):
    published = []

    async def fake_publish(pid, etype, data):
        published.append((etype, data))

    monkeypatch.setattr("app.sessions.bus.publish", fake_publish)
    monkeypatch.setattr(SessionManager, "_persist_event", lambda self, *a, **k: None)

    mgr = SessionManager()
    session = ProjectSession(project_id="p1", cwd=tmp_path, client=None)

    # No sentinel yet → nothing emitted.
    asyncio.get_event_loop().run_until_complete(mgr._maybe_part_review(session))
    assert published == []

    d = tmp_path / ".voltedge"
    d.mkdir()
    (d / "pending-part.json").write_text(json.dumps({"slug": "sn74hc595", "package": "SOIC-16"}))

    asyncio.get_event_loop().run_until_complete(mgr._maybe_part_review(session))
    assert [e for e, _ in published] == ["part_review"]
    assert published[0][1]["slug"] == "sn74hc595"

    # Same sentinel, unchanged → not re-emitted.
    asyncio.get_event_loop().run_until_complete(mgr._maybe_part_review(session))
    assert [e for e, _ in published] == ["part_review"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest tests/test_part_review.py -q`
Expected: FAIL — `module 'app.workspace' has no attribute 'pending_part_mtime'`.

- [ ] **Step 3: Add the workspace helpers + fsmap exclusion**

In `backend/app/workspace.py`, add `.voltedge` to the excluded dirs:

```python
_FSMAP_EXCLUDED_DIRS = {"node_modules", "dist", ".git", ".claude", ".agents", ".tscircuit", ".voltedge"}
```

And add near `circuit_json_mtime` (import `json` is already present at top of the module — confirm; add `import json` if missing):

```python
def _pending_part_file(cwd: Path) -> Path:
    return cwd / ".voltedge" / "pending-part.json"


def pending_part_mtime(cwd: Path) -> float:
    p = _pending_part_file(cwd)
    return p.stat().st_mtime if p.exists() else 0.0


def read_pending_part(cwd: Path) -> dict | None:
    p = _pending_part_file(cwd)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except (json.JSONDecodeError, OSError):
        return None
```

- [ ] **Step 4: Extend `ProjectSession` + seed + `_maybe_part_review`**

In `backend/app/sessions.py`:

Add the field to the dataclass:

```python
    last_circuit_mtime: float = 0.0
    last_part_review_mtime: float = 0.0
    checkpoint_version: int = 0
```

Import the helper (extend the existing `from .workspace import ...`):

```python
from .workspace import circuit_json_mtime, pending_part_mtime, read_pending_part
```

Seed it in `get_or_create` where the session is constructed:

```python
            session = ProjectSession(
                project_id=project.id,
                cwd=cwd,
                client=client,
                last_circuit_mtime=circuit_json_mtime(cwd),
                last_part_review_mtime=pending_part_mtime(cwd),
            )
```

Add the method next to `_maybe_checkpoint`:

```python
    async def _maybe_part_review(self, session: ProjectSession) -> None:
        mtime = pending_part_mtime(session.cwd)
        if mtime <= session.last_part_review_mtime:
            return
        session.last_part_review_mtime = mtime
        payload = read_pending_part(session.cwd)
        if payload is None:
            return
        await bus.publish(session.project_id, "part_review", payload)
        self._persist_event(session.project_id, "part_review", payload)
```

Call it in `run_turn` alongside the checkpoint calls (after the `tool_result` check and in the end-of-turn sweep):

```python
                        if event_type == "tool_result":
                            await self._maybe_checkpoint(session)
                            await self._maybe_part_review(session)
                        if event_type == "done" and data.get("session_id"):
                            self._store_claude_session_id(
                                project.id, data["session_id"]
                            )
                # end-of-turn sweep in case the last build wasn't followed by a tool_result
                await self._maybe_checkpoint(session)
                await self._maybe_part_review(session)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest tests/test_part_review.py -q`
Expected: PASS (2 passed)

- [ ] **Step 6: Commit**

```bash
git add backend/app/workspace.py backend/app/sessions.py backend/tests/test_part_review.py
git commit -m "feat(backend): detect pending-part.json sentinel and emit part_review event"
```

---

### Task 5: Backend — `POST /answer` starts the follow-up turn

**Files:**
- Modify: `backend/app/schemas.py` (add `AnswerRequest`)
- Modify: `backend/app/routes.py` (add the endpoint after `post_message` ~line 143; add `AnswerRequest` to the schemas import ~top of file)
- Test: `backend/tests/test_answer.py` (create)

**Interfaces:**
- Consumes: `manager.run_turn`, `manager.is_busy`, `_get_project`.
- Produces: `POST /api/projects/{project_id}/answer` accepting `AnswerRequest{ decision: Literal["confirm","edit","reject"], slug: str, corrections: str | None }`; returns `202 {"status":"accepted"}`; `409` if busy; `404` unknown project. It schedules `run_turn` with a decision-specific instruction string.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_answer.py
def test_answer_confirm_schedules_turn(client, monkeypatch):
    c, _db, _models = client
    proj = c.post("/api/projects", json={"title": "p"}).json()

    captured = {}

    async def fake_run_turn(project, text):
        captured["text"] = text

    import app.routes as routes
    monkeypatch.setattr(routes.manager, "run_turn", fake_run_turn)
    monkeypatch.setattr(routes.manager, "is_busy", lambda pid: False)

    res = c.post(f"/api/projects/{proj['id']}/answer", json={"decision": "confirm", "slug": "sn74hc595"})
    assert res.status_code == 202
    assert "sn74hc595" in captured["text"]
    assert "wire" in captured["text"].lower()


def test_answer_edit_includes_corrections(client, monkeypatch):
    c, _db, _models = client
    proj = c.post("/api/projects", json={"title": "p"}).json()
    captured = {}

    async def fake_run_turn(project, text):
        captured["text"] = text

    import app.routes as routes
    monkeypatch.setattr(routes.manager, "run_turn", fake_run_turn)
    monkeypatch.setattr(routes.manager, "is_busy", lambda pid: False)

    res = c.post(
        f"/api/projects/{proj['id']}/answer",
        json={"decision": "edit", "slug": "sn74hc595", "corrections": "pin 9 is SRCLR"},
    )
    assert res.status_code == 202
    assert "pin 9 is SRCLR" in captured["text"]


def test_answer_conflict_when_busy(client, monkeypatch):
    c, _db, _models = client
    proj = c.post("/api/projects", json={"title": "p"}).json()
    import app.routes as routes
    monkeypatch.setattr(routes.manager, "is_busy", lambda pid: True)
    res = c.post(f"/api/projects/{proj['id']}/answer", json={"decision": "confirm", "slug": "x"})
    assert res.status_code == 409


def test_answer_unknown_project(client):
    c, _db, _models = client
    res = c.post("/api/projects/nope/answer", json={"decision": "confirm", "slug": "x"})
    assert res.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest tests/test_answer.py -q`
Expected: FAIL — 404/405 (endpoint does not exist).

- [ ] **Step 3: Add the `AnswerRequest` schema**

In `backend/app/schemas.py`:

```python
from typing import Literal
```

```python
class AnswerRequest(BaseModel):
    """A Part Card decision from the user (part_review confirmation gate)."""

    decision: Literal["confirm", "edit", "reject"]
    slug: str = Field(min_length=1, max_length=100)
    corrections: str | None = Field(default=None, max_length=2000)
```

- [ ] **Step 4: Add the endpoint**

In `backend/app/routes.py`, add `AnswerRequest` to the schemas import, then add after `post_message`:

```python
def _answer_instruction(body: AnswerRequest) -> str:
    if body.decision == "confirm":
        return (
            f"I confirmed the part '{body.slug}'. Import it from ./parts/{body.slug} "
            f"and wire it into index.circuit.tsx as planned."
        )
    if body.decision == "edit":
        return (
            f"Corrections to the part '{body.slug}': {body.corrections or '(none given)'}. "
            f"Update ./parts/{body.slug}.tsx accordingly, re-run verify_part.mjs, then wire it "
            f"into index.circuit.tsx."
        )
    return (
        f"I rejected the part '{body.slug}'. Do not use it — try another source "
        f"(registry/JLCPCB) or ask me before modeling again."
    )


@router.post("/projects/{project_id}/answer", status_code=202)
async def post_answer(
    project_id: str, body: AnswerRequest, background: BackgroundTasks
):
    project = _get_project(project_id)
    if manager.is_busy(project_id):
        raise HTTPException(409, "a turn is already running for this project")
    background.add_task(manager.run_turn, project, _answer_instruction(body))
    return {"status": "accepted"}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest tests/test_answer.py -q`
Expected: PASS (4 passed)

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas.py backend/app/routes.py backend/tests/test_answer.py
git commit -m "feat(backend): POST /answer resumes the turn after a part_review decision"
```

---

### Task 6: Frontend — API client: `part_review` event + `answerPartReview`

**Files:**
- Modify: `frontend/src/api.ts` (`SSE_EVENT_TYPES` ~line 100-113; add an `api.answerPartReview` method ~after `interrupt`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `"part_review"` in `SSE_EVENT_TYPES`; `api.answerPartReview(projectId, decision, slug, corrections?) -> Promise<void>`.

- [ ] **Step 1: Add `part_review` to the SSE event list**

In `frontend/src/api.ts`, add `"part_review",` to `SSE_EVENT_TYPES` (after `"question",`):

```typescript
  "plan",
  "question",
  "part_review",
  "checkpoint",
```

- [ ] **Step 2: Add the `answerPartReview` method**

In the `api` object, after `interrupt`:

```typescript
  answerPartReview: (
    projectId: string,
    decision: "confirm" | "edit" | "reject",
    slug: string,
    corrections?: string,
  ): Promise<void> =>
    fetch(`/api/projects/${projectId}/answer`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ decision, slug, corrections }),
    }).then(jsonOrThrow),
```

- [ ] **Step 3: Verify it typechecks**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api.ts
git commit -m "feat(frontend): add part_review SSE type and answerPartReview client"
```

---

### Task 7: Frontend — the Part Card and its wiring

**Files:**
- Create: `frontend/src/components/PartCard.tsx`
- Modify: `frontend/src/components/EventRow.tsx` (add the `part_review` case + prop threading)
- Modify: `frontend/src/components/ChatPanel.tsx` (pass an `onAnswer` prop through to `EventRow`)
- Modify: `frontend/src/App.tsx` (provide `onAnswer`; on `part_review` set `busy=false` since the turn ended)

**Interfaces:**
- Consumes: `api.answerPartReview` (Task 6); the `part_review` event payload `{ slug, manufacturer?, part_number?, package?, dimensions?, footprint?, datasheet_url?, pinLabels? }`.
- Produces: `PartCard` component; `EventRow` gains an optional `onAnswer(decision, slug, corrections?)` prop.

Note: the frontend has no unit-test harness; these steps are verified by `tsc --noEmit` + `npm run build` and a manual render check.

- [ ] **Step 1: Create `PartCard.tsx`**

```tsx
import { useState } from "react"
import { CircuitBoard } from "lucide-react"

type Decision = "confirm" | "edit" | "reject"

export function PartCard({
  data,
  onAnswer,
}: {
  data: Record<string, any>
  onAnswer?: (decision: Decision, slug: string, corrections?: string) => void
}) {
  const [done, setDone] = useState<Decision | null>(null)
  const [editing, setEditing] = useState(false)
  const [corrections, setCorrections] = useState("")
  const slug: string = data.slug ?? "part"
  const pins: Record<string, string> = data.pinLabels ?? {}

  const act = (d: Decision, c?: string) => {
    setDone(d)
    onAnswer?.(d, slug, c)
  }

  return (
    <div className="my-2 max-w-[90%] rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/5 p-3 text-sm text-[var(--text)]">
      <div className="mb-1 flex items-center gap-2 font-medium">
        <CircuitBoard size={15} />
        New part: {data.manufacturer ? `${data.manufacturer} ` : ""}
        {data.part_number ?? slug}
        {data.package ? ` (${data.package})` : ""}
      </div>
      <div className="text-xs text-[var(--muted)]">
        {data.dimensions ? `${data.dimensions} · ` : ""}
        {data.footprint ? `footprint ${data.footprint}` : ""}
        {data.datasheet_url ? (
          <>
            {" · "}
            <a href={data.datasheet_url} target="_blank" rel="noreferrer" className="underline">
              datasheet
            </a>
          </>
        ) : null}
      </div>
      {Object.keys(pins).length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-[var(--muted)] sm:grid-cols-3">
          {Object.entries(pins).map(([pin, sig]) => (
            <div key={pin}>
              <span className="text-[var(--text)]">{pin.replace("pin", "")}</span> {String(sig)}
            </div>
          ))}
        </div>
      )}

      {done ? (
        <div className="mt-2 text-xs text-[var(--muted)]">You chose: {done}.</div>
      ) : editing ? (
        <div className="mt-2">
          <textarea
            value={corrections}
            onChange={(e) => setCorrections(e.target.value)}
            placeholder="e.g. pin 9 is SRCLR, body is 6.0 x 4.9 mm"
            className="w-full rounded border border-[var(--border)] bg-[var(--panel)] p-1.5 text-xs"
            rows={2}
          />
          <div className="mt-1 flex gap-2">
            <button
              className="rounded bg-[var(--accent)] px-2 py-1 text-xs text-white"
              onClick={() => act("edit", corrections)}
            >
              Submit correction
            </button>
            <button className="px-2 py-1 text-xs text-[var(--muted)]" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex gap-2">
          <button
            className="rounded bg-[var(--accent)] px-2.5 py-1 text-xs text-white"
            onClick={() => act("confirm")}
          >
            Confirm
          </button>
          <button
            className="rounded border border-[var(--border)] px-2.5 py-1 text-xs"
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
          <button
            className="rounded border border-red-500/40 px-2.5 py-1 text-xs text-red-300"
            onClick={() => act("reject")}
          >
            Reject
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Dispatch `part_review` in `EventRow.tsx`**

Add the import and thread the prop:

```tsx
import { PartCard } from "./PartCard"
```

Change the signature and add the case:

```tsx
export function EventRow({
  ev,
  onAnswer,
}: {
  ev: ChatEvent
  onAnswer?: (decision: "confirm" | "edit" | "reject", slug: string, corrections?: string) => void
}) {
  switch (ev.type) {
    // ... existing cases ...
    case "part_review":
      return <PartCard data={ev.data} onAnswer={onAnswer} />
    default:
      return null
  }
}
```

- [ ] **Step 3: Thread `onAnswer` through `ChatPanel.tsx`**

Add `onAnswer` to `ChatPanel`'s props and pass it to each `EventRow`. Locate where `ChatPanel` renders `<EventRow ev={...} />` and change to `<EventRow ev={...} onAnswer={onAnswer} />`; add `onAnswer` to the `ChatPanel` prop type and destructure it. (Match the existing prop-passing style in the file.)

- [ ] **Step 4: Provide `onAnswer` in `App.tsx` and clear busy on part_review**

In the SSE subscription effect, treat `part_review` as a turn end (the agent stopped for confirmation):

```tsx
      if (ev.type === "checkpoint" || ev.type === "done") void loadFsMap(activeId)
      if (ev.type === "done" || ev.type === "error" || ev.type === "part_review") setBusy(false)
```

Add the handler (near `interrupt`/`send`):

```tsx
  const answerPartReview = (
    decision: "confirm" | "edit" | "reject",
    slug: string,
    corrections?: string,
  ) => {
    if (!activeId) return
    setBusy(true)
    api.answerPartReview(activeId, decision, slug, corrections).catch((e) => {
      setBusy(false)
      setEvents((prev) => [...prev, { type: "error", data: { message: e.message }, ts: Date.now() }])
    })
  }
```

Pass it to `ChatPanel`: `<ChatPanel ... onAnswer={answerPartReview} />` (match the existing `ChatPanel` usage/props).

- [ ] **Step 5: Verify typecheck + build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/PartCard.tsx frontend/src/components/EventRow.tsx frontend/src/components/ChatPanel.tsx frontend/src/App.tsx
git commit -m "feat(frontend): render Part Card and wire Confirm/Edit/Reject to /answer"
```

---

### Task 8: Integration check + docs

**Files:**
- Modify: `docs/REPORT.md` (§4.3 note the hardened hand-model tier; §7 / limitations: the datasheet-hallucination risk is now mitigated)

**Interfaces:** none.

- [ ] **Step 1: Full backend test sweep**

Run: `cd backend && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest -q`
Expected: all tests pass (existing + `test_agent_permissions`, `test_part_review`, `test_answer`).

- [ ] **Step 2: Verifier test sweep**

Run: `node --test skill/scripts/verify_part.test.mjs`
Expected: PASS.

- [ ] **Step 3: Manual end-to-end (documented, run with backend+frontend up)**

Start backend (`uvicorn app.main:app --port 8787`) and frontend (`npm run dev`). New chat, prompt for a part in no tier, e.g.:
> "Add a Texas Instruments SN74HC595 shift register (SOIC-16) to a small board. It's not in the parts library — model it from the datasheet."

Verify: the agent uses WebSearch/WebFetch in the transcript; writes `parts/sn74hc595.tsx` with `footprint="soic16_p1.27mm"` and 16 pinLabels; runs `verify_part.mjs`; a Part Card appears with the pin map + datasheet link; clicking **Confirm** starts a new turn that wires the part in and reaches a checkpoint. Note any deviation as a follow-up issue.

- [ ] **Step 4: Update `docs/REPORT.md`**

In §4.3, change the source-5 line so it no longer reads as an unguarded last resort — note it now runs the datasheet-research + verify + confirm procedure. In §7 (Discussion & Limitations), update the datasheet-hallucination bullet to note it is mitigated by gated web research, `verify_part.mjs`, and the user-confirmation gate (residual risk: a wrong datasheet extraction the user also misses).

- [ ] **Step 5: Commit**

```bash
git add docs/REPORT.md
git commit -m "docs(report): note the hardened datasheet authoring tier"
```

---

## Self-Review

**Spec coverage:**
- Gated web access → Task 1. ✓
- Preferred-source order + search budget → Task 2 (AUTHORING.md). ✓
- Deterministic footprint strategy → Task 2. ✓
- `verify_part` self-verification → Task 3. ✓
- `part_review` sentinel detection + event → Task 4. ✓
- `POST /answer` + injected follow-up turn → Task 5. ✓
- Frontend Part Card (Confirm/Edit/Reject) → Tasks 6–7. ✓
- Project-local `./parts/` persistence → no code (agent writes there); reinforced by Task 2 doc + Task 1 prompt. ✓
- PDF-datasheet risk → resolved in Task 1 (`curl` added) + Task 2 (prefer HTML, curl+Read fallback). ✓
- `part_review` round-trips through the event log for reload → covered by the existing `_persist_event` path used in Task 4; restored by the same `EventRow` dispatcher (Task 7). ✓
- Docs update → Task 8. ✓
- Testing (verify logic pass/fail, backend detection, /answer, integration) → Tasks 3/4/5/8. ✓

**Placeholder scan:** No TBD/TODO. Frontend Steps 3–4 reference "match the existing prop-passing style" rather than quoting the whole file — acceptable because the exact edit (add one prop, pass it down) is fully specified and the surrounding code is short; not a logic placeholder.

**Type consistency:** `validateCircuitJson` returns `{ ok, problems }` — used identically in Task 3 test and CLI. `part_review` event name identical across Tasks 4/6/7. `answerPartReview(projectId, decision, slug, corrections?)` signature identical in Tasks 6 and 7. `AnswerRequest{decision, slug, corrections}` matches the frontend body in Task 6. Decision literals `"confirm"|"edit"|"reject"` consistent backend↔frontend.
