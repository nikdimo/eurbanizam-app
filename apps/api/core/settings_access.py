from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]
SETTINGS_PATH = PROJECT_ROOT / "settings.json"
FINANCE_SETTINGS_PATH = PROJECT_ROOT / "finance_settings.json"


def _expand_path(path_value: str, project_root: Path) -> Path:
    expanded = os.path.expandvars(path_value)
    path = Path(expanded)
    if not path.is_absolute():
        path = project_root / path
    return path


@lru_cache(maxsize=1)
def load_app_settings() -> dict:
    if not SETTINGS_PATH.exists():
        raise FileNotFoundError(f"settings.json not found at {SETTINGS_PATH}")
    with SETTINGS_PATH.open("r", encoding="utf-8-sig") as handle:
        raw = json.load(handle)
    project_root = PROJECT_ROOT
    resolved = {
        "project_root": str(project_root),
        "local_db_path": str(_expand_path(raw["local_db_path"], project_root)),
        "local_json_dir": str(_expand_path(raw["local_json_dir"], project_root)),
        "local_logs_dir": str(_expand_path(raw["local_logs_dir"], project_root)),
        "schema_validation": raw.get("schema_validation", {}),
        "visible_columns_v9": raw.get("visible_columns_v9", []),
        "column_order_map": raw.get("column_order_map", {}),
        "custom_field_defs": raw.get("custom_field_defs", []),
        "raw": raw,
    }
    return resolved


def save_app_settings_keys(updates: dict) -> dict:
    if not SETTINGS_PATH.exists():
        raise FileNotFoundError(f"settings.json not found at {SETTINGS_PATH}")

    with SETTINGS_PATH.open("r", encoding="utf-8-sig") as handle:
        raw = json.load(handle)

    raw.update(updates)

    with SETTINGS_PATH.open("w", encoding="utf-8") as handle:
        json.dump(raw, handle, ensure_ascii=False, indent=2)

    load_app_settings.cache_clear()
    return load_app_settings()


@lru_cache(maxsize=1)
def load_finance_settings() -> dict:
    if not FINANCE_SETTINGS_PATH.exists():
        return {}
    with FINANCE_SETTINGS_PATH.open("r", encoding="utf-8-sig") as handle:
        return json.load(handle)


def save_finance_settings_keys(updates: dict) -> dict:
    raw = {}
    if FINANCE_SETTINGS_PATH.exists():
        with FINANCE_SETTINGS_PATH.open("r", encoding="utf-8-sig") as handle:
            raw = json.load(handle)

    raw.update(updates)

    with FINANCE_SETTINGS_PATH.open("w", encoding="utf-8") as handle:
        json.dump(raw, handle, ensure_ascii=False, indent=2)

    load_finance_settings.cache_clear()
    return load_finance_settings()

