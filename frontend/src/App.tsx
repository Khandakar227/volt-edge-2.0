import React, { useCallback, useEffect, useState } from "react"
import { CircuitJsonPreview } from "@tscircuit/runframe/preview"
import { api, subscribeEvents, type ChatEvent, type Project } from "./api"
import { Chat } from "./Chat"

// The 3D (cad) tab needs WebGL; schematic/PCB don't. Probe once and only offer
// the tab when a context can actually be created (software-rendered browsers
// without GPU acceleration fail here — degrade instead of crashing the viewer).
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

export default function App() {
  const [project, setProject] = useState<Project | null>(null)
  const [events, setEvents] = useState<ChatEvent[]>([])
  const [busy, setBusy] = useState(false)
  const [circuitJson, setCircuitJson] = useState<any[] | null>(null)
  const [status, setStatus] = useState("loading…")

  // Bootstrap: reuse the most recent project or create one.
  useEffect(() => {
    ;(async () => {
      try {
        const projects = await api.listProjects()
        const current =
          projects[0] ?? (await api.createProject("My first board"))
        setProject(current)
        setStatus("")
        // restore prior chat + latest artifact
        const history = await api.getMessages(current.id)
        setEvents(
          history.map((m) => ({
            type: m.role === "user" ? "user" : "assistant_text",
            data: { text: m.content },
            ts: Date.parse(m.ts),
          })),
        )
        setCircuitJson(await api.getCircuitJson(current.id))
      } catch (e: any) {
        setStatus(`backend unreachable: ${e.message}`)
      }
    })()
  }, [])

  const refreshCircuit = useCallback(async (projectId: string) => {
    const cj = await api.getCircuitJson(projectId)
    if (cj) setCircuitJson(cj)
  }, [])

  // SSE subscription
  useEffect(() => {
    if (!project) return
    const close = subscribeEvents(project.id, (ev) => {
      if (ev.type === "connected") return
      setEvents((prev) => [...prev, ev])
      if (ev.type === "checkpoint") void refreshCircuit(project.id)
      if (ev.type === "done" || ev.type === "error") setBusy(false)
    })
    return close
  }, [project, refreshCircuit])

  const send = async (text: string) => {
    if (!project) return
    setEvents((prev) => [...prev, { type: "user", data: { text }, ts: Date.now() }])
    setBusy(true)
    try {
      await api.sendMessage(project.id, text)
    } catch (e: any) {
      setBusy(false)
      setEvents((prev) => [
        ...prev,
        { type: "error", data: { message: e.message }, ts: Date.now() },
      ])
    }
  }

  const interrupt = () => project && api.interrupt(project.id)

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <aside
        style={{
          width: 420,
          minWidth: 320,
          borderRight: "1px solid #262b38",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid #262b38",
            fontWeight: 600,
          }}
        >
          ⚡ VoltEdge
          <span style={{ color: "#8b90a0", fontWeight: 400, marginLeft: 8, fontSize: 13 }}>
            {project?.title ?? status}
          </span>
        </header>
        <Chat events={events} busy={busy} onSend={send} onInterrupt={interrupt} />
      </aside>
      <main style={{ flex: 1, minWidth: 0, background: "#fff", position: "relative" }}>
        {circuitJson ? (
          <>
            <CircuitJsonPreview
              circuitJson={circuitJson as any}
              defaultTab="schematic"
              availableTabs={AVAILABLE_TABS as any}
              showCodeTab={false}
              showJsonTab={false}
              className="h-full"
            />
            {!WEBGL_AVAILABLE && (
              <div
                style={{
                  position: "absolute",
                  bottom: 8,
                  right: 12,
                  fontSize: 11,
                  color: "#999",
                }}
              >
                3D view disabled — WebGL unavailable (enable browser hardware
                acceleration to restore it)
              </div>
            )}
          </>
        ) : (
          <div
            style={{
              height: "100%",
              display: "grid",
              placeItems: "center",
              color: "#555",
            }}
          >
            No build yet — ask the agent for a circuit.
          </div>
        )}
      </main>
    </div>
  )
}
