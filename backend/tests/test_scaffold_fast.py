import json
import os
from pathlib import Path

from app import workspace


def _make_template(tmp_path: Path) -> Path:
    t = tmp_path / "template"
    (t / "node_modules" / "pkg").mkdir(parents=True)
    (t / "node_modules" / "pkg" / "x.js").write_text("module.exports=1")
    (t / "node_modules" / ".bin").mkdir()
    os.symlink("../pkg/x.js", t / "node_modules" / ".bin" / "foo")  # bin symlink
    (t / "package.json").write_text('{"name":"template","devDependencies":{}}')
    (t / "tsconfig.json").write_text("{}")
    (t / "tscircuit.config.json").write_text("{}")
    (t / "bun.lock").write_text("")
    (t / "index.circuit.tsx").write_text("export default () => (<board/>)\n")
    return t


def test_fast_scaffold_hardlinks_node_modules(tmp_path):
    t = _make_template(tmp_path)
    cwd = tmp_path / "proj_abc"
    workspace._fast_scaffold(cwd, t)

    src_file = t / "node_modules" / "pkg" / "x.js"
    dst_file = cwd / "node_modules" / "pkg" / "x.js"
    assert dst_file.exists()
    assert os.stat(src_file).st_ino == os.stat(dst_file).st_ino  # same inode = hardlink

    binlink = cwd / "node_modules" / ".bin" / "foo"
    assert binlink.is_symlink()
    assert os.readlink(binlink) == "../pkg/x.js"  # symlink recreated, not hardlinked

    # The entry is intentionally NOT created: the agent writes it on its first
    # turn. A pre-existing file would trip the SDK read-before-write guard. This
    # also verifies index.circuit.tsx is excluded from the copied template files.
    assert not (cwd / "index.circuit.tsx").exists()
    assert (cwd / "tsconfig.json").exists()
    assert (cwd / "bun.lock").exists()


def test_fast_scaffold_rewrites_package_name(tmp_path):
    t = _make_template(tmp_path)
    cwd = tmp_path / "proj_xyz"
    workspace._fast_scaffold(cwd, t)
    pkg = json.loads((cwd / "package.json").read_text())
    assert pkg["name"] == "proj_xyz"
