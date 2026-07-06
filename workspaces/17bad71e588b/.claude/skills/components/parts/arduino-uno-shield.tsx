const PITCH = 2.54
const HEADERS = [
  { labels: ["SCL", "SDA", "AREF", "GND", "D13", "D12", "D11", "D10", "D9", "D8"], cx: -10.92, y: 24 },
  { labels: ["D7", "D6", "D5", "D4", "D3", "D2", "D1", "D0"], cx: 13.46, y: 24 },
  { labels: ["NC", "IOREF", "RESET", "3V3", "5V", "GND", "GND", "VIN"], cx: -19, y: -24 },
  { labels: ["A0", "A1", "A2", "A3", "A4", "A5"], cx: 16, y: -24 },
]

export const ArduinoUnoShield = (props) => {
  let n = 0
  const holes = []
  for (const h of HEADERS)
    h.labels.forEach((label, i) => {
      n++
      holes.push({ pin: n, label, x: h.cx + (i - (h.labels.length - 1) / 2) * PITCH, y: h.y })
    })
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

export default () => (
  <board width="68.6mm" height="53.4mm">
    <ArduinoUnoShield name="A1" />
  </board>
)
