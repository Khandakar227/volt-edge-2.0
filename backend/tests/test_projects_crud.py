import json
import tempfile
from pathlib import Path


def _make_project(db_mod, models_mod, project_id="p1", cwd=None):
    cwd = cwd or tempfile.mkdtemp()
    with db_mod.db_session() as db:
        db.add(models_mod.Project(id=project_id, title="Old title", cwd=cwd))
        db.commit()
    return cwd


def test_rename_updates_title(client):
    tc, db_mod, models_mod = client
    _make_project(db_mod, models_mod)
    res = tc.patch("/api/projects/p1", json={"title": "New name"})
    assert res.status_code == 200
    assert res.json()["title"] == "New name"
    # persisted
    assert tc.get("/api/projects").json()[0]["title"] == "New name"


def test_rename_rejects_empty_title(client):
    tc, db_mod, models_mod = client
    _make_project(db_mod, models_mod)
    assert tc.patch("/api/projects/p1", json={"title": ""}).status_code == 422


def test_rename_unknown_project_404(client):
    tc, _, _ = client
    assert tc.patch("/api/projects/nope", json={"title": "x"}).status_code == 404


def test_delete_removes_project_events_and_workspace(client):
    tc, db_mod, models_mod = client
    cwd = Path(tempfile.mkdtemp()) / "ws"
    cwd.mkdir()
    (cwd / "marker.txt").write_text("hi")
    _make_project(db_mod, models_mod, cwd=str(cwd))
    with db_mod.db_session() as db:
        db.add(models_mod.EventRecord(
            project_id="p1", event_type="user", data=json.dumps({"text": "hi"})))
        db.commit()

    res = tc.delete("/api/projects/p1")
    assert res.status_code == 204
    assert tc.get("/api/projects").json() == []
    assert tc.get("/api/projects/p1/events/history").status_code == 404
    assert not cwd.exists()  # workspace dir removed


def test_delete_unknown_project_404(client):
    tc, _, _ = client
    assert tc.delete("/api/projects/nope").status_code == 404
