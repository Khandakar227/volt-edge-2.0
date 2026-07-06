"""Claude Agent SDK wiring (PLAN §3.2, validated in P0-5).

- permission_mode="acceptEdits" auto-allows Write/Edit in the workspace.
- Bash is deliberately NOT in allowed_tools: listing it there pre-approves it and
  bypasses can_use_tool (P0-5 finding). The allowlist below is the only Bash gate.
- The tscircuit skill is mounted at <cwd>/.claude/skills/tscircuit by the workspace
  service and activated via setting_sources=["project"] + skills=["tscircuit"].
"""

from pathlib import Path
from typing import Any

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    PermissionResultAllow,
    PermissionResultDeny,
    ResultMessage,
    SystemMessage,
    TextBlock,
    ThinkingBlock,
    ToolResultBlock,
    ToolUseBlock,
    UserMessage,
)

from .config import settings

# Steering appended to the default Claude Code system prompt. Addresses observed
# over-engineering: adding unrequested passives, splitting schematics into
# sections, sparse layouts, and wasted tool calls.
VOLTEDGE_SYSTEM_APPEND = """\
You are VoltEdge's circuit-design agent. Design rules for every request:

- Build exactly what the user asks for and nothing more. Do NOT add extra parts unless the user asks for them or the circuit cannot function without them — and if one is strictly required, add it and state why in one line.
- "breakout board" / "module" means use the ready-made breakout with its header pins and wire the modules directly together. Do not expand a module into discrete parts.
- A ready-made parts library lives in `./parts/` (catalog + pinouts in the `components` skill). For any board it covers (ESP32-C3 SuperMini, GY-521/MPU-6050, STM32 Blue Pill, Arduino Uno shield), IMPORT and place the library component — e.g. `import { Esp32C3SuperMini } from "./parts/esp32-c3-supermini"` then `<Esp32C3SuperMini name="U1" />` — and wire by pin label (e.g. `.U1 > .IO8`). Read the part file for its exact pins. Do NOT hand-model these or use a guessed `dip*` footprint.
- For a part NOT in `./parts/`: `tsci search` then `tsci import` for an authoritative footprint, or model a breakout as a `<pinheader>` with real pin count, `pitch` ("2.54mm"), row layout, and real board dimensions. A single-inline-header breakout is NOT a DIP.
- Wire pins directly net-to-net and keep the schematic compact. Prefer direct
  connections over splitting the schematic into separate sections/groups.
- Keep the layout condensed: place components close together and size the board
  to fit the parts snugly rather than spreading them out.
- Be efficient with tools. You already run inside the project working directory —
  never use `cd`. Do not run `tsci build --pcb-png` (unsupported here). Do not
  create README/summary/doc files unless explicitly asked. Run only the checks
  you need, then `tsci build`.
- Finish with a 1-3 sentence summary, not a long report.
"""

BASH_ALLOWED_PREFIXES = (
    "tsci",
    "npm",
    "bun",
    "git",
    "ls",
    "cat",
    "grep",
    "rg",
    "find",
    "head",
    "tail",
    "wc",
    "node",
    "mkdir",
    "pwd",
    "echo",
)


def _make_can_use_tool(cwd: Path):
    async def can_use_tool(tool_name: str, tool_input: dict, _ctx: Any):
        if tool_name == "Bash":
            command = (tool_input.get("command") or "").strip()
            if not any(command.startswith(p) for p in BASH_ALLOWED_PREFIXES):
                head = command.split()[0] if command else "(empty)"
                return PermissionResultDeny(
                    message=f"Bash command '{head}' is not in the VoltEdge allowlist."
                )
        if tool_name in ("Write", "Edit"):
            file_path = tool_input.get("file_path", "")
            if file_path and not Path(file_path).resolve().is_relative_to(cwd.resolve()):
                return PermissionResultDeny(
                    message="File edits are confined to the project workspace."
                )
        return PermissionResultAllow()

    return can_use_tool


def build_options(cwd: Path) -> ClaudeAgentOptions:
    return ClaudeAgentOptions(
        cwd=str(cwd),
        permission_mode="acceptEdits",
        system_prompt={
            "type": "preset",
            "preset": "claude_code",
            "append": VOLTEDGE_SYSTEM_APPEND,
        },
        setting_sources=["project"],
        skills=["tscircuit", "components"],
        allowed_tools=["Read", "Write", "Edit", "Glob", "Grep"],  # Bash gated via callback
        can_use_tool=_make_can_use_tool(cwd),
        model=settings.model,
        max_turns=settings.max_turns,
        env={"PATH": settings.agent_path},
    )


def _summarize_tool_input(name: str, tool_input: dict) -> str:
    if name == "Bash":
        return str(tool_input.get("command", ""))[:300]
    if name in ("Write", "Edit", "Read"):
        return str(tool_input.get("file_path", ""))
    if name == "Skill":
        return str(tool_input.get("skill", tool_input.get("command", "")))
    return ", ".join(list(tool_input)[:4])


def map_message(msg: Any) -> list[tuple[str, dict]]:
    """SDK message → list of (sse_event_type, data). Taxonomy per PLAN §4."""
    events: list[tuple[str, dict]] = []

    if isinstance(msg, SystemMessage):
        return events  # init/config chatter — not user-facing

    if isinstance(msg, AssistantMessage):
        for block in msg.content:
            if isinstance(block, ThinkingBlock):
                events.append(("thinking", {"text": block.thinking or ""}))
            elif isinstance(block, TextBlock):
                events.append(("assistant_text", {"text": block.text or ""}))
            elif isinstance(block, ToolUseBlock):
                events.append(
                    (
                        "tool_use",
                        {
                            "tool": block.name,
                            "input": _summarize_tool_input(block.name, block.input or {}),
                        },
                    )
                )
        return events

    if isinstance(msg, UserMessage):
        content = msg.content if isinstance(msg.content, list) else []
        for block in content:
            if isinstance(block, ToolResultBlock):
                raw = block.content
                if isinstance(raw, list):
                    raw = " ".join(
                        part.get("text", "") for part in raw if isinstance(part, dict)
                    )
                events.append(
                    (
                        "tool_result",
                        {
                            "ok": not bool(block.is_error),
                            "summary": str(raw or "")[:500],
                        },
                    )
                )
        return events

    if isinstance(msg, ResultMessage):
        events.append(
            (
                "done",
                {
                    "is_error": bool(getattr(msg, "is_error", False)),
                    "num_turns": getattr(msg, "num_turns", None),
                    "cost_usd": getattr(msg, "total_cost_usd", None),
                    "session_id": getattr(msg, "session_id", None),
                },
            )
        )
        return events

    return events
