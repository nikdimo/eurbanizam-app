from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from ..core.common import first_existing, get_table_columns
from ..core.settings_access import (
    load_app_settings,
    load_finance_settings,
    save_app_settings_keys,
    save_finance_settings_keys,
)
from ..repositories.db import db_session
from ..schemas.cases import (
    CaseCustomFieldCreatePayload,
    CaseCustomFieldDefinition,
    CaseCustomFieldUpdatePayload,
)


RESERVED_FIELD_NAMES = {"phone", "address"}


def _normalize_scope(value: object) -> str:
    return "finance" if str(value or "").strip().lower() == "finance" else "case"


def _normalize_type(value: object) -> str:
    return "Dropdown" if str(value or "").strip().lower() == "dropdown" else "Text"


def _normalize_options(values: object) -> list[str]:
    if not isinstance(values, list):
        return []

    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        option = str(value or "").strip()
        if not option or option in seen:
            continue
        seen.add(option)
        out.append(option)
    return out


def normalize_custom_field_definitions(raw_defs: object) -> list[dict[str, Any]]:
    if not isinstance(raw_defs, list):
        return []

    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for entry in raw_defs:
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("name", "")).strip()
        lowered = name.lower()
        if not name or lowered in RESERVED_FIELD_NAMES or lowered in seen:
            continue
        seen.add(lowered)
        out.append(
            {
                "name": name,
                "type": _normalize_type(entry.get("type")),
                "options": _normalize_options(entry.get("options", [])),
                "enabled": bool(entry.get("enabled", True)),
                "scope": _normalize_scope(entry.get("scope", "case")),
            }
        )
    return out


def _coerce_order_value(value: object) -> Optional[int]:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    text = str(value or "").strip()
    if text.isdigit():
        return int(text)
    return None


def _upsert_visible_column(
    visible_columns: list[str],
    name: str,
    *,
    enabled: bool,
    previous_name: Optional[str] = None,
) -> list[str]:
    out = [
        column
        for column in visible_columns
        if column != previous_name and column != name
    ]
    if enabled:
        out.append(name)
    return out


def _upsert_column_order(
    order_map: dict[str, Any],
    name: str,
    *,
    enabled: bool,
    previous_name: Optional[str] = None,
) -> dict[str, Any]:
    next_map = {
        str(key): value
        for key, value in order_map.items()
        if str(key) != str(previous_name or "")
    }
    if enabled and name not in next_map:
        next_map[name] = max(
            [
                order
                for order in (_coerce_order_value(value) for value in next_map.values())
                if order is not None
            ],
            default=0,
        ) + 1
    return next_map


