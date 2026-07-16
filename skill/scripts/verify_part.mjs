// skill/scripts/verify_part.mjs
// Validate a freshly authored tscircuit part against its built circuit.json.
// Pure check: `validateCircuitJson`. CLI: build a part file then validate.
import { execFileSync } from "node:child_process"
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs"
import { join } from "node:path"

const PAD_TYPES = new Set(["pcb_plated_hole", "pcb_smtpad", "pcb_hole"])

export function validateCircuitJson(circuitJson) {
  const problems = []
  if (!Array.isArray(circuitJson) || circuitJson.length === 0) {
    return { ok: false, problems: ["circuit.json is empty — the part failed to build"] }
  }

  // Any explicit error element about the component itself is fatal.
  for (const el of circuitJson) {
    if (typeof el.type === "string" && el.type.includes("error") && !el.type.startsWith("pcb_trace")) {
      problems.push(`build error element: ${el.type}${el.message ? ` (${el.message})` : ""}`)
    }
  }

  // pad count (per pcb_component) must equal source_port count (per its source_component).
  const padsByPcb = new Map()
  for (const el of circuitJson) {
    if (PAD_TYPES.has(el.type) && el.pcb_component_id) {
      padsByPcb.set(el.pcb_component_id, (padsByPcb.get(el.pcb_component_id) || 0) + 1)
    }
  }
  const portsBySource = new Map()
  for (const el of circuitJson) {
    if (el.type === "source_port" && el.source_component_id) {
      portsBySource.set(el.source_component_id, (portsBySource.get(el.source_component_id) || 0) + 1)
    }
  }
  for (const el of circuitJson) {
    if (el.type === "pcb_component" && el.source_component_id) {
      const pads = padsByPcb.get(el.pcb_component_id) || 0
      const ports = portsBySource.get(el.source_component_id) || 0
      if (pads !== ports) {
        problems.push(`pin/pad mismatch: ${ports} schematic pins vs ${pads} footprint pads (component ${el.source_component_id})`)
      }
    }
  }

  return { ok: problems.length === 0, problems }
}

function main() {
  const partFile = process.argv[2]
  if (!partFile) {
    console.error("usage: node verify_part.mjs parts/<slug>.tsx")
    process.exit(2)
  }
  try {
    execFileSync("tsci", ["build", partFile], { stdio: "inherit" })
  } catch {
    console.error("FAIL: tsci build did not succeed")
    process.exit(1)
  }
  const distDir = "dist"
  let jsonPath = null
  if (existsSync(distDir)) {
    for (const sub of readdirSync(distDir)) {
      const p = join(distDir, sub, "circuit.json")
      if (existsSync(p) && (!jsonPath || statSync(p).mtimeMs > statSync(jsonPath).mtimeMs)) jsonPath = p
    }
  }
  if (!jsonPath) {
    console.error("FAIL: no dist/*/circuit.json produced")
    process.exit(1)
  }
  const { ok, problems } = validateCircuitJson(JSON.parse(readFileSync(jsonPath)))
  if (!ok) {
    console.error("FAIL:\n - " + problems.join("\n - "))
    process.exit(1)
  }
  console.log("OK: part verified (" + jsonPath + ")")
}

// Run main only when invoked as a CLI, not when imported by the test.
if (import.meta.url === `file://${process.argv[1]}`) main()
