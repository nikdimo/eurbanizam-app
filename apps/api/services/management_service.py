from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import json
import os
from pathlib import Path
import platform
import shutil
import shlex
import subprocess
import sys
import time
from typing import Any, Iterable, Optional

import psutil

from ..core.settings_access import load_app_settings, save_app_settings_keys
from ..repositories.db import db_session
from ..schemas.settings import (
    HealthStatus,
    JobActionPayload,
    JobActionResult,
    JobRunSummary,
    ManagedProcessStatus,
    ProjectManagementConfig,
    ProjectManagementState,
    ProjectManagementUpdatePayload,
    RuntimeMetrics,
    RuntimeStatus,
    SchedulerEntry,
    SchedulerStatus,
)


ROOT = Path(__file__).resolve().parents[3]
TOOLS_DIR = ROOT / "tools"
CRON_BLOCK_START = "# BEGIN EURBANIZAM_MANAGED"
CRON_BLOCK_END = "# END EURBANIZAM_MANAGED"
DEFAULT_BOT_SERVICE_NAME = "eurbanizam-bot.service"


JOB_SPECS: dict[str, dict[str, str]] = {
    "smart_sync": {
        "label": "Smart sync",
        "script": "smart_sync.py",
        "mode": "smart_sync",
        "log_prefix": "smart-sync",
    },
    "full_scrape": {
        "label": "Full scrape",
        "script": "scrape_full_two_phase_to_db.py",
        "mode": "full",
        "log_prefix": "full-scrape",
    },
    "report": {
        "label": "Daily report",
        "script": "daily_report.py",
        "mode": "report",
        "log_prefix": "daily-report",
    },
    "healthcheck": {
        "label": "Healthcheck",
        "script": "system_healthcheck.py",
        "mode": "healthcheck",
        "log_prefix": "healthcheck",
    },
    "project_checks": {
        "label": "Project checks",
        "script": "project_checks.py",
        "mode": "checks",
        "log_prefix": "project-checks",
    },
    "telegram_bot": {
        "label": "Telegram bot",
        "script": "telegram_bot_server.py",
        "mode": "telegram_bot",
        "log_prefix": "telegram-bot",
    },
}


DEFAULT_MANAGEMENT: dict[str, Any] = {
    "automation": {
        "timezone": "Europe/Copenhagen",
        "smart_sync_enabled": False,
        "smart_sync_time": "04:00",
        "full_scrape_enabled": False,
        "full_scrape_time": "03:00",
        "full_scrape_day_of_week": 0,
        "daily_report_enabled": False,
        "daily_report_time": "04:15",
        "daily_report_hours": 24,
        "healthcheck_enabled": False,
        "healthcheck_interval_minutes": 15,
        "healthcheck_stale_hours": 36,
        "healthcheck_remind_hours": 12,
    },
    "tools": {
        "smart_sync_test_pages": 2,
        "full_scrape_test_pages": 2,
        "headless_mode": None,
    },
}

MANAGEMENT_STATE_CACHE_TTL_SECONDS = 10.0
PROCESS_SCAN_CACHE_TTL_SECONDS = 5.0

_MANAGEMENT_STATE_CACHE: dict[str, Any] = {
    "expires_at": 0.0,
    "value": None,
}
_PROCESS_SCAN_CACHE: dict[str, Any] = {
    "expires_at": 0.0,
    "value": None,
}


def _now_stamp() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def _parse_bool(value: Any) -> Optional[bool]:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return value
    lowered = str(value).strip().lower()
    if lowered in {"1", "true", "yes", "on"}:
        return True
    if lowered in {"0", "false", "no", "off"}:
        return False
    return None


def _normalize_time(value: Any, default: str) -> str:
    text = str(value or "").strip()
    if len(text) == 5 and text[2] == ":":
        hh, mm = text.split(":", 1)
        if hh.isdigit() and mm.isdigit():
            hour = max(0, min(23, int(hh)))
            minute = max(0, min(59, int(mm)))
            return f"{hour:02d}:{minute:02d}"
    return default


