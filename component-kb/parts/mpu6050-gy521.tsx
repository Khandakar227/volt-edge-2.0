/**
 * MPU-6050 IMU — GY-521 breakout board (the common module) as a single placeable part.
 * Single <chip> + custom THT footprint => one schematic symbol + correct PCB.
 *
 * Body: ~21.2 x 16.4 mm. One 8-pin 0.1" (2.54mm) header. Pinout = standard GY-521:
 *   VCC, GND, SCL, SDA, XDA, XCL, AD0, INT
 *   - VCC: 3-5V (onboard regulator)      - SCL/SDA: I2C
 *   - XDA/XCL: auxiliary I2C master      - AD0: I2C address LSB select
 *   - INT: data-ready interrupt
 *
 * NOTE: this is the GY-521 *module*. For the bare InvenSense MPU-6050 IC, use a
 * QFN-24 (4x4mm, 0.5mm pitch) chip with the datasheet pinout instead — different part.
 */

const PITCH = 2.54
const PINS = ["VCC", "GND", "SCL", "SDA", "XDA", "XCL", "AD0", "INT"] // GY-521 header order

export const Mpu6050Gy521 = (props: { name: string;[key: string]: any }) => {
  const n = PINS.length
  const holes = PINS.map((label, i) => ({
    pin: i + 1,
    label,
    x: (i - (n - 1) / 2) * PITCH,
    y: 6, // single row along the top edge
  }))
  return (
    <chip
      {...props}
      pinLabels={Object.fromEntries(holes.map((h) => [`pin${h.pin}`, h.label]))}
      footprint={
        <footprint>
          {holes.map((h) => (
            <platedhole
              key={h.pin}
              portHints={[`pin${h.pin}`]}
              shape="circle"
              holeDiameter="1mm"
              outerDiameter="1.8mm"
              pcbX={h.x}
              pcbY={h.y}
            />
          ))}
        </footprint>
      }
    />
  )
}

// Standalone preview — run this file directly in the Playground.
export default () => (
  <board width="21.2mm" height="16.4mm">
    <Mpu6050Gy521 name="MPU6050-GY521" />
  </board>
)
