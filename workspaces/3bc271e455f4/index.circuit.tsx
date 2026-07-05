import { MPU_6050 } from "./imports/MPU_6050"
import { ESP32_WROOM_32E_N4 } from "./imports/ESP32_WROOM_32E_N4"

export default () => (
  <board width="50mm" height="40mm">
    <schematicsection name="MCU" schX={-15} schY={0}>
      <ESP32_WROOM_32E_N4
        name="U1"
        pcbX={-10}
        pcbY={0}
        schX={-15}
        schY={0}
        schSectionName="MCU"
      />
    </schematicsection>

    <schematicsection name="Sensor" schX={5} schY={0}>
      <MPU_6050
        name="U2"
        pcbX={10}
        pcbY={0}
        schX={5}
        schY={0}
        schSectionName="Sensor"
      />
    </schematicsection>

    <schematicsection name="Power" schX={-15} schY={-10}>
      {/* Power decoupling capacitors */}
      <capacitor
        name="C1"
        capacitance="100nF"
        footprint="0402"
        pcbX={0}
        pcbY={-12}
        schX={-15}
        schY={-10}
        schSectionName="Power"
      />
      <capacitor
        name="C2"
        capacitance="10uF"
        footprint="0805"
        pcbX={0}
        pcbY={12}
        schX={-10}
        schY={-10}
        schSectionName="Power"
      />
    </schematicsection>

    {/* I2C connections: ESP32 IO21 (SDA), IO22 (SCL) to MPU-6050 */}
    <trace name="SDA" from=".U1 > .IO21" to=".U2 > .SDA" />
    <trace name="SCL" from=".U1 > .IO22" to=".U2 > .SCL" />

    {/* Power connections for MPU-6050 */}
    <trace name="MPU_VDD" from=".U2 > .VDD" to="net.VCC" />
    <trace name="MPU_VLOGIC" from=".U2 > .VLOGIC" to="net.VCC" />
    <trace name="MPU_GND" from=".U2 > .GND" to="net.GND" />

    {/* Power connections for ESP32 */}
    <trace name="ESP32_3V3" from=".U1 > .3V3" to="net.VCC" />
    <trace name="ESP32_GND1" from=".U1 > .GND1" to="net.GND" />
    <trace name="ESP32_GND2" from=".U1 > .GND2" to="net.GND" />
    <trace name="ESP32_GND3" from=".U1 > .GND3" to="net.GND" />
    <trace name="ESP32_GND4" from=".U1 > .GND4" to="net.GND" />

    {/* Decoupling capacitors */}
    <trace name="C1_VCC" from=".C1 > .pin1" to="net.VCC" />
    <trace name="C1_GND" from=".C1 > .pin2" to="net.GND" />
    <trace name="C2_VCC" from=".C2 > .pin1" to="net.VCC" />
    <trace name="C2_GND" from=".C2 > .pin2" to="net.GND" />

    {/* MPU-6050 address select (AD0) - tie to GND for address 0x68 */}
    <trace name="AD0_GND" from=".U2 > .AD0" to="net.GND" />
  </board>
)
