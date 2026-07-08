import { ArduinoNano } from "./parts/arduino-nano"

export default () => (
  <board width="120mm" height="80mm">
    {/* Arduino Nano - centered */}
    <ArduinoNano
      name="U1" schX={3.4} schY={2.5}
      pcbX={-11.006196381853016}
      pcbY={3.886283412669343}
    />

    {/* Servo 1 - MG90 (left side, top) */}
    <pinheader
      name="SERVO1"
      schX={1.2} schY={-0.4}
      pinCount={3}
      pitch="2.54mm"
      pinLabels={["SIG", "VCC", "GND"]}
      pcbX={-11.288178986303265}
      pcbY={27.268011186643953}
    />

    {/* Servo 2 - MG90 (left side, middle) */}
    <pinheader
      name="SERVO2"
      schX={-1.7} schY={1}
      pinCount={3}
      pitch="2.54mm"
      pinLabels={["SIG", "VCC", "GND"]}
      pcbX={-11.11371658733065}
      pcbY={-20.18952764555108}
    />

    {/* External power supply connector (left side, bottom) */}
    <pinheader
      name="PWR" schX={-1.5} schY={3.2}
      pinCount={2}
      pitch="2.54mm"
      pinLabels={["VCC", "GND"]}
      pcbX={-24.54732130822176}
      pcbY={4.40590429794257}
    />

    {/* Signal wires: Servo 1 to D9, Servo 2 to D10 */}
    <trace from=".SERVO1 > .SIG" to=".U1 > .D9" />
    <trace from=".SERVO2 > .SIG" to=".U1 > .D10" />

    {/* Common ground net - all connect to GND */}
    <trace from=".U1 > .GND" to="net.GND" />
    <trace from=".SERVO1 > .GND" to="net.GND" />
    <trace from=".SERVO2 > .GND" to="net.GND" />
    <trace from=".PWR > .GND" to="net.GND" />

    {/* External power net - servos get power from external supply */}
    <trace from=".PWR > .VCC" to="net.SERVO_VCC" />
    <trace from=".SERVO1 > .VCC" to="net.SERVO_VCC" />
    <trace from=".SERVO2 > .VCC" to="net.SERVO_VCC" />
  </board>
)
