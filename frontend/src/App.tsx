import { useCallback, useEffect, useRef, useState } from "react"
import { applyEditEventsToManualEditsFile } from "@tscircuit/core"
import { api, subscribeEvents, type ChatEvent, type Project } from "./api"
import { SessionSidebar } from "./components/SessionSidebar"
import { ChatPanel } from "./components/ChatPanel"
import { PreviewPane } from "./components/PreviewPane"
import { ResizableSplit } from "./components/ResizableSplit"

// The 3D (cad) tab needs WebGL; schematic/PCB don't. Probe once and only offer
// the tab when a context can actually be created.
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

// The eval worker never reads manual-edits.json on its own — it applies manual
// PCB/schematic placements ONLY through the board's `manualEdits` prop
// (RootCircuit.getManualPlacementForComponent). Agent-authored boards aren't
// wired for it, so drags would never persist through a Run. Wire the copy of
// index.circuit.tsx that RunFrame evaluates (the on-disk file stays untouched):
// import manual-edits.json and pass it to the first <board>. Verified in-browser
// against the real eval engine — without this the component stays at (0,0); with
// it, it moves to the manual placement.
function wireManualEdits(
  files: Record<string, string>,
): Record<string, string> {
  const src = files["index.circuit.tsx"]
  // Skip if there's no entry, no board, or it's already wired (agent or us).
  if (!src || /manualEdits/.test(src) || !/<board/.test(src)) return files
  let wired = src
  if (!/from\s+["']\.\/manual-edits\.json["']/.test(wired)) {
    wired = `import __manualEdits from "./manual-edits.json"\n` + wired
  }
  // Inject the prop on the first <board> (handles `<board ...>`, `<board>`,
  // `<board/>`). Non-global: only the root board.
  wired = wired.replace(/<board(\s|>|\/)/, `<board manualEdits={__manualEdits}$1`)
  return { ...files, "index.circuit.tsx": wired }
}

/** Session title derived from the first prompt (trimmed to a readable length). */
function deriveTitle(text: string): string {
  const t = text.trim().replace(/\s+/g, " ")
  if (!t) return "Untitled board"
  return t.length > 40 ? t.slice(0, 40) + "…" : t
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [events, setEvents] = useState<ChatEvent[]>([])
  const [busy, setBusy] = useState(false)
  // RunFrame evaluates the workspace source in-browser; we feed it the fsMap and
  // bump evalVersion to force a re-eval after the agent changes files.
  const [fsMap, setFsMap] = useState<Record<string, string> | null>(null)
  const [evalVersion, setEvalVersion] = useState(0)
  // Manual PCB/schematic edits (drag/rotate). RunFrame's viewers render purely
  // from the evaluated circuitJson — the `editEvents` prop reaches neither the
  // PCB nor the schematic viewer — so the ONLY way a drag survives a Run is to
  // fold it into manual-edits.json inside the fsMap the eval reads. We keep a
  // running manual-edits object, write it back into fsMap on every edit (Run
  // then re-evaluates + re-autoroutes at the new position), and debounce-persist
  // it to the workspace so edits also survive a reload.
  const circuitJsonRef = useRef<any>([])
  const manualEditsRef = useRef<any>({})
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeIdRef = useRef<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [leftWidth, setLeftWidth] = useState(() => {
    const saved = Number(localStorage.getItem(LEFT_WIDTH_KEY))
    return saved > 0 ? saved : 460
  })

  const loadFsMap = useCallback(async (id: string) => {
    try {
      const files = await api.getFsMap(id)
      // Always keep manual-edits.json present as a key so later content updates
      // don't change PreviewPane's remount key (activeKey is keyed on filenames).
      if (files["manual-edits.json"] == null) files["manual-edits.json"] = "{}"
      // Wire the board to consume manual-edits.json so drags persist through Run.
      setFsMap(wireManualEdits(files))
      setEvalVersion((v) => v + 1)
      // The eval reads manual-edits.json from the fsMap; seed our running merge
      // base from that file so subsequent drags accumulate onto it.
      try {
        manualEditsRef.current = JSON.parse(files["manual-edits.json"])
      } catch {
        manualEditsRef.current = {}
      }
    } catch {
      /* no build yet — leave as-is */
    }
  }, [])

  const onCircuitJsonChange = useCallback((cj: any) => {
    circuitJsonRef.current = cj
  }, [])

  // A drag/rotate finished: fold it into manual-edits.json and write that back
  // into fsMap so the next Run re-evaluates + re-autoroutes at the new position.
  // showRunButton gates auto-eval, so this does NOT trigger an immediate re-run.
  const onEditEvent = useCallback((ev: any) => {
    let updated: any
    try {
      updated = applyEditEventsToManualEditsFile({
        circuitJson: circuitJsonRef.current ?? [],
        editEvents: [ev],
        manualEditsFile: manualEditsRef.current ?? {},
      })
    } catch {
      return // malformed edit — nothing safe to persist
    }
    manualEditsRef.current = updated
    const content = JSON.stringify(updated, null, 2)
    setFsMap((prev) =>
      prev ? { ...prev, "manual-edits.json": content } : prev,
    )
    // Debounced persist to the workspace so edits also survive a reload.
    const id = activeIdRef.current
    if (!id) return
    if (persistTimer.current) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      void api.putManualEdits(id, updated)
    }, 600)
  }, [])

  // Keep a ref of the active id so the RunFrame edit callback (captured once by
  // RunFrame) always persists to the current session, not a stale closure.
  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  // Load a session's rich transcript + current source files.
  const loadSession = useCallback(
    async (id: string) => {
      setActiveId(id)
      setBusy(false)
      setEvents(await api.getEventHistory(id))
      await loadFsMap(id)
    },
    [loadFsMap],
  )

  // Bootstrap: list sessions, open the most recent. Don't auto-create — show the
  // empty state until New chat or the first prompt. Guard StrictMode double-invoke.
  const booted = useRef(false)
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    ;(async () => {
      try {
        const list = await api.listProjects()
        setProjects(list)
        if (list.length > 0) await loadSession(list[0].id)
      } catch (e: any) {
        setEvents([
          {
            type: "error",
            data: { message: `backend unreachable: ${e.message}` },
            ts: Date.now(),
          },
        ])
      }
    })()
  }, [loadSession])

  // SSE subscription for the active session.
  useEffect(() => {
    if (!activeId) return
    const close = subscribeEvents(activeId, (ev) => {
      if (ev.type === "connected") return
      setEvents((prev) => [...prev, ev])
      // The agent edits files during a turn; refresh the source when it builds
      // or finishes so RunFrame re-evaluates.
      if (ev.type === "checkpoint" || ev.type === "done") void loadFsMap(activeId)
      if (ev.type === "done" || ev.type === "error") setBusy(false)
    })
    return close
  }, [activeId, loadFsMap])

  const send = async (text: string) => {
    setEvents((prev) => [...prev, { type: "user", data: { text }, ts: Date.now() }])
    setBusy(true)
    try {
      let id = activeId
      if (!id) {
        // No session yet — create one lazily from the first prompt.
        setFsMap(null)
        const created = await api.createProject(deriveTitle(text))
        setProjects((prev) => [created, ...prev])
        setActiveId(created.id)
        id = created.id
      }
      await api.sendMessage(id, text)
    } catch (e: any) {
      setBusy(false)
      setEvents((prev) => [
        ...prev,
        { type: "error", data: { message: e.message }, ts: Date.now() },
      ])
    }
  }

  const interrupt = () => activeId && api.interrupt(activeId)

  // New chat is a blank slate — no backend project (and no scaffold) until the
  // first prompt lazily creates it in `send`.
  const newChat = () => {
    setActiveId(null)
    setEvents([])
    setFsMap(null)
    manualEditsRef.current = {}
    setBusy(false)
  }

  const renameSession = async (id: string, title: string) => {
    const updated = await api.renameProject(id, title)
    setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)))
  }

  const deleteSession = async (id: string) => {
    await api.deleteProject(id)
    const remaining = projects.filter((p) => p.id !== id)
    setProjects(remaining)
    if (id === activeId) {
      if (remaining.length > 0) {
        await loadSession(remaining[0].id)
      } else {
        setActiveId(null)
        setEvents([])
        setFsMap(null)
        setBusy(false)
      }
    }
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
        onRename={renameSession}
        onDelete={deleteSession}
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
              fsMap={fsMap}
              evalVersion={evalVersion}
              availableTabs={AVAILABLE_TABS}
              onEditEvent={onEditEvent}
              onCircuitJsonChange={onCircuitJsonChange}
            />
          }
        />
      </div>
    </div>
  )
}
