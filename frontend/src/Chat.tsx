import React, { useEffect, useRef, useState } from "react"
import type { ChatEvent } from "./api"

const chipColors: Record<string, string> = {
  Bash: "#3b82f6",
  Write: "#22c55e",
  Edit: "#22c55e",
  Read: "#a78bfa",
  Skill: "#f59e0b",
}

function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ margin: "4px 0" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: "none",
          border: "none",
          color: "#8b90a0",
          cursor: "pointer",
          fontSize: 12,
          padding: 0,
        }}
      >
        {open ? "▾" : "▸"} thinking…
      </button>
      {open && (
        <pre
          style={{
            whiteSpace: "pre-wrap",
            fontSize: 12,
            color: "#8b90a0",
            background: "#161922",
            padding: 8,
            borderRadius: 6,
            margin: "4px 0",
          }}
        >
          {text}
        </pre>
      )}
    </div>
  )
}

function EventRow({ ev }: { ev: ChatEvent }) {
  switch (ev.type) {
    case "thinking":
      return <ThinkingBlock text={ev.data.text ?? ""} />
    case "assistant_text":
      return (
        <div style={{ margin: "6px 0", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
          {ev.data.text}
        </div>
      )
    case "tool_use":
      return (
        <div style={{ margin: "3px 0", fontSize: 12 }}>
          <span
            style={{
              background: chipColors[ev.data.tool] ?? "#64748b",
              color: "#fff",
              borderRadius: 4,
              padding: "1px 6px",
              marginRight: 6,
            }}
          >
            {ev.data.tool}
          </span>
          <code style={{ color: "#aab" }}>{ev.data.input}</code>
        </div>
      )
    case "tool_result":
      return ev.data.ok ? null : (
        <div style={{ margin: "3px 0", fontSize: 12, color: "#f87171" }}>
          ✗ {ev.data.summary?.slice(0, 200)}
        </div>
      )
    case "checkpoint":
      return (
        <div
          style={{
            margin: "8px 0",
            padding: "6px 10px",
            background: "#14331f",
            border: "1px solid #22c55e55",
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          ✓ Checkpoint v{ev.data.version} — circuit re-rendered
        </div>
      )
    case "error":
      return (
        <div style={{ margin: "8px 0", color: "#f87171", fontSize: 13 }}>
          ⚠ {ev.data.message}
        </div>
      )
    case "done":
      return (
        <div style={{ margin: "6px 0", fontSize: 12, color: "#8b90a0" }}>
          — turn finished ({ev.data.num_turns} steps, $
          {(ev.data.cost_usd ?? 0).toFixed(3)}) —
        </div>
      )
    case "user":
      return (
        <div
          style={{
            margin: "10px 0",
            padding: "8px 12px",
            background: "#1e2536",
            borderRadius: 8,
            whiteSpace: "pre-wrap",
          }}
        >
          {ev.data.text}
        </div>
      )
    default:
      return null
  }
}

export function Chat({
  events,
  busy,
  onSend,
  onInterrupt,
}: {
  events: ChatEvent[]
  busy: boolean
  onSend: (text: string) => void
  onInterrupt: () => void
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
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {events.length === 0 && (
          <div style={{ color: "#8b90a0", fontSize: 14, marginTop: 24 }}>
            Describe the circuit you want — e.g. “an LED blinker with a 555 timer
            on a 30×20mm board”.
          </div>
        )}
        {events.map((ev, i) => (
          <EventRow key={i} ev={ev} />
        ))}
        {busy && (
          <div style={{ color: "#8b90a0", fontSize: 12, margin: "6px 0" }}>
            ● agent working…
          </div>
        )}
      </div>
      <div style={{ padding: 12, borderTop: "1px solid #262b38", display: "flex", gap: 8 }}>
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
          style={{
            flex: 1,
            resize: "none",
            background: "#161922",
            color: "#e6e8ec",
            border: "1px solid #262b38",
            borderRadius: 8,
            padding: 8,
            fontFamily: "inherit",
            fontSize: 14,
          }}
        />
        {busy ? (
          <button onClick={onInterrupt} style={btnStyle("#b91c1c")}>
            Stop
          </button>
        ) : (
          <button onClick={submit} style={btnStyle("#2563eb")}>
            Send
          </button>
        )}
      </div>
    </div>
  )
}

const btnStyle = (bg: string): React.CSSProperties => ({
  background: bg,
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "0 18px",
  cursor: "pointer",
  fontSize: 14,
})
