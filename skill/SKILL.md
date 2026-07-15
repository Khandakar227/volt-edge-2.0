---
name: tscircuit
description: Build, modify, and debug tscircuit (React/TypeScript) PCB designs. Use when working with tsci CLI (init/dev/search/add/import/build/export/snapshot/push), choosing footprints, placing parts, wiring nets/traces, or preparing fabrication outputs (Gerbers/BOM/PnP).
allowed-tools: Read, Write, Grep, Glob, Bash
---

# tscircuit

You are helping the user design electronics using tscircuit (React/TypeScript) and the `tsci` CLI.

When this Skill is active:

- Prefer tscircuit’s documented primitives and CLI behavior. If something is unclear, confirm by:
  - Reading local files in the repo (e.g., `tscircuit.config.json`, `index.circuit.tsx`, `package.json`)
  - Running `tsci --help` or the specific subcommand’s `--help`
- Avoid “inventing” JSX props or CLI flags.

## Default workflow

1) Clarify requirements (if not already given)
- Board form factor / size constraints
- Power sources and voltage rails
- I/O: connectors, headers, mounting holes, mechanical constraints
- Target manufacturer constraints (trace/space, assembly, supplier)

2) Choose a starting point
- If the repo is not a tscircuit project, recommend:
  - Install CLI, then `tsci init` to bootstrap a project.
- For a standard board shape, use a `@tscircuit/common` form-factor board (see step 3, source 3) instead of hand-modeling the outline.

3) Source components — exhaust existing sources IN ORDER before modeling by hand
Work down this list and stop at the first source that has the part. Hand-modeling is the **last resort** (source 5), never a shortcut.
1. **Local library `./parts/`** — the curated boards in the `components` skill; import and place, never hand-model these.
2. **tscircuit registry** — `tsci search --tscircuit "<query>"`, then `tsci add <author/pkg>` (installs `@tsci/*` packages).
3. **`@tscircuit/common`** (installed) — standard form-factor boards / carriers: `ArduinoShield`, `RaspberryPiHatBoard`, `XiaoBoard`, `ProMicroBoard`, `MicroModBoard`, `ViaGridBoard`. Use for a standard board/carrier instead of hand-modeling an outline + headers.
4. **JLCPCB / LCSC** — `tsci search --jlcpcb "<query>"`, then `tsci import "<part#>"` for an authoritative supplier footprint.
5. **Model it yourself** — only if 1–4 all miss (real pin count, `pitch`, row layout, real dimensions; a single-inline-header breakout is NOT a DIP).
- USB-C is the exception: always use builtin `<connector standard="usb_c" />`, never a JLC import.

4) Write/modify TSX circuit code
- Keep circuits as a default-exported function that returns JSX.
- Use layout props intentionally:
  - PCB: `pcbX`, `pcbY`, `pcbRotation`, `layer`
  - Schematic: `schX`, `schY`, `schRotation`, `schOrientation`
- On large projects (5+ components), use `<schematicsection />` to group components by function (e.g. "Power", "MCU", "IO"). This is one of the most important things for schematic readability. Assign each component a `schSectionName` and manually position all members of a section in close proximity using `schX`/`schY`.
- Use `<trace />` for connectivity; prefer net connections (`net.GND`, `net.VCC`, etc.) for power/ground.

5) Build and iterate
- Run `tsci check netlist` before `tsci check schematic-placement`, `tsci check placement`, and `tsci build` to catch connectivity issues early.
- Use `tsci check schematic-placement` to validate schematic-side placement before checking PCB placement.
- Do not finalize unless both `tsci check schematic-placement` and `tsci check placement` pass with no actionable placement violations; if violations exist, fix layout and rerun — but under the **iteration budget** below, not "until clean" without limit.
- Use `tsci check trace-length` to check for long straight line distances (before routing) or long routes (after routing)
- Run `tsci build --pcb-png [file]` to inspect placement before checking routing.
- Run `tsci check routing-difficulty` after placement to identify potential areas of congestion.
- Run `tsci build` to compile and validate the circuit.
- DRC (Design Rule Check) errors can often be ignored during development—focus on getting the circuit correct first.
- If routing struggles, reduce density, use `<group />` for sub-layouts, or change autorouter settings.
- Use `tsci dev` only when you need interactive visual feedback (not typical for AI-driven iteration).

### Iteration budget (stop retrying infeasible constraints)

The check → fix → rerun loop is the most expensive part of any design. Autorouting and placement checks are heavy, and some user constraints are simply **infeasible** (e.g. `layers={1}` on a circuit that needs signal crossings). Retrying an infeasible constraint never converges, so cap the effort and escalate to the user instead of looping.

