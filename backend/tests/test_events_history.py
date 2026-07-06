import json


def _make_project(db_mod, models_mod, project_id="p1"):
    with db_mod.db_session() as db:
        db.add(models_mod.Project(id=project_id, title="T", cwd="/tmp/x"))
        db.commit()


def test_history_empty_returns_empty_list(client):
    tc, db_mod, models_mod = client
    _make_project(db_mod, models_mod)
    res = tc.get("/api/projects/p1/events/history")
    assert res.status_code == 200
    assert res.json() == []


def test_history_returns_events_in_insertion_order(client):
    tc, db_mod, models_mod = client
    _make_project(db_mod, models_mod)
    with db_mod.db_session() as db:
        db.add(models_mod.EventRecord(
            project_id="p1", event_type="user", data=json.dumps({"text": "hi"})))
        db.add(models_mod.EventRecord(
            project_id="p1", event_type="thinking", data=json.dumps({"text": "hmm"})))
        db.add(models_mod.EventRecord(
            project_id="p1", event_type="assistant_text", data=json.dumps({"text": "ok"})))
        db.commit()
    res = tc.get("/api/projects/p1/events/history")
    body = res.json()
    assert [e["type"] for e in body] == ["user", "thinking", "assistant_text"]
    assert body[0]["data"] == {"text": "hi"}


def test_history_skips_malformed_rows(client):
    tc, db_mod, models_mod = client
    _make_project(db_mod, models_mod)
    with db_mod.db_session() as db:
        db.add(models_mod.EventRecord(
            project_id="p1", event_type="user", data="not-json{"))
        db.add(models_mod.EventRecord(
            project_id="p1", event_type="assistant_text", data=json.dumps({"text": "ok"})))
        db.commit()
    body = tc.get("/api/projects/p1/events/history").json()
    assert [e["type"] for e in body] == ["assistant_text"]


def test_history_unknown_project_404(client):
    tc, _, _ = client
    assert tc.get("/api/projects/nope/events/history").status_code == 404
