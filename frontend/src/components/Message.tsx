import { marked } from "marked"
import { CheckCircle2, TriangleAlert } from "lucide-react"

export function UserBubble({ text }: { text: string }) {
  return (
    <div className="my-2 ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-[var(--accent)] px-3.5 py-2 text-sm text-white">
      {text}
    </div>
  )
}

export function AssistantText({ text }: { text: string }) {
  const html = marked.parse(text, { async: false }) as string
  return (
    <div
      className="prose-chat my-2 max-w-[90%] text-sm leading-relaxed text-[var(--text)]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export function CheckpointBanner({ version }: { version: number }) {
  return (
    <div className="my-2 flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs text-green-300">
      <CheckCircle2 size={14} /> Checkpoint v{version} — circuit re-rendered
    </div>
  )
}

export function TurnFooter({
  numTurns,
  costUsd,
}: {
  numTurns?: number
  costUsd?: number
}) {
  return (
    <div className="my-2 text-center text-[11px] text-[var(--muted)]">
      — turn finished ({numTurns ?? 0} steps, ${(costUsd ?? 0).toFixed(3)}) —
    </div>
  )
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="my-2 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
      <TriangleAlert size={14} /> {message}
    </div>
  )
}
