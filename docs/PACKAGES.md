# VoltEdge — Packages & Dependencies

> **Companion docs:** [SPEC.md](./SPEC.md) · [PLAN.md](./PLAN.md) · [TASKS.md](./TASKS.md)
>
> What to install, per surface, and why. Pin versions once **P0-1** locks the tscircuit version;
> until then treat versions here as "latest compatible" and pin during Phase 0.

## 0. System prerequisites

| Tool | Why | Notes |
|------|-----|-------|
| **Node.js ≥ 18 or Bun** | Runs the `tsci` toolchain in each workspace | Bun is faster for install; either works |
| **Python ≥ 3.10** | FastAPI backend + Claude Agent SDK | 3.11+ recommended for asyncio ergonomics |
| **Claude Code CLI** | Local auth the Agent SDK drives | Install per Anthropic docs; `claude` on PATH, authenticated |
| **git** | Allowlisted agent tool + repo ops | — |

> **Version parity (NFR-1):** the globally installed `tscircuit` (`tsci`) and the frontend
> `@tscircuit/runframe` **must resolve the same tscircuit compiler version**. Pin both.

---

## 1. Circuit toolchain (global / per-workspace)

Installed globally, invoked by the agent inside each project workspace.

| Package | Install | Purpose |
|---------|---------|---------|
| **`tscircuit`** | `npm install -g tscircuit` (or `bun install --global tscircuit`) | The `tsci` CLI: `init`, `search`, `add`, `import`, `check`, `build`, `export`, `snapshot` |

Each scaffolded workspace (`tsci init -y`) additionally pulls tscircuit runtime deps and any
`@tsci/*` registry packages the agent adds via `tsci add`. **Phase 0 (P0-3)** may add a
programmatic fab-export dependency (e.g. **`circuit-json-to-gerber`** + a BOM/PnP generator) if no
headless CLI path exists.

---

## 2. Backend — Python (`backend/pyproject.toml`)

### Runtime
| Package | Purpose | Maps to |
|---------|---------|---------|
| **`claude-agent-sdk`** | Drives the local Claude Code session (streaming `ClaudeSDKClient`, `ClaudeAgentOptions`, `can_use_tool`, `resume`) | FR-5, FR-9, FR-10, FR-22 |
| **`fastapi`** | HTTP + SSE web framework | §3.8 API |
| **`uvicorn[standard]`** | ASGI server | serve |
| **`sse-starlette`** | `EventSourceResponse` for the SSE event stream | FR-6 |
| **`pydantic`** | Request/response + SSE event models | schemas |
| **`pydantic-settings`** | Config (caps, model policy, pins, timeouts) from env | NFR-1, NFR-4 |
| **`sqlmodel`** | SQLite ORM for projects/sessions/messages/checkpoints | FR-4 |
| **`aiosqlite`** | Async SQLite driver | FR-4 |
| **`anyio`** | Structured async concurrency for the turn/event loops | events, guardrails |
| **`python-multipart`** | Form/file handling for export downloads (if needed) | FR-17/18 |

> Note: `httpx` and `starlette` come transitively via FastAPI; add `httpx` explicitly only if the
> backend makes its own outbound HTTP calls. The agent's own WebFetch runs inside Claude Code, not
> the backend.

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
| **`react`**, **`react-dom`** | UI framework | §5 |
| **`@tscircuit/runframe`** | In-browser compile + render of the fsMap → Schematic/PCB/3D; resolves `@tsci/*`/JLCPCB imports from the CDN | FR-15, FR-16 |

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
    "react": "^18",
    "react-dom": "^18",
    "@tscircuit/runframe": "<pin to match tsci — P0-1>"
  },
  "devDependencies": {
    "vite": "^5",
    "@vitejs/plugin-react": "^4",
    "typescript": "^5",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "vitest": "^2",
    "@testing-library/react": "^16",
    "eslint": "^9",
    "prettier": "^3"
  }
}
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

## 6. Version-pinning checklist (do during Phase 0)

1. Lock the global **`tscircuit`** version → record in this file and in CI.
2. Set **`@tscircuit/runframe`** to the matching version; assert parity at backend startup (NFR-1).
3. Freeze **Python** deps (`uv.lock` / `requirements.txt`) and **JS** deps (`package-lock.json` /
   `bun.lock`).
4. Re-run the **P0** smoke spikes against the pinned set before starting Phase 1.
</content>
