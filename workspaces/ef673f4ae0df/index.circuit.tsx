import { ArduinoShield } from "@tscircuit/common"
import { Mpu6050Gy521 } from "./parts/mpu6050-gy521"

export default () => (
  <ArduinoShield chipProps={{ name: "SHIELD" }}>
    <Mpu6050Gy521 name="IMU1" schX={2.2} schY={-3} pcbX={0} pcbY={-15} />

    {/* I2C connections - Arduino Uno I2C is on A4 (SDA) and A5 (SCL) */}
    <trace from=".A4" to=".IMU1 > .SDA" />
    <trace from=".SCL" to=".IMU1 > .SCL" />

    {/* Power and ground */}
    <trace from=".V5" to=".IMU1 > .VCC" />
    <trace from=".GND0" to=".IMU1 > .GND" />
  </ArduinoShield>
)
