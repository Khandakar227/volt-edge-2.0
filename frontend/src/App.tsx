import { useCallback, useEffect, useRef, useState } from "react"
import { api, subscribeEvents, type ChatEvent, type Project } from "./api"
import { SessionSidebar } from "./components/SessionSidebar"
import { ChatPanel } from "./components/ChatPanel"
import { HomePage } from "./components/HomePage"
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
  const [showHome, setShowHome] = useState(() => window.location.hash !== "#app")
  // RunFrame evaluates the workspace source in-browser; we feed it the fsMap and
  // bump evalVersion to force a re-eval after the agent changes files.
  const [fsMap, setFsMap] = useState<Record<string, string> | null>(null)
  const [evalVersion, setEvalVersion] = useState(0)
  // Latest evaluated circuit JSON — used to resolve a dragged element's id back
  // to its component name so the drag can be written into the source.
  const circuitJsonRef = useRef<any>([])
  const activeIdRef = useRef<string | null>(null)
  const startedFromHomeRef = useRef(false)
  // The PCB viewer keeps every drag event since mount in internal state and
  // re-applies them (delta-based) to each new eval result — after 2+ drags the
  // replay deviates the component by its total travel. There is no prop to
  // clear that state, so after a Run that followed a drag we remount RunFrame
  // (viewerEpoch in its key): the remount re-evals once more and the fresh
  // viewers render pure eval output.
  const [viewerEpoch, setViewerEpoch] = useState(0)
  const dragsSinceEvalRef = useRef(false)
  const [collapsed, setCollapsed] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [leftWidth, setLeftWidth] = useState(() => {
    const saved = Number(localStorage.getItem(LEFT_WIDTH_KEY))
    return saved > 0 ? saved : 460
  })

  const loadFsMap = useCallback(async (id: string) => {
    try {
      const files = await api.getFsMap(id)
      setFsMap(files)
      setEvalVersion((v) => v + 1)
    } catch {
      /* no build yet — leave as-is */
    }
  }, [])

  const onCircuitJsonChange = useCallback((cj: any) => {
    circuitJsonRef.current = cj
  }, [])

  // A drag finished: write the drop position into the component's pcbX/pcbY
  // (or schX/schY) in index.circuit.tsx via the backend, then patch the local
  // fsMap with the updated source. The next Run re-evaluates from that source,
  // so the component stays put and the autorouter re-traces from its new pins.
  // (showRunButton gates auto-eval — patching fsMap does NOT trigger a re-run.)
  const onEditEvent = useCallback((ev: any) => {
    const id = activeIdRef.current
    if (!id || !ev?.new_center) return
    const cj: any[] = Array.isArray(circuitJsonRef.current)
      ? circuitJsonRef.current
      : []
    const bySource = (sourceId: string | undefined) =>
      cj.find(
        (e) => e.type === "source_component" && e.source_component_id === sourceId,
      )?.name as string | undefined

    let name: string | undefined
    let coords: Partial<Record<"pcbX" | "pcbY" | "schX" | "schY", number>> = {}
    if (ev.edit_event_type === "edit_pcb_component_location") {
      const pcb = cj.find(
        (e) =>
          e.type === "pcb_component" &&
          e.pcb_component_id === ev.pcb_component_id,
      )
      name = bySource(pcb?.source_component_id)
      coords = { pcbX: ev.new_center.x, pcbY: ev.new_center.y }
    } else if (ev.edit_event_type === "edit_schematic_component_location") {
      const sch = cj.find(
        (e) =>
          e.type === "schematic_component" &&
          e.schematic_component_id === ev.schematic_component_id,
      )
      name = bySource(sch?.source_component_id)
      coords = { schX: ev.new_center.x, schY: ev.new_center.y }
    }
    if (!name) return
    void api
      .setPlacement(id, { name, ...coords })
      .then(({ source }) => {
        dragsSinceEvalRef.current = true
        setFsMap((prev) =>
          prev ? { ...prev, "index.circuit.tsx": source } : prev,
        )
      })
      .catch(() => {
        /* keep the in-viewer position; the next fsMap load resyncs */
      })
  }, [])

  // A Run finished. If any drag happened since the last eval, the viewers'
  // internal edit-event replay is now stale — remount them (see viewerEpoch).
  // The flag is cleared first so the remount's own eval doesn't loop.
  const onRenderFinished = useCallback(() => {
    if (!dragsSinceEvalRef.current) return
    dragsSinceEvalRef.current = false
    setViewerEpoch((e) => e + 1)
  }, [])

  // Keep a ref of the active id so the RunFrame edit callback (captured once by
  // RunFrame) always persists to the current session, not a stale closure.
  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  // Load a session's rich transcript + current source files.
  const loadSession = useCallback(
    async (id: string, opts?: { fromBoot?: boolean }) => {
      if (opts?.fromBoot && startedFromHomeRef.current) return
      setActiveId(id)
      setBusy(false)
      const history = await api.getEventHistory(id)
      if (opts?.fromBoot && startedFromHomeRef.current) return
      setEvents(history)
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
        setProjects((prev) =>
          startedFromHomeRef.current && prev.length > 0 ? prev : list,
        )
        if (list.length > 0) await loadSession(list[0].id, { fromBoot: true })
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

  useEffect(() => {
    const syncHash = () => setShowHome(window.location.hash !== "#app")
    window.addEventListener("hashchange", syncHash)
    return () => window.removeEventListener("hashchange", syncHash)
  }, [])

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

  const send = async (text: string, opts?: { newSession?: boolean }) => {
    const userEvent: ChatEvent = {
      type: "user",
      data: { text },
      ts: Date.now(),
    }
    if (opts?.newSession) {
      startedFromHomeRef.current = true
      setActiveId(null)
      setEvents([userEvent])
      setFsMap(null)
    } else {
      setEvents((prev) => [...prev, userEvent])
    }
    setBusy(true)
    try {
      let id = opts?.newSession ? null : activeId
      if (!id) {
        // No session yet — create one lazily from the first prompt.
        setFsMap(null)
        const created = await api.createProject(deriveTitle(text))
        setProjects((prev) => [created, ...prev.filter((p) => p.id !== created.id)])
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

  const openWorkspace = () => {
    window.location.hash = "app"
    setShowHome(false)
  }

  const startFromHome = (prompt: string) => {
    openWorkspace()
    void send(prompt, { newSession: true })
  }

  if (showHome) {
    return <HomePage onLaunch={openWorkspace} onSubmitPrompt={startFromHome} />
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
              viewerEpoch={viewerEpoch}
              availableTabs={AVAILABLE_TABS}
              onEditEvent={onEditEvent}
              onCircuitJsonChange={onCircuitJsonChange}
              onRenderFinished={onRenderFinished}
            />
          }
        />
      </div>
    </div>
  )
}
