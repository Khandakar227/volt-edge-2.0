import { RunFrame } from "@tscircuit/runframe/runner"
// Self-contained eval worker (worker code inlined as a blob URL) so RunFrame
// evaluates locally instead of fetching from unpkg.com (which is CORS-blocked).
import evalWebWorkerBlobUrl from "@tscircuit/eval/blob-url"

/**
 * Renders the circuit with the tscircuit RunFrame runner: it evaluates the
 * workspace source (fsMap) in-browser, giving the playground experience —
 * a Run button, drag-to-move, and in-browser autorouting.
 */
export function PreviewPane({
  fsMap,
  evalVersion,
  availableTabs,
  onEditEvent,
  onCircuitJsonChange,
}: {
  fsMap: Record<string, string> | null
  evalVersion: number
  availableTabs: readonly string[]
  onEditEvent: (ev: any) => void
  onCircuitJsonChange: (cj: any) => void
}) {
  const hasCircuit = !!fsMap && !!fsMap["index.circuit.tsx"]

  if (!hasCircuit) {
    return (
      <div className="grid h-full min-w-0 place-items-center bg-white text-gray-500">
        No build yet — ask the agent for a circuit.
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 min-w-0 bg-white">
      <RunFrame
        key={activeKey(fsMap)}
        fsMap={fsMap}
        mainComponentPath="index.circuit.tsx"
        availableTabs={availableTabs as any}
        defaultActiveTab="pcb"
        showRunButton
        evalVersion={String(evalVersion)}
        evalWebWorkerBlobUrl={evalWebWorkerBlobUrl}
        onEditEvent={onEditEvent}
        onCircuitJsonChange={onCircuitJsonChange}
      />
    </div>
  )
}

// Force a fresh RunFrame instance when switching sessions (different file set),
// while letting evalVersion drive re-eval within the same session.
function activeKey(fsMap: Record<string, string>): string {
  return Object.keys(fsMap).sort().join("|").slice(0, 200)
}
