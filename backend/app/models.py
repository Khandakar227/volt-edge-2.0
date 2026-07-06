"""SQLite persistence models (PLAN §3.7): projects, sessions, messages, checkpoints."""

from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Project(SQLModel, table=True):
    id: str = Field(primary_key=True)
    title: str
    cwd: str
    created_at: datetime = Field(default_factory=utcnow)


class SessionRecord(SQLModel, table=True):
    project_id: str = Field(primary_key=True)
    claude_session_id: str | None = None
    last_active: datetime = Field(default_factory=utcnow)


class MessageRecord(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    project_id: str = Field(index=True)
    role: str  # "user" | "assistant"
    content: str
    ts: datetime = Field(default_factory=utcnow)


class CheckpointRecord(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    project_id: str = Field(index=True)
    version: int
    summary: str
    ts: datetime = Field(default_factory=utcnow)


class EventRecord(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    project_id: str = Field(index=True)
    event_type: str
    data: str  # JSON-encoded event payload
    ts: datetime = Field(default_factory=utcnow)
