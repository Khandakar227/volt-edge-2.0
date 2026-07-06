"""Rewrite PCB layout props (pcbX/pcbY/pcbRotation) on named JSX components.

Used by the interactive PCB editor: a drag/rotate in the browser maps to a
component `name`, and we upsert its layout props in `index.circuit.tsx` before
rebuilding. Explicit pcbX/pcbY take precedence over the autorouter's placement
(verified), so writing them pins the component where the user dropped it.
"""

import re

_LAYOUT_PROPS = ("pcbX", "pcbY", "pcbRotation")


class LayoutEditError(ValueError):
    pass


def _fmt(value: float) -> str:
    # Emit ints without a trailing .0 (e.g. 12 not 12.0); round floats to 3dp.
    if isinstance(value, bool):
        raise LayoutEditError("layout value must be numeric")
    r = round(float(value), 3)
    return str(int(r)) if r == int(r) else str(r)


def _find_opening_tag(source: str, name: str) -> tuple[int, int]:
    """Return (start, end) span of the JSX opening tag whose name prop == `name`.

    Matches name="x", name={"x"} and name={'x'}. The tag is assumed to be
    self-closing (`/>`), which is how tscircuit component elements are written.
    """
    name_pat = re.compile(
        r"""name=\{?["']""" + re.escape(name) + r"""["']\}?""",
    )
    for m in name_pat.finditer(source):
        start = source.rfind("<", 0, m.start())
        if start == -1:
            continue
        end = source.find("/>", m.end())
        if end == -1:
            continue
        end += 2
        # Guard: the name match must belong to THIS tag (no intervening `/>`).
        if "/>" in source[start:m.start()]:
            continue
        return start, end
    raise LayoutEditError(f"component name={name!r} not found in source")


def _upsert_prop(tag: str, prop: str, value: float) -> str:
    """Replace `prop={...}` inside a self-closing tag, or insert it before `/>`."""
    literal = f"{prop}={{{_fmt(value)}}}"
    existing = re.compile(prop + r"=\{[^{}]*\}")
    if existing.search(tag):
        return existing.sub(literal, tag, count=1)
    # insert just before the closing `/>`, matching the tag's trailing whitespace
    return re.sub(r"\s*/>\s*$", f"\n      {literal}\n    />", tag, count=1)


def apply_layout_edits(source: str, edits: list[dict]) -> str:
    """Upsert pcbX/pcbY/pcbRotation on each named component. Returns new source.

    `edits`: [{"name": str, "pcbX"?: num, "pcbY"?: num, "pcbRotation"?: num}].
    Raises LayoutEditError if a named component isn't found.
    """
    for edit in edits:
        name = edit.get("name")
        if not name:
            raise LayoutEditError("each edit needs a component name")
        props = {k: edit[k] for k in _LAYOUT_PROPS if edit.get(k) is not None}
        if not props:
            continue
        start, end = _find_opening_tag(source, name)
        tag = source[start:end]
        for prop, value in props.items():
            tag = _upsert_prop(tag, prop, value)
        source = source[:start] + tag + source[end:]
    return source
