import { Accordion } from "./Accordion"

const chipColors: Record<string, string> = {
  Bash: "#3b82f6",
  Write: "#22c55e",
  Edit: "#22c55e",
  Read: "#a78bfa",
  Skill: "#f59e0b",
}

export function ToolCall({ tool, input }: { tool: string; input: string }) {
  return (
    <Accordion
      header={
        <span className="flex items-center gap-2">
          <span
            className="rounded px-1.5 py-0.5 text-[11px] font-medium text-white"
            style={{ background: chipColors[tool] ?? "#64748b" }}
          >
            {tool}
          </span>
          <span className="max-w-[220px] truncate font-mono text-[11px] text-[var(--muted)]">
            {input}
          </span>
        </span>
      }
    >
      <pre className="whitespace-pre-wrap break-all rounded-md bg-[var(--panel)] p-2 font-mono text-[11px] text-[var(--text)]">
        {input}
      </pre>
    </Accordion>
  )
}

export function ToolResultError({ summary }: { summary: string }) {
  return (
    <div className="my-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-300">
      ✗ {summary.slice(0, 300)}
    </div>
  )
}