- **Budget: at most 3 fix-and-rerun rounds per failing check.** A "round" is one edit followed by one rerun of the failing check. Count rounds; do not reset the counter just because you tried a different tweak.
- **Detect infeasibility early, before routing.** Run `tsci check routing-difficulty` right after placement. If it reports very high congestion (or `tsci check placement` cannot place parts) on a low layer count, treat it as a likely-infeasible constraint and go straight to escalation — do not attempt full routing rounds first.
- **When the budget is exhausted, STOP and report to the user.** Do not keep retrying silently. Report:
  - The specific violations that remain (paste the concrete `tsci check` output).
  - Why it is likely infeasible under the current constraints (e.g. "single-layer with N crossings").
  - Concrete relaxations, ranked, e.g.: increase `layers` (1 → 2), enlarge the board outline, lower component density / spread placement, split into `<group />` sub-layouts, or allow jumpers/0-ohm bridges for single-layer.
  - Then ask which relaxation to apply (or let the user override the budget) before continuing.
- **Never silently change a user-specified constraint** (layer count, board size, part choice). Propose it and get confirmation; the user asked for that constraint on purpose.
- A change that reduces violations counts as progress and earns a fresh budget; a change that does not reduce (or increases) violations does **not** — after one non-improving round, stop and escalate rather than trying variations of the same approach.

### Single-layer crossings: wire jumpers (bypass a route)

When routing fails on a single-layer board because two nets must cross, you don't have to add a second copper layer — you can add a **wire jumper**: two holes with a wire soldered over the top, so one net physically hops over the other trace. This keeps the board single-layer (`layers={1}`).

Model it as a 2-pin `<jumper />` with a through-hole footprint (`pinrow2` = two plated holes) spliced into the net that needs to cross. Route that net *through* the jumper's two pins so the segment between them is the over-the-top wire:

```tsx
{/* Net SIG must cross another trace on a single-layer board.
    Splice a wire jumper in so SIG hops over the crossing trace. */}
<jumper name="JP1" footprint="pinrow2" pcbX={5} pcbY={5} />

<trace from="U1.SIG_OUT" to="JP1.pin1" />
<trace from="JP1.pin2" to="U2.SIG_IN" />
```

Guidance:
- Place `JP1` (with `pcbX`/`pcbY`) straddling the trace it must jump over, and orient it so the wire spans the crossing.
- Use one jumper per crossing. If a single-layer layout needs many jumpers, that's a signal the design is a poor fit for one layer — surface the jumper count to the user and offer 2 layers as the cleaner alternative.
- A `0-ohm resistor` (`<resistor resistance="0" footprint="0402" />`) spliced in the same way is the SMD equivalent of a wire jumper and is often preferred for assembly.
- Only add jumpers when the user wants to stay single-layer. If layer count wasn't specified, propose 2 layers vs. jumpers and let the user choose (per the "never silently change a constraint" rule above).

6) Validate and export
- Run `tsci check netlist` before `tsci check schematic-placement`, `tsci check placement`, and `tsci build` when preparing to share/publish.
- Run `tsci build` (and optionally `tsci snapshot`) before sharing/publishing.
- Use `tsci export` for SVG/netlist/DSN/3D/library outputs.
- For manufacturing, obtain fabrication outputs (Gerbers/BOM/PnP) from the export UI after `tsci dev`.

## Safety and non-goals

- Treat electrical safety, regulatory compliance, and manufacturability as user-owned responsibilities.
- Do not publish (`tsci push`) or place orders unless the user explicitly requests it.

## Local references bundled with this Skill

- CLI primer: `CLI.md`
- Syntax primer: `SYNTAX.md`
- Workflow patterns: `WORKFLOW.md`
- Pre-export checklist: `CHECKLIST.md`
- Ready-to-copy templates: `templates/`
- Helper scripts: `scripts/`

## Builtin Elements

