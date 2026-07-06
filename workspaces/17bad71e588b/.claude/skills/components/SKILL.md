---
name: components
description: Ready-made, dimensionally-correct tscircuit parts for common dev boards and breakout modules (ESP32-C3 SuperMini, GY-521/MPU-6050, STM32 Blue Pill, Arduino Uno shield). Use BEFORE modeling any of these parts yourself — import the library component instead of guessing a footprint.
allowed-tools: Read, Grep, Glob, Bash
---

# Component parts library

Each scaffolded workspace has a **`./parts/` directory** of verified, reusable
tscircuit part components — real board dimensions, real footprints (custom
through-hole pad layouts, not guessed DIPs), and real pinouts. Each part is a
single `<chip>`, so it renders as ONE schematic symbol with the correct PCB.

## Rule

- If the user's part is in the catalog below, **import and place the library
  component** — never hand-model its headers or invent a `dip*` footprint.
- Wire by pin **label** (e.g. `.U1 > .IO8`), not pin number.
- For a part NOT in the catalog: `tsci search`/`tsci import` from the registry,
  or model a breakout as a `<pinheader>` with real pin count/pitch/dimensions.
- Read the part file itself for the exact pinout before wiring — the header
  comment lists every pin and any "verify against your board's silkscreen"
  caveats (clone boards vary).

## Catalog

| Import from `./parts/…` | Component | Body (mm) | Notes |
|---|---|---|---|
| `esp32-c3-supermini` | `Esp32C3SuperMini` | 18 × 22.52 | 16 THT pins, two rows 15.24mm apart. Pins: 5V, 3V3, GND, IO0–IO10, RXD0, TXD0. I²C default SDA=IO8, SCL=IO9. |
| `mpu6050-gy521` | `Mpu6050Gy521` | 21.2 × 16.4 | GY-521 module, single 8-pin header. Pins: VCC, GND, SCL, SDA, XDA, XCL, AD0, INT. |
| `stm32-bluepill` | `Stm32BluePill` | 53.34 × 22.86 | STM32F103C8T6, two 20-pin rows + 4-pin SWD. Verify pin order vs silkscreen. |
| `arduino-uno-shield` | `ArduinoUnoShield` | 68.6 × 53.4 | Arduino Uno header footprint (D0–D13, A0–A5, power). |

## Usage

```tsx
import { Esp32C3SuperMini } from "./parts/esp32-c3-supermini"
import { Mpu6050Gy521 } from "./parts/mpu6050-gy521"

export default () => (
  <board width="50mm" height="40mm">
    <Esp32C3SuperMini name="U1" />
    <Mpu6050Gy521 name="MPU1" />
    <trace from=".U1 > .IO8" to=".MPU1 > .SDA" />
    <trace from=".U1 > .IO9" to=".MPU1 > .SCL" />
    <trace from=".U1 > .3V3" to=".MPU1 > .VCC" />
    <trace from=".U1 > .GND" to=".MPU1 > .GND" />
  </board>
)
```

## Adding a part

Drop a new `<name>.tsx` in `component-kb/parts/` exporting a single named
component (one `<chip>` with a real footprint + full `pinLabels`), following the
existing files, and add a catalog row above.
