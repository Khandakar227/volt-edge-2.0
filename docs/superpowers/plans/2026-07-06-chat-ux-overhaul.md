# Chat / UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the full agent event stream and rebuild VoltEdge's frontend into a rich, session-aware chat UI with an expandable/resizable chat panel and accordion-based thinking/tool tags.

**Architecture:** Backend gains an `EventRecord` table written during each turn plus a history endpoint; the frontend is restyled on Tailwind v4 + Radix, replays stored events into a rich transcript, and adds a session sidebar, a resizable/fullscreen chat panel, and accordion thinking/tool components.

**Tech Stack:** FastAPI + SQLModel + SQLite (backend); React 19 + Vite 8 + Tailwind v4 + Radix UI + lucide-react + marked (frontend).

## Global Constraints

- Backend Python `>=3.10`; run all backend commands from `backend/` using its venv: `backend/.venv/bin/python -m ...`.
- Frontend commands run from `frontend/`.
- No new heavy dependencies beyond: `@tailwindcss/vite`, `tailwindcss`, `@radix-ui/react-accordion` (Radix, cva, clsx, tailwind-merge, lucide-react, marked are already in `package.json`).
- Dark theme only; keep the existing per-tool color mapping (Bash=blue, Write/Edit=green, Read=purple, Skill=amber).
- Ordering of stored events uses the autoincrement `id` (insertion order under the per-project turn lock) — no separate `seq` column (simplification of the spec; `id` is monotonic and sufficient).
- Event history and SSE events share one shape: `{ type: string, data: object, ts: number }` on the frontend.

---

## File Structure

**Backend**
- Modify `backend/app/models.py` — add `EventRecord`.
- Modify `backend/app/schemas.py` — add `EventOut`.
- Modify `backend/app/sessions.py` — persist events during `run_turn`.
- Modify `backend/app/routes.py` — add `GET /projects/{id}/events/history`.
- Create `backend/tests/conftest.py`, `backend/tests/test_events_history.py`.

**Frontend**
- Modify `frontend/package.json`, `frontend/vite.config.ts`, `frontend/src/main.tsx`.
- Create `frontend/src/index.css`, `frontend/src/lib/utils.ts`.
- Modify `frontend/src/api.ts` — add `getEventHistory`.
- Create `frontend/src/components/` — `Accordion.tsx`, `ThinkingAccordion.tsx`, `ToolCall.tsx`, `Message.tsx`, `EventRow.tsx`, `SessionSidebar.tsx`, `ChatPanel.tsx`, `PreviewPane.tsx`, `ResizableSplit.tsx`.
- Rewrite `frontend/src/App.tsx`; replace `frontend/src/Chat.tsx` (logic moves into `ChatPanel.tsx` + `EventRow.tsx`).

---

## Task 1: Backend — EventRecord persistence + history endpoint

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/sessions.py:80-108` (`run_turn`) and add a helper
- Modify: `backend/app/routes.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_events_history.py`

**Interfaces:**
- Produces (models): `EventRecord(id, project_id, event_type, data, ts)`.
- Produces (schema): `EventOut(type: str, data: dict, ts: datetime)`.
- Produces (route): `GET /projects/{project_id}/events/history -> list[EventOut]` ordered by `id`, `[]` when empty.
- Produces (sessions): `SessionManager._persist_event(project_id: str, event_type: str, data: dict) -> None`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/conftest.py`:

```python
import os
import tempfile
from pathlib import Path

import pytest


@pytest.fixture()
def client(monkeypatch):
    """FastAPI TestClient backed by a throwaway SQLite file + temp workspaces."""
    tmp = Path(tempfile.mkdtemp())
    monkeypatch.setenv("VOLTEDGE_data_dir", str(tmp / "data"))
    monkeypatch.setenv("VOLTEDGE_workspaces_dir", str(tmp / "workspaces"))

    # Re-import settings/db/app fresh so the env overrides take effect.
    import importlib
    from app import config as config_mod
    importlib.reload(config_mod)
    from app import db as db_mod
    importlib.reload(db_mod)
    from app import models as models_mod
    importlib.reload(models_mod)

    db_mod.init_db()

    from fastapi import FastAPI
    from app.routes import router
    app = FastAPI()
    app.include_router(router, prefix="/api")

    from fastapi.testclient import TestClient
    return TestClient(app), db_mod, models_mod
```

Create `backend/tests/test_events_history.py`:

