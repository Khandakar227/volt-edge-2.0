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
  // RunFrame evaluates the workspace source in-browser; we feed it the fsMap and
  // bump evalVersion to force a re-eval after the agent changes files.
  const [fsMap, setFsMap] = useState<Record<string, string> | null>(null)
  const [evalVersion, setEvalVersion] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [leftWidth, setLeftWidth] = useState(() => {
    const saved = Number(localStorage.getItem(LEFT_WIDTH_KEY))
    return saved > 0 ? saved : 460
  })

  const loadFsMap = useCallback(async (id: string) => {
    try {
      setFsMap(await api.getFsMap(id))
      setEvalVersion((v) => v + 1)
    } catch {
      /* no build yet — leave as-is */
    }
  }, [])

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
            />
          }
        />
      </div>
    </div>
  )
}
