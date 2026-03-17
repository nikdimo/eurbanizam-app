from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

from ..core import cases as cases_core
from ..core import finance_cases as finance_cases_core
from ..core.common import as_float, first_existing, get_table_columns, normalize_text
from ..core.settings_access import load_app_settings
from ..repositories.db import db_session
from ..schemas.cases import (
    CaseCreatePayload,
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

    def create_case(self, payload: CaseCreatePayload) -> Optional[CaseDetail]:
        manual_request_type = normalize_text(
            payload.request_type or "Рачно внесен предмет"
        )

        with db_session(self.db_path) as conn:
            cases_cols = get_table_columns(conn, "cases")
            if "case_id" not in cases_cols:
                return None

            now_dt = datetime.now()
            today_prefix = now_dt.strftime("%d%m%y")

            existing_ids = conn.execute(
                "SELECT case_id FROM cases WHERE case_id LIKE ?",
                (f"{today_prefix}.%",),
            ).fetchall()
            suffix = 0
            for (raw_id,) in existing_ids:
                try:
                    text = str(raw_id or "").strip()
                    if not text.startswith(f"{today_prefix}."):
                        continue
                    part = text.split(".", 1)[1]
                    suffix = max(suffix, int(part))
                except Exception:
                    continue
            next_id = f"{today_prefix}.{suffix + 1}"

            column_values: dict[str, object] = {"case_id": next_id}

            first_seen_at_col = first_existing(cases_cols, ("first_seen_at",))
            if first_seen_at_col:
                column_values[first_seen_at_col] = now_dt.strftime(
                    "%Y-%m-%d %H:%M:%S"
                )

            last_seen_at_col = first_existing(cases_cols, ("last_seen_at",))
            if last_seen_at_col:
                column_values[last_seen_at_col] = now_dt.strftime(
                    "%Y-%m-%d %H:%M:%S"
                )

            first_seen_source_col = first_existing(
                cases_cols, ("first_seen_source",)
            )
            if first_seen_source_col:
                column_values[first_seen_source_col] = "manual_sync"

            created_at_value = now_dt.strftime("%Y-%m-%d %H:%M:%S")

            title_column = first_existing(cases_cols, ("latest_title", "title"))
            if title_column:
                column_values[title_column] = normalize_text(payload.title)

            request_type_column = first_existing(
                cases_cols, ("latest_request_type", "request_type")
            )
            if request_type_column:
                column_values[request_type_column] = manual_request_type

            created_at_column = first_existing(
                cases_cols, ("official_created_at", "created_at")
            )
            if created_at_column:
                column_values[created_at_column] = created_at_value

            columns = list(column_values.keys())
            placeholders = ", ".join(["?"] * len(columns))
            sql = f"INSERT INTO cases ({', '.join(columns)}) VALUES ({placeholders})"
            conn.execute(sql, [column_values[name] for name in columns])

            updates = _dump_payload(
                CaseUpdatePayload(
                    request_type=manual_request_type,
                    phone=payload.phone,
                    custom_fields=payload.custom_fields or {},
                )
            )
            if updates:
                cases_core.update_case_record(conn, case_id=next_id, updates=updates)

            custom = payload.custom_fields or {}
            fin = payload.finance
            client_name = normalize_text(
                fin.client_name if fin and fin.client_name is not None else None
            ) or normalize_text(custom.get("Name / Last name"))
            client_phone = normalize_text(
                fin.client_phone if fin and fin.client_phone is not None else None
            ) or normalize_text(payload.phone)
            service_type = normalize_text(
                fin.service_type if fin and fin.service_type is not None else None
            ) or ""
            contract_sum = (
                as_float(fin.contract_sum)
                if fin and fin.contract_sum is not None
                else 0.0
            )
            currency = (
                str(fin.currency).strip()
                if fin and fin.currency is not None and str(fin.currency).strip()
                else "MKD"
            )
            paid_amount = (
                as_float(fin.paid_amount)
                if fin and fin.paid_amount is not None
                else 0.0
            )
            notes = normalize_text(fin.notes if fin and fin.notes is not None else None)
            finance_cases_core.upsert_finance_row(
                conn,
                {
                    "case_id": next_id,
                    "client_name": client_name or "",
                    "client_phone": client_phone or "",
                    "service_type": service_type or "",
                    "contract_sum": contract_sum,
                    "currency": currency,
                    "paid_amount": paid_amount,
                    "notes": notes or "",
                },
            )

            detail = cases_core.get_case_detail_dict(
                conn,
                case_id=next_id,
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
                custom_updates = updates.get("custom_fields")
                if isinstance(custom_updates, dict) and "Name / Last name" in custom_updates:
                    finance_cases_core.sync_finance_client_name_from_case(
                        conn,
                        case_id,
                        custom_updates.get("Name / Last name"),
                    )
                if "phone" in updates:
                    finance_cases_core.sync_finance_client_phone_from_case(
                        conn,
                        case_id,
                        updates.get("phone"),
                    )
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
