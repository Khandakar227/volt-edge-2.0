import asyncio
import tempfile
from pathlib import Path

import pytest

from app import workspace


def test_scaffold_missing_tsci_raises_scaffold_error(monkeypatch):
    """A missing `tsci` binary must surface as a clean ScaffoldError, not a raw
    FileNotFoundError (which would 500 without an actionable message)."""

    async def boom(*_args, **_kwargs):
        raise FileNotFoundError(2, "No such file or directory")

    monkeypatch.setattr(asyncio, "create_subprocess_exec", boom)

    # Test the tsci init step directly — scaffold() takes the hardlink fast path
    # when a template already exists and wouldn't invoke tsci at all.
    tmp = Path(tempfile.mkdtemp())
    with pytest.raises(workspace.ScaffoldError) as ei:
        asyncio.run(workspace._tsci_init(tmp))
    assert "tsci" in str(ei.value)
