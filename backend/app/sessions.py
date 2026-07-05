"""Session Manager (PLAN §3.1): one long-lived ClaudeSDKClient per active project.

A per-project lock serializes turns. Checkpoints are detected by watching the
workspace's circuit.json mtime: whenever a tool_result (or end of turn) reveals a
newer build artifact, a `checkpoint` event is emitted and persisted.
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from claude_agent_sdk import ClaudeSDKClient
from sqlmodel import select

from .agent import build_options, map_message
from .config import settings
from .db import db_session
from .events import bus
from .models import CheckpointRecord, MessageRecord, Project, SessionRecord
from .workspace import circuit_json_mtime

logger = logging.getLogger("voltedge.sessions")


@dataclass
class ProjectSession:
    project_id: str
    cwd: Path
    client: ClaudeSDKClient
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    last_circuit_mtime: float = 0.0
    checkpoint_version: int = 0


class SessionManager:
    def __init__(self) -> None:
        self._sessions: dict[str, ProjectSession] = {}
        self._create_lock = asyncio.Lock()

    async def get_or_create(self, project: Project) -> ProjectSession:
        async with self._create_lock:
            session = self._sessions.get(project.id)
            if session is not None:
                return session

            cwd = Path(project.cwd)
            client = ClaudeSDKClient(options=build_options(cwd))
            await client.connect()

            session = ProjectSession(
                project_id=project.id,
                cwd=cwd,
                client=client,
                last_circuit_mtime=circuit_json_mtime(cwd),
            )
            with db_session() as db:
                for cp in db.exec(
                    select(CheckpointRecord)
                    .where(CheckpointRecord.project_id == project.id)
                    .order_by(CheckpointRecord.version.desc())
                ):
                    session.checkpoint_version = cp.version
                    break
            self._sessions[project.id] = session
            return session

    def is_busy(self, project_id: str) -> bool:
        session = self._sessions.get(project_id)
        return session is not None and session.lock.locked()

    async def interrupt(self, project_id: str) -> bool:
        session = self._sessions.get(project_id)
        if session is None or not session.lock.locked():
            return False
        await session.client.interrupt()
        return True

    async def run_turn(self, project: Project, text: str) -> None:
        """Drive one agent turn; relay SDK messages as SSE events (PLAN §4)."""
        session = await self.get_or_create(project)
        async with session.lock:
            self._persist_message(project.id, "user", text)
            assistant_chunks: list[str] = []
            try:
                await session.client.query(text)
                async for msg in session.client.receive_response():
                    for event_type, data in map_message(msg):
                        if event_type == "assistant_text":
                            assistant_chunks.append(data["text"])
                        await bus.publish(project.id, event_type, data)
                        if event_type == "tool_result":
                            await self._maybe_checkpoint(session)
                        if event_type == "done" and data.get("session_id"):
                            self._store_claude_session_id(
                                project.id, data["session_id"]
                            )
                # end-of-turn sweep in case the last build wasn't followed by a tool_result
                await self._maybe_checkpoint(session)
            except Exception as exc:  # surface, don't swallow
                logger.exception("turn failed for project %s", project.id)
                await bus.publish(project.id, "error", {"message": str(exc)[:500]})
            finally:
                if assistant_chunks:
                    self._persist_message(
                        project.id, "assistant", "\n".join(assistant_chunks)
                    )

    async def _maybe_checkpoint(self, session: ProjectSession) -> None:
        mtime = circuit_json_mtime(session.cwd)
        if mtime <= session.last_circuit_mtime:
            return
        session.last_circuit_mtime = mtime
        session.checkpoint_version += 1
        summary = f"Build artifact updated ({datetime.now(timezone.utc):%H:%M:%S} UTC)"
        with db_session() as db:
            db.add(
                CheckpointRecord(
                    project_id=session.project_id,
                    version=session.checkpoint_version,
                    summary=summary,
                )
            )
            db.commit()
        await bus.publish(
            session.project_id,
            "checkpoint",
            {"version": session.checkpoint_version, "summary": summary},
        )

    def _persist_message(self, project_id: str, role: str, content: str) -> None:
        with db_session() as db:
            db.add(MessageRecord(project_id=project_id, role=role, content=content))
            db.commit()

    def _store_claude_session_id(self, project_id: str, claude_session_id: str) -> None:
        with db_session() as db:
            record = db.get(SessionRecord, project_id) or SessionRecord(
                project_id=project_id
            )
            record.claude_session_id = claude_session_id
            record.last_active = datetime.now(timezone.utc)
            db.add(record)
            db.commit()


manager = SessionManager()
