"""Workspace service (PLAN §3.5): scaffold via `tsci init`, fsMap read, circuit.json lookup."""

import asyncio
import json
import shutil
from pathlib import Path

from .config import settings

# Source files exposed to the browser (fsMap). node_modules/dist/dotdirs excluded.
_FSMAP_EXTENSIONS = {".tsx", ".ts", ".json", ".md"}
_FSMAP_EXCLUDED_DIRS = {"node_modules", "dist", ".git", ".claude", ".agents", ".tscircuit"}
_FSMAP_MAX_FILE_BYTES = 512 * 1024


class ScaffoldError(RuntimeError):
    pass


async def scaffold(cwd: Path) -> None:
    """Create a tscircuit workspace: `tsci init -y`, pin tscircuit version, mount skill."""
    cwd.mkdir(parents=True, exist_ok=True)

    try:
        proc = await asyncio.create_subprocess_exec(
            "tsci",
            "init",
            "-y",
            cwd=cwd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env={"PATH": settings.agent_path, "HOME": str(Path.home())},
        )
    except FileNotFoundError as exc:
        raise ScaffoldError(
            "`tsci` not found on PATH — install the tscircuit CLI "
            "(`npm install -g tscircuit`) and `bun`"
        ) from exc
    try:
        out, _ = await asyncio.wait_for(
            proc.communicate(), timeout=settings.scaffold_timeout_s
        )
    except asyncio.TimeoutError:
        proc.kill()
        raise ScaffoldError("tsci init timed out")
    if proc.returncode != 0:
        raise ScaffoldError(f"tsci init failed: {out.decode(errors='replace')[-500:]}")

    _pin_tscircuit_version(cwd)
    _mount_skills(cwd)


def _pin_tscircuit_version(cwd: Path) -> None:
    """The scaffold writes "tscircuit": "latest" — rewrite to the locked version (P0-1)."""
    pkg_path = cwd / "package.json"
    if not pkg_path.exists():
        return
    pkg = json.loads(pkg_path.read_text())
    for section in ("dependencies", "devDependencies"):
        deps = pkg.get(section)
        if deps and deps.get("tscircuit") == "latest":
            deps["tscircuit"] = settings.tscircuit_version
    pkg_path.write_text(json.dumps(pkg, indent=2) + "\n")


def _mount_skills(cwd: Path) -> None:
    """Copy the agent skills into <cwd>/.claude/skills/<name> (P0-5 verified mount)."""
    mounts = {
        "tscircuit": settings.skill_dir,
        "components": settings.component_kb_dir,
    }
    for name, src in mounts.items():
        if not src.exists():
            continue
        target = cwd / ".claude" / "skills" / name
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(src, target)


def remove(cwd: Path) -> None:
    """Delete a project's workspace directory (best-effort)."""
    shutil.rmtree(cwd, ignore_errors=True)


def read_fsmap(cwd: Path) -> dict[str, str]:
    files: dict[str, str] = {}
    for path in sorted(cwd.rglob("*")):
        if not path.is_file() or path.suffix not in _FSMAP_EXTENSIONS:
            continue
        rel = path.relative_to(cwd)
        if any(part in _FSMAP_EXCLUDED_DIRS for part in rel.parts):
            continue
        if path.stat().st_size > _FSMAP_MAX_FILE_BYTES:
            continue
        try:
            files[str(rel)] = path.read_text()
        except UnicodeDecodeError:
            continue
    return files


def circuit_json_path(cwd: Path) -> Path | None:
    """Latest circuit.json — lives at dist/<entrypoint>/circuit.json (P0-1)."""
    candidates = list(cwd.glob("dist/*/circuit.json")) + [cwd / "dist" / "circuit.json"]
    existing = [p for p in candidates if p.exists()]
    if not existing:
        return None
    return max(existing, key=lambda p: p.stat().st_mtime)


def circuit_json_mtime(cwd: Path) -> float:
    path = circuit_json_path(cwd)
    return path.stat().st_mtime if path else 0.0