```python
def _make_project(db_mod, models_mod, project_id="p1"):
    with db_mod.db_session() as db:
        db.add(models_mod.Project(id=project_id, title="T", cwd="/tmp/x"))
        db.commit()


def test_history_empty_returns_empty_list(client):
    tc, db_mod, models_mod = client
    _make_project(db_mod, models_mod)
    res = tc.get("/api/projects/p1/events/history")
    assert res.status_code == 200
    assert res.json() == []


def test_history_returns_events_in_insertion_order(client):
    import json
    tc, db_mod, models_mod = client
    _make_project(db_mod, models_mod)
    with db_mod.db_session() as db:
        db.add(models_mod.EventRecord(
            project_id="p1", event_type="user", data=json.dumps({"text": "hi"})))
        db.add(models_mod.EventRecord(
            project_id="p1", event_type="thinking", data=json.dumps({"text": "hmm"})))
        db.add(models_mod.EventRecord(
            project_id="p1", event_type="assistant_text", data=json.dumps({"text": "ok"})))
        db.commit()
    res = tc.get("/api/projects/p1/events/history")
    body = res.json()
    assert [e["type"] for e in body] == ["user", "thinking", "assistant_text"]
    assert body[0]["data"] == {"text": "hi"}


def test_history_unknown_project_404(client):
    tc, _, _ = client
    assert tc.get("/api/projects/nope/events/history").status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/ -v`
Expected: FAIL — `EventRecord` does not exist / route 404 for the history path.

- [ ] **Step 3: Add the `EventRecord` model**

In `backend/app/models.py`, after `CheckpointRecord`:

```python
class EventRecord(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    project_id: str = Field(index=True)
    event_type: str
    data: str  # JSON-encoded event payload
    ts: datetime = Field(default_factory=utcnow)
```

- [ ] **Step 4: Add the `EventOut` schema**

In `backend/app/schemas.py`, after `MessageOut`:

```python
class EventOut(BaseModel):
    type: str
    data: dict
    ts: datetime
```

- [ ] **Step 5: Add the history route**

In `backend/app/routes.py`: extend the model import and add the endpoint after `get_messages`.

Change the import line:

```python
from .models import EventRecord, MessageRecord, Project
```

Add `EventOut` to the schemas import:

```python
from .schemas import (
    CreateProjectRequest,
    EventOut,
    FsMapOut,
    MessageOut,
    MessageRequest,
    ProjectOut,
)
```

Add the route:

```python
@router.get("/projects/{project_id}/events/history", response_model=list[EventOut])
async def get_event_history(project_id: str):
    _get_project(project_id)
    with db_session() as db:
        records = db.exec(
            select(EventRecord)
            .where(EventRecord.project_id == project_id)
            .order_by(EventRecord.id)
        ).all()
    out: list[EventOut] = []
    for r in records:
        try:
            data = json.loads(r.data)
        except (ValueError, TypeError):
            continue  # skip malformed rows defensively
        out.append(EventOut(type=r.event_type, data=data, ts=r.ts))
    return out
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/ -v`
Expected: PASS (3 tests).

- [ ] **Step 7: Persist events during a turn**

In `backend/app/sessions.py`, add the import `import json` at the top (with the stdlib imports).

Add a helper method to `SessionManager` (next to `_persist_message`):

```python
    def _persist_event(self, project_id: str, event_type: str, data: dict) -> None:
        with db_session() as db:
            db.add(
                EventRecord(
                    project_id=project_id,
                    event_type=event_type,
                    data=json.dumps(data),
                )
            )
            db.commit()
```

Add `EventRecord` to the models import in `sessions.py`:

```python
from .models import CheckpointRecord, EventRecord, MessageRecord, Project, SessionRecord
```

In `run_turn`, persist the user event at turn start and every streamed event. Replace the body of the `async with session.lock:` block's start and loop:

```python
        async with session.lock:
            self._persist_message(project.id, "user", text)
            self._persist_event(project.id, "user", {"text": text})
            assistant_chunks: list[str] = []
            try:
                await session.client.query(text)
                async for msg in session.client.receive_response():
                    for event_type, data in map_message(msg):
                        if event_type == "assistant_text":
                            assistant_chunks.append(data["text"])
                        await bus.publish(project.id, event_type, data)
                        self._persist_event(project.id, event_type, data)
                        if event_type == "tool_result":
                            await self._maybe_checkpoint(session)
                        if event_type == "done" and data.get("session_id"):
                            self._store_claude_session_id(
                                project.id, data["session_id"]
                            )
                await self._maybe_checkpoint(session)
            except Exception as exc:
                logger.exception("turn failed for project %s", project.id)
                await bus.publish(project.id, "error", {"message": str(exc)[:500]})
                self._persist_event(project.id, "error", {"message": str(exc)[:500]})
            finally:
                if assistant_chunks:
                    self._persist_message(
                        project.id, "assistant", "\n".join(assistant_chunks)
                    )
```

