import tempfile
from pathlib import Path


BOARD = """\
import { Esp32C3SuperMini } from "./parts/esp32-c3-supermini"
import { Mpu6050Gy521 } from "./parts/mpu6050-gy521"

export default () => (
  <board width="50mm" height="30mm">
    <Esp32C3SuperMini name="U1" pcbX={-13} pcbY={0} />
    <Mpu6050Gy521 name="U2" />
    <trace from=".U1 > .IO8" to=".U2 > .SCL" />
  </board>
)
"""


def _make_project(db_mod, models_mod, pid="p1", source=BOARD):
    cwd = Path(tempfile.mkdtemp())
    (cwd / "index.circuit.tsx").write_text(source)
    with db_mod.db_session() as db:
        db.add(models_mod.Project(id=pid, title="T", cwd=str(cwd)))
        db.commit()
    return cwd


def test_placement_replaces_existing_coords(client):
    tc, db_mod, models_mod = client
    cwd = _make_project(db_mod, models_mod)
    # Exact precision matters: the viewer only treats a stale drag event as
    # applied when the evaluated center EXACTLY equals the event's new_center.
    res = tc.put(
        "/api/projects/p1/placement",
        json={"name": "U1", "pcbX": -10.242094258619503, "pcbY": -2.0},
    )
    assert res.status_code == 200
    src = (cwd / "index.circuit.tsx").read_text()
    assert "pcbX={-10.242094258619503}" in src and "pcbY={-2}" in src
    assert "pcbX={-13}" not in src  # old value replaced, not duplicated
    assert res.json()["source"] == src  # returned source matches disk


def test_placement_inserts_missing_coords(client):
    tc, db_mod, models_mod = client
    cwd = _make_project(db_mod, models_mod, pid="p2")
    res = tc.put(
        "/api/projects/p2/placement", json={"name": "U2", "pcbX": 12, "pcbY": 3}
    )
    assert res.status_code == 200
    src = (cwd / "index.circuit.tsx").read_text()
    assert '<Mpu6050Gy521 name="U2" pcbX={12} pcbY={3} />' in src
    # U1 untouched
    assert "pcbX={-13}" in src


def test_placement_schematic_props(client):
    tc, db_mod, models_mod = client
    cwd = _make_project(db_mod, models_mod, pid="p3")
    res = tc.put(
        "/api/projects/p3/placement", json={"name": "U2", "schX": 1.5, "schY": -0.25}
    )
    assert res.status_code == 200
    src = (cwd / "index.circuit.tsx").read_text()
    u2_tag = src.split("<Mpu6050Gy521")[1].split("/>")[0]
    assert "schX={1.5}" in u2_tag and "schY={-0.25}" in u2_tag
    assert "pcbX" not in u2_tag  # a schematic drag must not touch pcb props


def test_placement_unknown_component_404(client):
    tc, db_mod, models_mod = client
    _make_project(db_mod, models_mod, pid="p4")
    res = tc.put("/api/projects/p4/placement", json={"name": "NOPE", "pcbX": 1})
    assert res.status_code == 404


def test_placement_no_props_422(client):
    tc, db_mod, models_mod = client
    _make_project(db_mod, models_mod, pid="p5")
    assert (
        tc.put("/api/projects/p5/placement", json={"name": "U1"}).status_code == 422
    )


def test_placement_unknown_project_404(client):
    tc, _, _ = client
    res = tc.put("/api/projects/nope/placement", json={"name": "U1", "pcbX": 1})
    assert res.status_code == 404
