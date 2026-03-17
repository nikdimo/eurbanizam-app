from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

from ..core import cases as cases_core
from ..core.settings_access import load_app_settings
from ..repositories.db import db_session
from ..schemas.cases import (
    CaseCustomFieldDefinition,
    CaseDetail,
    CaseFilterOptions,
    CaseListItem,
    PaginatedCaseList,
    CaseUpdatePayload,
)

FIXED_CASE_FIELD_NAMES = (
    "address",
    "email",
    "alternate_emails",
    "Name / Last name",
)


@dataclass
class CasesService:
    settings: dict

    @property
    def db_path(self) -> str:
        return self.settings["local_db_path"]

    def list_cases(
        self,
        search: Optional[str],
        request_types: Optional[List[str]],
        statuses: Optional[List[str]],
        date_from: Optional[str],
        date_to: Optional[str],
        limit: int,
        offset: int,
        sort_by: Optional[str] = None,
        sort_desc: bool = True,
    ) -> PaginatedCaseList:
        with db_session(self.db_path) as conn:
            rows, total = cases_core.list_case_dicts(
                conn,
                search=search,
                request_types=request_types,
                statuses=statuses,
                date_from=date_from,
                date_to=date_to,
                custom_field_names=self.get_custom_field_names(),
                limit=limit,
                offset=offset,
                sort_by=sort_by,
                sort_desc=sort_desc,
            )
        return PaginatedCaseList(
            items=[CaseListItem(**row) for row in rows],
            total=total,
            limit=limit,
            offset=offset,
        )

    def get_case(self, case_id: str) -> Optional[CaseDetail]:
        with db_session(self.db_path) as conn:
            detail = cases_core.get_case_detail_dict(
                conn,
                case_id=case_id,
                custom_field_names=self.get_custom_field_names(),
            )
        return CaseDetail(**detail) if detail else None

    def update_case(self, case_id: str, payload: CaseUpdatePayload) -> Optional[CaseDetail]:
        updates = _dump_payload(payload)
        with db_session(self.db_path) as conn:
            existing = cases_core.get_case_detail_dict(
                conn,
                case_id=case_id,
                custom_field_names=self.get_custom_field_names(),
            )
            if existing is None:
                return None
            if updates:
                cases_core.update_case_record(conn, case_id=case_id, updates=updates)
            refreshed = cases_core.get_case_detail_dict(
                conn,
                case_id=case_id,
                custom_field_names=self.get_custom_field_names(),
            )
        return CaseDetail(**refreshed) if refreshed else None

    def get_custom_field_names(self) -> list[str]:
        names = [entry.name for entry in self.get_custom_field_definitions()]
        for fixed_name in FIXED_CASE_FIELD_NAMES:
            if fixed_name not in names:
                names.append(fixed_name)
        return names

    def get_custom_field_definitions(self) -> list[CaseCustomFieldDefinition]:
        settings = load_app_settings()
        defs = settings.get("custom_field_defs", [])
        out: list[CaseCustomFieldDefinition] = []
        for entry in defs:
            name = str(entry.get("name", "")).strip()
            scope = str(entry.get("scope", "case") or "case").strip().lower()
            if not name or not entry.get("enabled", True) or scope == "finance":
                continue
            out.append(
                CaseCustomFieldDefinition(
                    name=name,
                    type=str(entry.get("type", "Text") or "Text"),
                    options=[
                        str(option).strip()
                        for option in (entry.get("options", []) or [])
                        if str(option).strip()
                    ],
                    enabled=bool(entry.get("enabled", True)),
                    scope=scope,
                )
            )
        return out

    def get_filter_options(self) -> CaseFilterOptions:
        with db_session(self.db_path) as conn:
            options = cases_core.get_case_filter_options(conn)
        return CaseFilterOptions(**options)


def _dump_payload(payload: object) -> dict:
    if hasattr(payload, "model_dump"):
        return payload.model_dump(exclude_none=True)
    if hasattr(payload, "dict"):
        return payload.dict(exclude_none=True)
    return {}
