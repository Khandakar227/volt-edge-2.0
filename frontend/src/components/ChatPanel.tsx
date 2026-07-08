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

      <div className="border-t border-[var(--border)] bg-[var(--panel)]/80 backdrop-blur-md p-2">
        <div className="flex items-end gap-3 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-3 shadow-lg transition-all focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent)]/20">

          <textarea
            id="chat-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            rows={1}
            placeholder={
              busy
                ? "Agent is thinking..."
                : "Describe your circuit..."
            }
            className="
        flex-1
        resize-none
        bg-transparent
        px-1
        py-2
        text-sm
        text-[var(--text)]
        placeholder:text-[var(--muted)]
        outline-none
        max-h-40
      "
          />

          {busy ? (
            <button
              onClick={onInterrupt}
              className="
          flex h-11 w-11 items-center justify-center
          rounded-xl
          bg-red-600
          text-white
          shadow-md
          transition-all
          hover:scale-105
          hover:bg-red-500
          active:scale-95
        "
            >
              <Square size={16} />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!draft.trim()}
              className="
          flex h-11 w-11 items-center justify-center
          rounded-xl
          bg-[var(--accent)]
          text-white
          shadow-md
          transition-all
          hover:scale-105
          hover:shadow-lg
          active:scale-95
          disabled:cursor-not-allowed
          disabled:opacity-40
        "
            >
              <Send size={18} />
            </button>
          )}
        </div>

        <div className="mt-1 flex justify-between px-2 text-xs text-[var(--muted)]">
          <span>Press <kbd className="rounded bg-[var(--panel)] px-1">Enter</kbd> to send</span>
          <span><kbd className="rounded bg-[var(--panel)] px-1">Shift + Enter</kbd> for newline</span>
        </div>
      </div>
    </div>
  )
}
