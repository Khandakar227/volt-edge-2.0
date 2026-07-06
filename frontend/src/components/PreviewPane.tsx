import { useState } from "react"
import { CircuitJsonPreview } from "@tscircuit/runframe/preview"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { Play, RotateCw, Loader2 } from "lucide-react"

export function PreviewPane({
  circuitJson,
  webglAvailable,
  availableTabs,
  onEditEvent,
  componentNames,
  onRotate,
  pendingCount,
  rerouting,
  onReroute,
}: {
  circuitJson: any[] | null
  webglAvailable: boolean
  availableTabs: readonly string[]
  onEditEvent: (ev: any) => void
  componentNames: string[]
  onRotate: (name: string) => void
  pendingCount: number
  rerouting: boolean
  onReroute: () => void
}) {
  const [activeTab, setActiveTab] = useState<string>("pcb")
  const showEditTools = activeTab === "pcb"

  return (
    <div className="relative h-full min-w-0 bg-white">
      {circuitJson ? (
        <>
          {/* Edit toolbar — bottom-left, only on the PCB tab (where move/rotate
              apply). Light colors so it reads on the viewer's white canvas. */}
          {showEditTools && (
            <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2">
              {componentNames.length > 0 && (
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50">
                      <RotateCw size={13} /> Rotate
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      align="start"
                      side="top"
                      sideOffset={4}
                      className="z-30 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 text-sm text-gray-800 shadow-lg"
                    >
                      <div className="px-2 py-1 text-[11px] text-gray-400">
                        Rotate 90° — then Re-route
                      </div>
                      {componentNames.map((name) => (
                        <DropdownMenu.Item
                          key={name}
                          onSelect={() => onRotate(name)}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none hover:bg-gray-100"
                        >
                          <RotateCw size={12} className="text-gray-400" /> {name}
                        </DropdownMenu.Item>
                      ))}
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              )}

              <button
                onClick={onReroute}
                disabled={pendingCount === 0 || rerouting}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow enabled:hover:bg-blue-700 disabled:opacity-40"
                title={
                  pendingCount === 0
                    ? "Move or rotate a component first"
                    : "Rebuild and re-route with your edits"
                }
              >
                {rerouting ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Play size={13} />
                )}
                {rerouting
                  ? "Re-routing…"
                  : pendingCount > 0
                    ? `Re-route (${pendingCount})`
                    : "Re-route"}
              </button>
            </div>
          )}

          <CircuitJsonPreview
            circuitJson={circuitJson as any}
            defaultTab="pcb"
            availableTabs={availableTabs as any}
            showCodeTab={false}
            showJsonTab={false}
            readOnly={false as any}
            onEditEvent={onEditEvent as any}
            onActiveTabChange={((tab: string) => setActiveTab(tab)) as any}
            className="h-full"
          />
          {!webglAvailable && (
            <div className="absolute bottom-2 right-3 text-[11px] text-gray-500">
              3D view disabled — WebGL unavailable (enable browser hardware
              acceleration to restore it)
            </div>
          )}
        </>
      ) : (
        <div className="grid h-full place-items-center text-gray-500">
          No build yet — ask the agent for a circuit.
        </div>
      )}
    </div>
  )
}
