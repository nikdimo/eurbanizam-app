from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from .api.routers import cases, finance, settings, help as help_router


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _get_env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def create_app() -> FastAPI:
    app = FastAPI(
        title="eUrbanizam API",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    allow_origins = os.environ.get("CORS_ALLOW_ORIGINS", "*")
    origins = [o.strip() for o in allow_origins.split(",")] if allow_origins else ["*"]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(cases.router, prefix="/api")
    app.include_router(finance.router, prefix="/api")
    app.include_router(settings.router, prefix="/api")
    app.include_router(help_router.router, prefix="/api")

    @app.get("/", include_in_schema=False)
    def root() -> RedirectResponse:
        return RedirectResponse(url="/docs", status_code=307)

    @app.get("/favicon.ico", include_in_schema=False)
    def favicon() -> Response:
        return Response(status_code=204)

    @app.get("/health", tags=["system"])
    def health() -> dict:
        return {"status": "ok"}

    return app


app = create_app()


def main() -> None:
    import uvicorn

    uvicorn.run(
        "apps.api.main:app",
        host=os.environ.get("API_HOST", "127.0.0.1"),
        port=int(os.environ.get("API_PORT", "8000")),
        reload=_get_env_bool("API_RELOAD", True),
        reload_dirs=[str(PROJECT_ROOT)],
    )


if __name__ == "__main__":
    main()

