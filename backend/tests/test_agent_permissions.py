import asyncio
from pathlib import Path

from claude_agent_sdk import PermissionResultAllow, PermissionResultDeny
from app.agent import _make_can_use_tool, BASH_ALLOWED_PREFIXES


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_websearch_and_webfetch_are_allowed(tmp_path: Path):
    can_use = _make_can_use_tool(tmp_path)
    assert isinstance(_run(can_use("WebSearch", {"query": "ne555 datasheet"}, None)), PermissionResultAllow)
    assert isinstance(_run(can_use("WebFetch", {"url": "https://ti.com/x.pdf"}, None)), PermissionResultAllow)


def test_curl_is_allowlisted():
    assert "curl" in BASH_ALLOWED_PREFIXES


def test_curl_bash_command_allowed(tmp_path: Path):
    can_use = _make_can_use_tool(tmp_path)
    res = _run(can_use("Bash", {"command": "curl -sL https://example.com/ds.pdf -o ds.pdf"}, None))
    assert isinstance(res, PermissionResultAllow)


def test_unlisted_bash_still_denied(tmp_path: Path):
    can_use = _make_can_use_tool(tmp_path)
    res = _run(can_use("Bash", {"command": "rm -rf /"}, None))
    assert isinstance(res, PermissionResultDeny)