def _int_or_default(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        number = int(value)
    except Exception:
        return default
    return max(minimum, min(maximum, number))


def _read_secret_keys(path: Path) -> set[str]:
    if not path.exists():
        return set()
    text = None
    for encoding in ("utf-8", "utf-8-sig", "cp1252", "latin-1"):
        try:
            text = path.read_text(encoding=encoding)
            break
        except Exception:
            text = None
    if text is None:
        return set()
    keys: set[str] = set()
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key = line.split("=", 1)[0].strip()
        if key:
            keys.add(key)
    return keys


def _has_table(conn, table_name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def _load_table_names(conn) -> set[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ).fetchall()
    return {str(row[0]) for row in rows}


def _load_management_section(raw: dict[str, Any]) -> ProjectManagementConfig:
    management = raw.get("management") if isinstance(raw.get("management"), dict) else {}
    automation = (
        management.get("automation")
        if isinstance(management.get("automation"), dict)
        else {}
    )
    tools = management.get("tools") if isinstance(management.get("tools"), dict) else {}
    return ProjectManagementConfig(
        finance_pin=str(raw.get("finance_pin") or "").strip() or None,
        bot_service_name=str(raw.get("bot_service_name") or DEFAULT_BOT_SERVICE_NAME),
        automation_timezone=str(
            automation.get("timezone")
            or DEFAULT_MANAGEMENT["automation"]["timezone"]
        ),
        smart_sync_schedule_enabled=bool(
            automation.get(
                "smart_sync_enabled",
                DEFAULT_MANAGEMENT["automation"]["smart_sync_enabled"],
            )
        ),
        smart_sync_time=_normalize_time(
            automation.get("smart_sync_time"),
            DEFAULT_MANAGEMENT["automation"]["smart_sync_time"],
        ),
        full_scrape_schedule_enabled=bool(
            automation.get(
                "full_scrape_enabled",
                DEFAULT_MANAGEMENT["automation"]["full_scrape_enabled"],
            )
        ),
        full_scrape_time=_normalize_time(
            automation.get("full_scrape_time"),
            DEFAULT_MANAGEMENT["automation"]["full_scrape_time"],
        ),
        full_scrape_day_of_week=_int_or_default(
            automation.get("full_scrape_day_of_week"),
            DEFAULT_MANAGEMENT["automation"]["full_scrape_day_of_week"],
            0,
            6,
        ),
        daily_report_schedule_enabled=bool(
            automation.get(
                "daily_report_enabled",
                DEFAULT_MANAGEMENT["automation"]["daily_report_enabled"],
            )
        ),
        daily_report_time=_normalize_time(
            automation.get("daily_report_time"),
            DEFAULT_MANAGEMENT["automation"]["daily_report_time"],
        ),
        daily_report_hours=_int_or_default(
            automation.get("daily_report_hours"),
            DEFAULT_MANAGEMENT["automation"]["daily_report_hours"],
            1,
            168,
        ),
        healthcheck_schedule_enabled=bool(
            automation.get(
                "healthcheck_enabled",
                DEFAULT_MANAGEMENT["automation"]["healthcheck_enabled"],
            )
        ),
        healthcheck_interval_minutes=_int_or_default(
            automation.get("healthcheck_interval_minutes"),
            DEFAULT_MANAGEMENT["automation"]["healthcheck_interval_minutes"],
            5,
            240,
        ),
        healthcheck_stale_hours=_int_or_default(
            automation.get("healthcheck_stale_hours"),
            DEFAULT_MANAGEMENT["automation"]["healthcheck_stale_hours"],
            1,
            240,
        ),
        healthcheck_remind_hours=_int_or_default(
            automation.get("healthcheck_remind_hours"),
            DEFAULT_MANAGEMENT["automation"]["healthcheck_remind_hours"],
            1,
            240,
        ),
        smart_sync_test_pages=_int_or_default(
            tools.get("smart_sync_test_pages"),
            DEFAULT_MANAGEMENT["tools"]["smart_sync_test_pages"],
            1,
            50,
        ),
        full_scrape_test_pages=_int_or_default(
            tools.get("full_scrape_test_pages"),
            DEFAULT_MANAGEMENT["tools"]["full_scrape_test_pages"],
            1,
            50,
        ),
        headless_mode=_parse_bool(tools.get("headless_mode")),
    )


def _quote_shell(parts: Iterable[str]) -> str:
    return " ".join(shlex.quote(str(part)) for part in parts)


def _invalidate_management_caches() -> None:
    _MANAGEMENT_STATE_CACHE["expires_at"] = 0.0
    _MANAGEMENT_STATE_CACHE["value"] = None
    _PROCESS_SCAN_CACHE["expires_at"] = 0.0
    _PROCESS_SCAN_CACHE["value"] = None


@dataclass
class ManagementService:
    settings: dict

    @property
    def raw(self) -> dict[str, Any]:
        return self.settings.get("raw", {})

    @property
    def config(self) -> ProjectManagementConfig:
        return _load_management_section(self.raw)

    @property
    def runtime_root(self) -> Path:
        return Path(self.settings["runtime_root"])

    @property
    def db_path(self) -> Path:
        return Path(self.settings["local_db_path"])

    @property
    def json_dir(self) -> Path:
        return Path(self.settings["local_json_dir"])

    @property
    def logs_dir(self) -> Path:
        return Path(self.settings["local_logs_dir"])

    def get_management_state(self) -> ProjectManagementState:
        now = time.monotonic()
        cached = _MANAGEMENT_STATE_CACHE.get("value")
        if cached is not None and float(_MANAGEMENT_STATE_CACHE.get("expires_at", 0.0)) > now:
            return cached

        health = self.get_health_status()
        state = ProjectManagementState(
            config=self.config,
            runtime=self.get_runtime_status(),
            metrics=self.get_runtime_metrics(),
            health=health,
            scheduler=self.get_scheduler_status(),
            runs=self.get_run_summaries(health=health),
            processes=self.get_process_statuses(),
        )
        _MANAGEMENT_STATE_CACHE["value"] = state
        _MANAGEMENT_STATE_CACHE["expires_at"] = (
            now + MANAGEMENT_STATE_CACHE_TTL_SECONDS
        )
        return state

    def get_runtime_status(self) -> RuntimeStatus:
        secrets_path = self.runtime_root / "secrets" / ".eurbanizam_secrets.env"
        secret_keys = _read_secret_keys(secrets_path)
        return RuntimeStatus(
            os_name=os.name,
            platform=platform.platform(),
            python_executable=sys.executable,
            project_root=str(ROOT),
            runtime_root=str(self.runtime_root),
            db_path=str(self.db_path),
            json_dir=str(self.json_dir),
            logs_dir=str(self.logs_dir),
            db_exists=self.db_path.exists(),
            json_dir_exists=self.json_dir.exists(),
            logs_dir_exists=self.logs_dir.exists(),
            secrets_file_exists=secrets_path.exists(),
            storage_state_exists=(self.runtime_root / "state" / "storage_state.json").exists(),
            wkhtmltopdf_available=shutil.which("wkhtmltopdf") is not None,
            cron_available=shutil.which("crontab") is not None and os.name != "nt",
            systemctl_available=shutil.which("systemctl") is not None and os.name != "nt",
            node_available=shutil.which("node") is not None,
            npm_available=shutil.which("npm") is not None,
            portal_credentials_configured={
                "PORTAL_USERNAME",
                "PORTAL_PASSWORD",
            }.issubset(secret_keys),
            email_credentials_configured=bool(
                {"EMAIL_USER", "EMAIL_PASS"}.issubset(secret_keys)
                or {
                    "SMTP_SERVER",
                    "EMAIL_USER",
                    "EMAIL_PASS",
                }.issubset(secret_keys)
            ),
            telegram_credentials_configured={"TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"}.issubset(
                secret_keys
            ),
        )

    def get_runtime_metrics(self) -> RuntimeMetrics:
        metrics = RuntimeMetrics(
            json_file_count=(
                sum(1 for _ in self.json_dir.glob("*.json"))
                if self.json_dir.exists()
                else 0
            )
        )
        if not self.db_path.exists():
            return metrics

        try:
            with db_session(self.db_path) as conn:
                table_names = _load_table_names(conn)
                if "cases" in table_names:
                    row = conn.execute("SELECT COUNT(*) FROM cases").fetchone()
                    metrics.case_count = int(row[0] or 0)
                if "case_documents" in table_names:
                    row = conn.execute("SELECT COUNT(*) FROM case_documents").fetchone()
                    metrics.document_count = int(row[0] or 0)
                if "finance_invoices" in table_names:
                    row = conn.execute("SELECT COUNT(*) FROM finance_invoices").fetchone()
                    metrics.invoice_count = int(row[0] or 0)
                if "finance_payments" in table_names:
                    row = conn.execute("SELECT COUNT(*) FROM finance_payments").fetchone()
                    metrics.payment_count = int(row[0] or 0)
                if "finance_email_log" in table_names:
                    row = conn.execute("SELECT COUNT(*) FROM finance_email_log").fetchone()
                    metrics.email_log_count = int(row[0] or 0)
        except Exception:
            return metrics
        return metrics

    def get_health_status(self) -> HealthStatus:
        state_path = self.runtime_root / "state" / "system_health_state.json"
        if not state_path.exists():
            return HealthStatus()
        try:
            payload = json.loads(state_path.read_text(encoding="utf-8"))
        except Exception:
            return HealthStatus()
        return HealthStatus(
            status=payload.get("status"),
            updated_at=payload.get("updated_at"),
            last_email_subject_state=payload.get("last_email_subject_state"),
            last_email_ok=payload.get("last_email_ok"),
            last_email_msg=payload.get("last_email_msg"),
        )

    def get_run_summaries(
        self, health: Optional[HealthStatus] = None
    ) -> list[JobRunSummary]:
        summaries: list[JobRunSummary] = []
        if self.db_path.exists():
            try:
                with db_session(self.db_path) as conn:
                    if "runs" in _load_table_names(conn):
                        for job_name, mode in (
                            ("smart_sync", "smart_sync"),
                            ("full_scrape", "full"),
                        ):
                            row = conn.execute(
                                """
                                SELECT started_at, finished_at
                                FROM runs
                                WHERE mode = ?
                                ORDER BY run_id DESC
                                LIMIT 1
                                """,
                                (mode,),
                            ).fetchone()
                            status = "never"
                            started_at = None
                            finished_at = None
                            if row is not None:
                                started_at = row[0]
                                finished_at = row[1]
                                status = "finished" if finished_at else "running"
                            summaries.append(
                                JobRunSummary(
                                    job=job_name,
                                    started_at=started_at,
                                    finished_at=finished_at,
                                    status=status,
                                )
                            )
            except Exception:
                pass

        report_path = self._latest_matching_file(
            self.runtime_root / "snapshots",
            "eurbanizam_report_*.html",
        )
        summaries.append(
            JobRunSummary(
                job="report",
                finished_at=self._path_mtime_iso(report_path),
                status="finished" if report_path else "never",
            )
        )
        if health is None:
            health = self.get_health_status()
        summaries.append(
            JobRunSummary(
                job="healthcheck",
                finished_at=health.updated_at,
                status="finished" if health.updated_at else "never",
            )
        )
        checks_log = self._latest_matching_file(
            self.logs_dir / "management",
            "project-checks-*.log",
        )
        summaries.append(
            JobRunSummary(
                job="project_checks",
                finished_at=self._path_mtime_iso(checks_log),
                status="finished" if checks_log else "never",
            )
        )
        return summaries

    def get_process_statuses(self) -> list[ManagedProcessStatus]:
        process_map = self._scan_managed_processes()
        statuses: list[ManagedProcessStatus] = []
        for job_name, spec in JOB_SPECS.items():
            processes = process_map.get(spec["script"], [])
            active = processes[0] if processes else None
            statuses.append(
                ManagedProcessStatus(
                    job=job_name,
                    label=spec["label"],
                    running=active is not None,
                    pid=active["pid"] if active else None,
                    started_at=active["started_at"] if active else None,
                    command=active["command"] if active else None,
                )
            )
        return statuses

    def get_scheduler_status(self) -> SchedulerStatus:
        config = self.config
        entries = self._build_scheduler_entries(config)
        available = shutil.which("crontab") is not None and os.name != "nt"
        if not available:
            return SchedulerStatus(
                driver="manual",
                available=False,
                applied=False,
                timezone=config.automation_timezone,
                entries=entries,
            )

        cron_text = self._read_crontab()
        expected_block = self._build_cron_block(config)
        block_present = CRON_BLOCK_START in cron_text and CRON_BLOCK_END in cron_text
        applied = block_present and expected_block.strip() in cron_text
        return SchedulerStatus(
            driver="cron",
            available=True,
            applied=applied,
            timezone=config.automation_timezone,
            entries=entries,
        )

    def update_project_settings(self, payload: ProjectManagementUpdatePayload) -> ProjectManagementState:
        current_raw = dict(load_app_settings().get("raw", {}))
        management = (
            dict(current_raw.get("management"))
            if isinstance(current_raw.get("management"), dict)
            else {}
        )
        automation = (
            dict(management.get("automation"))
            if isinstance(management.get("automation"), dict)
            else {}
        )
        tools = (
            dict(management.get("tools"))
            if isinstance(management.get("tools"), dict)
            else {}
        )
        fields = payload.model_fields_set

        if "finance_pin" in fields:
            current_raw["finance_pin"] = (
                str(payload.finance_pin).strip() if payload.finance_pin else None
            )
        if "bot_service_name" in fields:
            current_raw["bot_service_name"] = (
                str(payload.bot_service_name).strip()
                if payload.bot_service_name
                else DEFAULT_BOT_SERVICE_NAME
            )
        if "automation_timezone" in fields:
            automation["timezone"] = (
                str(payload.automation_timezone).strip()
                if payload.automation_timezone
                else DEFAULT_MANAGEMENT["automation"]["timezone"]
            )
        if "smart_sync_schedule_enabled" in fields:
            automation["smart_sync_enabled"] = bool(payload.smart_sync_schedule_enabled)
        if "smart_sync_time" in fields:
            automation["smart_sync_time"] = _normalize_time(
                payload.smart_sync_time,
                DEFAULT_MANAGEMENT["automation"]["smart_sync_time"],
            )
        if "full_scrape_schedule_enabled" in fields:
            automation["full_scrape_enabled"] = bool(payload.full_scrape_schedule_enabled)
        if "full_scrape_time" in fields:
            automation["full_scrape_time"] = _normalize_time(
                payload.full_scrape_time,
                DEFAULT_MANAGEMENT["automation"]["full_scrape_time"],
            )
        if "full_scrape_day_of_week" in fields:
            automation["full_scrape_day_of_week"] = _int_or_default(
                payload.full_scrape_day_of_week,
                DEFAULT_MANAGEMENT["automation"]["full_scrape_day_of_week"],
                0,
                6,
            )
        if "daily_report_schedule_enabled" in fields:
            automation["daily_report_enabled"] = bool(payload.daily_report_schedule_enabled)
        if "daily_report_time" in fields:
            automation["daily_report_time"] = _normalize_time(
                payload.daily_report_time,
                DEFAULT_MANAGEMENT["automation"]["daily_report_time"],
            )
        if "daily_report_hours" in fields:
            automation["daily_report_hours"] = _int_or_default(
                payload.daily_report_hours,
                DEFAULT_MANAGEMENT["automation"]["daily_report_hours"],
                1,
                168,
            )
        if "healthcheck_schedule_enabled" in fields:
            automation["healthcheck_enabled"] = bool(payload.healthcheck_schedule_enabled)
        if "healthcheck_interval_minutes" in fields:
            automation["healthcheck_interval_minutes"] = _int_or_default(
                payload.healthcheck_interval_minutes,
                DEFAULT_MANAGEMENT["automation"]["healthcheck_interval_minutes"],
                5,
                240,
            )
        if "healthcheck_stale_hours" in fields:
            automation["healthcheck_stale_hours"] = _int_or_default(
                payload.healthcheck_stale_hours,
                DEFAULT_MANAGEMENT["automation"]["healthcheck_stale_hours"],
                1,
                240,
            )
        if "healthcheck_remind_hours" in fields:
            automation["healthcheck_remind_hours"] = _int_or_default(
                payload.healthcheck_remind_hours,
                DEFAULT_MANAGEMENT["automation"]["healthcheck_remind_hours"],
                1,
                240,
            )
        if "smart_sync_test_pages" in fields:
            tools["smart_sync_test_pages"] = _int_or_default(
                payload.smart_sync_test_pages,
                DEFAULT_MANAGEMENT["tools"]["smart_sync_test_pages"],
                1,
                50,
            )
        if "full_scrape_test_pages" in fields:
            tools["full_scrape_test_pages"] = _int_or_default(
                payload.full_scrape_test_pages,
                DEFAULT_MANAGEMENT["tools"]["full_scrape_test_pages"],
                1,
                50,
            )
        if "headless_mode" in fields:
            tools["headless_mode"] = _parse_bool(payload.headless_mode)

        management["automation"] = automation
        management["tools"] = tools
        current_raw["management"] = management

        save_app_settings_keys(
            {
                "finance_pin": current_raw.get("finance_pin"),
                "bot_service_name": current_raw.get("bot_service_name"),
                "management": current_raw.get("management"),
            }
        )
        self.settings = load_app_settings()
        _invalidate_management_caches()
        self.apply_scheduler()
        return self.get_management_state()

    def apply_scheduler(self) -> SchedulerStatus:
        config = self.config
        if shutil.which("crontab") is None or os.name == "nt":
            return self.get_scheduler_status()

        current = self._read_crontab()
        cleaned = self._strip_managed_block(current).strip()
        block = self._build_cron_block(config).strip()
        new_text = cleaned
        if block:
            new_text = f"{cleaned}\n\n{block}\n" if cleaned else f"{block}\n"
        elif cleaned:
            new_text = f"{cleaned}\n"
        self._write_crontab(new_text)
        return self.get_scheduler_status()

    def run_job_action(self, job_name: str, payload: JobActionPayload) -> JobActionResult:
        normalized = job_name.strip().lower()
        if normalized not in JOB_SPECS:
            raise ValueError(f"Unknown job '{job_name}'")

        if payload.action == "stop":
            stopped = self._stop_job(normalized)
            _invalidate_management_caches()
            return JobActionResult(
                job=normalized,
                action=payload.action,
                accepted=stopped[0],
                message=stopped[1],
            )

        if payload.action == "start":
            if normalized != "telegram_bot":
                raise ValueError("Only the Telegram bot supports the start action")
            result = self._launch_job(normalized, payload)
            _invalidate_management_caches()
            return result

        result = self._launch_job(normalized, payload)
        _invalidate_management_caches()
        return result

    def _launch_job(self, job_name: str, payload: JobActionPayload) -> JobActionResult:
        spec = JOB_SPECS[job_name]
        if self._find_script_processes(spec["script"]):
            return JobActionResult(
                job=job_name,
                action=payload.action,
                accepted=False,
                message=f"{spec['label']} is already running.",
            )

        script_path = TOOLS_DIR / spec["script"]
        if not script_path.exists():
            return JobActionResult(
                job=job_name,
                action=payload.action,
                accepted=False,
                message=f"Script not found: {script_path}",
            )

        command = [sys.executable, str(script_path)]
        command.extend(self._build_job_args(job_name, payload, self.config))

        log_dir = self.logs_dir / "management"
        log_dir.mkdir(parents=True, exist_ok=True)
        log_path = log_dir / f"{spec['log_prefix']}-{_now_stamp()}.log"

        with log_path.open("a", encoding="utf-8") as handle:
            handle.write(f"$ {_quote_shell(command)}\n")
            handle.flush()
            kwargs: dict[str, Any] = {
                "cwd": str(ROOT),
                "stdout": handle,
                "stderr": subprocess.STDOUT,
            }
            if os.name == "nt":
                kwargs["creationflags"] = getattr(
                    subprocess,
                    "CREATE_NEW_PROCESS_GROUP",
                    0,
                )
            else:
                kwargs["start_new_session"] = True
            process = subprocess.Popen(command, **kwargs)

        return JobActionResult(
            job=job_name,
            action=payload.action,
            accepted=True,
            message=f"{spec['label']} started.",
            pid=process.pid,
            log_path=str(log_path),
        )

    def _build_job_args(
        self,
        job_name: str,
        payload: JobActionPayload,
        config: ProjectManagementConfig,
    ) -> list[str]:
        args: list[str] = []
        headless = config.headless_mode
        if job_name in {"smart_sync", "full_scrape"} and headless is not None:
            args.extend(["--headless", "true" if headless else "false"])

        if job_name == "smart_sync":
            if payload.mode == "test":
                args.extend(
                    ["--max-pages", str(payload.max_pages or config.smart_sync_test_pages)]
                )
        elif job_name == "full_scrape":
            if payload.mode == "test":
                args.extend(
                    [
                        "--test-mode",
                        "--max-pages",
                        str(payload.max_pages or config.full_scrape_test_pages),
                    ]
                )
            elif payload.max_pages:
                args.extend(["--max-pages", str(payload.max_pages)])
        elif job_name == "report":
            hours = payload.hours or config.daily_report_hours
            args.extend(["--hours", str(hours)])
            if payload.mode == "test":
                args.append("--dry-run")
        elif job_name == "healthcheck":
            args.extend(
                [
                    "--stale-hours",
                    str(config.healthcheck_stale_hours),
                    "--remind-hours",
                    str(config.healthcheck_remind_hours),
                ]
            )
            if payload.mode == "test":
                args.append("--dry-run")
        return args

    def _stop_job(self, job_name: str) -> tuple[bool, str]:
        spec = JOB_SPECS[job_name]
        processes = self._find_script_processes(spec["script"])
        if not processes:
            return False, f"{spec['label']} is not running."

        stopped_any = False
        for item in processes:
            proc = None
            try:
                proc = psutil.Process(item["pid"])
                proc.terminate()
                proc.wait(timeout=5)
                stopped_any = True
            except Exception:
                if proc is None:
                    continue
                try:
                    proc.kill()
                    proc.wait(timeout=5)
                    stopped_any = True
                except Exception:
                    continue

        if stopped_any:
            _invalidate_management_caches()
            return True, f"{spec['label']} stopped."
        return False, f"Unable to stop {spec['label']}."

    def _find_script_processes(self, script_name: str) -> list[dict[str, Any]]:
        return list(self._scan_managed_processes().get(script_name, []))

    def _scan_managed_processes(self) -> dict[str, list[dict[str, Any]]]:
        now = time.monotonic()
        cached = _PROCESS_SCAN_CACHE.get("value")
        if cached is not None and float(_PROCESS_SCAN_CACHE.get("expires_at", 0.0)) > now:
            return cached

        scripts = list({spec["script"] for spec in JOB_SPECS.values()})
        matches_by_script: dict[str, list[dict[str, Any]]] = {
            script: [] for script in scripts
        }
        current_pid = os.getpid()
        for process in psutil.process_iter(["pid", "cmdline", "create_time"]):
            try:
                pid = int(process.info["pid"])
                if pid == current_pid:
                    continue
                cmdline = process.info.get("cmdline") or []
                joined = " ".join(str(part) for part in cmdline)
                matched_script = next(
                    (script for script in scripts if script in joined),
                    None,
                )
                if matched_script is None:
                    continue
                started_at = None
                if process.info.get("create_time"):
                    started_at = datetime.fromtimestamp(
                        float(process.info["create_time"])
                    ).isoformat(timespec="seconds")
                match = {
                    "pid": pid,
                    "command": joined,
                    "started_at": started_at,
                }
                matches_by_script[matched_script].append(match)
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue

        for script in scripts:
            matches_by_script[script].sort(key=lambda item: item["pid"])

        _PROCESS_SCAN_CACHE["value"] = matches_by_script
        _PROCESS_SCAN_CACHE["expires_at"] = now + PROCESS_SCAN_CACHE_TTL_SECONDS
        return matches_by_script

    def _latest_matching_file(self, directory: Path, pattern: str) -> Optional[Path]:
        if not directory.exists():
            return None
        files = list(directory.glob(pattern))
        if not files:
            return None
        return max(files, key=lambda path: path.stat().st_mtime)

    def _path_mtime_iso(self, path: Optional[Path]) -> Optional[str]:
        if path is None or not path.exists():
            return None
        return datetime.fromtimestamp(path.stat().st_mtime).isoformat(timespec="seconds")

    def _build_scheduler_entries(
        self, config: ProjectManagementConfig
    ) -> list[SchedulerEntry]:
        weekday_names = [
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
        ]
        return [
            SchedulerEntry(
                job="smart_sync",
                enabled=config.smart_sync_schedule_enabled,
                schedule=f"Daily at {config.smart_sync_time}",
                command_preview="python tools/smart_sync.py",
            ),
            SchedulerEntry(
                job="full_scrape",
                enabled=config.full_scrape_schedule_enabled,
                schedule=(
                    f"Weekly on {weekday_names[config.full_scrape_day_of_week]} "
                    f"at {config.full_scrape_time}"
                ),
                command_preview="python tools/scrape_full_two_phase_to_db.py",
            ),
            SchedulerEntry(
                job="report",
                enabled=config.daily_report_schedule_enabled,
                schedule=f"Daily at {config.daily_report_time}",
                command_preview=f"python tools/daily_report.py --hours {config.daily_report_hours}",
            ),
            SchedulerEntry(
                job="healthcheck",
                enabled=config.healthcheck_schedule_enabled,
                schedule=f"Every {config.healthcheck_interval_minutes} minutes",
                command_preview=(
                    "python tools/system_healthcheck.py "
                    f"--stale-hours {config.healthcheck_stale_hours} "
                    f"--remind-hours {config.healthcheck_remind_hours}"
                ),
            ),
        ]

    def _build_cron_block(self, config: ProjectManagementConfig) -> str:
        if shutil.which("crontab") is None or os.name == "nt":
            return ""

        log_dir = self.logs_dir / "automation"
        log_dir.mkdir(parents=True, exist_ok=True)
        python_exe = sys.executable
        project_root = str(ROOT)
        lines = [CRON_BLOCK_START, f"CRON_TZ={config.automation_timezone}"]

        if config.smart_sync_schedule_enabled:
            hour, minute = config.smart_sync_time.split(":")
            command = self._cron_command(
                python_exe,
                "smart_sync.py",
                self._build_job_args("smart_sync", JobActionPayload(), config),
                log_dir / "smart-sync.log",
                project_root,
            )
            lines.append(f"{int(minute)} {int(hour)} * * * {command}")

        if config.full_scrape_schedule_enabled:
            hour, minute = config.full_scrape_time.split(":")
            command = self._cron_command(
                python_exe,
                "scrape_full_two_phase_to_db.py",
                self._build_job_args("full_scrape", JobActionPayload(), config),
                log_dir / "full-scrape.log",
                project_root,
            )
            lines.append(
                f"{int(minute)} {int(hour)} * * {config.full_scrape_day_of_week} {command}"
            )

        if config.daily_report_schedule_enabled:
            hour, minute = config.daily_report_time.split(":")
            command = self._cron_command(
                python_exe,
                "daily_report.py",
                self._build_job_args("report", JobActionPayload(), config),
                log_dir / "daily-report.log",
                project_root,
            )
            lines.append(f"{int(minute)} {int(hour)} * * * {command}")

        if config.healthcheck_schedule_enabled:
            command = self._cron_command(
                python_exe,
                "system_healthcheck.py",
                self._build_job_args("healthcheck", JobActionPayload(), config),
                log_dir / "healthcheck.log",
                project_root,
            )
            lines.append(f"*/{config.healthcheck_interval_minutes} * * * * {command}")

        lines.append(CRON_BLOCK_END)
        return "\n".join(lines)

    def _cron_command(
        self,
        python_executable: str,
        script_name: str,
        args: list[str],
        log_path: Path,
        project_root: str,
    ) -> str:
        script_path = TOOLS_DIR / script_name
        command = [python_executable, str(script_path), *args]
        return (
            f"cd {shlex.quote(project_root)} && "
            f"{_quote_shell(command)} >> {shlex.quote(str(log_path))} 2>&1"
        )

    def _read_crontab(self) -> str:
        proc = subprocess.run(
            ["crontab", "-l"],
            capture_output=True,
            text=True,
            check=False,
        )
        stdout = proc.stdout or ""
        stderr = proc.stderr or ""
        if proc.returncode != 0:
            joined = f"{stdout}\n{stderr}".lower()
            if "no crontab" in joined:
                return ""
        return stdout

    def _write_crontab(self, content: str) -> None:
        subprocess.run(
            ["crontab", "-"],
            input=content,
            capture_output=True,
            text=True,
            check=True,
        )

    def _strip_managed_block(self, text: str) -> str:
        if CRON_BLOCK_START not in text or CRON_BLOCK_END not in text:
            return text
        before, _, rest = text.partition(CRON_BLOCK_START)
        _, _, after = rest.partition(CRON_BLOCK_END)
        return f"{before.rstrip()}\n{after.lstrip()}".strip()
