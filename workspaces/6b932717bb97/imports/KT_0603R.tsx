import type { LedProps } from "@tscircuit/props"

export const KT_0603R = (props: LedProps) => {
  const { name = "LED1", ...restProps } = props

  return (
    <led
      name={name}
      supplierPartNumbers={{
  "jlcpcb": [
    "C2286"
  ]
}}
      manufacturerPartNumber="KT_0603R"
      footprint={<footprint>
        <smtpad portHints={["pin2"]} pcbX="-0.750062mm" pcbY="0mm" width="0.7999984mm" height="0.7999984mm" shape="rect" />
<smtpad portHints={["pin1"]} pcbX="0.750062mm" pcbY="0mm" width="0.7999984mm" height="0.7999984mm" shape="rect" />
<silkscreenpath route={[{"x":0.20063460000005762,"y":0.7010653999999477},{"x":1.4706346000000394,"y":0.7010653999999477},{"x":1.4706346000000394,"y":-0.7010146000001214},{"x":0.20063460000005762,"y":-0.7010146000001214}]} />
<silkscreenpath route={[{"x":0.08994139999992967,"y":0.0020065999999587802},{"x":-0.11892280000006394,"y":0.00015239999993355013}]} />
<silkscreenpath route={[{"x":-0.30005019999998694,"y":0.7000747999998111},{"x":-1.400022599999943,"y":0.7000747999998111},{"x":-1.7000474000000168,"y":0.39999919999991107},{"x":-1.7000474000000168,"y":-0.3999484000000848},{"x":-1.400022599999943,"y":-0.7000240000000986}]} />
<silkscreenpath route={[{"x":-1.400022599999943,"y":-0.7000240000000986},{"x":-0.30005019999998694,"y":-0.7000240000000986}]} />
<silkscreenpath route={[{"x":0.08994139999992967,"y":0.39999919999991107},{"x":0.08994139999992967,"y":-0.37998400000014954}]} />
<silkscreentext text="{NAME}" pcbX="-0.109982mm" pcbY="1.69596mm" anchorAlignment="center" fontSize="1mm" />
<courtyardoutline outline={[{"x":-1.9474820000000364,"y":0.9459599999999},{"x":1.7275180000000319,"y":0.9459599999999},{"x":1.7275180000000319,"y":-0.9510400000000345},{"x":-1.9474820000000364,"y":-0.9510400000000345},{"x":-1.9474820000000364,"y":0.9459599999999}]} />
      </footprint>}
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C2286.obj?uuid=0da0275bf7a84667bce8747a921fb9e3",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C2286.step?uuid=0da0275bf7a84667bce8747a921fb9e3",
        pcbRotationOffset: 0,
        modelOriginPosition: { x: 0.000050799999826267594, y: -0.00005079999993995443, z: -0.01 },
      }}
      {...restProps}
    />
  )
}