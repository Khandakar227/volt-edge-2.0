# ESP32-C3 SuperMini — dev board

**Aliases:** ESP32-C3 Mini, ESP32C3 SuperMini, C3 SuperMini, ESP32-C3 mini dev board
**Category:** microcontroller dev board (Wi-Fi/BLE, RISC-V)

> Note: "ESP32-C3 Mini" colloquially means this SuperMini dev board. The Espressif
> **ESP32-C3-MINI-1** is a different thing — a surface-mount *module* (no headers).
> If the user wants the bare module for a custom PCB, `tsci import "ESP32-C3-MINI-1-N4"`
> instead. This entry is the header-based dev board.

## Physical

- **Board size:** ≈ 22.5 × 18 mm.
- **Connectors:** **two single-row 8-pin headers, one along each long edge**,
  2.54 mm pitch (breadboard-compatible). The rows are ~15 mm apart (the board
  width), so this is **NOT** a 2.54 mm dual-row DIP and **NOT** a `dip14`/`dip16`.
  Model it as **two separate single-row headers** placed at opposite edges.

## Pinout (common SuperMini arrangement — verify against your board silk)

Left header (J1): `5V, GND, 3V3, GPIO4, GPIO3, GPIO2, GPIO1, GPIO0`
Right header (J2): `GPIO5, GPIO6, GPIO7, GPIO8, GPIO9, GPIO10, GPIO20, GPIO21`

Defaults: I²C `SDA = GPIO8`, `SCL = GPIO9`; UART `TX = GPIO21`, `RX = GPIO20`.
Exposed GPIOs: 0–10, 20, 21.

## tscircuit modeling

Two edge headers spaced by the board width (~15.24 mm ⇒ pcbX ±7.62):

```tsx
<board width="22.5mm" height="18mm">
  <pinheader
    name="J1"
    pinCount={8}
    pitch="2.54mm"
    footprint="pinrow8"
    gender="male"
    schFacingDirection="left"
    showSilkscreenPinLabels={true}
    pinLabels={["5V", "GND", "3V3", "GPIO4", "GPIO3", "GPIO2", "GPIO1", "GPIO0"]}
    pcbX={-7.62}
    pcbY={0}
  />
  <pinheader
    name="J2"
    pinCount={8}
    pitch="2.54mm"
    footprint="pinrow8"
    gender="male"
    schFacingDirection="right"
    showSilkscreenPinLabels={true}
    pinLabels={["GPIO5", "GPIO6", "GPIO7", "GPIO8", "GPIO9", "GPIO10", "GPIO20", "GPIO21"]}
    pcbX={7.62}
    pcbY={0}
  />
</board>
```

Wire by label, e.g. I²C to a sensor: `.J2 > .GPIO8` (SDA), `.J2 > .GPIO9` (SCL),
power from `.J1 > .3V3` and `.J1 > .GND`.

**Source:** ESP32-C3 SuperMini pinout references (espboards.dev, mischianti.org, lastminuteengineers.com).
