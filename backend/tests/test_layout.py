import pytest

from app.layout import apply_layout_edits, LayoutEditError

SRC = '''\
export default () => (
  <board width="40mm" height="24mm">
    <pinheader
      name="J1"
      pinCount={8}
      pcbX={-18}
      pcbY={5}
    />
    <resistor name="R1" resistance="1k" footprint="0402" />
  </board>
)
'''


def test_replaces_existing_pcbxy():
    out = apply_layout_edits(SRC, [{"name": "J1", "pcbX": 12, "pcbY": -3}])
    assert "pcbX={12}" in out
    assert "pcbY={-3}" in out
    assert "pcbX={-18}" not in out
    assert "pcbY={5}" not in out
    # other props untouched
    assert "pinCount={8}" in out


def test_inserts_missing_props_on_single_line_element():
    out = apply_layout_edits(SRC, [{"name": "R1", "pcbX": 4, "pcbY": 0, "pcbRotation": 90}])
    assert "pcbX={4}" in out
    assert "pcbY={0}" in out
    assert "pcbRotation={90}" in out
    # untouched component keeps its original placement
    assert "pcbX={-18}" in out


def test_float_formatting_and_int_coercion():
    out = apply_layout_edits(SRC, [{"name": "J1", "pcbX": 12.0, "pcbY": 3.456}])
    assert "pcbX={12}" in out          # 12.0 -> 12
    assert "pcbY={3.456}" in out


def test_multiple_edits():
    out = apply_layout_edits(
        SRC, [{"name": "J1", "pcbX": 1}, {"name": "R1", "pcbX": 2}]
    )
    assert "pcbX={1}" in out and "pcbX={2}" in out


def test_unknown_component_raises():
    with pytest.raises(LayoutEditError):
        apply_layout_edits(SRC, [{"name": "NOPE", "pcbX": 1}])


def test_rebuild_is_idempotent_on_repeat():
    once = apply_layout_edits(SRC, [{"name": "J1", "pcbX": 7, "pcbY": 7}])
    twice = apply_layout_edits(once, [{"name": "J1", "pcbX": 7, "pcbY": 7}])
    assert once == twice
