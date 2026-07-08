import { useResistor, useCapacitor, useLed } from "@tscircuit/core"

export default () => {
  return (
    <board width="50mm" height="40mm">
      <chip
        name="U1" schX={1.1} schY={2.9}
        footprint="dip8"
        pinLabels={{
          pin1: "GND",
          pin2: "TRIG",
          pin3: "OUT",
          pin4: "RESET",
          pin5: "CTRL",
          pin6: "THR",
          pin7: "DISCH",
          pin8: "VCC"
        }}
        pcbX={0}
        pcbY={0}
      />

      <resistor name="R1" schX={-2.4} schY={3.2} resistance="10k" footprint="0805" pcbX={-3.857848726719876} pcbY={-7.391866210566327} />
      <resistor name="R2" resistance="68k" footprint="0805" pcbX={-7.628278221208667} pcbY={-2} />
      <capacitor name="C1" schX={3} schY={2.8} capacitance="10uF" footprint="0805" pcbX={5.74306347396427} pcbY={-7.310908399847968} />
      <capacitor name="C2" capacitance="100nF" footprint="0805" pcbX={5.803876852907635} pcbY={7.310908399847964} />
      <led name="LED1" footprint="0805" pcbX={-7.50665146332193} pcbY={5.50665146332193} />
      <resistor name="R3" resistance="330" footprint="0805" pcbX={-1.0604332953249695} pcbY={6.5267958950969245} />

      <trace from=".U1 .pin8" to=".R1 .pin1" />
      <trace from=".R1 .pin2" to=".U1 .pin7" />
      <trace from=".U1 .pin7" to=".R2 .pin1" />
      <trace from=".R2 .pin2" to=".U1 .pin6" />
      <trace from=".U1 .pin6" to=".U1 .pin2" />
      <trace from=".U1 .pin6" to=".C1 .pin1" />
      <trace from=".C1 .pin2" to=".U1 .pin1" />

      <trace from=".U1 .pin4" to=".U1 .pin8" />

      <trace from=".U1 .pin5" to=".C2 .pin1" />
      <trace from=".C2 .pin2" to=".U1 .pin1" />

      <trace from=".U1 .pin3" to=".R3 .pin1" />
      <trace from=".R3 .pin2" to=".LED1 .anode" />
      <trace from=".LED1 .cathode" to=".U1 .pin1" />
    </board>
  )
}
