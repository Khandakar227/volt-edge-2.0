# Recommended workflow

## 1) Start from a known shape

- Prefer a standard template when possible (Arduino Shield, Raspberry Pi HAT, etc.)
- Otherwise use `<board width height>` with explicit dimensions.

## 2) Establish rails and connectors early

- Decide net names (`net.GND`, `net.VCC`, `net.V3_3`, etc.)
- Add power entry (USB-C, barrel jack, header) and protection (fuse/TVS) as appropriate.
- For USB-C, use `<connector standard="usb_c" />` directly (no JLC import needed).

## 3) Source parts: exhaust existing sources before modeling by hand

For every part, work down this list **in order** and stop at the first source that has
it. Hand-modeling is the **last resort**, only after 1–4 all miss.

1. **Local library `./parts/`** — the curated, dimensionally-correct boards in the
   `components` skill (ESP32-C3 SuperMini, GY-521/MPU-6050, STM32 Blue Pill, Arduino
   Nano, Arduino Uno shield). If the part is here, import and place it; never
   hand-model it.
2. **tscircuit registry** — `tsci search --tscircuit "<query>"`, then
   `tsci add <author/pkg>` for a reusable community package.
3. **`@tscircuit/common`** (already installed) — standard form-factor boards /
   carriers: `ArduinoShield`, `RaspberryPiHatBoard`, `XiaoBoard`, `ProMicroBoard`,
   `MicroModBoard`, `ViaGridBoard`. Use these for a standard board shape/carrier
   instead of hand-modeling an outline + headers, e.g.
   `import { ArduinoShield } from "@tscircuit/common"`.
4. **JLCPCB / LCSC** — `tsci search --jlcpcb "<query>"`, then `tsci import "<part#>"`
   for an authoritative supplier footprint. (You can also `tsci search --kicad "SOIC8"`
   for a footprint by name.)
5. **Model it yourself** — only if none of the above has the part. See "Define
   pinLabels and pinAttributes first" below. A single-inline-header breakout is NOT a
   DIP.
   After authoring, verify with `node .claude/skills/tscircuit/scripts/verify_part.mjs
   parts/<slug>.tsx`, then write `.voltedge/pending-part.json` and stop for the user to
   confirm (see the `components` skill's AUTHORING.md).

USB-C is the exception to the search: always use builtin
`<connector standard="usb_c" />` directly (no JLC import).

## 5) Define pinLabels and pinAttributes first

**This is a critical step for chips and ICs.** Before wiring traces, ensure your components have correct `pinLabels` and `pinAttributes`.

### Getting pin information right

1. **Consult the datasheet** - Look up the component's datasheet to find the correct pin names and functions.

2. **Define pinLabels** - Map physical pin numbers to meaningful names:
   ```tsx
   pinLabels={{
     pin1: "VCC",
     pin2: "GND",
     pin3: ["SDA", "I2C_DATA"],
     pin4: ["SCL", "I2C_CLK"],
   }}
   ```

3. **Add pinAttributes** - Specify pin behavior for DRC and schematic clarity:
   ```tsx
   pinAttributes={{
     VCC: { requiresPower: true },
     EN: { mustBeConnected: true },
     VOUT: { providesPower: true },
   }}
   ```

4. **Verify pin mappings** - Double-check that:
   - Power pins are marked with `requiresPower` or `providesPower`
   - Critical control pins have `mustBeConnected: true`
   - Multi-function pins have all relevant aliases

## 6) Make a minimal, working first draft

- Place core IC + passives
- Wire nets using `<trace />`
- Reference pins by label when pinLabels are defined:
  ```tsx
  <trace from="U1.VCC" to="net.V3_3" />
  <trace from="U1.GND" to="net.GND" />
  ```

## 7) Iterate with `tsci build`

- Run `tsci check netlist` before `tsci check schematic-placement`, `tsci check placement`, and `tsci build` to catch connectivity issues early.
- Use `tsci check schematic-placement` to validate schematic-side placement before checking PCB placement.
- Do not finalize unless both `tsci check schematic-placement` and `tsci check placement` pass with no actionable placement violations; if violations exist, fix layout and rerun — under the iteration budget (see below), not "until clean" without limit.
- Run `tsci build` to validate changes—this is the preferred iteration method for AI-driven development.
- DRC (Design Rule Check) errors can often be ignored during development; focus on connectivity and component placement first.
- Fix connectivity errors first, then placement.
- Run `tsci snapshot` to inspect placement before checking routing.
- Run `tsci check routing-difficulty` after placement to identify potential areas of congestion.
- Then address routing issues.
- Use `tsci dev` only when interactive visual preview is needed (not typical for AI iteration).

### Iteration budget

The check → fix → rerun loop is the slowest, most token-hungry part of the flow, and some constraints are infeasible (e.g. `layers={1}` for a circuit that needs crossings) and will never converge. Bound the effort:

- Cap fix-and-rerun at **3 rounds per failing check**. Count rounds; a non-improving round costs the same as any other.
- Detect infeasibility **before** routing: if `tsci check routing-difficulty` is very high (or `tsci check placement` can't place parts) at a low layer count, escalate immediately instead of attempting routing rounds.
- When the budget is spent, **stop and report to the user**: paste the remaining `tsci check` output, explain why it is likely infeasible, and propose ranked relaxations (raise `layers`, enlarge board, lower density, split into `<group />`, allow jumpers). Ask before applying.
- **To keep a board single-layer despite a crossing**, splice a wire jumper into the net that must cross — a 2-pin `<jumper name="JP1" footprint="pinrow2" />` (two holes + a wire over the top), or a 0-ohm resistor as the SMD equivalent. Route the net through its two pins so it hops over the other trace. See "Single-layer crossings: wire jumpers" in `SKILL.md`.
- **Never silently change a user-specified constraint** (layer count, board size, chosen part). Propose and confirm.

See "Iteration budget" in `SKILL.md` for the full policy.

## 8) Stabilize and regression-test

- Use `tsci build` in CI or before sharing.
- Use `tsci snapshot` to generate visuals that help with placement analysis and quick circuit understanding.
- Use `tsci snapshot --pcb-only` when you want a fast, placement-focused PCB view without schematic snapshots.
- Use `tsci snapshot --test` in CI/regression checks to prevent overwriting snapshots and catch unexpected visual diffs.

## 9) Export what you need

- `tsci export` for SVG/netlist/DSN/3D/library
- Fabrication zip (Gerbers/BOM/PnP): use the export UI after `tsci dev`
