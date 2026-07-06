import { Esp32C3SuperMini } from "./parts/esp32-c3-supermini"
import { Mpu6050Gy521 } from "./parts/mpu6050-gy521"

export default () => (
  <board width="60mm" height="40mm">
    <Esp32C3SuperMini name="U1" />
    <Mpu6050Gy521 name="MPU1"
      pcbX={0.758}
      pcbY={12.47}
    />
    <trace from=".U1 > .3V3" to=".MPU1 > .VCC" />
    <trace from=".U1 > .GND" to=".MPU1 > .GND" />
    <trace from=".U1 > .IO8" to=".MPU1 > .SDA" />
    <trace from=".U1 > .IO9" to=".MPU1 > .SCL" />
  </board>
)
