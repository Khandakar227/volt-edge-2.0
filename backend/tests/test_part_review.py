import asyncio
import json

from app.sessions import SessionManager, ProjectSession
from app import workspace as ws


def test_pending_part_helpers(tmp_path):
    assert ws.pending_part_mtime(tmp_path) == 0.0
    assert ws.read_pending_part(tmp_path) is None
    d = tmp_path / ".voltedge"
    d.mkdir()
    (d / "pending-part.json").write_text(json.dumps({"slug": "sn74hc595", "package": "SOIC-16"}))
    assert ws.pending_part_mtime(tmp_path) > 0.0
    assert ws.read_pending_part(tmp_path)["slug"] == "sn74hc595"


def test_maybe_part_review_emits_once(tmp_path, monkeypatch):
    published = []

    async def fake_publish(pid, etype, data):
        published.append((etype, data))

    monkeypatch.setattr("app.sessions.bus.publish", fake_publish)
    monkeypatch.setattr(SessionManager, "_persist_event", lambda self, *a, **k: None)

    mgr = SessionManager()
    session = ProjectSession(project_id="p1", cwd=tmp_path, client=None)

    # No sentinel yet → nothing emitted.
    asyncio.get_event_loop().run_until_complete(mgr._maybe_part_review(session))
    assert published == []

    d = tmp_path / ".voltedge"
    d.mkdir()
    (d / "pending-part.json").write_text(json.dumps({"slug": "sn74hc595", "package": "SOIC-16"}))

    asyncio.get_event_loop().run_until_complete(mgr._maybe_part_review(session))
    assert [e for e, _ in published] == ["part_review"]
    assert published[0][1]["slug"] == "sn74hc595"

    # Same sentinel, unchanged → not re-emitted.
    asyncio.get_event_loop().run_until_complete(mgr._maybe_part_review(session))
    assert [e for e, _ in published] == ["part_review"]
