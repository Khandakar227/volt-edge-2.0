/**
 * STM32F103C8T6 "Blue Pill" — dev board as a single placeable tscircuit part.
 * Single <chip> + custom footprint (pcbX/pcbY), so it's ONE schematic symbol with
 * the correct two-row through-hole layout.
 *
 * Body: ~53.34 x 22.86 mm. Two 20-pin rows @ 2.54mm pitch along the long edges,
 * plus the 4-pin SWD header at one end.
 *
 * ⚠️ VERIFY against your board's silkscreen before fabricating: the exact per-row
 * pin ORDER and the power-pin positions (3V3 / GND / 5V / VBAT) vary between Blue
 * Pill clones and between pinout diagrams. The GPIO port names below are correct;
 * tweak the ROW1/ROW2/SWD arrays in the Playground to match your physical board.
 * (Some boards expose a 5V pin not listed here.)
 */

const PITCH = 2.54

// Pin labels in physical order along each header.
const ROW1 = [
  "VBAT", "PC13", "PC14", "PC15", "PA0", "PA1", "PA2", "PA3", "PA4", "PA5",
  "PA6", "PA7", "PB0", "PB1", "PB10", "PB11", "RESET", "3V3", "GND", "GND",
] // 20 — top long edge
const ROW2 = [
  "GND", "GND", "3V3", "PB12", "PB13", "PB14", "PB15", "PA8", "PA9", "PA10",
  "PA11", "PA12", "PA15", "PB3", "PB4", "PB5", "PB6", "PB7", "PB8", "PB9",
] // 20 — bottom long edge
const SWD = ["3V3", "SWDIO", "SWCLK", "GND"] // 4-pin debug header (one end)

// Each header: pins laid out along `axis`, centered at (cx, cy).
const HEADERS = [
  { labels: ROW1, axis: "x" as const, cx: 0, cy: 8.89 },
  { labels: ROW2, axis: "x" as const, cx: 0, cy: -8.89 },
  { labels: SWD, axis: "y" as const, cx: 24, cy: 0 },
]

export const Stm32BluePill = (props: { name: string;[key: string]: any }) => {
  let n = 0
  const holes: { pin: number; label: string; x: number; y: number }[] = []
  for (const h of HEADERS) {
    h.labels.forEach((label, i) => {
      n++
      const offset = (i - (h.labels.length - 1) / 2) * PITCH
      holes.push({
        pin: n,
        label,
        x: h.axis === "x" ? h.cx + offset : h.cx,
        y: h.axis === "y" ? h.cy + offset : h.cy,
      })
    })
  }
  return (
    <chip
      {...props}
      pinLabels={Object.fromEntries(holes.map((h) => [`pin${h.pin}`, h.label]))}
      footprint={
        <footprint>
          {holes.map((h) => (
            <platedhole
              key={h.pin}
              portHints={[`pin${h.pin}`]}
              shape="circle"
              holeDiameter="1mm"
              outerDiameter="1.8mm"
              pcbX={h.x}
              pcbY={h.y}
            />
          ))}
        </footprint>
      }
    />
  )
}

// Standalone preview — run this file directly in the Playground.
export default () => (
  <board width="53.34mm" height="22.86mm">
    <Stm32BluePill name="STM32-BluePil" />
  </board>
)
