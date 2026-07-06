"""Workspace service (PLAN §3.5): scaffold via `tsci init`, fsMap read, circuit.json lookup."""

import asyncio
import json
import logging
import os
import shutil
from pathlib import Path

from .config import settings

logger = logging.getLogger("voltedge.workspace")

# Files (besides node_modules) copied from the template into each new workspace.
# NOTE: index.circuit.tsx is intentionally excluded — tsci's starter is a
# resistor+capacitor example; we write our own clean entry instead (below).
_TEMPLATE_BASE_FILES = (
    "package.json",
    "tsconfig.json",
    "bun.lock",
    "tscircuit.config.json",
)

# The canonical entry file rendered by the frontend and built by tsci. Kept as a
# minimal empty board so a fresh (un-prompted) workspace shows nothing misleading;
# the agent overwrites it on the first prompt.
_DEFAULT_ENTRY = "export default () => <board width=\"30mm\" height=\"30mm\" />\n"

# Source files exposed to the browser (fsMap). node_modules/dist/dotdirs excluded.
_FSMAP_EXTENSIONS = {".tsx", ".ts", ".json", ".md"}
_FSMAP_EXCLUDED_DIRS = {"node_modules", "dist", ".git", ".claude", ".agents", ".tscircuit"}
_FSMAP_MAX_FILE_BYTES = 512 * 1024


class ScaffoldError(RuntimeError):
    pass


_template_lock = asyncio.Lock()


def _template_dir() -> Path:
    return settings.workspaces_dir / ".template"


def _template_ready(t: Path) -> bool:
    return t.is_dir() and (t / "node_modules").is_dir() and (t / "package.json").exists()


async def _tsci_init(cwd: Path) -> None:
    """Full `tsci init -y` (installs node_modules) + version pin. Slow (~30s)."""
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


async def ensure_template() -> Path | None:
    """Build the shared workspace template once (its node_modules is hardlinked
    into every new project). Returns None if it can't be built (caller falls
    back to a full `tsci init`)."""
    t = _template_dir()
    if _template_ready(t):
        return t
    async with _template_lock:
        if _template_ready(t):
            return t
        try:
            if t.exists():
                shutil.rmtree(t, ignore_errors=True)
            await _tsci_init(t)
        except Exception:
            logger.warning("template build failed; scaffolds will use full init", exc_info=True)
            return None
        return t if _template_ready(t) else None


async def scaffold(cwd: Path) -> None:
    """Create a tscircuit workspace, then mount skills + the parts library.

    Fast path: hardlink node_modules from a shared template (near-instant).
    Fallback: a full `tsci init` if the template can't be built.
    """
    template = await ensure_template()
    if template is not None:
        await asyncio.get_event_loop().run_in_executor(
            None, _fast_scaffold, cwd, template
        )
    else:
        await _tsci_init(cwd)
        (cwd / "index.circuit.tsx").write_text(_DEFAULT_ENTRY)  # replace tsci's R+C starter
    _mount_skills(cwd)
    _install_parts_library(cwd)


def _hardlink_tree(src: Path, dst: Path) -> None:
    """Recreate `src` under `dst`, hardlinking regular files and re-creating
    symlinks as symlinks. Near-instant and disk-shared vs a full copy."""
    dst.mkdir(parents=True, exist_ok=True)
    for root, dirs, files in os.walk(src, followlinks=False):
        rel = Path(root).relative_to(src)
        (dst / rel).mkdir(parents=True, exist_ok=True)
        kept = []
        for dname in dirs:
            sp = Path(root) / dname
            if sp.is_symlink():
                dp = dst / rel / dname
                if not dp.exists():
                    os.symlink(os.readlink(sp), dp)
            else:
                kept.append(dname)
        dirs[:] = kept  # don't descend into symlinked dirs — recreated above
        for fname in files:
            sp = Path(root) / fname
            dp = dst / rel / fname
            if dp.exists():
                continue
            if sp.is_symlink():
                os.symlink(os.readlink(sp), dp)
            else:
                os.link(sp, dp)


def _fast_scaffold(cwd: Path, template: Path) -> None:
    """Create a workspace by hardlinking the template's node_modules and copying
    its base files. `package.json` name is rewritten to the project id."""
    cwd.mkdir(parents=True, exist_ok=True)
    tmpl_modules = template / "node_modules"
    if tmpl_modules.is_dir():
        _hardlink_tree(tmpl_modules, cwd / "node_modules")
    for name in _TEMPLATE_BASE_FILES:
        src = template / name
        if src.exists():
            shutil.copy(src, cwd / name)
    pkg_path = cwd / "package.json"
    if pkg_path.exists():
        pkg = json.loads(pkg_path.read_text())
        pkg["name"] = cwd.name
        pkg_path.write_text(json.dumps(pkg, indent=2) + "\n")
    (cwd / "index.circuit.tsx").write_text(_DEFAULT_ENTRY)


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


def _install_parts_library(cwd: Path) -> None:
    """Copy the component parts library into <cwd>/parts so circuits can
    `import { X } from "./parts/<name>"`."""
    src = settings.component_kb_dir / "parts"
    if not src.exists():
        return
    target = cwd / "parts"
    target.mkdir(parents=True, exist_ok=True)
    for part in src.glob("*.tsx"):
        shutil.copy(part, target / part.name)


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
