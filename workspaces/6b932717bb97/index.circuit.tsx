import { NE555DR } from "./imports/NE555DR"
import { WJ500V_5_08_2P } from "./imports/WJ500V_5_08_2P"
import { KT_0603R } from "./imports/KT_0603R"

export default () => {
  return (
    <board width="40mm" height="30mm" layers={2}>
      {/* Power input screw terminal - left edge */}
      <WJ500V_5_08_2P
        name="PWR"
        pcbX={-15}
        pcbY={0}
        pcbRotation={270}
        silkscreenRefText="PWR"
      />

      {/* 555 Timer IC - center */}
      <NE555DR
        name="U1"
        pcbX={0}
        pcbY={0}
        silkscreenRefText="555"
      />

      {/* Timing resistors for ~1 Hz blink */}
      <resistor
        name="R1"
        resistance="68k"
        footprint="0603"
        pcbX={-5}
        pcbY={-8}
        pcbRotation={90}
        silkscreenRefText="R1 68K"
      />

      <resistor
        name="R2"
        resistance="68k"
        footprint="0603"
        pcbX={-5.5882352941176485}
        pcbY={8.000000000000004}
        pcbRotation={90}
        silkscreenRefText="R2 68K"
      />

      {/* Timing capacitor for ~1 Hz */}
      <capacitor
        name="C1"
        capacitance="10uF"
        footprint="0805"
        pcbX={5}
        pcbY={8}
        silkscreenRefText="C1 10uF"
      />

      {/* Decoupling capacitor */}
      <capacitor
        name="C2"
        capacitance="100nF"
        footprint="0603"
        pcbX={10}
        pcbY={0}
        silkscreenRefText="C2 100nF"
      />

      {/* LED current limiting resistor */}
      <resistor
        name="R3"
        resistance="330"
        footprint="0603"
        pcbX={5}
        pcbY={-10}
        pcbRotation={90}
        silkscreenRefText="R3 330R"
      />

      {/* Red LED - near top edge */}
      <KT_0603R
        name="LED1"
        pcbX={10}
        pcbY={-10}
        pcbRotation={90}
        silkscreenRefText="LED"
      />

      {/* Power connections */}
      <trace from=".PWR > .pin1" to=".U1 > .VCC" />
      <trace from=".PWR > .pin1" to=".C2 > .pos" />

      <trace from=".PWR > .pin2" to=".U1 > .GND" />
      <trace from=".PWR > .pin2" to=".C2 > .neg" />
      <trace from=".PWR > .pin2" to=".C1 > .neg" />

      {/* 555 astable configuration */}
      <trace from=".U1 > .DISCH" to=".R1 > .pin1" />
      <trace from=".R1 > .pin2" to=".U1 > .VCC" />

      <trace from=".U1 > .THRES" to=".U1 > .DISCH" />
      <trace from=".U1 > .THRES" to=".R2 > .pin1" />

      <trace from=".R2 > .pin2" to=".U1 > .TRIG" />
      <trace from=".R2 > .pin2" to=".C1 > .pos" />

      {/* Control pin to ground via C2 (optional, for noise immunity) */}
      <trace from=".U1 > .CONT" to=".C2 > .neg" />

      {/* Reset pin high */}
      <trace from=".U1 > .RST" to=".U1 > .VCC" />

      {/* LED output */}
      <trace from=".U1 > .OUT" to=".R3 > .pin1" />
      <trace from=".R3 > .pin2" to=".LED1 > .anode" />
      <trace from=".LED1 > .cathode" to=".U1 > .GND" />
    </board>
  )
}
