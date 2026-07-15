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
- SOURCING: for every part, EXHAUST the existing sources below in order before you model anything by hand. Hand-modeling is the LAST resort, not a shortcut.
  1. Local library `./parts/` (catalog + pinouts in the `components` skill): ESP32-C3 SuperMini, GY-521/MPU-6050, STM32 Blue Pill, Arduino Nano, Arduino Uno shield. If the part is here, IMPORT and place it — e.g. `import { Esp32C3SuperMini } from "./parts/esp32-c3-supermini"` then `<Esp32C3SuperMini name="U1" />` — and wire by pin label (e.g. `.U1 > .IO8`). Read the part file for its exact pins. NEVER hand-model these or use a guessed `dip*` footprint.
  2. tscircuit registry: `tsci search --tscircuit "<query>"` then `tsci add <author/pkg>` for a reusable community package.
  3. `@tscircuit/common` (already installed): standard form-factor boards / carriers — `ArduinoShield`, `RaspberryPiHatBoard`, `XiaoBoard`, `ProMicroBoard`, `MicroModBoard`, `ViaGridBoard`. Use these for a standard board shape/carrier instead of hand-modeling an outline + headers, e.g. `import { ArduinoShield } from "@tscircuit/common"`.
  4. JLCPCB / LCSC: `tsci search --jlcpcb "<query>"` then `tsci import "<part#>"` for an authoritative supplier footprint.
  5. ONLY if none of the above has it, MODEL IT YOURSELF from the datasheet — follow the `components` skill's AUTHORING.md procedure: use WebSearch/WebFetch (check manufacturer datasheet, then Octopart/DigiKey/Mouser/SnapEDA; ~1-2 searches, then read) to get the real pinout and body dimensions; author one `<chip>` in `./parts/<slug>.tsx` (standard IC packages use a footprinter string like `soic8_p1.27mm`, header modules use a `<platedhole>` grid centered on the origin at real pitch); then run `node .claude/skills/tscircuit/scripts/verify_part.mjs parts/<slug>.tsx`, and once it passes write `.voltedge/pending-part.json` and STOP for the user to confirm before wiring it in. If no datasheet can be found, ask the user rather than guessing. A single-inline-header breakout is NOT a DIP. (USB-C is the exception: always `<connector standard="usb_c" />`.)
- Wire pins directly net-to-net and keep the schematic compact. Prefer direct
  connections over splitting the schematic into separate sections/groups.
- The `<board>` layer-count prop is `layers` (a number), NOT `num_layers` or
  `numLayers` — tscircuit silently ignores unknown props, so a wrong name leaves
  the board at its 2-layer default. Single-layer is `<board layers={1} ...>`.
  Only set it when the user asks for single/one layer; otherwise omit it — most
  circuits with a shared ground or power net need trace crossings that only a
  second layer can route, and forcing `layers={1}` makes autorouting fail.
- If `tsci build` reports an autorouting failure ("All solvers failed", "Ran out
  of candidates", pcb_autorouting_error), the board did NOT route — don't leave
  it broken. Fix the cause, don't retry blindly: remove any `layers={1}` you
  added (unless the user required single-layer), and spread components apart so
  pads aren't blocking routing channels. If single-layer was explicitly required
  and still won't route, add a wire jumper for the crossing rather than a 2nd
  layer, and if it still fails after ~2 attempts, stop and tell the user it's
  infeasible instead of looping.
- Give every top-level component an explicit pcbX/pcbY: all components fully
  inside the board outline, non-overlapping, with a few mm clearance between
  footprints (account for each part's real width/height — e.g. a 20-pin header
  row is ~50mm long). Size the <board> so everything fits snugly. This is only
  the starting layout: the user drags components in the editor afterwards and
  each drag rewrites pcbX/pcbY in index.circuit.tsx, so never re-tune positions
  the user has set unless asked.
- Be efficient with tools. You already run inside the project working directory —
  never use `cd`. Do not run `tsci build --pcb-png` (unsupported here). Do not
  create README/summary/doc files unless explicitly asked. Run only the checks
  you need, then `tsci build`.
- Write the circuit to `index.circuit.tsx` (the project entry that `tsci build` compiles and the UI renders). Overwrite that file — do NOT create a separate entry like `circuit.tsx`; tsci only builds the `*.circuit.tsx` entry, so any other filename is ignored and the board won't update.
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
    "curl",  # download a datasheet PDF for hand-modeling (read-only fetch)
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
        if tool_name in ("WebSearch", "WebFetch"):
            # Read-only research for datasheets. Gated here (not pre-approved via
            # allowed_tools) so we keep a single chokepoint for future limits.
            return PermissionResultAllow()
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
