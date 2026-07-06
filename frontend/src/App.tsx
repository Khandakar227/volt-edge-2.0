import { useCallback, useEffect, useRef, useState } from "react"
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
  const [circuitJson, setCircuitJson] = useState<any[] | null>(null)
  const [pendingEdits, setPendingEdits] = useState<
    Record<string, { pcbX?: number; pcbY?: number; pcbRotation?: number }>
  >({})
  const [rerouting, setRerouting] = useState(false)
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
  // Guard against React StrictMode's double-invoke, which would otherwise
  // create two projects on first load.
  const booted = useRef(false)
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    ;(async () => {
      try {
        const list = await api.listProjects()
        setProjects(list)
        // Don't auto-create a session — show the empty state until the user
        // clicks New chat or sends their first prompt.
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
    setEvents((prev) => [...prev, { type: "user", data: { text }, ts: Date.now() }])
    setBusy(true)
    try {
      let id = activeId
      if (!id) {
        // No session yet — create one lazily from the first prompt.
        setCircuitJson(null)
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

  // New chat is a blank slate — no backend project (and no scaffold) is created
  // until the first prompt lazily creates it in `send`.
  const newChat = () => {
    setActiveId(null)
    setEvents([])
    setCircuitJson(null)
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
        setCircuitJson(null)
        setBusy(false)
      }
    }
  }

  const setWidth = (w: number) => {
    setLeftWidth(w)
    localStorage.setItem(LEFT_WIDTH_KEY, String(w))
  }

  // ---- Interactive PCB editing (move / rotate → re-route) ----

  // Component names present in the current build (for the rotate control).
  const componentNames: string[] = (circuitJson ?? [])
    .filter((e) => e.type === "source_component" && e.name)
    .map((e) => e.name)

  // Resolve a dragged pcb_component_id back to its source component name.
  const nameForPcbComponent = (pcbComponentId: string): string | null => {
    if (!circuitJson) return null
    const pc = circuitJson.find(
      (e) => e.type === "pcb_component" && e.pcb_component_id === pcbComponentId,
    )
    if (!pc) return null
    const sc = circuitJson.find(
      (e) =>
        e.type === "source_component" &&
        e.source_component_id === pc.source_component_id,
    )
    return sc?.name ?? null
  }

  const handleEditEvent = (ev: any) => {
    if (ev?.edit_event_type !== "edit_pcb_component_location") return
    const name = nameForPcbComponent(ev.pcb_component_id)
    if (!name || !ev.new_center) return
    setPendingEdits((prev) => ({
      ...prev,
      [name]: { ...prev[name], pcbX: ev.new_center.x, pcbY: ev.new_center.y },
    }))
  }

  const rotateComponent = (name: string) => {
    setPendingEdits((prev) => {
      const cur = prev[name]?.pcbRotation ?? 0
      return { ...prev, [name]: { ...prev[name], pcbRotation: (cur + 90) % 360 } }
    })
  }

  const reroute = async () => {
    if (!activeId) return
    const edits = Object.entries(pendingEdits).map(([name, v]) => ({ name, ...v }))
    if (edits.length === 0) return
    setRerouting(true)
    try {
      await api.applyLayout(activeId, edits)
      await refreshCircuit(activeId)
      setPendingEdits({})
    } catch (e: any) {
      setEvents((prev) => [
        ...prev,
        { type: "error", data: { message: `re-route failed: ${e.message}` }, ts: Date.now() },
      ])
    } finally {
      setRerouting(false)
    }
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
              circuitJson={circuitJson}
              webglAvailable={WEBGL_AVAILABLE}
              availableTabs={AVAILABLE_TABS}
              onEditEvent={handleEditEvent}
              componentNames={componentNames}
              onRotate={rotateComponent}
              pendingCount={Object.keys(pendingEdits).length}
              rerouting={rerouting}
              onReroute={reroute}
            />
          }
        />
      </div>
    </div>
  )
}
