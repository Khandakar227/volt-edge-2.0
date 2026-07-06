/**
 * ESP32-C3 SuperMini — dev board as a reusable tscircuit part.
 *
 * Body: 18 x 22.52 mm. 16 through-hole header pins @ 2.54mm pitch, two rows ~15.24mm
 * (0.6") apart. Footprint: dip16_w15.24mm (two rows of 8 THT pads, DIP-16 numbering).
 * Pinout: standard community SuperMini layout (no official datasheet — clones vary,
 * so verify against your board's silkscreen). LED on GPIO8, boot button on GPIO9.
 *
 * KNOWN ISSUE: the 3D view renders as the DIP-16 body (auto-generated from the
 * footprint). Attach a real model via the chip's `cadModel` prop (glb/obj/stl/step
 * URL) later for a faithful board — tracked as a follow-up.
 */

// PCB pin numbers (DIP-16, counter-clockwise) -> signal name.
const pinLabels = {
  pin1: "5V",
  pin2: "GND",
  pin3: "3V3",
  pin4: "IO4",
  pin5: "IO3",
  pin6: "IO2",
  pin7: "IO1",
  pin8: "IO0",
  pin9: "TXD0",
  pin10: "RXD0",
  pin11: "IO10",
  pin12: "IO9",
  pin13: "IO8",
  pin14: "IO7",
  pin15: "IO6",
  pin16: "IO5",
}

// Schematic-only grouping (independent of PCB pin numbers).
const schPinArrangement = {
  leftSide: {
    direction: "top-to-bottom",
    pins: ["5V", "3V3", "GND", "IO0", "IO1", "IO2", "IO3", "IO4"],
  },
  rightSide: {
    direction: "top-to-bottom",
    pins: ["IO5", "IO6", "IO7", "IO8", "IO9", "IO10", "RXD0", "TXD0"],
  },
}

/** Placeable part: <Esp32C3SuperMini name="U1" /> — wire by label, e.g. .U1 > .IO8 */
export const Esp32C3SuperMini = (props: { name: string; [key: string]: any }) => (
  <chip
    {...props}
    footprint="dip16_w15.24mm"
    pinLabels={pinLabels}
    schPinArrangement={schPinArrangement}
  />
)

// Standalone preview — run this file directly in the Playground.
export default () => (
  <board width="18mm" height="22.52mm">
    <Esp32C3SuperMini name="U1" />
  </board>
)
