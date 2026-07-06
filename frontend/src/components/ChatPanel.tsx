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