Also persist the checkpoint event: in `_maybe_checkpoint`, after the `await bus.publish(... "checkpoint" ...)` call, add:

```python
        self._persist_event(
            session.project_id,
            "checkpoint",
            {"version": session.checkpoint_version, "summary": summary},
        )
```

- [ ] **Step 8: Verify the suite still passes and the app imports**

Run: `cd backend && .venv/bin/python -m pytest tests/ -v && .venv/bin/python -c "import app.sessions, app.routes"`
Expected: PASS (3 tests) and no import error.

- [ ] **Step 9: Commit**

```bash
git add backend/app/models.py backend/app/schemas.py backend/app/sessions.py backend/app/routes.py backend/tests/
git commit -m "feat(backend): persist agent event stream + events/history endpoint"
```

---

## Task 2: Frontend — Tailwind v4 + theme tokens + cn() helper

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/index.html` (drop the inline body styles Tailwind now owns)
- Create: `frontend/src/index.css`
- Create: `frontend/src/lib/utils.ts`

**Interfaces:**
- Produces: `cn(...classes) -> string` from `src/lib/utils.ts`.
- Produces: Tailwind utility classes + CSS variables (`--bg`, `--panel`, `--border`, `--text`, `--muted`, `--accent`) available app-wide.

- [ ] **Step 1: Install dependencies**

Run:
```bash
cd frontend && npm install -D tailwindcss @tailwindcss/vite && npm install @radix-ui/react-accordion
```
Expected: installs succeed; `package.json` gains the three deps.

- [ ] **Step 2: Wire the Tailwind Vite plugin**

Edit `frontend/vite.config.ts`:

```typescript
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": { target: "http://localhost:8787", changeOrigin: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 12000, // circuit viewers are heavy by nature
  },
})
```

- [ ] **Step 3: Create the stylesheet with theme tokens**

Create `frontend/src/index.css`:

```css
@import "tailwindcss";

:root {
  --bg: #0f1115;
  --panel: #161922;
  --panel-2: #1e2536;
  --border: #262b38;
  --text: #e6e8ec;
  --muted: #8b90a0;
  --accent: #2563eb;
}

html, body, #root { height: 100%; margin: 0; }
body {
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  background: var(--bg);
  color: var(--text);
}

/* Accordion open/close animation (Radix data-state driven) */
@keyframes acc-down { from { height: 0 } to { height: var(--radix-accordion-content-height) } }
@keyframes acc-up { from { height: var(--radix-accordion-content-height) } to { height: 0 } }
.acc-content[data-state="open"] { animation: acc-down 160ms ease-out; }
.acc-content[data-state="closed"] { animation: acc-up 160ms ease-out; }
```

- [ ] **Step 4: Import the stylesheet**

Edit `frontend/src/main.tsx` — add `import "./index.css"` after the React imports:

```typescript
import React from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App"

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 5: Trim now-duplicated inline styles from index.html**

