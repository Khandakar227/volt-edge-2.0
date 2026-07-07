import { Esp32C3SuperMini } from "./parts/esp32-c3-supermini"
import { Mpu6050Gy521 } from "./parts/mpu6050-gy521"

export default () => (
  <board width="80mm" height="50mm">
    {/* Main microcontroller */}
    <Esp32C3SuperMini name="U1" pcbX={15} pcbY={15} />

    {/* Motion sensor */}
    <Mpu6050Gy521 name="U2" pcbX={42} pcbY={15} />

    {/* Voltage regulator */}
    <chip
      name="U3"
      footprint="sot223"
      pinLabels={{ 1: "GND", 2: "OUT", 3: "IN", 4: "GND" }}
      manufacturerPartNumber="AMS1117-3.3"
      pcbX={12} pcbY={35}
    />

    {/* Power connector */}
    <pinheader name="J1" pinCount={2} pitch="2.54mm" pcbX={4} pcbY={35} />

    {/* Expansion connector */}
    <pinheader name="J2" pinCount={3} pitch="2.54mm" pcbX={62} pcbY={35} />

    {/* Decoupling capacitors */}
    <capacitor name="C1" capacitance="10uF" footprint="0805" pcbX={22} pcbY={35} />
    <capacitor name="C2" capacitance="100nF" footprint="0603" pcbX={28} pcbY={15} />

    {/* I2C pull-ups */}
    <resistor name="R1" resistance="4.7k" footprint="0603" pcbX={35} pcbY={25} />
    <resistor name="R2" resistance="4.7k" footprint="0603" pcbX={42} pcbY={25} />

    {/* Status LED */}
    <resistor name="R3" resistance="330" footprint="0603" pcbX={62} pcbY={15} />
    <led name="D1" footprint="0805" pcbX={70} pcbY={15} />

    {/* Power */}
    <trace from=".J1 > .pin1" to=".U3 > .IN" />
    <trace from=".U3 > .OUT" to=".U1 > .3V3" />
    <trace from=".U3 > .OUT" to=".U2 > .VCC" />
    <trace from=".U3 > .OUT" to=".C1 > .pos" />

    {/* Ground */}
    <trace from=".J1 > .pin2" to=".U3 > .GND" />
    <trace from=".U3 > .GND" to=".U1 > .GND" />
    <trace from=".U1 > .GND" to=".U2 > .GND" />
    <trace from=".U2 > .GND" to=".C1 > .neg" />
    <trace from=".C1 > .neg" to=".C2 > .pin2" />
    <trace from=".C2 > .pin2" to=".D1 > .cathode" />

    {/* I2C */}
    <trace from=".U1 > .IO8" to=".U2 > .SDA" />
    <trace from=".U1 > .IO9" to=".U2 > .SCL" />
    <trace from=".U3 > .OUT" to=".R1 > .pin1" />
    <trace from=".U3 > .OUT" to=".R2 > .pin1" />
    <trace from=".R1 > .pin2" to=".U2 > .SDA" />
    <trace from=".R2 > .pin2" to=".U2 > .SCL" />

    {/* Decoupling */}
    <trace from=".C2 > .pin1" to=".U1 > .3V3" />

    {/* LED */}
    <trace from=".U1 > .IO10" to=".R3 > .pin1" />
    <trace from=".R3 > .pin2" to=".D1 > .anode" />

    {/* Expansion */}
    <trace from=".U1 > .IO0" to=".J2 > .pin1" />
    <trace from=".U3 > .OUT" to=".J2 > .pin2" />
    <trace from=".U3 > .GND" to=".J2 > .pin3" />
  </board>
)
