---
name: components
description: Ground-truth knowledge base of real electronic parts and breakout/dev boards — canonical dimensions, footprints, and pinouts, plus the correct tscircuit modeling for each. Use BEFORE placing any named part (ESP32 boards, sensor breakouts like GY-521/MPU6050, modules, connectors) to avoid guessing footprints or dimensions.
allowed-tools: Read, Grep, Glob, Bash
---

# Component Knowledge Base

Authoritative reference for real-world parts and breakout/dev boards. Consult it
so component **footprints and dimensions are correct**, instead of approximating a
part with a guessed `dip*`/`soic*` footprint.

## How to use this skill

For every named part in the user's request:

1. **Look here first.** Check `parts/` for a matching entry (grep aliases too):
   `grep -rli "<part or alias>" parts/`. If found, use its documented footprint,
   dimensions, pinout, and the ready-made tscircuit snippet.
2. **Else use the tscircuit registry.** Run `tsci search "<part>"` then
   `tsci import "<exact-name>"` to pull an authoritative footprint. Prefer this
   over hand-writing a footprint.
3. **Else model from the datasheet facts**, following the rules below. Never
   invent a `dip*` footprint for a part that isn't a through-hole DIP IC.

## Modeling rules

- **Breakout / dev boards are connectors, not ICs.** Model the physical headers
  with `<pinheader>` (real `pinCount`, `pitch` — usually `"2.54mm"`, and row
  layout), and set the `<board>` `width`/`height` to the module's real size.
- **Single inline header** (e.g. GY-521): one `<pinheader pinCount={N} .../>`.
- **Two header rows at the board edges** (e.g. ESP32 SuperMini/DevKit): the rows
  are far apart (board width, ~0.6"+), NOT a 2.54 mm dual-row DIP. Model as **two
  separate single-row `<pinheader>`s** positioned at opposite edges via `pcbX`,
  or use an imported module footprint — do not collapse them into a `dip*`.
- Only add passives (pull-ups, decoupling caps) if the user asks or the circuit
  requires them.

## Available parts

| File | Part | Aliases |
|---|---|---|
| `parts/mpu6050-gy521.md` | GY-521 MPU6050 6-DoF IMU breakout | MPU6050, MPU-6050, GY521, IMU |
| `parts/esp32-c3-supermini.md` | ESP32-C3 SuperMini dev board | ESP32-C3 Mini, ESP32C3, C3 SuperMini |

## Adding a new part

Copy an existing file in `parts/` and fill every field: canonical name, aliases,
category, board dimensions, the tscircuit element + footprint to use, the full
pinout table, a verified snippet, and a source link. Keep entries factual — an
inaccurate KB entry is worse than none.
