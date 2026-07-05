"""VoltEdge backend configuration (env-overridable via VOLTEDGE_*)."""

import os
from pathlib import Path

from pydantic_settings import BaseSettings

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = {"env_prefix": "VOLTEDGE_"}

    # Paths
    workspaces_dir: Path = REPO_ROOT / "workspaces"
    data_dir: Path = REPO_ROOT / "data"
    skill_dir: Path = REPO_ROOT / "skill"

    # Agent (P0-5 verified defaults)
    model: str = "claude-sonnet-4-5"
    max_turns: int = 30  # native SDK guardrail; hard caps proper come in Phase 2
    scaffold_timeout_s: int = 180
    tscircuit_version: str = "0.0.2001"  # pinned (P0-1); rewrites scaffold's "latest"

    # `tsci` needs bun on PATH (P0-1)
    extra_path: str = str(Path.home() / ".bun" / "bin")

    # CORS for the Vite dev server
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    @property
    def agent_path(self) -> str:
        return self.extra_path + os.pathsep + os.environ.get("PATH", "")

    @property
    def db_url(self) -> str:
        return f"sqlite:///{self.data_dir / 'volt-edge.db'}"


settings = Settings()
