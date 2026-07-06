# ⚡ VoltEdge

An agentic circuit-design dashboard: chat with a Claude-powered sidekick that turns
natural-language prompts into real [tscircuit](https://tscircuit.com) PCB designs, rendered
live as Schematic / PCB / 3D, with drag-to-edit + in-browser re-autoroute.

**Docs:** [SPEC](docs/SPEC.md) · [PLAN](docs/PLAN.md) · [TASKS](docs/TASKS.md) ·
[PACKAGES](docs/PACKAGES.md) · [Phase 0 results](docs/PHASE0_RESULTS.md)

## How it works

VoltEdge is three pieces: a **React frontend**, a **FastAPI backend**, and a **Claude
agent** (via the Claude Agent SDK) that drives the `tsci` CLI inside a per-project
workspace. The browser renders with tscircuit **RunFrame**, which evaluates the
workspace source *in the browser* — so the PCB/schematic are interactive (drag, Run,
autoroute), not just static images.

```mermaid
flowchart LR
  subgraph Browser["Browser — React + Vite + Tailwind"]
    SB["Session sidebar<br/>(new / switch / rename / delete)"]
    Chat["Chat panel<br/>(rich SSE transcript)"]
    RF["RunFrame<br/>in-browser eval + autoroute"]
  end
  subgraph Backend["Backend — FastAPI"]
    API["HTTP + SSE routes"]
    SM["SessionManager<br/>1 ClaudeSDKClient / project"]
    WS["Workspace service<br/>scaffold · tsci build · fsMap"]
    BUS["SSE event bus"]
    DB[("SQLite<br/>projects · events · checkpoints")]
  end
  subgraph Agent["Claude Agent (Agent SDK)"]
    SK["Skills:<br/>tscircuit + components (parts lib)"]
    TSCI["tsci build / search / import"]
  end
  FILES["Workspace files<br/>index.circuit.tsx · parts/"]

  Chat -- "POST /message" --> API --> SM --> Agent
  Agent --> SK
  Agent --> TSCI --> FILES
  SM -- events --> BUS -- SSE --> Chat
  SM --> DB
  RF -- "GET /fsmap" --> API --> WS --> FILES
  FILES -. fsMap .-> RF
```

### A turn, step by step

```mermaid
sequenceDiagram
  actor U as User
  participant FE as Frontend
  participant BE as Backend
  participant AG as Claude agent
  participant FS as Workspace
  U->>FE: describe a circuit
  FE->>BE: POST /projects/{id}/message
  BE->>AG: run_turn(prompt)
  loop streamed
    AG-->>BE: thinking / tool_use / tool_result
    BE-->>FE: SSE events (also persisted to SQLite)
  end
  AG->>FS: write index.circuit.tsx, run `tsci build`
  AG-->>BE: done
  BE-->>FE: checkpoint + done (busy clears)
  FE->>BE: GET /projects/{id}/fsmap
  BE-->>FE: source files
  FE->>FE: RunFrame evaluates + renders (PCB/Schematic/3D)
```

Key points:
- `index.circuit.tsx` is the **one entry** tscircuit builds and the UI renders. The agent
  overwrites it each turn (a plain `circuit.tsx` is *not* an entry and is ignored).
- The rich transcript (thinking + tool calls, shown as accordions) is **persisted** as an
  event stream, so reloading or switching sessions restores it.
- New workspaces scaffold in **~0.5 s** via a shared template with hardlinked
  `node_modules` (a one-time ~30–50 s template build seeds it).

## Where components come from

There is **no MCP server** — the agent sources parts two ways:

```mermaid
flowchart TD
  A["Agent needs a part"] --> B{"In the local<br/>parts library?"}
  B -- yes --> C["import from ./parts/<br/>(curated, dimensionally correct)"]
  B -- no --> D["tsci search / tsci import"]
  D --> E["tscircuit registry<br/>+ JLCPCB parts"]
  C --> F["index.circuit.tsx"]
  E --> F
```

1. **Local parts library** (`component-kb/parts/*.tsx`, mounted into each workspace as
   `./parts/`): verified board components — ESP32-C3 SuperMini, GY-521/MPU-6050, STM32
   Blue Pill, Arduino Uno shield — with real dimensions, footprints, and pinouts. The
   `components` skill documents the catalog; the agent imports these directly.
2. **tscircuit registry** via `tsci search` / `tsci import` for anything not in the
   library — this pulls authoritative footprints from the tscircuit registry / **JLCPCB**
   parts catalog.

> A datasheet/parts **MCP** (wrapping SnapEDA/Octopart/DigiKey) is a possible future
> addition, but is **not** currently wired up.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 18 (22.x) | |
| Bun | 1.3.x | **required by `tsci`** — `curl -fsSL https://bun.sh/install \| bash` |
| tscircuit CLI | 0.0.200x | `npm install -g tscircuit` (provides `tsci`) |
| Python | ≥ 3.10 | |
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

Open http://localhost:5173, click **New chat**, describe a circuit, and watch the agent
build it. Restart the backend after pulling changes so agent steering / scaffolding /
routes update.

## Layout

```
backend/       FastAPI app: session manager, SSE relay, workspace + agent wiring
  app/agent.py       Agent SDK options + system-prompt steering + Bash allowlist
  app/sessions.py    Per-project ClaudeSDKClient, turn loop, event persistence
  app/workspace.py   Scaffold (template + hardlink), tsci build, fsMap
  app/routes.py      HTTP + SSE endpoints
frontend/      React 19 + Vite: sidebar + chat + RunFrame preview
component-kb/  "components" skill: parts library (parts/*.tsx) + SKILL.md catalog
skill/         tscircuit Claude skill (mounted into each project workspace)
workspaces/    per-project tscircuit workspaces + .template (runtime, gitignored)
data/          SQLite (runtime, gitignored)
docs/          spec / plan / tasks / packages / phase results
```

## Notes

- The browser **evaluates the workspace source in-browser** (RunFrame) — drag a part,
  hit **Run**, and it re-autoroutes locally. The backend still runs `tsci build` per turn
  for validated checkpoints and (future) fabrication export.
- Bash commands run by the agent are gated by an allowlist; edits are confined to the
  project workspace.
- Manufacturability (DRC, fab rules) remains **your responsibility** — review before ordering.
```
