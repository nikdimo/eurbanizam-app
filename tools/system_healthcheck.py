import argparse
import json
import os
import smtplib
import sqlite3
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from runtime_identity import get_runtime_identity, get_service_units

ROOT = Path(__file__).resolve().parents[1]
SETTINGS_PATH = ROOT / "settings.json"


def _expand_path(path_value, project_root):
    expanded = os.path.expandvars(path_value)
    path = Path(expanded)
    if not path.is_absolute():
        path = project_root / path
    return path


def load_settings(settings_path: Path) -> dict:
    if not settings_path.exists():
        raise FileNotFoundError(f"settings.json not found at {settings_path}")
    with settings_path.open("r", encoding="utf-8-sig") as handle:
        data = json.load(handle)
    project_root = ROOT
    return {
        "project_root": project_root,
        "runtime_root": _expand_path(data.get("runtime_root", "%USERPROFILE%\\.eurbanizam"), project_root),
        "local_db_path": _expand_path(data["local_db_path"], project_root),
        "raw": data,
    }


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    text = None
    for enc in ("utf-8", "utf-8-sig", "cp1252", "latin-1"):
        try:
            text = path.read_text(encoding=enc)
            break
        except Exception:
            text = None
    if text is None:
        return
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ[k.strip()] = v.strip()


