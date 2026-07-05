# ⚡ VoltEdge

An agentic circuit-design dashboard: chat with a Claude-powered sidekick that turns
natural-language prompts into real [tscircuit](https://tscircuit.com) PCB designs, rendered
live as Schematic / PCB / 3D, with fabrication export (Gerbers/BOM/PnP).

**Docs:** [SPEC](docs/SPEC.md) · [PLAN](docs/PLAN.md) · [TASKS](docs/TASKS.md) ·
[PACKAGES](docs/PACKAGES.md) · [Phase 0 results](docs/PHASE0_RESULTS.md)

**Status:** Phase 1 (vertical slice) complete — create project → prompt → live agent turn
over SSE → validated build checkpoint → circuit rendered in the browser.

## Prerequisites

| Tool | Version (verified) | Notes |
|---|---|---|
| Node.js | ≥ 18 (22.x) | |
| Bun | 1.3.x | **required by `tsci`** — `curl -fsSL https://bun.sh/install \| bash` |
| tscircuit CLI | 0.0.2001 | `npm install -g tscircuit` |
| Python | ≥ 3.10 (3.14) | |
| Claude auth | — | local Claude Code / Agent SDK credentials (the SDK bundles its own CLI) |

## Run (dev)

```bash
# 1. Backend (FastAPI on :8787)
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install -e .
uvicorn app.main:app --port 8787

# 2. Frontend (Vite on :5173, proxies /api → :8787)
cd frontend
npm install          # .npmrc sets legacy-peer-deps (React-19 peer pins)
npm run dev
```

Open http://localhost:5173, describe a circuit, and watch the agent build it.

## Layout

```
backend/    FastAPI app: session manager, SSE relay, workspace + export services
frontend/   React 19 + Vite: chat sidekick + CircuitJsonPreview canvas
skill/      tscircuit Claude skill (mounted into each project workspace)
workspaces/ per-project tscircuit workspaces (runtime, gitignored)
data/       SQLite (runtime, gitignored)
docs/       spec / plan / tasks / packages / phase results
```

## Notes

- The browser renders the **backend-built `circuit.json`** (no in-browser compilation),
  so what you see is exactly what the agent validated.
- Bash commands run by the agent are gated by an allowlist; edits are confined to the
  project workspace.
- Manufacturability (DRC, fab rules) remains **your responsibility** — review before ordering.
