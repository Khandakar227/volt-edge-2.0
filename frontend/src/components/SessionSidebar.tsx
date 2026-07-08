import { useEffect, useRef, useState } from "react"
import {
  Check,
  Pencil,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Trash2,
  X,
  Zap,
} from "lucide-react"
import type { Project } from "../api"
import { cn } from "../lib/utils"

function parseUtc(iso: string): Date {
  // Trim microseconds to milliseconds and append Z if missing
  const normalized = iso
    .replace(/\.(\d{3})\d+/, ".$1")
    .replace(/(?<!Z)$/, "Z");

  return new Date(normalized);
}

function relativeTime(iso: string): string {
  const then = parseUtc(iso).getTime(); // Date.parse(iso)
  if (Number.isNaN(then)) return ""
  const secs = Math.max(0, (Date.now() - then) / 1000)
  if (secs < 60) return "just now"
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

function SessionRow({
  project,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  project: Project
  active: boolean
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => Promise<void> | void
  onDelete: (id: string) => Promise<void> | void
}) {
  const [mode, setMode] = useState<"idle" | "editing" | "confirmDelete">("idle")
  const [draft, setDraft] = useState(project.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (mode === "editing") {
      setDraft(project.title)
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [mode, project.title])

  const commit = async () => {
    const title = draft.trim()
    setMode("idle")
    if (title && title !== project.title) await onRename(project.id, title)
  }

  if (mode === "editing") {
    return (
      <div className="mb-1 flex items-center gap-1 rounded-lg bg-[var(--panel-2)] px-2 py-1.5">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commit()
            if (e.key === "Escape") setMode("idle")
          }}
          onBlur={() => void commit()}
          className="min-w-0 flex-1 rounded bg-[var(--bg)] px-1.5 py-1 text-sm text-[var(--text)] outline-none ring-1 ring-[var(--accent)]"
        />
      </div>
    )
  }

  return (
    <div
      className={cn(
        "group mb-1 flex items-center gap-1 rounded-lg px-2.5 py-2 transition-colors",
        active ? "bg-[var(--panel-2)]" : "hover:bg-[var(--panel)]",
      )}
    >
      <button
        onClick={() => onSelect(project.id)}
        className="flex min-w-0 flex-1 flex-col items-start text-left"
      >
        <span className="w-full truncate text-sm text-[var(--text)]">{project.title}</span>
        <span className="text-[11px] text-[var(--muted)]">
          {relativeTime(project.created_at)}
        </span>
      </button>

      {mode === "confirmDelete" ? (
        <span className="flex shrink-0 items-center gap-0.5">
          <button
            title="Confirm delete"
            onClick={() => void onDelete(project.id)}
            className="rounded p-1 text-red-400 hover:bg-red-500/15"
          >
            <Check size={14} />
          </button>
          <button
            title="Cancel"
            onClick={() => setMode("idle")}
            className="rounded p-1 text-[var(--muted)] hover:bg-[var(--bg)]"
          >
            <X size={14} />
          </button>
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button
            title="Rename"
            onClick={() => setMode("editing")}
            className="rounded p-1 text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--text)]"
          >
            <Pencil size={14} />
          </button>
          <button
            title="Delete"
            onClick={() => setMode("confirmDelete")}
            className="rounded p-1 text-[var(--muted)] hover:bg-red-500/15 hover:text-red-400"
          >
            <Trash2 size={14} />
          </button>
        </span>
      )}
    </div>
  )
}

export function SessionSidebar({
  projects,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  collapsed,
  onToggleCollapse,
}: {
  projects: Project[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onRename: (id: string, title: string) => Promise<void> | void
  onDelete: (id: string) => Promise<void> | void
  collapsed: boolean
  onToggleCollapse: () => void
}) {
  if (collapsed) {
    return (
      <div className="flex w-12 flex-col items-center gap-3 border-r border-[var(--border)] py-3">
        <button
          onClick={onToggleCollapse}
          className="text-[var(--muted)] hover:text-[var(--text)]"
          title="Expand sidebar"
        >
          <PanelLeft size={18} />
        </button>
        <button
          onClick={onNew}
          className="rounded-md bg-[var(--accent)] p-1.5 text-white"
          title="New chat"
        >
          <Plus size={16} />
        </button>
      </div>
    )
  }
  return (
    <div className="flex w-60 shrink-0 flex-col border-r border-[var(--border)]" style={{ backgroundColor: "rgb(0 94 148 / 10%)" }}>
      <div className="flex items-center justify-between px-3 py-3">
        <span className="flex items-center gap-1.5 font-semibold">
          <Zap size={16} className="text-[var(--accent)]" /> VoltEdge
        </span>
        <button
          onClick={onToggleCollapse}
          className="text-[var(--muted)] hover:text-[var(--text)]"
          title="Collapse sidebar"
        >
          <PanelLeftClose size={18} />
        </button>
      </div>
      <div className="px-3 pb-2">
        <button
          onClick={onNew}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus size={16} /> New chat
        </button>
      </div>
      <div className="mt-1 flex-1 overflow-y-auto px-2">
        {projects.length === 0 && (
          <div className="px-2 py-4 text-xs text-[var(--muted)]">No sessions yet.</div>
        )}
        {projects.map((p) => (
          <SessionRow
            key={p.id}
            project={p}
            active={p.id === activeId}
            onSelect={onSelect}
            onRename={onRename}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}