@dataclass
class CustomFieldsService:
    settings: dict

    @property
    def db_path(self) -> str:
        return self.settings["local_db_path"]

    def list_definitions(
        self,
        *,
        scope: Optional[str] = None,
        enabled_only: bool = False,
    ) -> list[CaseCustomFieldDefinition]:
        definitions = normalize_custom_field_definitions(
            load_app_settings().get("custom_field_defs", [])
        )
        if scope in {"case", "finance"}:
            definitions = [
                entry for entry in definitions if entry.get("scope") == scope
            ]
        if enabled_only:
            definitions = [
                entry for entry in definitions if entry.get("enabled", True)
            ]
        return [CaseCustomFieldDefinition(**entry) for entry in definitions]

    def create_definition(
        self,
        payload: CaseCustomFieldCreatePayload,
    ) -> CaseCustomFieldDefinition:
        app_settings = load_app_settings()
        definitions = normalize_custom_field_definitions(
            app_settings.get("custom_field_defs", [])
        )

        name = str(payload.name or "").strip()
        lowered = name.lower()
        if not name:
            raise ValueError("Field name cannot be empty.")
        if lowered in RESERVED_FIELD_NAMES:
            raise ValueError(f"'{name}' is reserved and cannot be used as a custom field name.")
        if any(entry["name"].lower() == lowered for entry in definitions):
            raise ValueError(f"Field '{name}' already exists.")

        definition = {
            "name": name,
            "type": _normalize_type(payload.type),
            "options": _normalize_options(payload.options),
            "enabled": bool(payload.enabled),
            "scope": _normalize_scope(payload.scope),
        }
        definitions.append(definition)

        save_app_settings_keys(
            {
                "custom_field_defs": definitions,
                "visible_columns_v9": _upsert_visible_column(
                    list(app_settings.get("visible_columns_v9", []) or []),
                    definition["name"],
                    enabled=definition["enabled"],
                ),
                "column_order_map": _upsert_column_order(
                    dict(app_settings.get("column_order_map", {}) or {}),
                    definition["name"],
                    enabled=definition["enabled"],
                ),
            }
        )

        if definition["scope"] == "finance":
            finance_settings = load_finance_settings()
            save_finance_settings_keys(
                {
                    "visible_columns": _upsert_visible_column(
                        list(finance_settings.get("visible_columns", []) or []),
                        definition["name"],
                        enabled=definition["enabled"],
                    ),
                    "column_order_map": _upsert_column_order(
                        dict(finance_settings.get("column_order_map", {}) or {}),
                        definition["name"],
                        enabled=definition["enabled"],
                    ),
                }
            )

        return CaseCustomFieldDefinition(**definition)

    def update_definition(
        self,
        field_name: str,
        payload: CaseCustomFieldUpdatePayload,
    ) -> CaseCustomFieldDefinition:
        current_name = str(field_name or "").strip()
        lowered_current = current_name.lower()
        if not current_name:
            raise ValueError("Field name cannot be empty.")

        app_settings = load_app_settings()
        definitions = normalize_custom_field_definitions(
            app_settings.get("custom_field_defs", [])
        )
        index = next(
            (
                idx
                for idx, entry in enumerate(definitions)
                if entry["name"].lower() == lowered_current
            ),
            -1,
        )
        if index < 0:
            raise LookupError("Custom field not found.")

        existing = definitions[index]
        next_name = str(payload.name or "").strip()
        lowered_next = next_name.lower()
        if not next_name:
            raise ValueError("Field name cannot be empty.")
        if lowered_next in RESERVED_FIELD_NAMES:
            raise ValueError(f"'{next_name}' is reserved and cannot be used as a custom field name.")
        if any(
            idx != index and entry["name"].lower() == lowered_next
            for idx, entry in enumerate(definitions)
        ):
            raise ValueError(f"Field '{next_name}' already exists.")

        updated = {
            "name": next_name,
            "type": _normalize_type(payload.type),
            "options": _normalize_options(payload.options),
            "enabled": bool(payload.enabled),
            "scope": existing["scope"],
        }
        definitions[index] = updated

        if existing["name"] != updated["name"]:
            with db_session(self.db_path) as conn:
                user_cols = get_table_columns(conn, "case_user_data")
                key_col = first_existing(user_cols, ("field_key", "key"))
                if key_col:
                    conn.execute(
                        f"UPDATE case_user_data SET {key_col} = ? WHERE {key_col} = ?",
                        (updated["name"], existing["name"]),
                    )
                    conn.commit()

        save_app_settings_keys(
            {
                "custom_field_defs": definitions,
                "visible_columns_v9": _upsert_visible_column(
                    list(app_settings.get("visible_columns_v9", []) or []),
                    updated["name"],
                    enabled=updated["enabled"],
                    previous_name=existing["name"],
                ),
                "column_order_map": _upsert_column_order(
                    dict(app_settings.get("column_order_map", {}) or {}),
                    updated["name"],
                    enabled=updated["enabled"],
                    previous_name=existing["name"],
                ),
            }
        )

        if existing["scope"] == "finance":
            finance_settings = load_finance_settings()
            save_finance_settings_keys(
                {
                    "visible_columns": _upsert_visible_column(
                        list(finance_settings.get("visible_columns", []) or []),
                        updated["name"],
                        enabled=updated["enabled"],
                        previous_name=existing["name"],
                    ),
                    "column_order_map": _upsert_column_order(
                        dict(finance_settings.get("column_order_map", {}) or {}),
                        updated["name"],
                        enabled=updated["enabled"],
                        previous_name=existing["name"],
                    ),
                }
            )

        return CaseCustomFieldDefinition(**updated)
