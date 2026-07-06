import type { ChatEvent } from "../api"
import { ThinkingAccordion } from "./ThinkingAccordion"
import { ToolCall, ToolResultError } from "./ToolCall"
import {
  AssistantText,
  CheckpointBanner,
  ErrorBanner,
  TurnFooter,
  UserBubble,
} from "./Message"

export function EventRow({ ev }: { ev: ChatEvent }) {
  switch (ev.type) {
    case "user":
      return <UserBubble text={ev.data.text ?? ""} />
    case "thinking":
      return <ThinkingAccordion text={ev.data.text ?? ""} />
    case "assistant_text":
      return <AssistantText text={ev.data.text ?? ""} />
    case "tool_use":
      return <ToolCall tool={ev.data.tool} input={ev.data.input ?? ""} />
    case "tool_result":
      return ev.data.ok ? null : (
        <ToolResultError summary={ev.data.summary ?? ""} />
      )
    case "checkpoint":
      return <CheckpointBanner version={ev.data.version} />
    case "error":
      return <ErrorBanner message={ev.data.message ?? "error"} />
    case "done":
      return (
        <TurnFooter numTurns={ev.data.num_turns} costUsd={ev.data.cost_usd} />
      )
    default:
      return null
  }
}
