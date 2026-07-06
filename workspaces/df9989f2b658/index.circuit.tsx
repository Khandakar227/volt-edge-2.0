export default () => (
  <board width="70mm" height="35mm">
    {/* ESP32-C3 SuperMini dev board */}
    <group name="ESP32" pcbX={-20}>
      <pinheader
        name="J1"
        pinCount={8}
        pitch="2.54mm"
        footprint="pinrow8"
        gender="male"
        schFacingDirection="left"
        showSilkscreenPinLabels={true}
        pinLabels={["5V", "GND", "3V3", "GPIO4", "GPIO3", "GPIO2", "GPIO1", "GPIO0"]}
        pcbX={-7.62}
        pcbY={0}
        pcbRotation={90}
      />
      <pinheader
        name="J2"
        pinCount={8}
        pitch="2.54mm"
        footprint="pinrow8"
        gender="male"
        schFacingDirection="right"
        showSilkscreenPinLabels={true}
        pinLabels={["GPIO5", "GPIO6", "GPIO7", "GPIO8", "GPIO9", "GPIO10", "GPIO20", "GPIO21"]}
        pcbX={7.62}
        pcbY={0}
        pcbRotation={90}
      />
    </group>

    {/* MPU6050 GY-521 breakout */}
    <pinheader
      name="MPU6050"
      pinCount={8}
      pitch="2.54mm"
      footprint="pinrow8"
      gender="male"
      schFacingDirection="right"
      showSilkscreenPinLabels={true}
      pinLabels={["VCC", "GND", "SCL", "SDA", "XDA", "XCL", "AD0", "INT"]}
      pcbX={20}
      pcbY={5}
    />

    {/* Power connections */}
    <trace from=".J1 > .3V3" to=".MPU6050 > .VCC" />
    <trace from=".J1 > .GND" to=".MPU6050 > .GND" />

    {/* I2C connections */}
    <trace from=".J2 > .GPIO9" to=".MPU6050 > .SCL" />
    <trace from=".J2 > .GPIO8" to=".MPU6050 > .SDA" />
  </board>
)
