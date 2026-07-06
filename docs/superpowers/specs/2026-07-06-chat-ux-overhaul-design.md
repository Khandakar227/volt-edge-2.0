# VoltEdge Chat / UX Overhaul — Design

**Date:** 2026-07-06
**Status:** Approved (design)

## Problem

The current UI ([frontend/src/App.tsx](../../../frontend/src/App.tsx), [frontend/src/Chat.tsx](../../../frontend/src/Chat.tsx)) has three gaps:

1. **No session management.** The app auto-selects the most recent "project" and offers no way to create a new chat session or switch to an old one.
2. **Rich transcript is lost on reload.** The backend persists only plain user/assistant text (`MessageRecord`). Thinking blocks and tool calls stream over SSE but are never stored, so on reload [App.tsx:44](../../../frontend/src/App.tsx) rebuilds a text-only transcript. Thinking / tool tags vanish.
3. **Bare styling.** Everything is inline-styled; no design system, no expandable chat, no accessible accordions.

## Goals

- Persist the full event stream so thinking + tool-call tags remain visible after a turn ends and across reloads/devices.
- Add session management: create new chat sessions, list and switch to old ones.
- Rich restyle on a real component system (Tailwind v4 + Radix), with an expandable/resizable chat panel and accordion-based thinking/tool tags.

## Non-goals (YAGNI)

Session rename/delete, auth, multi-user, real-time collaboration.

## Architecture

### Backend — persist the rich event stream

- **New table `EventRecord`** in [backend/app/models.py](../../../backend/app/models.py):
  - `id: int (pk)`, `project_id: str (indexed)`, `seq: int` (monotonic per project, for stable ordering), `event_type: str`, `data: str` (JSON-encoded event payload), `ts: datetime`.
- **[backend/app/sessions.py](../../../backend/app/sessions.py) `run_turn`:** as each event is published to the bus, also persist it to `EventRecord`. Covers `user`, `thinking`, `assistant_text`, `tool_use`, `tool_result`, `checkpoint`, `done`, `error`. Existing `MessageRecord` writes stay (SDK/back-compat, harmless).
  - `seq` assigned by counting existing rows for the project at turn start + incrementing per event, or a per-project counter held on the session. Ordering is by `(seq)` then `ts`.
  - The optimistic `user` event is persisted server-side at turn start so replay includes the user's message.
- **New endpoint** `GET /projects/{project_id}/events/history` in [backend/app/routes.py](../../../backend/app/routes.py) → ordered `list[{type, data, ts}]`, shape-compatible with the frontend `ChatEvent`. New schema `EventOut`.

### Frontend — full restyle (Tailwind v4 + Radix)

- **Build:** add Tailwind v4 via `@tailwindcss/vite` plugin in [vite.config.ts](../../../frontend/vite.config.ts); `src/index.css` with `@import "tailwindcss"` + CSS-variable dark theme tokens; import it in [main.tsx](../../../frontend/src/main.tsx). Add `src/lib/utils.ts` exporting `cn()` (clsx + tailwind-merge). Add dependency `@radix-ui/react-accordion`.
- **State:** on load, `listProjects()`; select most recent (or none → empty state). Loading a session fetches `events/history` and replays into the rich transcript; SSE subscription appends live events. `createProject` adds a session and switches to it. Switching sessions swaps the SSE subscription and reloads history + circuit JSON.
- **Layout:** `[ SessionSidebar | ChatPanel |↔ divider | PreviewPane ]`
  - **`SessionSidebar`** — collapsible rail: logo, **New chat** button, scrollable session list (title + relative time, active highlight, click to switch).
  - **`ChatPanel`** — transcript + composer. Draggable divider resizes the chat/preview split (persist width in `localStorage`); a **fullscreen toggle** expands chat to full width (preview hidden) and restores.
  - **`PreviewPane`** — existing `CircuitJsonPreview` in a restyled shell, keeps the WebGL-probe logic.
- **Message components** (in `src/components/`):
  - `UserBubble`, `AssistantMessage` (render markdown via `marked`), `CheckpointBanner`, `TurnFooter` (steps + cost), `ErrorBanner`.
  - `ThinkingAccordion` and `ToolCallAccordion` — Radix accordion items, collapsed by default, persist in the transcript after the turn. Tool chips keep the per-tool color map, refined.
  - `EventRow` dispatches an event to the right component (replaces the switch in [Chat.tsx:48](../../../frontend/src/Chat.tsx)).

## Data flow

1. User sends → optimistic `user` event in UI → `POST /message`.
2. Backend `run_turn` streams SDK messages → publishes each as SSE **and** persists to `EventRecord`.
3. Frontend SSE listener appends events live; `checkpoint` refreshes circuit JSON; `done`/`error` clears busy.
4. On reload / session switch → `GET events/history` rebuilds the full rich transcript; accordions render collapsed.

## Error handling

- History endpoint returns `[]` for a project with no events (not 404).
- Malformed stored `data` JSON is skipped on read (defensive parse), matching the existing SSE parse guard.
- Session switch cancels the previous `EventSource` before opening a new one.

## Testing

- Backend: `EventRecord` persisted for each event type during a turn; `events/history` returns them ordered; empty project → `[]`.
- Frontend: reload restores thinking/tool accordions; new-chat creates + switches; resize + fullscreen toggle behave; switching sessions swaps transcript and circuit.
