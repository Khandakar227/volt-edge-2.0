"""VoltEdge backend — FastAPI app entrypoint.

Run: uvicorn app.main:app --port 8000 (from backend/)
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .db import init_db
from .routes import router

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings.workspaces_dir.mkdir(parents=True, exist_ok=True)
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    init_db()
    yield


app = FastAPI(title="VoltEdge", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request: Request, exc: Exception):
    logging.exception("unhandled backend error")
    detail = str(exc)[:500] if settings.expose_error_details else "internal server error"
    return JSONResponse(status_code=500, content={"detail": detail})


@app.get("/api/health")
async def health():
    return {"ok": True}
