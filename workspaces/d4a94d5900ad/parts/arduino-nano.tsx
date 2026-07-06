/**
 * Arduino Nano (V3, ATmega328P) — dev board as a single placeable tscircuit part.
 *
 * Body: 18 x 45 mm. 30 through-hole header pins @ 2.54mm pitch, two rows of 15
 * spaced 15.24mm (0.6") apart — the "DIP-30W" form factor. Footprint:
 * dip30_w15.24mm (auto-centered on the origin), with DIP counter-clockwise pin
 * numbering, which is exactly the Nano's canonical pin order:
 *   pin 1 = D1/TX at one top corner, down that row to pin 15 = D12, then
 *   pin 16 = D13 at the opposite bottom corner, up that row to pin 30 = VIN.
 *
 * Pinout (Gravitech/Arduino Nano V3 numbering) — RX0/TX1 double as D0/D1, and
 * the board has two RESET pins and two GND pins (each pair is the same net, so
 * wiring to `.GND` / `.RESET` reaches either pad).
 */

// PCB pin number (DIP-30, counter-clockwise) -> signal label(s).
const pinLabels = {
  pin1: ["D1", "TX1"],
  pin2: ["D0", "RX0"],
  pin3: "RESET",
  pin4: "GND",
  pin5: "D2",
  pin6: "D3",
  pin7: "D4",
  pin8: "D5",
  pin9: "D6",
  pin10: "D7",
  pin11: "D8",
  pin12: "D9",
  pin13: "D10",
  pin14: "D11",
  pin15: "D12",
  pin16: "D13",
  pin17: "3V3",
  pin18: "AREF",
  pin19: "A0",
  pin20: "A1",
  pin21: "A2",
  pin22: "A3",
  pin23: "A4",
  pin24: "A5",
  pin25: "A6",
  pin26: "A7",
  pin27: "5V",
  pin28: "RESET",
  pin29: "GND",
  pin30: "VIN",
}

/** Placeable part: <ArduinoNano name="U1" /> — wire by label, e.g. .U1 > .D13 */
export const ArduinoNano = (props: { name: string; [key: string]: any }) => (
  <chip {...props} footprint="dip30_w15.24mm" pinLabels={pinLabels} />
)

// Standalone preview — run this file directly in the Playground.
export default () => (
  <board width="18mm" height="45mm">
    <ArduinoNano name="U1" />
  </board>
)
