import { type FormEvent, useState } from "react"
import {
  ArrowRight,
  Bot,
  CircuitBoard,
  Code2,
  Cpu,
  Layers3,
  Play,
  Route,
  Sparkles,
  Zap,
} from "lucide-react"
import heroWorkspace from "../../../docs/images/Pasted image.png"
import workspaceSchematic from "../../../docs/images/Pasted image (2).png"
import workspace3d from "../../../docs/images/Pasted image (3).png"
import pcbPreview from "../../../docs/images/555-blinker-pcb.png"
import schematicPreview from "../../../docs/images/555-blinker-schematic.png"
import threeDPreview from "../../../docs/images/555-blinker-3d.png"

const previews = [
  {
    id: "pcb",
    title: "PCB",
    meta: "2-layer route",
    image: pcbPreview,
    alt: "VoltEdge PCB layout preview for a 555 blinker board",
  },
  {
    id: "schematic",
    title: "Schematic",
    meta: "Generated netlist",
    image: schematicPreview,
    alt: "VoltEdge schematic preview for a 555 blinker circuit",
  },
  {
    id: "3d",
    title: "3D",
    meta: "Board render",
    image: threeDPreview,
    alt: "VoltEdge 3D board render for a 555 blinker board",
  },
] as const

const productViews = [
  {
    title: "Agent transcript",
    caption: "Every decision, edit, build, and checkpoint stays visible.",
    image: heroWorkspace,
    alt: "VoltEdge workspace showing chat and PCB preview",
  },
  {
    title: "Schematic view",
    caption: "Review generated circuits without leaving the browser.",
    image: workspaceSchematic,
    alt: "VoltEdge workspace showing chat and schematic preview",
  },
  {
    title: "3D review",
    caption: "Inspect placement and physical layout before fabrication.",
    image: workspace3d,
    alt: "VoltEdge workspace showing chat and 3D board preview",
  },
] as const

const starterPrompts = [
  "Create a 555 timer LED blinker board with a 5V screw terminal, red status LED, silkscreen labels, and a 2-layer PCB around 40 x 30 mm.",
  "Design an ESP32 sensor node with USB-C power, I2C header, status LEDs, and a compact 2-layer PCB.",
  "Make an Arduino shield with four protected outputs, labeled connectors, and clean schematic plus PCB previews.",
]

const stats = [
  ["~0.5s", "workspace scaffold"],
  ["3 views", "schematic, PCB, 3D"],
  ["1 prompt", "to routed board"],
] as const

const features = [
  {
    icon: Bot,
    title: "Agent-led design",
    text: "Describe the board, then watch VoltEdge source parts, edit tscircuit code, build, validate, and checkpoint the result.",
  },
  {
    icon: Code2,
    title: "Hardware as code",
    text: "Every board is TypeScript, so circuit changes are inspectable, repeatable, and ready for the same review habits as software.",
  },
  {
    icon: Route,
    title: "Browser iteration",
    text: "RunFrame previews keep schematic, PCB, and 3D review close to the chat, with drag-to-edit placement for quick refinements.",
  },
] as const

