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
        setting_sources=["project"],
        skills=["tscircuit"],
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