def parse_recipients(raw):
    if raw is None:
        return []
    if isinstance(raw, (list, tuple, set)):
        out = []
        for item in raw:
            out.extend(parse_recipients(item))
        return out
    text = str(raw).replace(";", ",")
    out = []
    seen = set()
    for part in text.split(","):
        email = part.strip()
        if not email:
            continue
        key = email.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(email)
    return out


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def load_state(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_state(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def run_systemctl_is_active(unit_name: str) -> tuple[bool, str]:
    try:
        proc = subprocess.run(
            ["systemctl", "is-active", unit_name],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        out = (proc.stdout or proc.stderr or "").strip()
        return proc.returncode == 0, out
    except Exception as exc:
        return False, f"systemctl error: {exc}"


def parse_db_dt(value: str | None):
    if not value:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt)
        except Exception:
            pass
    return None


def check_latest_sync(db_path: Path, stale_hours: int) -> tuple[bool, str]:
    if not db_path.exists():
        return False, f"DB missing: {db_path}"

    try:
        conn = sqlite3.connect(str(db_path))
        cur = conn.cursor()
        has_runs = cur.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='runs'"
        ).fetchone() is not None
        if not has_runs:
            conn.close()
            return False, "runs table missing"

        row = cur.execute(
            "SELECT MAX(finished_at) FROM runs WHERE mode='smart_sync' AND finished_at IS NOT NULL"
        ).fetchone()
        conn.close()
    except Exception as exc:
        return False, f"DB error: {exc}"

    latest = row[0] if row else None
    latest_dt = parse_db_dt(latest)
    if latest_dt is None:
        return False, "No completed smart_sync run found"

    age = datetime.now() - latest_dt
    age_h = age.total_seconds() / 3600.0
    if age_h > float(stale_hours):
        return False, f"Last smart_sync finished {age_h:.1f}h ago at {latest}"
    return True, f"Last smart_sync finished {age_h:.1f}h ago at {latest}"


def send_email(
    subject: str,
    body_html: str,
    recipients: list[str],
    identity: dict[str, str],
) -> tuple[bool, str]:
    smtp_server = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    sender = os.environ.get("EMAIL_USER")
    password = os.environ.get("EMAIL_PASS")

    if not sender or not password:
        return False, "Missing EMAIL_USER/EMAIL_PASS"
    if not recipients:
        return False, "No EMAIL_RECEIVER configured"

    msg = MIMEMultipart()
    msg["From"] = sender
    msg["To"] = ", ".join(recipients)
    msg["Subject"] = subject
    msg["X-Eurbanizam-Source"] = identity["source"]
    msg["X-Eurbanizam-Host"] = identity["hostname"]
    msg.attach(MIMEText(body_html, "html"))

    try:
        server = smtplib.SMTP(smtp_server, smtp_port, timeout=30)
        server.starttls()
        server.login(sender, password)
        server.send_message(msg, to_addrs=recipients)
        server.quit()
        return True, f"Email sent to {', '.join(recipients)}"
    except Exception as exc:
        return False, f"SMTP error: {exc}"


def build_signature(unhealthy_items: list[tuple[str, str]]) -> str:
    if not unhealthy_items:
        return "healthy"
    parts = [f"{k}:{v}" for k, v in unhealthy_items]
    return "|".join(parts)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stale-hours", type=int, default=36)
    parser.add_argument("--remind-hours", type=int, default=12)
    parser.add_argument("--force-email", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--api-unit", default=None)
    parser.add_argument("--web-unit", default=None)
    parser.add_argument("--bot-unit", default=None)
    parser.add_argument("--daily-timer-unit", default="eurbanizam-daily.timer")
    args = parser.parse_args()

    settings = load_settings(SETTINGS_PATH)
    settings_raw = settings.get("raw", {})
    runtime_root: Path = settings["runtime_root"]
    db_path: Path = settings["local_db_path"]
    env_path = runtime_root / "secrets" / ".eurbanizam_secrets.env"
    state_path = runtime_root / "state" / "system_health_state.json"

    load_env_file(env_path)
    identity = get_runtime_identity(settings_raw, os.environ)
    service_units = get_service_units(settings_raw)
    api_unit = str(args.api_unit or service_units["api"]).strip()
    web_unit = str(args.web_unit or service_units["web"]).strip()
    bot_unit = str(args.bot_unit or service_units["bot"]).strip()
    recipients = parse_recipients(os.environ.get("EMAIL_RECEIVER"))

    checks = []
    ok, detail = run_systemctl_is_active(api_unit)
    checks.append(("api_service", ok, f"{api_unit}: {detail}"))
    ok, detail = run_systemctl_is_active(web_unit)
    checks.append(("web_service", ok, f"{web_unit}: {detail}"))
    ok, detail = run_systemctl_is_active(bot_unit)
    checks.append(("bot_service", ok, f"{bot_unit}: {detail}"))
    ok, detail = run_systemctl_is_active(args.daily_timer_unit)
    checks.append(("daily_timer", ok, f"{args.daily_timer_unit}: {detail}"))
    ok, detail = check_latest_sync(db_path, args.stale_hours)
    checks.append(("smart_sync_freshness", ok, detail))

    unhealthy = [(name, detail) for name, ok, detail in checks if not ok]
    healthy = len(unhealthy) == 0
    signature = build_signature(unhealthy)

    now = datetime.now()
    now_iso = now_utc_iso()

    prev = load_state(state_path)
    prev_status = prev.get("status", "unknown")
    prev_signature = prev.get("signature", "")
    last_alert_at = parse_db_dt(prev.get("last_alert_at"))

    should_email = False
    subject_state = "OK"

    if args.force_email:
        should_email = True
        subject_state = "OK" if healthy else "ALERT"
    elif healthy:
        if prev_status == "unhealthy":
            should_email = True
            subject_state = "RECOVERY"
    else:
        if prev_status != "unhealthy" or signature != prev_signature:
            should_email = True
            subject_state = "ALERT"
        elif last_alert_at is None or (now - last_alert_at) >= timedelta(hours=args.remind_hours):
            should_email = True
            subject_state = "ALERT"

    rows = "".join(
        [
            f"<tr><td>{name}</td><td>{'OK' if ok else 'FAIL'}</td><td>{detail}</td></tr>"
            for name, ok, detail in checks
        ]
    )
    body = (
        "<h3>Eurbanizam VPS Healthcheck</h3>"
        f"<p><strong>Source:</strong> {identity['source']}</p>"
        f"<p>Status: <strong>{'HEALTHY' if healthy else 'UNHEALTHY'}</strong></p>"
        f"<p>Checked at: {now_iso} UTC</p>"
        "<table border='1' cellpadding='6' cellspacing='0'>"
        "<tr><th>Check</th><th>Status</th><th>Detail</th></tr>"
        f"{rows}</table>"
    )

    email_ok = True
    email_msg = "Email not required"
    if should_email and not args.dry_run:
        subj = f"[{subject_state}] [{identity['label']}] Eurbanizam Healthcheck"
        email_ok, email_msg = send_email(subj, body, recipients, identity)

    new_state = {
        "status": "healthy" if healthy else "unhealthy",
        "signature": signature,
        "updated_at": now_iso,
        "last_email_subject_state": subject_state if should_email else prev.get("last_email_subject_state", ""),
        "last_email_ok": bool(email_ok),
        "last_email_msg": email_msg,
        "last_alert_at": now_iso if (should_email and not healthy and email_ok) else prev.get("last_alert_at"),
        "last_recovery_at": now_iso if (should_email and healthy and prev_status == "unhealthy" and email_ok) else prev.get("last_recovery_at"),
    }
    save_state(state_path, new_state)

    print("[HEALTH]", "HEALTHY" if healthy else "UNHEALTHY")
    for name, ok, detail in checks:
        print(f" - {name}: {'OK' if ok else 'FAIL'} :: {detail}")
    print(f"[EMAIL] should_send={should_email} dry_run={args.dry_run} result={email_msg}")

    return 0 if healthy else 1


if __name__ == "__main__":
    raise SystemExit(main())