Edit `frontend/index.html` — replace the `<style>` block with only the box-sizing reset (Tailwind's preflight + `index.css` own the rest):

```html
    <style>
      * { box-sizing: border-box; }
    </style>
```

- [ ] **Step 6: Create the cn() helper**

Create `frontend/src/lib/utils.ts`:

```typescript
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 7: Verify build + typecheck**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: typecheck passes; build succeeds (Tailwind processes `index.css`).

- [ ] **Step 8: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.ts frontend/src/main.tsx frontend/src/index.css frontend/src/lib/utils.ts frontend/index.html
git commit -m "chore(frontend): add Tailwind v4, theme tokens, cn() helper"
```

---

## Task 3: Frontend — API client: event history

**Files:**
- Modify: `frontend/src/api.ts`

**Interfaces:**
- Consumes: existing `ChatEvent { type, data, ts }`, `api`, `subscribeEvents`.
- Produces: `api.getEventHistory(projectId: string) -> Promise<ChatEvent[]>`.

- [ ] **Step 1: Add the history fetch**

In `frontend/src/api.ts`, add to the `api` object (after `getMessages`):

```typescript
  getEventHistory: async (projectId: string): Promise<ChatEvent[]> => {
    const rows: { type: string; data: Record<string, any>; ts: string }[] =
      await fetch(`/api/projects/${projectId}/events/history`).then(jsonOrThrow)
    return rows.map((r) => ({
      type: r.type,
      data: r.data,
      ts: Date.parse(r.ts),
    }))
  },
```

Add `deleteProject` is out of scope — do not add.

- [ ] **Step 2: Verify typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api.ts
git commit -m "feat(frontend): api.getEventHistory for rich transcript restore"
```

---

## Task 4: Frontend — Accordion primitive + thinking/tool components

**Files:**
- Create: `frontend/src/components/Accordion.tsx`
- Create: `frontend/src/components/ThinkingAccordion.tsx`
- Create: `frontend/src/components/ToolCall.tsx`

**Interfaces:**
- Consumes: `cn` from `src/lib/utils`, `@radix-ui/react-accordion`, `lucide-react`.
- Produces: `<Accordion>` wrapper (single-item, collapsible); `<ThinkingAccordion text />`; `<ToolCall tool input />`; `<ToolResultError summary />`.

- [ ] **Step 1: Create the Accordion primitive**

Create `frontend/src/components/Accordion.tsx`:

```tsx
import * as RadixAccordion from "@radix-ui/react-accordion"
import { ChevronRight } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "../lib/utils"

/** A single collapsible accordion item, collapsed by default. */
export function Accordion({
  header,
  children,
  className,
}: {
  header: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <RadixAccordion.Root type="single" collapsible className={cn("my-1", className)}>
      <RadixAccordion.Item value="item">
        <RadixAccordion.Header>
          <RadixAccordion.Trigger
            className={cn(
              "group flex w-full items-center gap-1.5 rounded-md px-1.5 py-1",
              "text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors",
            )}
          >
            <ChevronRight
              size={12}
              className="transition-transform duration-150 group-data-[state=open]:rotate-90"
            />
            {header}
          </RadixAccordion.Trigger>
        </RadixAccordion.Header>
        <RadixAccordion.Content className="acc-content overflow-hidden">
          <div className="pt-1">{children}</div>
        </RadixAccordion.Content>
      </RadixAccordion.Item>
    </RadixAccordion.Root>
  )
}
```

- [ ] **Step 2: Create ThinkingAccordion**

Create `frontend/src/components/ThinkingAccordion.tsx`:

```tsx
import { Brain } from "lucide-react"
import { Accordion } from "./Accordion"

export function ThinkingAccordion({ text }: { text: string }) {
  return (
    <Accordion
      header={
        <span className="flex items-center gap-1.5">
          <Brain size={12} /> thinking
        </span>
      }
    >
      <pre className="whitespace-pre-wrap rounded-md bg-[var(--panel)] p-2 text-xs leading-relaxed text-[var(--muted)]">
        {text}
      </pre>
    </Accordion>
  )
}
```

- [ ] **Step 3: Create ToolCall + ToolResultError**

Create `frontend/src/components/ToolCall.tsx`:

```tsx
import { Accordion } from "./Accordion"

const chipColors: Record<string, string> = {
  Bash: "#3b82f6",
  Write: "#22c55e",
  Edit: "#22c55e",
  Read: "#a78bfa",
  Skill: "#f59e0b",
}

export function ToolCall({ tool, input }: { tool: string; input: string }) {
  return (
    <Accordion
      header={
        <span className="flex items-center gap-2">
          <span
            className="rounded px-1.5 py-0.5 text-[11px] font-medium text-white"
            style={{ background: chipColors[tool] ?? "#64748b" }}
          >
            {tool}
          </span>
          <span className="truncate max-w-[220px] font-mono text-[11px] text-[var(--muted)]">
            {input}
          </span>
        </span>
      }
    >
      <pre className="whitespace-pre-wrap break-all rounded-md bg-[var(--panel)] p-2 font-mono text-[11px] text-[var(--text)]">
        {input}
      </pre>
    </Accordion>
  )
}

export function ToolResultError({ summary }: { summary: string }) {
  return (
    <div className="my-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-300">
      ✗ {summary.slice(0, 300)}
    </div>
  )
}
```

- [ ] **Step 4: Verify typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Accordion.tsx frontend/src/components/ThinkingAccordion.tsx frontend/src/components/ToolCall.tsx
git commit -m "feat(frontend): accordion primitive + thinking/tool components"
```

---

## Task 5: Frontend — Message + EventRow dispatcher

**Files:**
- Create: `frontend/src/components/Message.tsx`
- Create: `frontend/src/components/EventRow.tsx`

**Interfaces:**
- Consumes: `ChatEvent`, `ThinkingAccordion`, `ToolCall`, `ToolResultError`, `cn`, `marked`.
- Produces: `<UserBubble text />`, `<AssistantText text />`, `<CheckpointBanner version />`, `<TurnFooter numTurns costUsd />`, `<ErrorBanner message />`, `<EventRow ev />`.

- [ ] **Step 1: Create Message components**

Create `frontend/src/components/Message.tsx`:

```tsx
import { marked } from "marked"
import { CheckCircle2, TriangleAlert } from "lucide-react"

export function UserBubble({ text }: { text: string }) {
  return (
    <div className="my-2 ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-[var(--accent)] px-3.5 py-2 text-sm text-white">
      {text}
    </div>
  )
}

export function AssistantText({ text }: { text: string }) {
  const html = marked.parse(text, { async: false }) as string
  return (
    <div
      className="prose-chat my-2 max-w-[90%] text-sm leading-relaxed text-[var(--text)]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export function CheckpointBanner({ version }: { version: number }) {
  return (
    <div className="my-2 flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs text-green-300">
      <CheckCircle2 size={14} /> Checkpoint v{version} — circuit re-rendered
    </div>
  )
}

export function TurnFooter({
  numTurns,
  costUsd,
}: {
  numTurns?: number
  costUsd?: number
}) {
  return (
    <div className="my-2 text-center text-[11px] text-[var(--muted)]">
      — turn finished ({numTurns ?? 0} steps, ${(costUsd ?? 0).toFixed(3)}) —
    </div>
  )
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="my-2 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
      <TriangleAlert size={14} /> {message}
    </div>
  )
}
```

- [ ] **Step 2: Create the EventRow dispatcher**

Create `frontend/src/components/EventRow.tsx`:

```tsx
import type { ChatEvent } from "../api"
import { ThinkingAccordion } from "./ThinkingAccordion"
import { ToolCall, ToolResultError } from "./ToolCall"
import {
  AssistantText,
  CheckpointBanner,
  ErrorBanner,
  TurnFooter,
  UserBubble,
} from "./Message"

export function EventRow({ ev }: { ev: ChatEvent }) {
  switch (ev.type) {
    case "user":
      return <UserBubble text={ev.data.text ?? ""} />
    case "thinking":
      return <ThinkingAccordion text={ev.data.text ?? ""} />
    case "assistant_text":
      return <AssistantText text={ev.data.text ?? ""} />
    case "tool_use":
      return <ToolCall tool={ev.data.tool} input={ev.data.input ?? ""} />
    case "tool_result":
      return ev.data.ok ? null : (
        <ToolResultError summary={ev.data.summary ?? ""} />
      )
    case "checkpoint":
      return <CheckpointBanner version={ev.data.version} />
    case "error":
      return <ErrorBanner message={ev.data.message ?? "error"} />
    case "done":
      return (
        <TurnFooter numTurns={ev.data.num_turns} costUsd={ev.data.cost_usd} />
      )
    default:
      return null
  }
}
```

- [ ] **Step 3: Add minimal prose styling for rendered markdown**

Append to `frontend/src/index.css`:

```css
.prose-chat p { margin: 0.35rem 0; }
.prose-chat ul, .prose-chat ol { margin: 0.35rem 0; padding-left: 1.25rem; }
.prose-chat code { background: var(--panel); padding: 0 4px; border-radius: 4px; font-size: 0.85em; }
.prose-chat pre { background: var(--panel); padding: 8px; border-radius: 6px; overflow-x: auto; }
.prose-chat a { color: #60a5fa; text-decoration: underline; }
```

- [ ] **Step 4: Verify typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Message.tsx frontend/src/components/EventRow.tsx frontend/src/index.css
git commit -m "feat(frontend): message components + event dispatcher"
```

---

## Task 6: Frontend — SessionSidebar

**Files:**
- Create: `frontend/src/components/SessionSidebar.tsx`

**Interfaces:**
- Consumes: `Project` from `../api`, `cn`, `lucide-react`.
- Produces: `<SessionSidebar projects activeId onSelect onNew collapsed onToggleCollapse />`.

- [ ] **Step 1: Create SessionSidebar**

Create `frontend/src/components/SessionSidebar.tsx`:

```tsx
import { Plus, PanelLeftClose, PanelLeft, Zap } from "lucide-react"
import type { Project } from "../api"
import { cn } from "../lib/utils"

function relativeTime(iso: string): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ""
  const secs = Math.max(0, (Date.now() - then) / 1000)
  if (secs < 60) return "just now"
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

export function SessionSidebar({
  projects,
  activeId,
  onSelect,
  onNew,
  collapsed,
  onToggleCollapse,
}: {
  projects: Project[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  collapsed: boolean
  onToggleCollapse: () => void
}) {
  if (collapsed) {
    return (
      <div className="flex w-12 flex-col items-center gap-3 border-r border-[var(--border)] py-3">
        <button onClick={onToggleCollapse} className="text-[var(--muted)] hover:text-[var(--text)]" title="Expand sidebar">
          <PanelLeft size={18} />
        </button>
        <button onClick={onNew} className="rounded-md bg-[var(--accent)] p-1.5 text-white" title="New chat">
          <Plus size={16} />
        </button>
      </div>
    )
  }
  return (
    <div className="flex w-60 shrink-0 flex-col border-r border-[var(--border)]">
      <div className="flex items-center justify-between px-3 py-3">
        <span className="flex items-center gap-1.5 font-semibold">
          <Zap size={16} className="text-[var(--accent)]" /> VoltEdge
        </span>
        <button onClick={onToggleCollapse} className="text-[var(--muted)] hover:text-[var(--text)]" title="Collapse sidebar">
          <PanelLeftClose size={18} />
        </button>
      </div>
      <div className="px-3 pb-2">
        <button
          onClick={onNew}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus size={16} /> New chat
        </button>
      </div>
      <div className="mt-1 flex-1 overflow-y-auto px-2">
        {projects.length === 0 && (
          <div className="px-2 py-4 text-xs text-[var(--muted)]">No sessions yet.</div>
        )}
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={cn(
              "mb-1 flex w-full flex-col items-start rounded-lg px-2.5 py-2 text-left transition-colors",
              p.id === activeId
                ? "bg-[var(--panel-2)]"
                : "hover:bg-[var(--panel)]",
            )}
          >
            <span className="w-full truncate text-sm text-[var(--text)]">{p.title}</span>
            <span className="text-[11px] text-[var(--muted)]">{relativeTime(p.created_at)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/SessionSidebar.tsx
git commit -m "feat(frontend): session sidebar with new-chat + switching"
```

---

## Task 7: Frontend — ResizableSplit + ChatPanel + PreviewPane

**Files:**
- Create: `frontend/src/components/ResizableSplit.tsx`
- Create: `frontend/src/components/ChatPanel.tsx`
- Create: `frontend/src/components/PreviewPane.tsx`

**Interfaces:**
- Consumes: `ChatEvent`, `EventRow`, `CircuitJsonPreview`, `cn`, `lucide-react`.
- Produces:
  - `<ResizableSplit left right leftWidth onLeftWidth fullscreen />` — draggable divider; when `fullscreen`, `right` is hidden and `left` fills.
  - `<ChatPanel events busy onSend onInterrupt fullscreen onToggleFullscreen />`.
  - `<PreviewPane circuitJson webglAvailable availableTabs />`.

- [ ] **Step 1: Create ResizableSplit**

Create `frontend/src/components/ResizableSplit.tsx`:

```tsx
import { useCallback, useEffect, useRef, type ReactNode } from "react"

/** Two-pane horizontal split with a draggable divider. When `fullscreen`,
 *  the right pane is hidden and the left fills the width. */
export function ResizableSplit({
  left,
  right,
  leftWidth,
  onLeftWidth,
  fullscreen,
  minLeft = 320,
  minRight = 360,
}: {
  left: ReactNode
  right: ReactNode
  leftWidth: number
  onLeftWidth: (w: number) => void
  fullscreen: boolean
  minLeft?: number
  minRight?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const onMove = useCallback(
    (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const next = e.clientX - rect.left
      const clamped = Math.max(minLeft, Math.min(next, rect.width - minRight))
      onLeftWidth(clamped)
    },
    [minLeft, minRight, onLeftWidth],
  )

  useEffect(() => {
    const stop = () => {
      dragging.current = false
      document.body.style.userSelect = ""
      document.body.style.cursor = ""
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", stop)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", stop)
    }
  }, [onMove])

  return (
    <div ref={containerRef} className="flex h-full min-h-0 w-full">
      <div
        className="h-full min-h-0"
        style={{ width: fullscreen ? "100%" : leftWidth, flexShrink: 0 }}
      >
        {left}
      </div>
      {!fullscreen && (
        <>
          <div
            onMouseDown={() => {
              dragging.current = true
              document.body.style.userSelect = "none"
              document.body.style.cursor = "col-resize"
            }}
            className="w-1 shrink-0 cursor-col-resize bg-[var(--border)] hover:bg-[var(--accent)] transition-colors"
          />
          <div className="h-full min-h-0 flex-1">{right}</div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create ChatPanel**

Create `frontend/src/components/ChatPanel.tsx`:

```tsx
import { useEffect, useRef, useState } from "react"
import { Maximize2, Minimize2, Send, Square } from "lucide-react"
import type { ChatEvent } from "../api"
import { EventRow } from "./EventRow"

export function ChatPanel({
  events,
  busy,
  onSend,
  onInterrupt,
  fullscreen,
  onToggleFullscreen,
}: {
  events: ChatEvent[]
  busy: boolean
  onSend: (text: string) => void
  onInterrupt: () => void
  fullscreen: boolean
  onToggleFullscreen: () => void
}) {
  const [draft, setDraft] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [events])

  const submit = () => {
    const text = draft.trim()
    if (!text || busy) return
    setDraft("")
    onSend(text)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
        <span className="text-sm font-medium text-[var(--text)]">Chat</span>
        <button
          onClick={onToggleFullscreen}
          className="text-[var(--muted)] hover:text-[var(--text)]"
          title={fullscreen ? "Exit fullscreen" : "Expand chat"}
        >
          {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {events.length === 0 && (
          <div className="mt-8 text-sm text-[var(--muted)]">
            Describe the circuit you want — e.g. “an LED blinker with a 555 timer
            on a 30×20mm board”.
          </div>
        )}
        <div className={fullscreen ? "mx-auto max-w-3xl" : ""}>
          {events.map((ev, i) => (
            <EventRow key={i} ev={ev} />
          ))}
          {busy && (
            <div className="my-2 flex items-center gap-2 text-xs text-[var(--muted)]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
              agent working…
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-t border-[var(--border)] p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={busy ? "agent is working…" : "Describe your circuit…"}
          rows={2}
          className="flex-1 resize-none rounded-lg border border-[var(--border)] bg-[var(--panel)] p-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
        />
        {busy ? (
          <button
            onClick={onInterrupt}
            className="flex items-center gap-1.5 rounded-lg bg-red-700 px-4 text-sm text-white hover:opacity-90"
          >
            <Square size={14} /> Stop
          </button>
        ) : (
          <button
            onClick={submit}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 text-sm text-white hover:opacity-90"
          >
            <Send size={14} /> Send
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create PreviewPane**

Create `frontend/src/components/PreviewPane.tsx`:

```tsx
import { CircuitJsonPreview } from "@tscircuit/runframe/preview"

export function PreviewPane({
  circuitJson,
  webglAvailable,
  availableTabs,
}: {
  circuitJson: any[] | null
  webglAvailable: boolean
  availableTabs: readonly string[]
}) {
  return (
    <div className="relative h-full min-w-0 bg-white">
      {circuitJson ? (
        <>
          <CircuitJsonPreview
            circuitJson={circuitJson as any}
            defaultTab="schematic"
            availableTabs={availableTabs as any}
            showCodeTab={false}
            showJsonTab={false}
            className="h-full"
          />
          {!webglAvailable && (
            <div className="absolute bottom-2 right-3 text-[11px] text-gray-500">
              3D view disabled — WebGL unavailable (enable browser hardware
              acceleration to restore it)
            </div>
          )}
        </>
      ) : (
        <div className="grid h-full place-items-center text-gray-500">
          No build yet — ask the agent for a circuit.
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Verify typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ResizableSplit.tsx frontend/src/components/ChatPanel.tsx frontend/src/components/PreviewPane.tsx
git commit -m "feat(frontend): resizable split, chat panel (fullscreen), preview pane"
```

---

## Task 8: Frontend — App wiring (sessions, history replay, layout)

**Files:**
- Rewrite: `frontend/src/App.tsx`
- Delete: `frontend/src/Chat.tsx` (logic replaced by ChatPanel + EventRow)

**Interfaces:**
- Consumes: everything produced above; `api`, `subscribeEvents`, `Project`, `ChatEvent`.

- [ ] **Step 1: Rewrite App.tsx**

Replace the entire contents of `frontend/src/App.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from "react"
import { api, subscribeEvents, type ChatEvent, type Project } from "./api"
import { SessionSidebar } from "./components/SessionSidebar"
import { ChatPanel } from "./components/ChatPanel"
import { PreviewPane } from "./components/PreviewPane"
import { ResizableSplit } from "./components/ResizableSplit"

const WEBGL_AVAILABLE = (() => {
  try {
    const canvas = document.createElement("canvas")
    const gl =
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl") ??
      canvas.getContext("experimental-webgl")
    return gl != null
  } catch {
    return false
  }
})()

const AVAILABLE_TABS = WEBGL_AVAILABLE
  ? (["schematic", "pcb", "cad"] as const)
  : (["schematic", "pcb"] as const)

const LEFT_WIDTH_KEY = "voltedge.leftWidth"

export default function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [events, setEvents] = useState<ChatEvent[]>([])
  const [busy, setBusy] = useState(false)
  const [circuitJson, setCircuitJson] = useState<any[] | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [leftWidth, setLeftWidth] = useState(() => {
    const saved = Number(localStorage.getItem(LEFT_WIDTH_KEY))
    return saved > 0 ? saved : 460
  })

  // Load a session's rich transcript + latest artifact.
  const loadSession = useCallback(async (id: string) => {
    setActiveId(id)
    setBusy(false)
    setEvents(await api.getEventHistory(id))
    setCircuitJson(await api.getCircuitJson(id))
  }, [])

  // Bootstrap: list sessions, open the most recent (or create one).
  useEffect(() => {
    ;(async () => {
      try {
        let list = await api.listProjects()
        if (list.length === 0) {
          const created = await api.createProject("My first board")
          list = [created]
        }
        setProjects(list)
        await loadSession(list[0].id)
      } catch (e: any) {
        setEvents([{ type: "error", data: { message: `backend unreachable: ${e.message}` }, ts: Date.now() }])
      }
    })()
  }, [loadSession])

  const refreshCircuit = useCallback(async (projectId: string) => {
    const cj = await api.getCircuitJson(projectId)
    if (cj) setCircuitJson(cj)
  }, [])

  // SSE subscription for the active session.
  useEffect(() => {
    if (!activeId) return
    const close = subscribeEvents(activeId, (ev) => {
      if (ev.type === "connected") return
      setEvents((prev) => [...prev, ev])
      if (ev.type === "checkpoint") void refreshCircuit(activeId)
      if (ev.type === "done" || ev.type === "error") setBusy(false)
    })
    return close
  }, [activeId, refreshCircuit])

  const send = async (text: string) => {
    if (!activeId) return
    setEvents((prev) => [...prev, { type: "user", data: { text }, ts: Date.now() }])
    setBusy(true)
    try {
      await api.sendMessage(activeId, text)
    } catch (e: any) {
      setBusy(false)
      setEvents((prev) => [...prev, { type: "error", data: { message: e.message }, ts: Date.now() }])
    }
  }

  const interrupt = () => activeId && api.interrupt(activeId)

  const newChat = async () => {
    const n = projects.length + 1
    const created = await api.createProject(`Board ${n}`)
    setProjects((prev) => [created, ...prev])
    await loadSession(created.id)
  }

  const setWidth = (w: number) => {
    setLeftWidth(w)
    localStorage.setItem(LEFT_WIDTH_KEY, String(w))
  }

  return (
    <div className="flex h-full w-full">
      <SessionSidebar
        projects={projects}
        activeId={activeId}
        onSelect={loadSession}
        onNew={newChat}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
      />
      <div className="min-w-0 flex-1">
        <ResizableSplit
          fullscreen={fullscreen}
          leftWidth={leftWidth}
          onLeftWidth={setWidth}
          left={
            <ChatPanel
              events={events}
              busy={busy}
              onSend={send}
              onInterrupt={interrupt}
              fullscreen={fullscreen}
              onToggleFullscreen={() => setFullscreen((f) => !f)}
            />
          }
          right={
            <PreviewPane
              circuitJson={circuitJson}
              webglAvailable={WEBGL_AVAILABLE}
              availableTabs={AVAILABLE_TABS}
            />
          }
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Delete the obsolete Chat.tsx**

Run: `cd frontend && git rm src/Chat.tsx`
Expected: file removed; nothing imports it (App.tsx no longer does).

- [ ] **Step 3: Verify typecheck + build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: typecheck passes; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(frontend): session-aware app shell with history replay + resizable layout"
```

---

## Task 9: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Start backend + frontend**

Run (backend): `cd backend && .venv/bin/python -m uvicorn app.main:app --port 8787`
Run (frontend, separate shell): `cd frontend && npm run dev`

- [ ] **Step 2: Manually verify each requirement**

Open http://localhost:5173 and confirm:
- Session sidebar lists sessions; **New chat** creates + switches to a new one; clicking an old session loads its transcript.
- Sending a message streams thinking + tool tags as accordions; each is collapsible/expandable.
- After the turn ends, thinking + tool accordions remain in the transcript.
- Reloading the page restores the full rich transcript (thinking + tool tags present, collapsed).
- Dragging the divider resizes the chat/preview split; width persists across reload.
- The fullscreen toggle expands chat to full width and restores.
- A checkpoint re-renders the circuit preview.

- [ ] **Step 3: Run the backend test suite once more**

Run: `cd backend && .venv/bin/python -m pytest tests/ -v`
Expected: PASS.

---

## Self-Review Notes

- **Spec coverage:** event persistence (Task 1) ✓; history endpoint (Task 1) ✓; history replay (Task 3, 8) ✓; Tailwind/Radix restyle (Tasks 2,4–7) ✓; session create/switch (Tasks 6, 8) ✓; resizable + fullscreen chat (Tasks 7, 8) ✓; accordion thinking/tool tags persisting after turn (Tasks 4, 5) ✓; tool color map retained (Task 4) ✓.
- **Deviation from spec:** ordering uses autoincrement `id` instead of a separate `seq` column (documented in Global Constraints) — simpler and equivalent under the per-project turn lock.
- **Type consistency:** `ChatEvent {type,data,ts}` used identically in api.ts, EventRow, ChatPanel, App; `cn` signature stable; component props match their call sites in App.tsx.
```
