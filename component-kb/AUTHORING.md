---
name: components-authoring
description: How to author a NEW tscircuit part correctly from its datasheet when it is in no existing source. Dimensions, footprint, and pinout must match the real part.
---

# Authoring a new part from its datasheet

Reach this ONLY after the local library, tscircuit registry, `@tscircuit/common`,
and JLCPCB/LCSC have all been checked and missed. Getting a hand-modeled part right
means the pinout, body dimensions, and footprint all match the real datasheet.

## 1. Research (bounded)

Find the **exact part number's** datasheet. Preferred order, stop early:

1. Manufacturer datasheet PDF (TI, ST, NXP, Microchip, …) — ground truth for the
   pinout table and mechanical (body) dimensions.
2. Octopart / DigiKey / Mouser — to locate the datasheet + parametric data fast.
3. SnapEDA — structured symbol/footprint/pinout, often HTML (easier than a PDF).
4. General web search — only if 1–3 miss.

Budget: ~1–2 `WebSearch` calls, then `WebFetch` the best hit and read it. If a page
is a PDF that `WebFetch` cannot read well, download it with
`curl -sL "<url>" -o /tmp/ds.pdf` and `Read` the local file. Do not keep searching
once you have the datasheet. **If no datasheet can be found, STOP and ask the user.**

## 2. Extract

- The **pinout table**: physical pin № → primary signal (+ aliases). Never renumber.
- The **package** (e.g. SOIC-8, SOT-23-5, QFN-32, DIP-8) and **body dimensions** (mm),
  plus pin **pitch** for header modules.

## 3. Author one `<chip>` in `./parts/<slug>.tsx`

Match the shape of the existing library parts (see the catalog files):

- A header comment stating the part №, package, body dimensions, the full pinout, the
  **datasheet URL**, and any "verify against silkscreen" caveats for clone boards.
- `pinLabels` keyed by physical pin (`pin1`, `pin2`, …) exactly as the datasheet numbers.
- `pinAttributes` tagging power/ground/must-connect pins.
- A named export `(props) => <chip {...props} footprint=... pinLabels=... />`.
- A `default` export wrapping it in a standalone `<board>` for preview.

### Footprint

- **Standard IC package** → a **footprinter string**, never hand-placed pads:
  `soic8_p1.27mm`, `sot23_5`, `qfn32_p0.5mm`, `dip8`, `tssop20`, … The datasheet gives
  you the package + pin count; footprinter generates correct geometry.
- **Header / breakout module** → a `<platedhole>` grid at the real pitch (2.54 mm
  typical), **centered on the origin** (the origin is the drag anchor — an off-center
  footprint offsets every drag).

## 4. Verify before showing the user

Run:

```
node .claude/skills/tscircuit/scripts/verify_part.mjs parts/<slug>.tsx
```

It builds the part and checks pin-count vs pad-count, sane dimensions, and a clean
build. Fix any reported problem (within the 3-round iteration budget) and re-run.

## 5. Confirm with the user

Once verify passes, write `.voltedge/pending-part.json`:

```json
{
  "slug": "sn74hc595",
  "manufacturer": "Texas Instruments",
  "part_number": "SN74HC595",
  "package": "SOIC-16",
  "dimensions": "9.9 x 3.9 mm",
  "footprint": "soic16_p1.27mm",
  "datasheet_url": "https://www.ti.com/lit/ds/symlink/sn74hc595.pdf",
  "pinLabels": { "pin1": "QB", "pin2": "QC", "...": "..." }
}
```

Then STOP (end your turn). The user reviews a Part Card and confirms, edits, or
rejects; your next turn wires the confirmed part into `index.circuit.tsx`.
