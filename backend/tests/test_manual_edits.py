import json
import tempfile
from pathlib import Path


def _make_project(db_mod, models_mod, pid="p1", cwd=None):
    cwd = cwd or tempfile.mkdtemp()
    with db_mod.db_session() as db:
        db.add(models_mod.Project(id=pid, title="T", cwd=cwd))
        db.commit()
    return Path(cwd)


def test_put_manual_edits_writes_file(client):
    tc, db_mod, models_mod = client
    cwd = _make_project(db_mod, models_mod)
    edits = {
        "pcb_placements": [
            {"selector": "R1", "center": {"x": 1, "y": 2}, "relative_to": "group_center"}
        ]
    }
    res = tc.put("/api/projects/p1/manual-edits", json=edits)
    assert res.status_code == 200
    saved = json.loads((cwd / "manual-edits.json").read_text())
    assert saved["pcb_placements"][0]["selector"] == "R1"


def test_put_manual_edits_unknown_project_404(client):
    tc, _, _ = client
    assert tc.put("/api/projects/nope/manual-edits", json={}).status_code == 404
