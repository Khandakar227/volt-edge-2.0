import { ArduinoNano } from "./parts/arduino-nano"
import { Mpu6050Gy521 } from "./parts/mpu6050-gy521"

export default () => (
  <board width="90mm" height="90mm">
    <ArduinoNano name="U1" pcbX={0.7790193842645436} pcbY={-0.6919802356518545} />
    <Mpu6050Gy521 name="MPU1" pcbX={1.4427651528394208} pcbY={-23.817757211714508} />
    <Mpu6050Gy521 name="MPU2" pcbX={-0.09791607788736201} pcbY={22.37439434521934} />

    {/* I2C Bus - both MPU6050s share SCL and SDA */}
    <trace from=".U1 > .A4" to=".MPU1 > .SDA" />
    <trace from=".U1 > .A4" to=".MPU2 > .SDA" />
    <trace from=".U1 > .A5" to=".MPU1 > .SCL" />
    <trace from=".U1 > .A5" to=".MPU2 > .SCL" />

    {/* Power connections */}
    <trace from=".U1 > .5V" to=".MPU1 > .VCC" />
    <trace from=".U1 > .5V" to=".MPU2 > .VCC" />
    <trace from=".U1 > .GND" to=".MPU1 > .GND" />
    <trace from=".U1 > .GND" to=".MPU2 > .GND" />

    {/* Address differentiation: MPU1 at 0x68 (AD0=LOW), MPU2 at 0x69 (AD0=HIGH) */}
    <trace from=".MPU1 > .AD0" to=".U1 > .GND" />
    <trace from=".MPU2 > .AD0" to=".U1 > .5V" />
  </board>
)