- [`<analogsimulation />`](./elements/analogsimulation.md)
- [`<battery />`](./elements/battery.md)
- [`<board />`](./elements/board.md)
- [`<breakout />`](./elements/breakout.md)
- [`<breakoutpoint />`](./elements/breakoutpoint.md)
- [`<cadassembly />`](./elements/cadassembly.md)
- [`<cadmodel />`](./elements/cadmodel.md)
- [`<capacitor />`](./elements/capacitor.md)
- [`<chip />`](./elements/chip.md)
- [`<connector />`](./elements/connector.md)
- [`<constraint />`](./elements/constraint.md)
- [`<copperpour />`](./elements/copperpour.md)
- [`<coppertext />`](./elements/coppertext.md)
- [`<courtyardcircle />`](./elements/courtyardcircle.md)
- [`<courtyardoutline />`](./elements/courtyardoutline.md)
- [`<courtyardpill />`](./elements/courtyardpill.md)
- [`<courtyardrect />`](./elements/courtyardrect.md)
- [`<crystal />`](./elements/crystal.md)
- [`<currentsource />`](./elements/currentsource.md)
- [`<cutout />`](./elements/cutout.md)
- [`<diode />`](./elements/diode.md)
- [`<fabricationnotedimension />`](./elements/fabricationnotedimension.md)
- [`<fabricationnotepath />`](./elements/fabricationnotepath.md)
- [`<fabricationnoterect />`](./elements/fabricationnoterect.md)
- [`<fabricationnotetext />`](./elements/fabricationnotetext.md)
- [`<fiducial />`](./elements/fiducial.md)
- [`<footprint />`](./elements/footprint.md)
- [`<fuse />`](./elements/fuse.md)
- [`<group />`](./elements/group.md)
- [`<hole />`](./elements/hole.md)
- [`<inductor />`](./elements/inductor.md)
- [`<jumper />`](./elements/jumper.md)
- [`<led />`](./elements/led.md)
- [`<mosfet />`](./elements/mosfet.md)
- [`<mountedboard />`](./elements/mountedboard.md)
- [`<net />`](./elements/net.md)
- [`<netalias />`](./elements/netalias.md)
- [`<netlabel />`](./elements/netlabel.md)
- [`<opamp />`](./elements/opamp.md)
- [`<panel />`](./elements/panel.md)
- [`<pcbkeepout />`](./elements/pcbkeepout.md)
- [`<pcbnotedimension />`](./elements/pcbnotedimension.md)
- [`<pcbnoteline />`](./elements/pcbnoteline.md)
- [`<pcbnotepath />`](./elements/pcbnotepath.md)
- [`<pcbnoterect />`](./elements/pcbnoterect.md)
- [`<pcbnotetext />`](./elements/pcbnotetext.md)
- [`<pcbtrace />`](./elements/pcbtrace.md)
- [`<pinheader />`](./elements/pinheader.md)
- [`<pinout />`](./elements/pinout.md)
- [`<platedhole />`](./elements/platedhole.md)
- [`<port />`](./elements/port.md)
- [`<potentiometer />`](./elements/potentiometer.md)
- [`<pushbutton />`](./elements/pushbutton.md)
- [`<resistor />`](./elements/resistor.md)
- [`<resonator />`](./elements/resonator.md)
- [`<schematicarc />`](./elements/schematicarc.md)
- [`<schematicbox />`](./elements/schematicbox.md)
- [`<schematiccell />`](./elements/schematiccell.md)
- [`<schematiccircle />`](./elements/schematiccircle.md)
- [`<schematicline />`](./elements/schematicline.md)
- [`<schematicpath />`](./elements/schematicpath.md)
- [`<schematicrect />`](./elements/schematicrect.md)
- [`<schematicrow />`](./elements/schematicrow.md)
- [`<schematicsection />`](./elements/schematicsection.md)
- [`<schematictable />`](./elements/schematictable.md)
- [`<schematictext />`](./elements/schematictext.md)
- [`<silkscreencircle />`](./elements/silkscreencircle.md)
- [`<silkscreenline />`](./elements/silkscreenline.md)
- [`<silkscreenpath />`](./elements/silkscreenpath.md)
- [`<silkscreenrect />`](./elements/silkscreenrect.md)
- [`<silkscreentext />`](./elements/silkscreentext.md)
- [`<smtpad />`](./elements/smtpad.md)
- [`<solderjumper />`](./elements/solderjumper.md)
- [`<subcircuit />`](./elements/subcircuit.md)
- [`<subpanel />`](./elements/subpanel.md)
- [`<switch />`](./elements/switch.md)
- [`<symbol />`](./elements/symbol.md)
- [`<testpoint />`](./elements/testpoint.md)
- [`<trace />`](./elements/trace.md)
- [`<tracehint />`](./elements/tracehint.md)
- [`<transistor />`](./elements/transistor.md)
- [`<via />`](./elements/via.md)
- [`<voltageprobe />`](./elements/voltageprobe.md)
- [`<voltagesource />`](./elements/voltagesource.md)
