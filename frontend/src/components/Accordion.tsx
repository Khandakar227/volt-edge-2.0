import * as RadixAccordion from "@radix-ui/react-accordion"
import { ChevronRight } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "../lib/utils"

/** A single collapsible accordion item, collapsed by default. */
export function Accordion({
  header,
  children,
  className,
}: {
  header: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <RadixAccordion.Root type="single" collapsible className={cn("my-1", className)}>
      <RadixAccordion.Item value="item">
        <RadixAccordion.Header>
          <RadixAccordion.Trigger
            className={cn(
              "group flex w-full items-center gap-1.5 rounded-md px-1.5 py-1",
              "text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors",
            )}
          >
            <ChevronRight
              size={12}
              className="transition-transform duration-150 group-data-[state=open]:rotate-90"
            />
            {header}
          </RadixAccordion.Trigger>
        </RadixAccordion.Header>
        <RadixAccordion.Content className="acc-content overflow-hidden">
          <div className="pt-1">{children}</div>
        </RadixAccordion.Content>
      </RadixAccordion.Item>
    </RadixAccordion.Root>
  )
}
