import type { ChipProps } from "@tscircuit/props"

const pinLabels = {
  pin1: ["CLKIN"],
  pin2: ["NC1"],
  pin3: ["NC2"],
  pin4: ["NC3"],
  pin5: ["NC4"],
  pin6: ["AUX_DA"],
  pin7: ["AUX_CL"],
  pin8: ["VLOGIC"],
  pin9: ["AD0"],
  pin10: ["REGOUT"],
  pin11: ["FSYNC"],
  pin12: ["INT"],
  pin13: ["VDD"],
  pin14: ["NC5"],
  pin15: ["NC6"],
  pin16: ["NC7"],
  pin17: ["NC8"],
  pin18: ["GND"],
  pin19: ["RESV1"],
  pin20: ["CPOUT"],
  pin21: ["RESV2"],
  pin22: ["RESV3"],
  pin23: ["SCL"],
  pin24: ["SDA"],
  pin25: ["EP"]
} as const

export const MPU_6050 = (props: ChipProps<typeof pinLabels>) => {
  return (
    <chip
      pinLabels={pinLabels}
      supplierPartNumbers={{
  "jlcpcb": [
    "C24112"
  ]
}}
      manufacturerPartNumber="MPU_6050"
      footprint={<footprint>
        <smtpad portHints={["pin1"]} pcbX="-1.249934mm" pcbY="-1.999996mm" width="0.2800096mm" height="0.7999984mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin2"]} pcbX="-0.750062mm" pcbY="-1.999996mm" width="0.2800096mm" height="0.7999984mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin3"]} pcbX="-0.249936mm" pcbY="-1.999996mm" width="0.2800096mm" height="0.7999984mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin4"]} pcbX="0.249936mm" pcbY="-1.999996mm" width="0.2800096mm" height="0.7999984mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin5"]} pcbX="0.750062mm" pcbY="-1.999996mm" width="0.2800096mm" height="0.7999984mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin6"]} pcbX="1.249934mm" pcbY="-1.999996mm" width="0.2800096mm" height="0.7999984mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin7"]} pcbX="1.999996mm" pcbY="-1.249934mm" width="0.7999984mm" height="0.2800096mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin8"]} pcbX="1.999996mm" pcbY="-0.750062mm" width="0.7999984mm" height="0.2800096mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin9"]} pcbX="1.999996mm" pcbY="-0.249936mm" width="0.7999984mm" height="0.2800096mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin10"]} pcbX="1.999996mm" pcbY="0.249936mm" width="0.7999984mm" height="0.2800096mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin11"]} pcbX="1.999996mm" pcbY="0.750062mm" width="0.7999984mm" height="0.2800096mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin12"]} pcbX="1.999996mm" pcbY="1.249934mm" width="0.7999984mm" height="0.2800096mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin13"]} pcbX="1.249934mm" pcbY="1.999996mm" width="0.2800096mm" height="0.7999984mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin14"]} pcbX="0.750062mm" pcbY="1.999996mm" width="0.2800096mm" height="0.7999984mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin15"]} pcbX="0.249936mm" pcbY="1.999996mm" width="0.2800096mm" height="0.7999984mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin16"]} pcbX="-0.249936mm" pcbY="1.999996mm" width="0.2800096mm" height="0.7999984mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin17"]} pcbX="-0.750062mm" pcbY="1.999996mm" width="0.2800096mm" height="0.7999984mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin18"]} pcbX="-1.24206mm" pcbY="1.999996mm" width="0.2800096mm" height="0.7999984mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin19"]} pcbX="-1.999996mm" pcbY="1.249934mm" width="0.7999984mm" height="0.2800096mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin20"]} pcbX="-1.999996mm" pcbY="0.750062mm" width="0.7999984mm" height="0.2800096mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin21"]} pcbX="-1.999996mm" pcbY="0.249936mm" width="0.7999984mm" height="0.2800096mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin22"]} pcbX="-1.999996mm" pcbY="-0.249936mm" width="0.7999984mm" height="0.2800096mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin23"]} pcbX="-1.999996mm" pcbY="-0.750062mm" width="0.7999984mm" height="0.2800096mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin24"]} pcbX="-1.999996mm" pcbY="-1.249934mm" width="0.7999984mm" height="0.2800096mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin25"]} pcbX="0.012446mm" pcbY="0mm" width="2.6999946mm" height="2.6999946mm" shape="rect" />
<silkscreenpath route={[{"x":2.162530599999968,"y":-1.7500599999998485},{"x":2.162530599999968,"y":-2.150160799999867},{"x":1.7625060000000303,"y":-2.150160799999867}]} />
<silkscreenpath route={[{"x":-1.7376394000000346,"y":-2.150160799999867},{"x":-2.1376132000000325,"y":-2.150160799999867},{"x":-2.1376132000000325,"y":-1.7500599999998485}]} />
<silkscreenpath route={[{"x":-2.1376132000000325,"y":1.7500092000000222},{"x":-2.1376132000000325,"y":2.1501100000000406},{"x":-1.7376394000000346,"y":2.1501100000000406}]} />
<silkscreenpath route={[{"x":2.162530599999968,"y":1.7500092000000222},{"x":2.162530599999968,"y":2.1501100000000406},{"x":1.7625060000000303,"y":2.1501100000000406}]} />
<silkscreentext text="{NAME}" pcbX="-0.000254mm" pcbY="3.394458mm" anchorAlignment="center" fontSize="1mm" />
<courtyardoutline outline={[{"x":-2.650553999999943,"y":2.6444580000002134},{"x":2.6500460000000885,"y":2.6444580000002134},{"x":2.6500460000000885,"y":-3.0371419999999034},{"x":-2.650553999999943,"y":-3.0371419999999034},{"x":-2.650553999999943,"y":2.6444580000002134}]} />
      </footprint>}
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C24112.obj?uuid=78358972877945cb927aaf48cb6c1c63",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C24112.step?uuid=78358972877945cb927aaf48cb6c1c63",
        pcbRotationOffset: 0,
        modelOriginPosition: { x: 0, y: 0, z: 0 },
      }}
      {...props}
    />
  )
}