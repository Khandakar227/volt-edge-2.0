import { Esp32C3SuperMini } from "./parts/esp32-c3-supermini"
import { Mpu6050Gy521 } from "./parts/mpu6050-gy521"

export default () => (
  <board width="50mm" height="30mm" layers={1}>
    <Esp32C3SuperMini name="U1" schX={0.4} schY={0.8} pcbX={-12.866400798136269} pcbY={-0.8831761471882178} />
    <Mpu6050Gy521 name="U2" schX={0.4} schY={-0.9} pcbX={-12.62542992692596} pcbY={11.699999999999996} />

    {/* Power connections */}
    <trace from=".U1 > .3V3" to=".U2 > .VCC" thickness="0.5mm" />
    <trace from=".U1 > .GND" to=".U2 > .GND" thickness="0.5mm" />

    {/* I2C connections */}
    <trace from=".U1 > .IO8" to=".U2 > .SCL" thickness="0.4mm" />
    <trace from=".U1 > .IO10" to=".U2 > .SDA" thickness="0.4mm" />
  </board>
)
