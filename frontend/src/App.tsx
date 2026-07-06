import { useCallback, useEffect, useState } from "react"
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
    if (!activeId) return
    setEvents((prev) => [...prev, { type: "user", data: { text }, ts: Date.now() }])
    setBusy(true)
    try {
      await api.sendMessage(activeId, text)
    } catch (e: any) {
      setBusy(false)
      setEvents((prev) => [
        ...prev,
        { type: "error", data: { message: e.message }, ts: Date.now() },
      ])
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
