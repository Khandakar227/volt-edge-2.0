import { Brain } from "lucide-react"
import { Accordion } from "./Accordion"

export function ThinkingAccordion({ text }: { text: string }) {
  return (
    <Accordion
      header={
        <span className="flex items-center gap-1.5 italic">
          <Brain size={12} /> thinking
        </span>
      }
    >
      <pre className="italic whitespace-pre-wrap rounded-md bg-[var(--panel)] p-2 text-xs leading-relaxed text-[var(--muted)]">
        {text}
      </pre>
    </Accordion>
  )
}
