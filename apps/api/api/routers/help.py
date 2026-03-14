from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException


router = APIRouter(tags=["help"])


PROJECT_ROOT = Path(__file__).resolve().parents[4]
HELP_PATH = PROJECT_ROOT / "docs" / "HELP.md"


@router.get("/help", response_model=str)
def get_help_markdown() -> str:
    if not HELP_PATH.exists():
        raise HTTPException(status_code=404, detail="HELP.md not found")
    return HELP_PATH.read_text(encoding="utf-8")

