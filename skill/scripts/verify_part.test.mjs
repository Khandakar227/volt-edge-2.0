// skill/scripts/verify_part.test.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { validateCircuitJson } from "./verify_part.mjs"

const mpu = JSON.parse(
  readFileSync(new URL("./fixtures/mpu6050.circuit.json", import.meta.url)),
)

test("a real, correct part passes", () => {
  const r = validateCircuitJson(mpu)
  assert.equal(r.ok, true, r.problems.join("; "))
})

test("empty circuit fails", () => {
  const r = validateCircuitJson([])
  assert.equal(r.ok, false)
  assert.match(r.problems.join(" "), /empty/i)
})

test("pin/pad mismatch fails", () => {
  // Drop one plated hole so pad count < source_port count.
  const padType = mpu.find((e) => e.type === "pcb_plated_hole") ? "pcb_plated_hole" : "pcb_smtpad"
  let dropped = false
  const broken = mpu.filter((e) => {
    if (!dropped && e.type === padType) { dropped = true; return false }
    return true
  })
  const r = validateCircuitJson(broken)
  assert.equal(r.ok, false)
  assert.match(r.problems.join(" "), /pin|pad/i)
})

test("component-creation error fails", () => {
  const withErr = [...mpu, { type: "source_failed_to_create_component_error", message: "bad" }]
  const r = validateCircuitJson(withErr)
  assert.equal(r.ok, false)
})
