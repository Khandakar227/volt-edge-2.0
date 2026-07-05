"""HTTP + SSE API (PLAN §3.8)."""

import asyncio
import json
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import FileResponse
from sse_starlette.sse import EventSourceResponse
from sqlmodel import select

from . import workspace
from .config import settings
from .db import db_session
from .events import bus
from .models import MessageRecord, Project
from .schemas import CreateProjectRequest, FsMapOut, MessageOut, MessageRequest, ProjectOut
from .sessions import manager

router = APIRouter()


def _get_project(project_id: str) -> Project:
    with db_session() as db:
        project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(404, "project not found")
    return project


@router.post("/projects", response_model=ProjectOut, status_code=201)
async def create_project(body: CreateProjectRequest):
    project_id = uuid.uuid4().hex[:12]
    cwd = settings.workspaces_dir / project_id
    try:
        await workspace.scaffold(cwd)
    except workspace.ScaffoldError as exc:
        raise HTTPException(500, f"workspace scaffold failed: {exc}")

    project = Project(id=project_id, title=body.title, cwd=str(cwd))
    with db_session() as db:
        db.add(project)
        db.commit()
        db.refresh(project)
    return ProjectOut(id=project.id, title=project.title, created_at=project.created_at)


@router.get("/projects", response_model=list[ProjectOut])
async def list_projects():
    with db_session() as db:
        projects = db.exec(select(Project).order_by(Project.created_at.desc())).all()
    return [
        ProjectOut(id=p.id, title=p.title, created_at=p.created_at) for p in projects
    ]


@router.get("/projects/{project_id}/fsmap", response_model=FsMapOut)
async def get_fsmap(project_id: str):
    project = _get_project(project_id)
    return FsMapOut(files=workspace.read_fsmap(Path(project.cwd)))


@router.get("/projects/{project_id}/circuit-json")
async def get_circuit_json(project_id: str):
    project = _get_project(project_id)
    path = workspace.circuit_json_path(Path(project.cwd))
    if path is None:
        raise HTTPException(404, "no build artifact yet")
    return FileResponse(path, media_type="application/json")


@router.get("/projects/{project_id}/messages", response_model=list[MessageOut])
async def get_messages(project_id: str):
    _get_project(project_id)
    with db_session() as db:
        records = db.exec(
            select(MessageRecord)
            .where(MessageRecord.project_id == project_id)
            .order_by(MessageRecord.ts)
        ).all()
    return [MessageOut(role=r.role, content=r.content, ts=r.ts) for r in records]


@router.post("/projects/{project_id}/message", status_code=202)
async def post_message(
    project_id: str, body: MessageRequest, background: BackgroundTasks
):
    project = _get_project(project_id)
    if manager.is_busy(project_id):
        raise HTTPException(409, "a turn is already running for this project")
    background.add_task(manager.run_turn, project, body.text)
    return {"status": "accepted"}


@router.post("/projects/{project_id}/interrupt")
async def interrupt(project_id: str):
    _get_project(project_id)
    interrupted = await manager.interrupt(project_id)
    return {"interrupted": interrupted}


@router.get("/projects/{project_id}/events")
async def events(project_id: str, request: Request):
    _get_project(project_id)

    async def stream():
        with bus.subscribe(project_id) as queue:
            yield {"event": "connected", "data": json.dumps({"project_id": project_id})}
            while True:
                if await request.is_disconnected():
                    return
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=15.0)
                except asyncio.TimeoutError:
                    yield {"event": "ping", "data": "{}"}
                    continue
                yield {"event": item["event"], "data": json.dumps(item["data"])}

    return EventSourceResponse(stream())
