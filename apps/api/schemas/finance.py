from __future__ import annotations

from typing import Dict, Optional

from pydantic import BaseModel, Field


class FinanceDashboardSummary(BaseModel):
    contract_total: float
    paid_total: float
    outstanding_total: float
    overdue_invoices: int
    needs_action_count: int = 0


class FinanceCaseListItem(BaseModel):
    case_id: str
    title: Optional[str] = None
    status: Optional[str] = None
    request_type: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    first_seen: Optional[str] = None
    days_since_update: Optional[int] = None
    phone: Optional[str] = None
    contract_sum: float = 0.0
    contract_amount: Optional[float] = None
    paid_total: float = 0.0
    remaining: float = 0.0
    payments_count: int = 0
    overdue_amount: float = 0.0
    currency: Optional[str] = None
    service_type: Optional[str] = None
    custom_fields: Dict[str, Optional[str]] = Field(default_factory=dict)


class Payment(BaseModel):
    payment_id: int
    case_id: str
    payment_date: Optional[str] = None
    amount: float
    currency: str = "MKD"
    note: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class Invoice(BaseModel):
    invoice_id: int
    case_id: str
    invoice_number: Optional[str] = None
    issue_date: Optional[str] = None
    due_date: Optional[str] = None
    amount: float
    currency: str = "MKD"
    status: Optional[str] = None
    client_name: Optional[str] = None
    client_email: Optional[str] = None
    client_address: Optional[str] = None
    service_description: Optional[str] = None
    items_json: Optional[str] = None
    file_path: Optional[str] = None
    reminders_enabled: Optional[int] = None
    reminder_first_after_days: Optional[int] = None
    reminder_repeat_days: Optional[int] = None
    reminder_max_count: Optional[int] = None
    reminder_sent_count: Optional[int] = None
    last_reminder_sent_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class EmailLogEntry(BaseModel):
    log_id: int
    case_id: str
    invoice_id: Optional[int] = None
    email_type: Optional[str] = None
    to_email: Optional[str] = None
    subject: Optional[str] = None
    body_preview: Optional[str] = None
    attachment_filename: Optional[str] = None
    attachment_size_bytes: Optional[int] = None
    reminder_sequence: Optional[int] = None
    sent_at: Optional[str] = None
    created_at: Optional[str] = None


class FinanceCaseRecipient(BaseModel):
    email: str
    last_used_at: Optional[str] = None
    label: Optional[str] = None


class RecipientLabelUpdate(BaseModel):
    label: Optional[str] = None


class FinanceCaseDetail(BaseModel):
    case_id: str
    title: Optional[str] = None
    status: Optional[str] = None
    request_type: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    first_seen: Optional[str] = None
    days_since_update: Optional[int] = None
    phone: Optional[str] = None
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    service_type: Optional[str] = None
    contract_sum: float = 0.0
    contract_amount: Optional[float] = None
    currency: Optional[str] = None
    paid_total: float = 0.0
    remaining: float = 0.0
    notes: Optional[str] = None
    invoiced_total: float = 0.0
    payments_count: int = 0
    overdue_amount: float = 0.0
    custom_fields: Dict[str, Optional[str]] = Field(default_factory=dict)
    payments: list[Payment]
    invoices: list[Invoice]
    email_log: list[EmailLogEntry]
    recipients: list[FinanceCaseRecipient] = Field(default_factory=list)


class FinanceProfilePayload(BaseModel):
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    service_type: Optional[str] = None
    contract_sum: Optional[float] = None
    currency: Optional[str] = None
    paid_amount: Optional[float] = None
    notes: Optional[str] = None


class FinanceOverviewUpdatePayload(BaseModel):
    phone: Optional[str] = None
    custom_fields: Dict[str, Optional[str]] = Field(default_factory=dict)


class PaymentCreatePayload(BaseModel):
    payment_date: str
    amount: float
    currency: str = "MKD"
    note: Optional[str] = None


class InvoiceCreatePayload(BaseModel):
    invoice_number: Optional[str] = None
    issue_date: Optional[str] = None
    due_date: Optional[str] = None
    amount: float
    currency: str = "MKD"
    status: str = "DRAFT"
    client_name: Optional[str] = None
    client_email: Optional[str] = None
    client_address: Optional[str] = None
    service_description: Optional[str] = None
    items_json: Optional[str] = None
    reminders_enabled: Optional[bool] = None
    reminder_first_after_days: Optional[int] = None
    reminder_repeat_days: Optional[int] = None
    reminder_max_count: Optional[int] = None


class InvoiceUpdatePayload(BaseModel):
    invoice_number: Optional[str] = None
    issue_date: Optional[str] = None
    due_date: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    status: Optional[str] = None
    client_name: Optional[str] = None
    client_email: Optional[str] = None
    client_address: Optional[str] = None
    service_description: Optional[str] = None
    items_json: Optional[str] = None
    file_path: Optional[str] = None
    reminders_enabled: Optional[bool] = None
    reminder_first_after_days: Optional[int] = None
    reminder_repeat_days: Optional[int] = None
    reminder_max_count: Optional[int] = None


class SendInvoiceEmailPayload(BaseModel):
    to_email: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    dry_run: bool = True


class FinanceSettingsPayload(BaseModel):
    company_name: Optional[str] = None
    company_address: Optional[str] = None
    company_city: Optional[str] = None
    company_tax_number: Optional[str] = None
    company_bank_name: Optional[str] = None
    company_bank_account: Optional[str] = None
    company_iban: Optional[str] = None
    company_email: Optional[str] = None
    company_phone: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_use_tls: Optional[bool] = None
    smtp_from_email: Optional[str] = None
    smtp_bcc: Optional[str] = None
    default_currency: Optional[str] = None
    invoice_email_subject_template: Optional[str] = None
    invoice_email_body_template: Optional[str] = None
    reminder_email_subject_template: Optional[str] = None
    reminder_email_body_template: Optional[str] = None


class FinanceFilterOptions(BaseModel):
    request_types: list[str] = Field(default_factory=list)
    statuses: list[str] = Field(default_factory=list)


class PaginatedFinanceCaseList(BaseModel):
    items: list[FinanceCaseListItem] = Field(default_factory=list)
    total: int = 0
    limit: int = 0
    offset: int = 0
