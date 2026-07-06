import { CircuitJsonPreview } from "@tscircuit/runframe/preview"

export function PreviewPane({
  circuitJson,
  webglAvailable,
  availableTabs,
}: {
  circuitJson: any[] | null
  webglAvailable: boolean
  availableTabs: readonly string[]
}) {
  return (
    <div className="relative h-full min-w-0 bg-white">
      {circuitJson ? (
        <>
          <CircuitJsonPreview
            circuitJson={circuitJson as any}
            defaultTab="schematic"
            availableTabs={availableTabs as any}
            showCodeTab={false}
            showJsonTab={false}
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
