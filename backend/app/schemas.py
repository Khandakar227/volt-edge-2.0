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


class PlacementRequest(BaseModel):
    """A drag in the editor: rewrite the named component's placement props in
    index.circuit.tsx (pcbX/pcbY for PCB drags, schX/schY for schematic)."""

    name: str = Field(min_length=1, max_length=100)
    pcbX: float | None = None
    pcbY: float | None = None
    schX: float | None = None
    schY: float | None = None


class EventOut(BaseModel):
    type: str
    data: dict
    ts: datetime


class FsMapOut(BaseModel):
    files: dict[str, str]
