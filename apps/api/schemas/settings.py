from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class ProjectManagementConfig(BaseModel):
    finance_pin: Optional[str] = None
    deployment_label: Optional[str] = None
    api_service_name: Optional[str] = None
    web_service_name: Optional[str] = None
    bot_service_name: Optional[str] = None
    automation_timezone: str = "Europe/Copenhagen"
    smart_sync_schedule_enabled: bool = False
    smart_sync_time: str = "04:00"
    full_scrape_schedule_enabled: bool = False
    full_scrape_time: str = "03:00"
    full_scrape_day_of_week: int = 0
    daily_report_schedule_enabled: bool = False
    daily_report_time: str = "04:15"
    daily_report_hours: int = 24
    healthcheck_schedule_enabled: bool = False
    healthcheck_interval_minutes: int = 15
    healthcheck_stale_hours: int = 36
    healthcheck_remind_hours: int = 12
    smart_sync_test_pages: int = 2
    full_scrape_test_pages: int = 2
    headless_mode: Optional[bool] = None


class OperationalSettings(BaseModel):
    portal_username: Optional[str] = None
    portal_password: Optional[str] = None
    report_sender_email: Optional[str] = None
    report_sender_password: Optional[str] = None
    report_recipient_emails: Optional[str] = None
    smtp_server: Optional[str] = None
    smtp_port: Optional[int] = None
    telegram_chat_id: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    google_api_key: Optional[str] = None


class ProjectManagementUpdatePayload(BaseModel):
    finance_pin: Optional[str] = None
    deployment_label: Optional[str] = None
    api_service_name: Optional[str] = None
    web_service_name: Optional[str] = None
    bot_service_name: Optional[str] = None
    automation_timezone: Optional[str] = None
    smart_sync_schedule_enabled: Optional[bool] = None
    smart_sync_time: Optional[str] = None
    full_scrape_schedule_enabled: Optional[bool] = None
    full_scrape_time: Optional[str] = None
    full_scrape_day_of_week: Optional[int] = None
    daily_report_schedule_enabled: Optional[bool] = None
    daily_report_time: Optional[str] = None
    daily_report_hours: Optional[int] = None
    healthcheck_schedule_enabled: Optional[bool] = None
    healthcheck_interval_minutes: Optional[int] = None
    healthcheck_stale_hours: Optional[int] = None
    healthcheck_remind_hours: Optional[int] = None
    smart_sync_test_pages: Optional[int] = None
    full_scrape_test_pages: Optional[int] = None
    headless_mode: Optional[bool] = None
    portal_username: Optional[str] = None
    portal_password: Optional[str] = None
    report_sender_email: Optional[str] = None
    report_sender_password: Optional[str] = None
    report_recipient_emails: Optional[str] = None
    smtp_server: Optional[str] = None
    smtp_port: Optional[int] = None
    telegram_chat_id: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    google_api_key: Optional[str] = None


class RuntimeStatus(BaseModel):
    os_name: str
    platform: str
    python_executable: str
    project_root: str
    runtime_root: Optional[str] = None
    db_path: Optional[str] = None
    json_dir: Optional[str] = None
    logs_dir: Optional[str] = None
    db_exists: bool = False
    json_dir_exists: bool = False
    logs_dir_exists: bool = False
    secrets_file_exists: bool = False
    storage_state_exists: bool = False
    wkhtmltopdf_available: bool = False
    cron_available: bool = False
    systemctl_available: bool = False
    node_available: bool = False
    npm_available: bool = False
    portal_credentials_configured: bool = False
    email_credentials_configured: bool = False
    telegram_credentials_configured: bool = False
    google_api_key_configured: bool = False


class RuntimeMetrics(BaseModel):
    case_count: int = 0
    document_count: int = 0
    invoice_count: int = 0
    payment_count: int = 0
    email_log_count: int = 0
    json_file_count: int = 0


class HealthStatus(BaseModel):
    status: Optional[str] = None
    updated_at: Optional[str] = None
    last_email_subject_state: Optional[str] = None
    last_email_ok: Optional[bool] = None
    last_email_msg: Optional[str] = None


class SchedulerEntry(BaseModel):
    job: str
    enabled: bool = False
    schedule: str
    command_preview: str


class SchedulerStatus(BaseModel):
    driver: str = "manual"
    available: bool = False
    applied: bool = False
    timezone: Optional[str] = None
    entries: list[SchedulerEntry] = Field(default_factory=list)


class JobRunSummary(BaseModel):
    job: str
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    status: str = "unknown"


class ManagedProcessStatus(BaseModel):
    job: str
    label: str
    running: bool = False
    pid: Optional[int] = None
    started_at: Optional[str] = None
    command: Optional[str] = None


class ProjectManagementState(BaseModel):
    config: ProjectManagementConfig
    operations: OperationalSettings
    runtime: RuntimeStatus
    metrics: RuntimeMetrics
    health: HealthStatus
    scheduler: SchedulerStatus
    runs: list[JobRunSummary] = Field(default_factory=list)
    processes: list[ManagedProcessStatus] = Field(default_factory=list)


class JobActionPayload(BaseModel):
    action: str = "run"
    mode: str = "live"
    max_pages: Optional[int] = None
    hours: Optional[int] = None


class JobActionResult(BaseModel):
    job: str
    action: str
    accepted: bool
    message: str
    pid: Optional[int] = None
    log_path: Optional[str] = None
