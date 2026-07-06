// API client + SSE wrapper for the VoltEdge backend (PLAN §5).

export interface Project {
  id: string
  title: string
  created_at: string
}

export interface ChatEvent {
  type: string
  data: Record<string, any>
  ts: number
}

const JSON_HEADERS = { "content-type": "application/json" }

async function jsonOrThrow(res: Response) {
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`${res.status}: ${body.slice(0, 200)}`)
  }
  return res.json()
}

export const api = {
  listProjects: (): Promise<Project[]> =>
    fetch("/api/projects").then(jsonOrThrow),

  createProject: (title: string): Promise<Project> =>
    fetch("/api/projects", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ title }),
    }).then(jsonOrThrow),

  renameProject: (projectId: string, title: string): Promise<Project> =>
    fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ title }),
    }).then(jsonOrThrow),

  deleteProject: async (projectId: string): Promise<void> => {
    const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`${res.status}: ${body.slice(0, 200)}`)
    }
  },

  sendMessage: (projectId: string, text: string): Promise<void> =>
    fetch(`/api/projects/${projectId}/message`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ text }),
    }).then(jsonOrThrow),

  interrupt: (projectId: string): Promise<{ interrupted: boolean }> =>
    fetch(`/api/projects/${projectId}/interrupt`, { method: "POST" }).then(
      jsonOrThrow,
    ),

  getMessages: (
    projectId: string,
  ): Promise<{ role: string; content: string; ts: string }[]> =>
    fetch(`/api/projects/${projectId}/messages`).then(jsonOrThrow),

  /** A drag finished: rewrite the component's placement props in the source.
   * Returns the updated index.circuit.tsx so the fsMap can be patched in place. */
  setPlacement: (
    projectId: string,
    placement: { name: string } & Partial<
      Record<"pcbX" | "pcbY" | "schX" | "schY", number>
    >,
  ): Promise<{ ok: boolean; source: string }> =>
    fetch(`/api/projects/${projectId}/placement`, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify(placement),
    }).then(jsonOrThrow),

  getFsMap: async (projectId: string): Promise<Record<string, string>> => {
    const res: { files: Record<string, string> } = await fetch(
      `/api/projects/${projectId}/fsmap`,
    ).then(jsonOrThrow)
    return res.files
  },

  getEventHistory: async (projectId: string): Promise<ChatEvent[]> => {
    const rows: { type: string; data: Record<string, any>; ts: string }[] =
      await fetch(`/api/projects/${projectId}/events/history`).then(jsonOrThrow)
    return rows.map((r) => ({
      type: r.type,
      data: r.data,
      ts: Date.parse(r.ts),
    }))
  },
}

const SSE_EVENT_TYPES = [
  "connected",
  "thinking",
  "assistant_text",
  "tool_use",
  "tool_result",
  "plan",
  "question",
  "checkpoint",
  "build_status",
  "paused",
  "error",
  "done",
] as const

export function subscribeEvents(
  projectId: string,
  onEvent: (ev: ChatEvent) => void,
): () => void {
  const source = new EventSource(`/api/projects/${projectId}/events`)
  for (const type of SSE_EVENT_TYPES) {
    source.addEventListener(type, (raw: MessageEvent) => {
      let data: Record<string, any> = {}
      try {
        data = JSON.parse(raw.data)
      } catch {
        /* keep empty */
      }
      onEvent({ type, data, ts: Date.now() })
    })
  }
  return () => source.close()
}
