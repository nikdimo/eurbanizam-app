from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

from ..core import finance_cases, finance_invoices
from ..core.settings_access import load_app_settings, save_finance_settings_keys
from ..repositories.db import db_session
from ..services.custom_fields_service import normalize_custom_field_definitions
from ..schemas.finance import (
    EmailLogEntry,
    FinanceCaseDetail,
    FinanceFilterOptions,
    FinanceCaseListItem,
    FinanceSettingsPayload,
    PaginatedFinanceCaseList,
    FinanceDashboardSummary,
    FinanceOverviewUpdatePayload,
    FinanceProfilePayload,
    Invoice,
    InvoiceCreatePayload,
    InvoiceUpdatePayload,
    Payment,
    PaymentCreatePayload,
    SendInvoiceEmailPayload,
)

FIXED_CASE_FIELD_NAMES = ("address",)


@dataclass
class FinanceService:
    settings: dict

    @property
    def db_path(self) -> str:
        return self.settings["local_db_path"]

    def get_dashboard_summary(self) -> FinanceDashboardSummary:
        with db_session(self.db_path) as conn:
            summary = finance_cases.summarize_dashboard(conn)
        return FinanceDashboardSummary(**summary)

    def list_cases(
        self,
        search: Optional[str],
        request_types: Optional[List[str]],
        statuses: Optional[List[str]],
        date_from: Optional[str],
        date_to: Optional[str],
        overdue_only: bool,
        needs_action_only: bool,
        limit: int,
        offset: int,
    ) -> PaginatedFinanceCaseList:
        with db_session(self.db_path) as conn:
            rows, total = finance_cases.list_finance_case_summaries(
                conn,
                search=search,
                request_types=request_types,
                statuses=statuses,
                date_from=date_from,
                date_to=date_to,
                overdue_only=overdue_only,
                needs_action_only=needs_action_only,
                custom_field_names=self.get_custom_field_names(),
                limit=limit,
                offset=offset,
            )
        return PaginatedFinanceCaseList(
            items=[FinanceCaseListItem(**row) for row in rows],
            total=total,
            limit=limit,
            offset=offset,
        )

    def get_case_detail(self, case_id: str) -> Optional[FinanceCaseDetail]:
        with db_session(self.db_path) as conn:
            detail = finance_cases.get_finance_case_detail_dict(
                conn,
                case_id,
                custom_field_names=self.get_custom_field_names(),
            )
        return FinanceCaseDetail(**detail) if detail else None

    def update_overview(
        self,
        case_id: str,
        payload: FinanceOverviewUpdatePayload,
    ) -> Optional[FinanceCaseDetail]:
        updates = _dump_payload(payload)
        with db_session(self.db_path) as conn:
            if "finance_status" in updates:
                finance_cases.ensure_finance_case_exists(
                    conn,
                    case_id,
                    {
                        "currency": "MKD",
                        "finance_status": updates.get("finance_status") or "GRAY",
                    },
                )
                conn.execute(
                    """
                    UPDATE finance_cases
                    SET finance_status = ?, updated_at = ?
                    WHERE case_id = ?
                    """,
                    (
                        updates.get("finance_status") or "GRAY",
                        datetime.now().isoformat(timespec="seconds"),
                        case_id,
                    ),
                )

            case_updates = {}
            if "phone" in updates:
                case_updates["phone"] = updates.get("phone")
            if isinstance(updates.get("custom_fields"), dict) and updates["custom_fields"]:
                case_updates["custom_fields"] = updates["custom_fields"]
            if case_updates:
                finance_cases.cases_core.update_case_record(
                    conn,
                    case_id=case_id,
                    updates=case_updates,
                )

            detail = finance_cases.get_finance_case_detail_dict(
                conn,
                case_id,
                custom_field_names=self.get_custom_field_names(),
            )
        return FinanceCaseDetail(**detail) if detail else None

    def upsert_profile(self, case_id: str, payload: FinanceProfilePayload) -> FinanceCaseDetail:
        with db_session(self.db_path) as conn:
            finance_cases.upsert_finance_profile(conn, case_id, _dump_payload(payload))
            detail = finance_cases.get_finance_case_detail_dict(
                conn,
                case_id,
                custom_field_names=self.get_custom_field_names(),
            )
        return FinanceCaseDetail(**detail)

    def list_payments(self, case_id: str) -> List[Payment]:
        with db_session(self.db_path) as conn:
            rows = finance_invoices.list_payments(conn, case_id)
        return [Payment(**row) for row in rows]

    def add_payment(self, case_id: str, payload: PaymentCreatePayload) -> FinanceCaseDetail:
        with db_session(self.db_path) as conn:
            finance_cases.ensure_finance_case_exists(
                conn,
                case_id,
                {
                    "currency": payload.currency,
                    "finance_status": "GRAY",
                },
            )
            finance_invoices.insert_payment(
                conn,
                case_id=case_id,
                payment_date=payload.payment_date,
                amount=payload.amount,
                currency=payload.currency,
                note=payload.note or "",
            )
            finance_invoices.sync_paid_amount_from_events(conn, case_id)
            detail = finance_cases.get_finance_case_detail_dict(
                conn,
                case_id,
                custom_field_names=self.get_custom_field_names(),
            )
        if detail is None:
            raise RuntimeError("Payment created but finance case detail could not be loaded")
        return FinanceCaseDetail(**detail)

    def delete_payment(self, payment_id: int) -> Optional[FinanceCaseDetail]:
        with db_session(self.db_path) as conn:
            case_id = finance_invoices.delete_payment_record(conn, payment_id)
            if case_id is None:
                return None
            finance_invoices.sync_paid_amount_from_events(conn, case_id)
            detail = finance_cases.get_finance_case_detail_dict(
                conn,
                case_id,
                custom_field_names=self.get_custom_field_names(),
            )
        return FinanceCaseDetail(**detail) if detail else None

    def list_invoices(self, case_id: str) -> List[Invoice]:
        with db_session(self.db_path) as conn:
            rows = finance_invoices.list_invoices(conn, case_id)
        return [Invoice(**row) for row in rows]

    def create_invoice(self, case_id: str, payload: InvoiceCreatePayload) -> Invoice:
        with db_session(self.db_path) as conn:
            row = finance_invoices.create_invoice(conn, case_id, _dump_payload(payload))
        return Invoice(**row)

    def update_invoice(self, invoice_id: int, payload: InvoiceUpdatePayload) -> Optional[Invoice]:
        with db_session(self.db_path) as conn:
            row = finance_invoices.update_invoice(conn, invoice_id, _dump_payload(payload))
        return Invoice(**row) if row else None

    def delete_invoice(self, invoice_id: int) -> bool:
        with db_session(self.db_path) as conn:
            return finance_invoices.delete_invoice(conn, invoice_id)

    def get_email_log(self, case_id: str, invoice_id: Optional[int]) -> List[EmailLogEntry]:
        with db_session(self.db_path) as conn:
            rows = finance_invoices.list_email_log(conn, case_id, invoice_id)
        return [EmailLogEntry(**row) for row in rows]

    def send_invoice_email(self, invoice_id: int, payload: SendInvoiceEmailPayload) -> Optional[dict]:
        with db_session(self.db_path) as conn:
            return finance_invoices.send_invoice_email(conn, invoice_id, _dump_payload(payload))

    def send_invoice_reminder(self, invoice_id: int, payload: SendInvoiceEmailPayload) -> Optional[dict]:
        with db_session(self.db_path) as conn:
            return finance_invoices.send_invoice_reminder(conn, invoice_id, _dump_payload(payload))

    def get_invoice_pdf(self, invoice_id: int) -> Optional[tuple[bytes, str]]:
        with db_session(self.db_path) as conn:
            pdf_bytes, filename = finance_invoices.generate_invoice_pdf(conn, invoice_id)
        if pdf_bytes and filename:
            return (pdf_bytes, filename)
        return None

    def delete_case_recipient(self, case_id: str, email: str) -> bool:
        with db_session(self.db_path) as conn:
            return finance_invoices.delete_case_recipient(conn, case_id, email)

    def update_recipient_label(
        self, case_id: str, email: str, label: Optional[str] = None
    ) -> bool:
        with db_session(self.db_path) as conn:
            return finance_invoices.update_case_recipient_label(
                conn, case_id, email, label
            )

    def get_custom_field_definitions(self) -> list[dict]:
        settings = load_app_settings()
        defs = normalize_custom_field_definitions(
            settings.get("custom_field_defs", [])
        )
        return [
            entry
            for entry in defs
            if str(entry.get("name", "")).strip() and entry.get("enabled", True)
        ]

    def get_custom_field_names(self) -> list[str]:
        names = [
            str(entry.get("name", "")).strip()
            for entry in self.get_custom_field_definitions()
        ]
        for fixed_name in FIXED_CASE_FIELD_NAMES:
            if fixed_name not in names:
                names.append(fixed_name)
        return names

    def get_filter_options(self) -> FinanceFilterOptions:
        with db_session(self.db_path) as conn:
            options = finance_cases.get_finance_filter_options(conn)
        return FinanceFilterOptions(**options)

    def update_finance_settings(self, payload: FinanceSettingsPayload) -> dict:
        updates = _dump_payload(payload)
        return save_finance_settings_keys(updates)


def _dump_payload(payload: object) -> dict:
    if hasattr(payload, "model_dump"):
        return payload.model_dump(exclude_none=True)
    if hasattr(payload, "dict"):
        return payload.dict(exclude_none=True)
    return {}
