"""SQLite engine + init. Sync SQLModel is sufficient for single-user v1."""

from sqlmodel import Session, SQLModel, create_engine

from .config import settings

_engine = None


def get_engine():
    global _engine
    if _engine is None:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        _engine = create_engine(
            settings.db_url, connect_args={"check_same_thread": False}
        )
    return _engine


def init_db() -> None:
    SQLModel.metadata.create_all(get_engine())


def db_session() -> Session:
    return Session(get_engine())
