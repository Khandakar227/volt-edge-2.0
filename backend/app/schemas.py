"""Request/response schemas."""

from datetime import datetime

from pydantic import BaseModel, Field


class CreateProjectRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class RenameProjectRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class ProjectOut(BaseModel):
    id: str
    title: str
    created_at: datetime


class MessageRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20_000)


class MessageOut(BaseModel):
    role: str
    content: str
    ts: datetime


class EventOut(BaseModel):
    type: str
    data: dict
    ts: datetime


class FsMapOut(BaseModel):
    files: dict[str, str]
