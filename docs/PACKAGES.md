# VoltEdge — Packages & Dependencies

> **Companion docs:** [SPEC.md](./SPEC.md) · [PLAN.md](./PLAN.md) · [TASKS.md](./TASKS.md)
>
> What to install, per surface, and why. **Versions below are the ones verified in Phase 0**
> ([PHASE0_RESULTS.md](./PHASE0_RESULTS.md)); pin these exact versions before Phase 1 integration.

## 0. System prerequisites

| Tool | Verified | Why | Notes |
|------|----------|-----|-------|
| **Node.js** | 22.22 | npm + JS tooling | ≥18 fine |
| **Bun** | 1.3.14 | **Required by `tsci`** — its launcher has a `#!/usr/bin/env bun` shebang | `curl -fsSL https://bun.sh/install \| bash`; not optional |
| **Python** | 3.14.4 | FastAPI backend + Claude Agent SDK | SDK installs cleanly on 3.14; ≥3.10 supported |
| **git** | 2.53 | Allowlisted agent tool + repo ops | — |
| ~~Claude Code CLI~~ | n/a | **Not needed separately** — `claude-agent-sdk` **bundles its own CLI** | Override via `cli_path` only if you want a specific build |

> **Version parity (NFR-1), revised:** after P0-4, the browser renders the **backend-built
> `circuit.json`** (via `CircuitJsonPreview`) rather than recompiling `.tsx`, so there is no second
> compiler to drift. Still pin `tscircuit` (backend) and the frontend runframe **viewer set**
> together, since the viewers must understand the circuit.json the pinned `tsci` emits.

---

## 1. Circuit toolchain (global / per-workspace)

Installed globally, invoked by the agent inside each project workspace.

| Package | Verified | Install | Purpose |
|---------|----------|---------|---------|
| **`tscircuit`** | 0.0.2001 | `npm install -g tscircuit` | The `tsci` CLI: `init`, `search`, `add`, `import`, `check`, `build`, `export`, `snapshot`. **Needs `bun` at runtime.** |

Each scaffolded workspace (`tsci init -y`) pulls tscircuit runtime deps (and `node_modules` +
`bun.lock` appear on first `tsci import`/`add`). Note the scaffold writes `"tscircuit": "latest"` in
the workspace `package.json` — the workspace service **rewrites this to the locked version** on
create (P0-1). **P0-3 confirmed no programmatic fab-export dependency is needed**:
`tsci export -f gerbers -o out.zip` already emits Gerbers + `bom.csv` + `pick_and_place.csv`.

---

## 2. Backend — Python (`backend/pyproject.toml`)

### Runtime
| Package | Purpose | Maps to |
|---------|---------|---------|
| **`claude-agent-sdk`** (v0.2.110 verified) | Drives the bundled Claude Code CLI (streaming `ClaudeSDKClient`, `ClaudeAgentOptions`, `can_use_tool`, `resume`, `skills`, native `max_turns`/`max_budget_usd`/`task_budget`). **Bundles its own CLI.** | FR-5, FR-9, FR-10, FR-20, FR-22 |
| **`fastapi`** | HTTP + SSE web framework | §3.8 API |
| **`uvicorn[standard]`** | ASGI server | serve |
| **`sse-starlette`** | `EventSourceResponse` for the SSE event stream | FR-6 |
| **`pydantic`** | Request/response + SSE event models | schemas |
| **`pydantic-settings`** | Config (caps, model policy, pins, timeouts) from env | NFR-1, NFR-4 |
| **`sqlmodel`** | SQLite ORM for projects/sessions/messages/checkpoints | FR-4 |
| **`aiosqlite`** | Async SQLite driver | FR-4 |
| **`anyio`** | Structured async concurrency for the turn/event loops | events, guardrails |
| **`python-multipart`** | Form/file handling for export downloads (if needed) | FR-17/18 |

> **Verified in P0-5:** `claude-agent-sdk` already pulls `sse-starlette`, `pydantic`,
> `pydantic-settings`, `uvicorn`, `starlette`, `httpx`, `anyio`, and `mcp` transitively — so several
> rows above arrive for free once the SDK is installed. Still list them explicitly as direct deps
> so the backend doesn't rely on transitive resolution.

### Dev / test
| Package | Purpose |
|---------|---------|
| **`pytest`** + **`pytest-asyncio`** | Unit + async tests (PLAN §9) |
| **`httpx`** | Test client for FastAPI routes |
| **`ruff`** | Lint + format |
| **`mypy`** | Static typing (optional but recommended) |

### Suggested `pyproject.toml` dependency block
```toml
[project]
requires-python = ">=3.10"
dependencies = [
  "claude-agent-sdk",
  "fastapi",
  "uvicorn[standard]",
  "sse-starlette",
  "pydantic",
  "pydantic-settings",
  "sqlmodel",
  "aiosqlite",
  "anyio",
]

[project.optional-dependencies]
dev = ["pytest", "pytest-asyncio", "httpx", "ruff", "mypy"]
```

---

## 3. Frontend — JavaScript/TypeScript (`frontend/package.json`)

