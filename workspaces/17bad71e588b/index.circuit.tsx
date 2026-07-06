import { Esp32C3SuperMini } from "./parts/esp32-c3-supermini"
import { Mpu6050Gy521 } from "./parts/mpu6050-gy521"

export default () => (
  <board width="50mm" height="30mm">
    <Esp32C3SuperMini name="U1" pcbX={-13} pcbY={0} />
    <Mpu6050Gy521 name="U2" pcbX={-12.37} pcbY={13.2} />

    {/* Power connections */}
    <trace from=".U1 > .3V3" to=".U2 > .VCC" />
    <trace from=".U1 > .GND" to=".U2 > .GND" />

    {/* I2C connections */}
    <trace from=".U1 > .IO8" to=".U2 > .SCL" />
    <trace from=".U1 > .IO10" to=".U2 > .SDA" />
  </board>
)