export function HomePage({
  onLaunch,
  onSubmitPrompt,
}: {
  onLaunch: () => void
  onSubmitPrompt: (prompt: string) => void
}) {
  const [activePreview, setActivePreview] = useState<(typeof previews)[number]["id"]>(
    "pcb",
  )
  const [prompt, setPrompt] = useState(starterPrompts[0])
  const selectedPreview =
    previews.find((preview) => preview.id === activePreview) ?? previews[0]

  const submitPrompt = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const text = prompt.trim()
    if (!text) return
    onSubmitPrompt(text)
  }

  return (
    <main className="min-h-screen bg-[#f5f7f4] text-[#111418]">
      <section className="relative min-h-[82vh] overflow-hidden bg-[#101418] text-white">
        <img
          src={heroWorkspace}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-[61%_center]"
        />
        <div className="absolute inset-0 bg-[#07090c]/70" />
        <div className="absolute inset-y-0 left-0 w-full bg-[linear-gradient(90deg,rgba(7,9,12,0.96)_0%,rgba(7,9,12,0.82)_42%,rgba(7,9,12,0.3)_100%)]" />

        <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
          <button
            onClick={onLaunch}
            className="flex items-center gap-2 text-left text-white"
          >
            <span className="grid h-9 w-9 place-items-center rounded-md border border-white/20 bg-white/10">
              <Zap size={19} />
            </span>
            <span>
              <span className="block text-base font-semibold">VoltEdge</span>
              <span className="block text-xs text-white/68">AI circuit studio</span>
            </span>
          </button>

          <div className="hidden items-center gap-6 text-sm text-white/72 md:flex">
            <a href="#workflow" className="hover:text-white">
              Workflow
            </a>
            <a href="#previews" className="hover:text-white">
              Previews
            </a>
            <a href="#examples" className="hover:text-white">
              Examples
            </a>
          </div>

          <button
            onClick={onLaunch}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-white/18 bg-white px-3.5 text-sm font-semibold text-[#101418] shadow-lg shadow-black/20 hover:bg-[#eef4ff]"
          >
            <CircuitBoard size={16} />
            Open workspace
          </button>
        </nav>

        <div className="relative z-10 mx-auto flex min-h-[calc(82vh-76px)] max-w-7xl flex-col justify-center px-5 pb-14 pt-12 sm:px-8 lg:px-10">
          <div className="max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 border border-white/18 bg-white/10 px-3 py-1.5 text-sm text-white/84 backdrop-blur">
              <Sparkles size={15} />
              Natural-language PCB design on tscircuit
            </div>
            <h1 className="max-w-2xl text-5xl font-semibold leading-[1.02] text-white sm:text-6xl lg:text-7xl">
              VoltEdge
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-white/78 sm:text-xl">
              Chat with an agent that turns circuit ideas into real TypeScript
              boards, renders schematic, PCB, and 3D views, then keeps every
              iteration in one fast workspace.
            </p>

            <form
              onSubmit={submitPrompt}
              className="mt-8 max-w-2xl rounded-lg border border-white/18 bg-white/94 p-2 shadow-2xl shadow-black/25"
            >
              <label className="sr-only" htmlFor="home-prompt">
                Circuit prompt
              </label>
              <textarea
                id="home-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={3}
                className="min-h-24 w-full resize-none rounded-md border border-[#d6dde8] bg-white px-3 py-3 text-sm leading-6 text-[#111418] outline-none focus:border-[#2563eb]"
              />
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  {starterPrompts.slice(0, 2).map((sample, index) => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => setPrompt(sample)}
                      className="rounded-md border border-[#d8dfeb] px-2.5 py-1.5 text-xs font-medium text-[#435064] hover:border-[#2563eb] hover:text-[#174ea6]"
                    >
                      Prompt {index + 1}
                    </button>
                  ))}
                </div>
                <button
                  type="submit"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#2563eb] px-4 text-sm font-semibold text-white hover:bg-[#174ea6]"
                >
                  <Play size={15} />
                  Start build
                </button>
              </div>
            </form>

            <div className="mt-7 grid max-w-2xl grid-cols-3 gap-3">
              {stats.map(([value, label]) => (
                <div
                  key={label}
                  className="border border-white/14 bg-white/10 px-3 py-3 backdrop-blur"
                >
                  <div className="text-xl font-semibold text-white">{value}</div>
                  <div className="mt-1 text-xs text-white/64">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        id="workflow"
        className="border-y border-[#d8ded9] bg-white px-5 py-12 sm:px-8 lg:px-10"
      >
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <article
                key={feature.title}
                className="rounded-lg border border-[#d8ded9] bg-[#fbfcfb] p-5"
              >
                <div className="mb-5 grid h-10 w-10 place-items-center rounded-md bg-[#111418] text-white">
                  <Icon size={19} />
                </div>
                <h2 className="text-lg font-semibold text-[#111418]">
                  {feature.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-[#5d6675]">
                  {feature.text}
                </p>
              </article>
            )
          })}
        </div>
      </section>

      <section id="previews" className="px-5 py-16 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
            <div>
              <div className="inline-flex items-center gap-2 border border-[#cdd6df] bg-white px-3 py-1.5 text-sm text-[#435064]">
                <Layers3 size={15} />
                Live review loop
              </div>
              <h2 className="mt-5 max-w-xl text-3xl font-semibold leading-tight text-[#111418] sm:text-4xl">
                Move from prompt to board without changing tools.
              </h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-[#5d6675]">
                Inspired by developer-first hardware workflows, VoltEdge keeps
                the chat, generated source, build events, and visual board
                outputs close together.
              </p>

              <div className="mt-7 flex flex-wrap gap-2">
                {previews.map((preview) => (
                  <button
                    key={preview.id}
                    type="button"
                    onClick={() => setActivePreview(preview.id)}
                    className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold ${
                      activePreview === preview.id
                        ? "border-[#111418] bg-[#111418] text-white"
                        : "border-[#ccd6df] bg-white text-[#435064] hover:border-[#2563eb]"
                    }`}
                  >
                    <Cpu size={15} />
                    {preview.title}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-[#cbd4dd] bg-[#111418] p-2 shadow-xl shadow-[#2b3b4b]/15">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-3 py-2 text-xs text-white/62">
                <span className="font-medium text-white">555-blinker.circuit.tsx</span>
                <span>{selectedPreview.meta}</span>
              </div>
              <div className="aspect-[1.24] overflow-hidden bg-white">
                <img
                  src={selectedPreview.image}
                  alt={selectedPreview.alt}
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="examples" className="bg-[#101418] px-5 py-16 text-white sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <div className="inline-flex items-center gap-2 border border-white/14 bg-white/8 px-3 py-1.5 text-sm text-white/72">
                <CircuitBoard size={15} />
                Real workspace captures
              </div>
              <h2 className="mt-5 max-w-2xl text-3xl font-semibold leading-tight sm:text-4xl">
                See the agent, board, and review panes in the same place.
              </h2>
            </div>
            <button
              onClick={onLaunch}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-[#101418] hover:bg-[#eef4ff]"
            >
              <ArrowRight size={16} />
              Launch VoltEdge
            </button>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {productViews.map((view) => (
              <article
                key={view.title}
                className="overflow-hidden rounded-lg border border-white/12 bg-white/8"
              >
                <div className="aspect-[1.45] overflow-hidden bg-white">
                  <img
                    src={view.image}
                    alt={view.alt}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="p-4">
                  <h3 className="text-base font-semibold">{view.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/64">
                    {view.caption}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