### Runtime
| Package | Purpose | Maps to |
|---------|---------|---------|
| **`react`@^19**, **`react-dom`@^19** | UI framework — **React 19 is required** (`@tscircuit/3d-viewer` peer-pins `react@19.1.0`, per P0-4) | §5 |
| **`@tscircuit/runframe`** (0.0.2160) | Provides `CircuitJsonPreview` (renders backend-built `circuit.json`, no eval) | FR-15, FR-16 |
| **`@tscircuit/pcb-viewer`**, **`@tscircuit/schematic-viewer`**, **`@tscircuit/3d-viewer`** | The actual view renderers `CircuitJsonPreview` externalizes — must be installed directly (P0-4) | FR-16 |

> **⚠ runframe packaging reality (P0-4):** do **not** bundle `@tscircuit/runframe/runner` (the
> in-browser `.tsx` eval path) from source — it externalizes a long tail of *undeclared* deps (`ky`,
> `react-error-boundary`, the `@radix-ui/*` suite, `comlink`, `jszip`, `zustand`, `@tscircuit/core`,
> `calculate-elbow`, …) and is not cleanly bundleable. Two supported integrations instead:
> 1. **`CircuitJsonPreview` (chosen for v1):** install the three viewer packages above; feed
>    backend-built `circuit.json`. May need `npm install --legacy-peer-deps` due to the React-19 peer pin.
> 2. **Standalone bundle / hosted iframe:** load `@tscircuit/runframe/standalone*.min.js` (~10 MB,
>    self-contained) or embed `https://runframe.tscircuit.com/iframe.html` (verified live) via
>    postMessage — zero bundler dependency resolution. Good fallback if the viewer install is fiddly.

> **SSE:** use the browser's native `EventSource` — no dependency needed. Add a small typed wrapper
> in `src/api/`. Only add a polyfill (`event-source-polyfill`) if you need custom headers on the
> SSE connection.

### Build / dev / test
| Package | Purpose |
|---------|---------|
| **`vite`** + **`@vitejs/plugin-react`** | Dev server + bundler | 
| **`typescript`** | Types |
| **`@types/react`**, **`@types/react-dom`** | React types |
| **`vitest`** + **`@testing-library/react`** | Component/render tests |
| **`eslint`** + **`prettier`** | Lint + format |

### Optional (UX polish, add only if adopted)
- A styling solution — **Tailwind CSS** *or* CSS modules (project choice; not required to ship).
- A lightweight state store — **zustand** — if `useReducer`/context proves unwieldy for the
  event stream. Start without it.

### Suggested `package.json` deps
```jsonc
{
  "dependencies": {
    "react": "^19",
    "react-dom": "^19",
    "@tscircuit/runframe": "0.0.2160",
    "@tscircuit/pcb-viewer": "latest",
    "@tscircuit/schematic-viewer": "latest",
    "@tscircuit/3d-viewer": "latest"
  },
  "devDependencies": {
    "vite": "^5",
    "@vitejs/plugin-react": "^4",
    "typescript": "^5",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "vitest": "^2",
    "@testing-library/react": "^16",
    "eslint": "^9",
    "prettier": "^3"
  }
}
// Pin the viewer trio to exact versions once confirmed; install may need --legacy-peer-deps.
```

---

## 4. Agent-side (already in the repo)

The **tscircuit skill** (`skill/`) is mounted into the Claude Code session via
`ClaudeAgentOptions.setting_sources` — it is not an installed package but a first-class dependency
of the agent's behavior. Its allowed tools (`Read, Write, Grep, Glob, Bash`) plus WebFetch are what
the backend's `can_use_tool` allowlist governs (FR-22).

---

## 5. What is deliberately NOT included (v1)

- **No auth/user-management libs** — single-user, local Claude auth (SPEC non-goals).
- **No Postgres/Redis** — SQLite is sufficient for single-user; revisit for multi-user.
- **No versioning/history libs** — latest state only (decision 12).
- **No charting/design-system dependency** beyond runframe's own rendering.
- **No CDN-bundling/offline packages** — CDN dependency is accepted for v1 (Risk 6).

---

## 6. Version-pinning checklist (finalize before Phase 1 integration)

Phase 0 verified this working set — pin these exact versions:

1. **`tscircuit` (tsci) `0.0.2001`** globally; **`bun 1.3.14`** on PATH. Rewrite each workspace's
   scaffolded `"tscircuit": "latest"` to `0.0.2001`.
2. **`@tscircuit/runframe 0.0.2160`** + the viewer trio (`pcb-viewer`/`schematic-viewer`/`3d-viewer`)
   as an exact-pinned set; frontend on **React 19**.
3. **`claude-agent-sdk 0.2.110`** (bundles the CLI). Freeze **Python** deps (`uv.lock` /
   `requirements.txt`) and **JS** deps (`package-lock.json`).
4. Re-run the **P0** smoke checks against the pinned set before starting Phase 1; do the one
   residual manual check — a live browser render via `CircuitJsonPreview` (folded into P1-14).
</content>
