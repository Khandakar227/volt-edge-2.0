"""Test fixtures: a FastAPI TestClient backed by a throwaway SQLite DB per test.

We avoid importlib.reload (it would re-register SQLModel tables on the shared
metadata and crash). Instead we point `settings` at a temp dir and reset the
cached engine so each test gets a fresh database file.
"""

import tempfile
from pathlib import Path

import pytest


@pytest.fixture()
def client(monkeypatch):
    tmp = Path(tempfile.mkdtemp())

    from app.config import settings
    from app import db as db_mod
    from app import models as models_mod  # noqa: F401 — registers tables

    monkeypatch.setattr(settings, "data_dir", tmp / "data")
    monkeypatch.setattr(settings, "workspaces_dir", tmp / "workspaces")
    monkeypatch.setattr(db_mod, "_engine", None)  # force re-create on new data_dir
    db_mod.init_db()

    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app.routes import router

    app = FastAPI()
    app.include_router(router, prefix="/api")
    return TestClient(app), db_mod, models_mod
