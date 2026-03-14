import json
import importlib
import importlib.metadata
import os
import re
import sqlite3
import subprocess
import sys
import time
from datetime import datetime
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd
import streamlit as st

try:
    from rapidfuzz import fuzz
except Exception:
    fuzz = None

try:
    from admin_pages.finance import render_finance_page
except ImportError:
    render_finance_page = None

from apps.api.core import cases as api_cases_core
from apps.api.core import case_documents as api_case_documents
from apps.api.core import finance_cases as api_finance_cases
from apps.api.core.common import rebuild_search_cache as api_rebuild_search_cache





def _ensure_requirements_installed(requirements_path: Path) -> None:
    if not requirements_path.exists():
        return
    try:
        lines = requirements_path.read_text(encoding="utf-8").splitlines()
    except Exception:
        return
    reqs = []
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("-e ") or line.startswith("--"):
            continue
        name = re.split(r"[<>=\[]", line, maxsplit=1)[0].strip()
        if name:
            reqs.append(name)
    if not reqs:
        return

def _ensure_rapidfuzz():
    if fuzz is not None:
        return
    key = "_rapidfuzz_install_attempted"
    if st.session_state.get(key):
        return
    st.session_state[key] = True
    try:
        res = subprocess.run([sys.executable, "-m", "pip", "install", "rapidfuzz"], capture_output=True, text=True)
        if res.returncode == 0:
            st.toast("Installed rapidfuzz. Reloading...")
            st.rerun()
        else:
            msg = (res.stderr or res.stdout or "").strip()
            st.warning("Rapidfuzz not installed; fuzzy search disabled.")
            if msg:
                st.caption(msg[:300])
    except Exception as e:
        st.warning("Rapidfuzz not installed; fuzzy search disabled.")
        st.caption(str(e)[:300])
PROJECT_ROOT = Path(__file__).resolve().parent
SETTINGS_PATH = PROJECT_ROOT / "settings.json"
REQUIREMENTS_PATH = PROJECT_ROOT / "requirements.txt"
TOOLS_DIR = PROJECT_ROOT / "tools"
SYNC_SCRIPT = TOOLS_DIR / "smart_sync.py"
REPORT_SCRIPT = TOOLS_DIR / "daily_report.py"
FULL_SCRAPE_SCRIPT = TOOLS_DIR / "scrape_full_two_phase_to_db.py"

BOT_SCRIPT = TOOLS_DIR / "telegram_bot_server.py"

def _bot_service_name(settings_raw: dict) -> str:
    return str((settings_raw or {}).get("bot_service_name") or "eurbanizam-bot.service")

def _is_windows() -> bool:
    return os.name == "nt"

def _windows_bot_pids() -> list:
    try:
        import psutil  # optional
    except Exception:
        psutil = None
    pids = []
    if psutil:
        for p in psutil.process_iter(["pid", "cmdline"]):
            try:
                cmd = p.info.get("cmdline") or []
            except Exception:
                continue
            if not cmd:
                continue
            joined = " ".join(cmd)
            if "telegram_bot_server.py" in joined:
                pids.append(int(p.info["pid"]))
        return sorted(set(pids))
    # Fallback: use tasklist + wmic-like parsing via powershell (best effort)
    try:
        import subprocess
        out = subprocess.check_output(["powershell", "-Command", "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*telegram_bot_server.py*' } | Select-Object ProcessId"], text=True, stderr=subprocess.DEVNULL)
        for line in out.splitlines():
            line = line.strip()
            if line.isdigit():
                pids.append(int(line))
    except Exception:
        pass
    return sorted(set(pids))

def _windows_bot_start():
    if not BOT_SCRIPT.exists():
        return False, f"Bot script not found: {BOT_SCRIPT}"
    try:
        # Avoid duplicate instances
        _windows_bot_stop()
        subprocess.Popen([sys.executable, str(BOT_SCRIPT)], creationflags=getattr(subprocess, "CREATE_NEW_CONSOLE", 0))
        return True, "Bot started"
    except Exception as e:
        return False, f"Start failed: {e}"

def _windows_bot_stop():
    try:
        pids = _windows_bot_pids()
        if not pids:
            return False, "Bot not running"
        # Try psutil for clean termination
        try:
            import psutil
        except Exception:
            psutil = None
        if psutil:
            for pid in pids:
                try:
                    p = psutil.Process(pid)
                    p.terminate()
                except Exception:
                    pass
            try:
                procs = [psutil.Process(pid) for pid in pids if psutil.pid_exists(pid)]
                _, alive = psutil.wait_procs(procs, timeout=2)
            except Exception:
                alive = []
            for p in alive:
                try:
                    p.kill()
                except Exception:
                    pass
        # Always try PowerShell kill by command line (best effort)
        try:
            subprocess.run(
                ["powershell", "-Command",
                 "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*telegram_bot_server.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"],
                capture_output=True,
            )
        except Exception:
            pass
        # Final fallback
        for pid in pids:
            subprocess.run(["taskkill", "/F", "/PID", str(pid)], capture_output=True)
        # Verify
        remaining = _windows_bot_pids()
        if remaining:
            return False, f"Bot still running (PIDs: {', '.join(str(p) for p in remaining)})"
        return True, "Bot stopped"
    except Exception as e:
        return False, f"Stop failed: {e}"

def _linux_bot_status(service_name: str):
    try:
        res = subprocess.run(["systemctl", "is-active", service_name], capture_output=True, text=True)
        return res.returncode == 0
    except Exception:
        return False

def _linux_bot_start(service_name: str):
    try:
        res = subprocess.run(["sudo", "-n", "systemctl", "start", service_name], capture_output=True, text=True)
        if res.returncode != 0:
            msg = (res.stderr or res.stdout or "Start failed").strip()
            if "authentication" in msg.lower() or "password" in msg.lower():
                msg = ("Permission denied. Allow passwordless sudo for: "
                       "systemctl start/stop " + service_name)
            return False, msg
        return True, "Bot started"
    except Exception as e:
        return False, f"Start failed: {e}"

def _linux_bot_stop(service_name: str):
    try:
        res = subprocess.run(["sudo", "-n", "systemctl", "stop", service_name], capture_output=True, text=True)
        if res.returncode != 0:
            msg = (res.stderr or res.stdout or "Stop failed").strip()
            if "authentication" in msg.lower() or "password" in msg.lower():
                msg = ("Permission denied. Allow passwordless sudo for: "
                       "systemctl start/stop " + service_name)
            return False, msg
        return True, "Bot stopped"
    except Exception as e:
        return False, f"Stop failed: {e}"

def get_bot_status(settings_raw: dict) -> bool:
    if _is_windows():
        return len(_windows_bot_pids()) > 0
    return _linux_bot_status(_bot_service_name(settings_raw))

def bot_start(settings_raw: dict):
    if _is_windows():
        return _windows_bot_start()
    return _linux_bot_start(_bot_service_name(settings_raw))

def bot_stop(settings_raw: dict):
    if _is_windows():
        return _windows_bot_stop()
    return _linux_bot_stop(_bot_service_name(settings_raw))

def _expand_path(path_value, project_root):
    expanded = os.path.expandvars(path_value)
    path = Path(expanded)
    if not path.is_absolute():
        path = project_root / path
    return path



def _should_headless() -> bool:
    env = (os.environ.get("HEADLESS") or os.environ.get("HEADLESS_MODE") or "").strip().lower()
    if env in ("true", "1", "yes", "y", "on"):
        return True
    if env in ("false", "0", "no", "n", "off"):
        return False
    return os.name != "nt"


def _headless_args():
    return ["--headless", "true"] if _should_headless() else []


def _resolve_finance_pin(settings_raw: dict):
    env_pin = os.environ.get("EURBANIZAM_FINANCE_PIN")
    if env_pin is not None and str(env_pin).strip():
        return str(env_pin)

    raw_pin = settings_raw.get("finance_pin") if isinstance(settings_raw, dict) else None
    if raw_pin is not None and str(raw_pin).strip():
        return str(raw_pin)

    return None


def load_settings(settings_path: Path) -> dict:
    if not settings_path.exists():
        raise FileNotFoundError(f"settings.json not found at {settings_path}")

    with settings_path.open("r", encoding="utf-8-sig") as handle:
        data = json.load(handle)

    project_root = PROJECT_ROOT
    resolved = {
        "project_root": project_root,
        "runtime_root": _expand_path(data.get("runtime_root", "%USERPROFILE%\\.eurbanizam"), project_root),
        "local_db_path": _expand_path(data["local_db_path"], project_root),
        "local_json_dir": _expand_path(data["local_json_dir"], project_root),
        "local_logs_dir": _expand_path(data["local_logs_dir"], project_root),
        "suitcase_db_path": _expand_path(data.get("suitcase_db_path", "data\\suitcase\\eurbanizam_suitcase.sqlite"), project_root),
        "suitcase_json_dir": _expand_path(data.get("suitcase_json_dir", "data\\suitcase\\cases_full_json"), project_root),
        "schema_validation": data.get("schema_validation", {}),
        "visible_columns_v9": data.get("visible_columns_v9", []),
        "column_order_map": data.get("column_order_map", {}),
        "custom_field_defs": data.get("custom_field_defs", []),
        "raw": data,
    }
    return resolved

def _atomic_write_json(path: Path, data: dict) -> None:
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
    tmp_path.replace(path)

def save_settings_key(settings_path: Path, key: str, value) -> None:
    current = load_settings(settings_path)["raw"]
    current[key] = value
    _atomic_write_json(settings_path, current)

def normalize_custom_defs(raw_defs):
    normalized = []
    for item in raw_defs:
        if not isinstance(item, dict):
            continue

        if "name" in item:
            name = str(item.get("name", "")).strip()
            if not name:
                continue
            normalized.append(
                {
                    "name": name,
                    "type": item.get("type", "Text"),
                    "options": list(item.get("options", []) or []),
                    "enabled": bool(item.get("enabled", True)),
                    "scope": str(item.get("scope", "case")).strip().lower() or "case",
                }
            )
            continue

        key = item.get("key") or item.get("label")
        label = item.get("label") or item.get("key")
        if not key or not label:
            continue
        normalized.append(
            {
                "name": str(label).strip(),
                "type": "Text",
                "options": [],
                "enabled": bool(item.get("editable", True)),
                "scope": "case",
            }
        )
    return normalized

def ensure_custom_defs_on_disk(settings_path: Path, custom_defs):
    existing = load_settings(settings_path)["raw"].get("custom_field_defs", [])
    if existing != custom_defs:
        save_settings_key(settings_path, "custom_field_defs", custom_defs)

def get_connection(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path), timeout=30, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn

def validate_db_schema(db_path: Path, expected_tables, expected_columns):
    issues = []
    if not db_path.exists():
        issues.append(f"Local DB not found: {db_path}")
        return issues

    db_uri = f"file:{db_path.as_posix()}?mode=ro"
    try:
        with sqlite3.connect(db_uri, uri=True) as conn:
            cursor = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            )
            tables = {row[0] for row in cursor.fetchall()}

            for table in expected_tables:
                if table not in tables:
                    issues.append(f"Missing table: {table}")

            for table, columns in (expected_columns or {}).items():
                if table not in tables:
                    continue
                cursor = conn.execute(f"PRAGMA table_info('{table}')")
                existing_columns = {row[1] for row in cursor.fetchall()}
                for column in columns:
                    if column not in existing_columns:
                        issues.append(f"Missing column: {table}.{column}")
    except sqlite3.Error as exc:
        issues.append(f"SQLite error: {exc}")

    return issues

def get_table_columns(conn: sqlite3.Connection, table_name: str):
    cursor = conn.execute(f"PRAGMA table_info('{table_name}')")
    return [row[1] for row in cursor.fetchall()]

def resolve_case_key(cases_cols, user_cols):
    preferred = ["case_id", "id", "case_number", "uuid"]
    intersection = [col for col in preferred if col in cases_cols and col in user_cols]
    if intersection:
        return intersection[0]
    for col in cases_cols:
        if col in user_cols:
            return col
    return None

def resolve_field_value_col(user_cols):
    for col in ["field_value", "value"]:
        if col in user_cols:
            return col
    return None

def pick_column(cases_cols, candidates):
    for col in candidates:
        if col in cases_cols:
            return col
    return None

def load_cases(conn: sqlite3.Connection, case_key_col: str, cases_cols):
    return api_cases_core.load_cases(conn, case_key_col, cases_cols)


def load_new_case_badges(conn: sqlite3.Connection, days: int = 7):
    """Return case_id -> newest NEW_CASE timestamp within the last N days."""
    try:
        cur = conn.cursor()
        has_changes = cur.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='change_events'"
        ).fetchone() is not None
        if not has_changes:
            return {}
        window = f"-{int(days)} days"
        cur.execute(
            "SELECT case_id, MAX(timestamp) as ts FROM change_events "
            "WHERE change_type='NEW_CASE' AND timestamp >= datetime('now', ?) "
            "GROUP BY case_id",
            (window,),
        )
        rows = cur.fetchall()
        return {str(r[0]): r[1] for r in rows if r and r[0]}
    except sqlite3.Error:
        return {}
def load_custom_fields(conn, table_name, case_key_col, field_key_col, field_value_col, field_keys):
    return api_cases_core.load_custom_fields(
        conn,
        table_name,
        case_key_col,
        field_key_col,
        field_value_col,
        list(field_keys),
    )


@st.cache_data(show_spinner=False)
def _load_cases_cached(db_path: str, case_key_col: str, cases_cols: tuple, mtime: float):
    conn = sqlite3.connect(str(db_path), timeout=30, check_same_thread=False)
    try:
        return load_cases(conn, case_key_col, list(cases_cols))
    finally:
        conn.close()

@st.cache_data(show_spinner=False)
def _load_custom_fields_cached(db_path: str, table_name: str, case_key_col: str, field_key_col: str, field_value_col: str, field_keys: tuple, mtime: float):
    conn = sqlite3.connect(str(db_path), timeout=30, check_same_thread=False)
    try:
        return load_custom_fields(conn, table_name, case_key_col, field_key_col, field_value_col, list(field_keys))
    finally:
        conn.close()


@st.cache_data(show_spinner=False)
def _prepare_cases_cached(
    db_path: str,
    case_key_col: str,
    cases_cols: tuple,
    mtime: float,
    today_key: str,
    recent_days: int,
    late_days_threshold: int,
):
    conn = sqlite3.connect(str(db_path), timeout=30, check_same_thread=False)
    try:
        return api_cases_core.prepare_cases_dataframe(
            conn,
            recent_days=recent_days,
            late_days_threshold=late_days_threshold,
        )
    finally:
        conn.close()


def _ensure_finance_tables(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS finance_cases (
            case_id TEXT PRIMARY KEY,
            client_name TEXT,
            client_phone TEXT,
            service_type TEXT,
            finance_date TEXT,
            contract_sum REAL NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'MKD',
            paid_amount REAL NOT NULL DEFAULT 0,
            due_date TEXT,
            finance_status TEXT NOT NULL DEFAULT 'GRAY',
            notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_finance_cases_status ON finance_cases(finance_status)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_finance_cases_due_date ON finance_cases(due_date)")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS finance_payments (
            payment_id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id TEXT NOT NULL,
            payment_date TEXT NOT NULL,
            amount REAL NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'MKD',
            note TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_finance_payments_case_id ON finance_payments(case_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_finance_payments_date ON finance_payments(payment_date)")
    conn.commit()


def _finance_columns() -> list:
    return [
        "finance_contract_sum",
        "finance_currency",
        "finance_paid_total",
        "finance_remaining",
        "finance_overdue_amount",
        "finance_due_date",
        "finance_status",
        "finance_last_payment_date",
        "finance_payments_count",
        "finance_service_type",
        "finance_notes",
        "finance_unallocated_cash",
    ]


FINANCE_CURRENCY_OPTIONS = ["MKD", "EUR", "USD"]
FINANCE_STATUS_OPTIONS = ["GRAY", "GREEN", "YELLOW", "RED", "PENDING", "PAID"]
# Custom field names that cannot be deleted (permanent contact columns)
PERMANENT_CUSTOM_FIELD_NAMES = frozenset({"Name / Last name", "email"})


def _finance_as_float(value) -> float:
    if value is None:
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _finance_clean_text(value):
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def _finance_to_date(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text).date()
    except ValueError:
        pass
    for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def _load_finance_case_record(conn, case_id: str) -> dict:
    cid = str(case_id or "").strip()
    if not cid:
        return {}
    row = conn.execute(
        """
        SELECT
            case_id,
            client_name,
            client_phone,
            service_type,
            finance_date,
            contract_sum,
            currency,
            paid_amount,
            due_date,
            finance_status,
            notes,
            created_at,
            updated_at
        FROM finance_cases
        WHERE case_id = ?
        """,
        (cid,),
    ).fetchone()
    if not row:
        return {}
    return {key: row[key] for key in row.keys()}


def _load_finance_payments_for_case(conn, case_id: str) -> pd.DataFrame:
    cid = str(case_id or "").strip()
    if not cid:
        return pd.DataFrame(columns=["payment_id", "case_id", "payment_date", "amount", "currency", "note", "created_at", "updated_at"])
    return pd.read_sql_query(
        """
        SELECT payment_id, case_id, payment_date, amount, currency, note, created_at, updated_at
        FROM finance_payments
        WHERE case_id = ?
        ORDER BY payment_date DESC, payment_id DESC
        """,
        conn,
        params=[cid],
    )


def _upsert_finance_case_record(conn, payload: dict) -> None:
    cid = str(payload.get("case_id") or "").strip()
    if not cid:
        raise ValueError("case_id is required")
    now = datetime.now().isoformat(timespec="seconds")
    conn.execute(
        """
        INSERT INTO finance_cases (
            case_id,
            client_name,
            client_phone,
            service_type,
            finance_date,
            contract_sum,
            currency,
            paid_amount,
            due_date,
            finance_status,
            notes,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(case_id) DO UPDATE SET
            client_name=excluded.client_name,
            client_phone=excluded.client_phone,
            service_type=excluded.service_type,
            finance_date=excluded.finance_date,
            contract_sum=excluded.contract_sum,
            currency=excluded.currency,
            paid_amount=excluded.paid_amount,
            due_date=excluded.due_date,
            finance_status=excluded.finance_status,
            notes=excluded.notes,
            updated_at=excluded.updated_at
        """,
        (
            cid,
            _finance_clean_text(payload.get("client_name")),
            _finance_clean_text(payload.get("client_phone")),
            _finance_clean_text(payload.get("service_type")),
            payload.get("finance_date"),
            _finance_as_float(payload.get("contract_sum")),
            str(payload.get("currency") or FINANCE_CURRENCY_OPTIONS[0]),
            _finance_as_float(payload.get("paid_amount")),
            payload.get("due_date"),
            str(payload.get("finance_status") or FINANCE_STATUS_OPTIONS[0]),
            _finance_clean_text(payload.get("notes")),
            now,
            now,
        ),
    )
    conn.commit()


def _ensure_finance_case_stub(conn, case_id: str, seed: dict) -> None:
    cid = str(case_id or "").strip()
    if not cid:
        return
    if _load_finance_case_record(conn, cid):
        return
    payload = {
        "case_id": cid,
        "client_name": seed.get("client_name"),
        "client_phone": seed.get("client_phone"),
        "service_type": seed.get("service_type"),
        "finance_date": seed.get("finance_date"),
        "contract_sum": seed.get("contract_sum"),
        "currency": seed.get("currency"),
        "paid_amount": seed.get("paid_amount"),
        "due_date": seed.get("due_date"),
        "finance_status": seed.get("finance_status"),
        "notes": seed.get("notes"),
    }
    _upsert_finance_case_record(conn, payload)


def _sync_finance_paid_total(conn, case_id: str) -> None:
    cid = str(case_id or "").strip()
    if not cid:
        return
    total = conn.execute(
        "SELECT COALESCE(SUM(amount), 0) FROM finance_payments WHERE case_id = ?",
        (cid,),
    ).fetchone()[0]
    conn.execute(
        "UPDATE finance_cases SET paid_amount = ?, updated_at = ? WHERE case_id = ?",
        (_finance_as_float(total), datetime.now().isoformat(timespec="seconds"), cid),
    )
    conn.commit()


def _upsert_finance_payment(conn, case_id: str, payment_date, amount, currency: str, note: str, payment_id=None) -> None:
    cid = str(case_id or "").strip()
    if not cid:
        raise ValueError("case_id is required")
    pay_date = _finance_to_date(payment_date) or date.today()
    now = datetime.now().isoformat(timespec="seconds")
    if payment_id is None:
        conn.execute(
            """
            INSERT INTO finance_payments (case_id, payment_date, amount, currency, note, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                cid,
                pay_date.isoformat(),
                _finance_as_float(amount),
                str(currency or FINANCE_CURRENCY_OPTIONS[0]),
                _finance_clean_text(note),
                now,
                now,
            ),
        )
    else:
        conn.execute(
            """
            UPDATE finance_payments
            SET payment_date = ?, amount = ?, currency = ?, note = ?, updated_at = ?
            WHERE payment_id = ? AND case_id = ?
            """,
            (
                pay_date.isoformat(),
                _finance_as_float(amount),
                str(currency or FINANCE_CURRENCY_OPTIONS[0]),
                _finance_clean_text(note),
                now,
                int(payment_id),
                cid,
            ),
        )
    conn.commit()


def _delete_finance_payment(conn, payment_id: int) -> bool:
    result = conn.execute("DELETE FROM finance_payments WHERE payment_id = ?", (int(payment_id),))
    conn.commit()
    return result.rowcount > 0


def _delete_finance_case_bundle(conn, case_id: str) -> bool:
    cid = str(case_id or "").strip()
    if not cid:
        return False
    payments_result = conn.execute("DELETE FROM finance_payments WHERE case_id = ?", (cid,))
    case_result = conn.execute("DELETE FROM finance_cases WHERE case_id = ?", (cid,))
    conn.commit()
    return payments_result.rowcount > 0 or case_result.rowcount > 0


def _load_finance_snapshot(conn: sqlite3.Connection) -> pd.DataFrame:
    return api_finance_cases.load_finance_snapshot(conn)


def _rebuild_search_cache(df: pd.DataFrame) -> pd.DataFrame:
    return api_rebuild_search_cache(df, focus_columns=("title", "name_blob", "finance_notes"))


def _merge_finance_into_cases(df_cases: pd.DataFrame, conn: sqlite3.Connection) -> pd.DataFrame:
    return api_finance_cases.merge_finance_into_cases(df_cases, conn)


def _init_checkbox_options(key_prefix: str, options: list, default_selected: list) -> None:
    pending_key = f"{key_prefix}_pending"
    has_pending = pending_key in st.session_state
    if st.session_state.get(f"{key_prefix}_options") != options or has_pending:
        st.session_state[f"{key_prefix}_options"] = list(options)
        selected = st.session_state.get(pending_key, default_selected or [])
        if has_pending:
            del st.session_state[pending_key]
        selected_set = set(selected or [])
        for idx, opt in enumerate(options):
            st.session_state[f"{key_prefix}_{idx}"] = opt in selected_set


def _get_checkbox_selection(key_prefix: str, options: list) -> list:
    selected = []
    for idx, opt in enumerate(options):
        if st.checkbox(str(opt), key=f"{key_prefix}_{idx}"):
            selected.append(opt)
    return selected


def _set_checkbox_selection(key_prefix: str, options: list, selected: list) -> None:
    selected_set = set(selected or [])
    for idx, opt in enumerate(options):
        st.session_state[f"{key_prefix}_{idx}"] = opt in selected_set




def _normalize_search(text):
    return re.sub(r'[^a-zA-Z0-9Ѐ-ӿ]', '', str(text or '')).lower()

def _mk_cyr_to_lat(s: str) -> str:
    if not s:
        return ""
    m = {
        "А": "A", "а": "a",
        "Б": "B", "б": "b",
        "В": "V", "в": "v",
        "Г": "G", "г": "g",
        "Д": "D", "д": "d",
        "Ѓ": "Gj", "ѓ": "gj",
        "Е": "E", "е": "e",
        "Ж": "Zh", "ж": "zh",
        "З": "Z", "з": "z",
        "Ѕ": "Dz", "ѕ": "dz",
        "И": "I", "и": "i",
        "Ј": "J", "ј": "j",
        "К": "K", "к": "k",
        "Л": "L", "л": "l",
        "Љ": "Lj", "љ": "lj",
        "М": "M", "м": "m",
        "Н": "N", "н": "n",
        "Њ": "Nj", "њ": "nj",
        "О": "O", "о": "o",
        "П": "P", "п": "p",
        "Р": "R", "р": "r",
        "С": "S", "с": "s",
        "Т": "T", "т": "t",
        "Ќ": "Kj", "ќ": "kj",
        "У": "U", "у": "u",
        "Ф": "F", "ф": "f",
        "Х": "H", "х": "h",
        "Ц": "C", "ц": "c",
        "Ч": "Ch", "ч": "ch",
        "Џ": "Dz", "џ": "dz",
        "Ш": "Sh", "ш": "sh",
        "Ђ": "Dj", "ђ": "dj",
    }
    return "".join(m.get(ch, ch) for ch in s)

def _collapse_repeats(s: str) -> str:
    return re.sub(r"(.)\1+", r"\1", s)

def _mk_lat_to_cyr(s: str) -> str:
    if not s:
        return ""
    t = s
    replacements = [
        ("dzh", "џ"), ("Dzh", "Џ"), ("DZH", "Џ"),
        ("gj", "ѓ"), ("Gj", "Ѓ"), ("GJ", "Ѓ"),
        ("kj", "ќ"), ("Kj", "Ќ"), ("KJ", "Ќ"),
        ("lj", "љ"), ("Lj", "Љ"), ("LJ", "Љ"),
        ("nj", "њ"), ("Nj", "Њ"), ("NJ", "Њ"),
        ("zh", "ж"), ("Zh", "Ж"), ("ZH", "Ж"),
        ("ch", "ч"), ("Ch", "Ч"), ("CH", "Ч"),
        ("sh", "ш"), ("Sh", "Ш"), ("SH", "Ш"),
        ("dz", "ѕ"), ("Dz", "Ѕ"), ("DZ", "Ѕ"),
    ]
    for a, b in replacements:
        t = t.replace(a, b)
    single = {
        "A": "А", "a": "а",
        "B": "Б", "b": "б",
        "V": "В", "v": "в",
        "G": "Г", "g": "г",
        "D": "Д", "d": "д",
        "E": "Е", "e": "е",
        "Z": "З", "z": "з",
        "I": "И", "i": "и",
        "J": "Ј", "j": "ј",
        "K": "К", "k": "к",
        "L": "Л", "l": "л",
        "M": "М", "m": "м",
        "N": "Н", "n": "н",
        "O": "О", "o": "о",
        "P": "П", "p": "п",
        "R": "Р", "r": "р",
        "S": "С", "s": "с",
        "T": "Т", "t": "т",
        "U": "У", "u": "у",
        "F": "Ф", "f": "ф",
        "H": "Х", "h": "х",
        "C": "Ц", "c": "ц",
        "Q": "Ќ", "q": "ќ",
        "W": "В", "w": "в",
        "Y": "Ј", "y": "ј",
        "X": "Кс", "x": "кс",
    }
    return "".join(single.get(ch, ch) for ch in t)

def _load_user_search_map_cached(db_path: str, mtime: float):
    conn = sqlite3.connect(str(db_path), timeout=30, check_same_thread=False)
    try:
        conn.row_factory = sqlite3.Row
        return api_cases_core.load_user_search_map(conn)
    finally:
        conn.close()


def values_equal(a, b):
    if pd.isna(a) and pd.isna(b):
        return True
    return str(a) == str(b)

def ensure_unique_index(conn, case_key_col, field_key_col):
    try:
        conn.execute(
            f"CREATE UNIQUE INDEX IF NOT EXISTS idx_case_user_data_unique ON case_user_data({case_key_col}, {field_key_col})"
        )
        conn.commit()
    except sqlite3.Error:
        pass


def build_display_columns(df, visible_columns, column_order_map):
    if visible_columns:
        display_cols = [col for col in visible_columns if col in df.columns]
    else:
        display_cols = list(df.columns)

    # Guard against duplicated entries in persisted settings.
    display_cols = list(dict.fromkeys(display_cols))

    order = None
    if isinstance(column_order_map, dict):
        order = column_order_map

    if order:
        ordered = sorted(display_cols, key=lambda c: int(order.get(c, 999)))
        display_cols = ordered

    return display_cols

def build_grid_config(df, custom_defs):
    grid_config = {}
    if "case_id" in df.columns:
        grid_config["case_id"] = st.column_config.TextColumn("ID", disabled=True)
    if "status" in df.columns:
        grid_config["status"] = st.column_config.TextColumn("Sostojba", disabled=True)
    if "title" in df.columns:
        grid_config["title"] = st.column_config.TextColumn("Naslov", disabled=True)
    if "request_type" in df.columns:
        grid_config["request_type"] = st.column_config.TextColumn("Tip", disabled=True)
    if "created_at" in df.columns:
        grid_config["created_at"] = st.column_config.DatetimeColumn("Kreirano", format="DD.MM.YYYY", disabled=True)
    if "updated_at" in df.columns:
        grid_config["updated_at"] = st.column_config.DatetimeColumn("Posledna", format="DD.MM.YYYY", disabled=True)
    if "prev_change_at" in df.columns:
        grid_config["prev_change_at"] = st.column_config.DatetimeColumn("Prethodna", format="DD.MM.YYYY", disabled=True)
    if "Denovi (Od Posledna)" in df.columns:
        grid_config["Denovi (Od Posledna)"] = st.column_config.NumberColumn("Denovi", disabled=True)
    if "First Seen" in df.columns:
        grid_config["First Seen"] = st.column_config.TextColumn("First Seen", disabled=True)
    if "Latest Document" in df.columns:
        grid_config["Latest Document"] = st.column_config.TextColumn("Latest Document", disabled=True)

    if "Phone" in df.columns:
        grid_config["Phone"] = st.column_config.TextColumn("Phone", disabled=False)

    if "finance_contract_sum" in df.columns:
        grid_config["finance_contract_sum"] = st.column_config.NumberColumn("Contract Sum", format="%.2f", disabled=True)
    if "finance_currency" in df.columns:
        grid_config["finance_currency"] = st.column_config.TextColumn("Finance Currency", disabled=True)
    if "finance_paid_total" in df.columns:
        grid_config["finance_paid_total"] = st.column_config.NumberColumn("Paid Total", format="%.2f", disabled=True)
    if "finance_remaining" in df.columns:
        grid_config["finance_remaining"] = st.column_config.NumberColumn("Remaining", format="%.2f", disabled=True)
    if "finance_overdue_amount" in df.columns:
        grid_config["finance_overdue_amount"] = st.column_config.NumberColumn("Overdue Amount", format="%.2f", disabled=True)
    if "finance_due_date" in df.columns:
        grid_config["finance_due_date"] = st.column_config.DatetimeColumn("Finance Due Date", format="DD.MM.YYYY", disabled=True)
    if "finance_status" in df.columns:
        grid_config["finance_status"] = st.column_config.TextColumn("Finance Status", disabled=True)
    if "finance_last_payment_date" in df.columns:
        grid_config["finance_last_payment_date"] = st.column_config.DatetimeColumn("Last Payment", format="DD.MM.YYYY", disabled=True)
    if "finance_payments_count" in df.columns:
        grid_config["finance_payments_count"] = st.column_config.NumberColumn("Payments #", disabled=True)
    if "finance_service_type" in df.columns:
        grid_config["finance_service_type"] = st.column_config.TextColumn("Finance Service", disabled=True)
    if "finance_notes" in df.columns:
        grid_config["finance_notes"] = st.column_config.TextColumn("Finance Notes", disabled=True)
    if "finance_unallocated_cash" in df.columns:
        grid_config["finance_unallocated_cash"] = st.column_config.NumberColumn("Unallocated Cash", format="%.2f", disabled=True)

    for d in custom_defs:
        name = d.get("name", "").strip()
        if not name or not d.get("enabled", True):
            continue
        if name not in df.columns:
            continue

        if d.get("type") == "Dropdown":
            defined_opts = d.get("options", [])
            existing_vals = df[name].dropna().unique().tolist()
            merged_opts = list(dict.fromkeys(defined_opts + [str(v) for v in existing_vals]))
            grid_config[name] = st.column_config.SelectboxColumn(name, options=merged_opts, disabled=False)
        else:
            grid_config[name] = st.column_config.TextColumn(name, disabled=False)

    return grid_config

def handle_pending_edits(conn, case_key_col, field_key_col, field_value_col, user_cols, cases_cols, custom_defs):
    if "main_table_editor" not in st.session_state:
        return

    changes = st.session_state["main_table_editor"].get("edited_rows", {})
    if not changes:
        return

    display_case_ids = st.session_state.get("display_case_ids", [])
    snapshot = st.session_state.get("editable_snapshot", {})
    if not display_case_ids or not snapshot:
        st.error("Display context lost. Refresh the page to edit.")
        st.session_state["main_table_editor"]["edited_rows"] = {}
        st.stop()

    ensure_unique_index(conn, case_key_col, field_key_col)

    editable_fields = {"Phone"}
    for d in custom_defs:
        if d.get("enabled", True):
            name = d.get("name", "").strip()
            if name:
                editable_fields.add(name)

    has_updated_at = "updated_at" in user_cols

    updates = 0
    try:
        conn.execute("BEGIN")
        for row_idx, updated_cols in changes.items():
            if int(row_idx) >= len(display_case_ids):
                continue
            case_id = display_case_ids[int(row_idx)]
            original_row = snapshot.get(case_id, {})

            for key, new_value in updated_cols.items():
                field_key = key.strip()
                if field_key not in editable_fields:
                    continue

                original_value = original_row.get(field_key)
                if values_equal(original_value, new_value):
                    continue

                normalized_value = None
                if new_value is not None and str(new_value).strip() != "":
                    normalized_value = str(new_value).strip()

                if has_updated_at:
                    conn.execute(
                        f"""
                        INSERT INTO case_user_data ({case_key_col}, {field_key_col}, {field_value_col}, updated_at)
                        VALUES (?, ?, ?, ?)
                        ON CONFLICT({case_key_col}, {field_key_col}) DO UPDATE SET
                          {field_value_col}=excluded.{field_value_col},
                          updated_at=excluded.updated_at
                        """,
                        (case_id, field_key, normalized_value, datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
                    )
                else:
                    conn.execute(
                        f"""
                        INSERT INTO case_user_data ({case_key_col}, {field_key_col}, {field_value_col})
                        VALUES (?, ?, ?)
                        ON CONFLICT({case_key_col}, {field_key_col}) DO UPDATE SET
                          {field_value_col}=excluded.{field_value_col}
                        """,
                        (case_id, field_key, normalized_value),
                    )

                if field_key == "Phone" and "phone" in cases_cols:
                    conn.execute(
                        f"UPDATE cases SET phone=? WHERE {case_key_col}=?",
                        (normalized_value, case_id),
                    )

                updates += 1

        conn.commit()
    except Exception:
        conn.rollback()
        raise

    if updates:
        st.toast(f"Saved {updates} change(s).")

    st.session_state["main_table_editor"]["edited_rows"] = {}
    time.sleep(0.1)
    st.rerun()

def main():
    st.set_page_config(page_title="E-Urbanizam Manager", layout="wide", initial_sidebar_state="expanded")
    st.markdown(
        """
        <style>
        .block-container { padding-top: 3.0rem; padding-bottom: 0.5rem; }
        header { margin-bottom: 0.2rem; }
        [data-testid="stVerticalBlock"] { gap: 0.2rem; }
        h1, h2, h3, h4 { margin-bottom: 0.2rem; }
        [data-testid="stToolbar"] { min-height: 0.4rem; }
        .stTabs [data-baseweb="tab"] {
          min-width: 90px !important;
          padding-left: 12px !important;
          padding-right: 12px !important;
          white-space: nowrap !important;
        }
        .stTabs [data-baseweb="tab-list"] {
          gap: 8px !important;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

    if not SETTINGS_PATH.exists():
        st.error(f"settings.json not found at {SETTINGS_PATH}")
        return

    try:
        settings = load_settings(SETTINGS_PATH)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        st.error(f"Failed to load settings: {exc}")
        return

    raw = settings.get("raw", {})
    if not isinstance(raw, dict):
        raw = {}

    raw_defs = settings.get("custom_field_defs", [])
    custom_defs = normalize_custom_defs(raw_defs)
    custom_defs = [d for d in custom_defs if d.get("name", "").strip().lower() != "phone"]
    ensure_custom_defs_on_disk(SETTINGS_PATH, custom_defs)

    schema_validation = settings.get("schema_validation", {})
    expected_tables = schema_validation.get("expected_tables", [])
    expected_columns = schema_validation.get("expected_columns", {})

    issues = validate_db_schema(settings["local_db_path"], expected_tables, expected_columns)
    if issues:
        st.error("Schema validation errors:")
        for issue in issues:
            st.error(issue)
        return

    db_path = settings["local_db_path"]
    if not db_path.exists():
        st.error(f"Local DB not found: {db_path}")
        return

    conn = get_connection(db_path)
    try:
        cases_cols = get_table_columns(conn, "cases")
        user_cols = get_table_columns(conn, "case_user_data")
    except sqlite3.Error as exc:
        st.error(f"SQLite error: {exc}")
        conn.close()
        return

    if not cases_cols or not user_cols:
        st.error("Missing required tables or columns: cases, case_user_data")
        conn.close()
        return

    case_key_col = resolve_case_key(cases_cols, user_cols)
    if not case_key_col:
        st.error("Could not determine case key column shared by cases and case_user_data.")
        conn.close()
        return

    field_key_col = "field_key" if "field_key" in user_cols else None
    field_value_col = resolve_field_value_col(user_cols)
    if not field_key_col or not field_value_col:
        st.error("case_user_data missing required columns (field_key, field_value).")
        conn.close()
        return

    handle_pending_edits(
        conn,
        case_key_col,
        field_key_col,
        field_value_col,
        user_cols,
        cases_cols,
        custom_defs,
    )

    db_mtime = db_path.stat().st_mtime if db_path.exists() else 0.0
    recent_days = 7
    late_days_threshold = 20
    today_key = date.today().isoformat()
    df_cases = _prepare_cases_cached(
        str(db_path),
        case_key_col,
        tuple(cases_cols),
        db_mtime,
        today_key,
        recent_days,
        late_days_threshold,
    )

    base_cols = ["case_id", "status", "title", "request_type", "created_at", "updated_at", "prev_change_at", "First Seen", "Latest Document"]
    enabled_custom = [d["name"] for d in custom_defs if d.get("enabled", True) and d.get("scope", "case") != "finance"]
    visible_columns = settings.get("visible_columns_v9", [])
    changed_cols = False
    if "First Seen" not in visible_columns:
        visible_columns = visible_columns + ["First Seen"]
        changed_cols = True
    if "Latest Document" not in visible_columns:
        visible_columns = visible_columns + ["Latest Document"]
        changed_cols = True
    if changed_cols:
        save_settings_key(SETTINGS_PATH, "visible_columns_v9", visible_columns)

    default_exclude = raw.get("default_request_type_exclude", [])
    if not isinstance(default_exclude, list):
        default_exclude = []
        save_settings_key(SETTINGS_PATH, "default_request_type_exclude", default_exclude)

    default_sort_column = settings.get("default_sort_column", "updated_at")
    default_sort_desc = bool(settings.get("default_sort_desc", True))

    last_request_type_selection = raw.get("last_request_type_selection", [])
    if not isinstance(last_request_type_selection, list):
        last_request_type_selection = []
        save_settings_key(SETTINGS_PATH, "last_request_type_selection", last_request_type_selection)

    last_status_selection = raw.get("last_status_selection", [])
    if not isinstance(last_status_selection, list):
        last_status_selection = []
        save_settings_key(SETTINGS_PATH, "last_status_selection", last_status_selection)

    last_date_range = raw.get("last_date_range", {})
    if not isinstance(last_date_range, dict):
        last_date_range = {"preset": "All Time", "start": None, "end": None}
        save_settings_key(SETTINGS_PATH, "last_date_range", last_date_range)

    last_search_text = raw.get("last_search_text", "")
    if not isinstance(last_search_text, str):
        last_search_text = ""
        save_settings_key(SETTINGS_PATH, "last_search_text", last_search_text)

    force_exclude_request_types = raw.get("force_exclude_request_types", None)

    def _normalize_label(value: str) -> str:
        return " ".join(str(value).split()).casefold()

    def _coerce_date(value):
        if isinstance(value, date):
            return value
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, str) and value:
            try:
                return datetime.strptime(value, "%Y-%m-%d").date()
            except ValueError:
                return None
        return None

    if "updated_at" in df_cases.columns:
        df_cases["updated_at"] = pd.to_datetime(df_cases["updated_at"], errors="coerce")
        df_cases["updated_date"] = df_cases["updated_at"].dt.date
        df_cases["Denovi (Od Posledna)"] = (datetime.now() - df_cases["updated_at"]).dt.days
        df_cases["_late_case"] = df_cases["Denovi (Od Posledna)"].fillna(10**9) >= late_days_threshold
    else:
        df_cases["Denovi (Od Posledna)"] = None


    def _render_sidebar_bot_scrapers() -> None:
        st.sidebar.subheader("Bot and Scrapers")

        # Cache bot status to avoid expensive polling on every rerun
        if "bot_status" not in st.session_state:
            st.session_state["bot_status"] = get_bot_status(raw)
        if "bot_pids" not in st.session_state:
            st.session_state["bot_pids"] = []

        if st.sidebar.button("Refresh bot status", use_container_width=True):
            st.session_state["bot_status"] = get_bot_status(raw)
            if _is_windows() and st.session_state["bot_status"]:
                st.session_state["bot_pids"] = _windows_bot_pids()
            else:
                st.session_state["bot_pids"] = []

        bot_running = st.session_state.get("bot_status", False)
        bot_pids = st.session_state.get("bot_pids", [])

        if st.session_state.get("bot_toggle_sync"):
            st.session_state["bot_toggle_sync"] = False
            st.session_state["bot_enabled_toggle"] = bot_running
        desired = st.sidebar.toggle("Bot enabled", value=bot_running, key="bot_enabled_toggle")

        status_text = "Running" if bot_running else "Stopped"
        if bot_pids:
            status_text += f" (PIDs: {', '.join(str(p) for p in bot_pids)})"
        st.sidebar.caption(f"Status: {status_text}")

        if desired != bot_running:
            if desired:
                ok, msg = bot_start(raw)
            else:
                ok, msg = bot_stop(raw)
            if ok:
                st.toast(msg)
                st.session_state["bot_status"] = desired
                st.session_state["bot_pids"] = _windows_bot_pids() if (_is_windows() and desired) else []
                st.session_state["bot_toggle_sync"] = True
                time.sleep(0.2)
                st.rerun()
            else:
                st.error(msg)
                st.session_state["bot_status"] = get_bot_status(raw)
                st.session_state["bot_pids"] = _windows_bot_pids() if (_is_windows() and st.session_state["bot_status"]) else []
                st.session_state["bot_toggle_sync"] = True
                time.sleep(0.2)
                st.rerun()

        scrape_mode = st.sidebar.radio("Full Scrape Mode", ["Test (2 pages)", "Full"], index=0, key="full_scrape_mode")

        if st.sidebar.button("Full Scrape", type="primary", use_container_width=True):
            if not FULL_SCRAPE_SCRIPT.exists():
                st.error(f"Full Scrape tool not found: {FULL_SCRAPE_SCRIPT}")
            else:
                if scrape_mode == "Full":
                    st.session_state["confirm_full_scrape"] = True
                else:
                    subprocess.Popen([sys.executable, str(FULL_SCRAPE_SCRIPT), "--test-mode", "--max-pages", "2"] + _headless_args())
                    st.toast("Test Full Scrape Started (2 pages)...")

        if st.session_state.get("confirm_full_scrape"):
            st.warning("Full Scrape will rebuild the DB and JSONs from scratch and overwrite existing data.")
            c1, c2 = st.sidebar.columns(2)
            with c1:
                if st.button("Confirm Full Scrape", type="primary", use_container_width=True):
                    subprocess.Popen([sys.executable, str(FULL_SCRAPE_SCRIPT)] + _headless_args())
                    st.toast("Full Scrape Started...")
                    st.session_state["confirm_full_scrape"] = False
            with c2:
                if st.button("Cancel", use_container_width=True):
                    st.session_state["confirm_full_scrape"] = False

        c1, c2 = st.sidebar.columns(2)
        with c1:
            if st.button("Smart Sync", type="secondary", use_container_width=True):
                if SYNC_SCRIPT.exists():
                    env = dict(os.environ)
                    env["EURB_SYNC_SOURCE"] = "manual_sync"
                    subprocess.Popen([sys.executable, str(SYNC_SCRIPT)] + _headless_args(), env=env)
                    st.toast("Smart Sync Started...")
                else:
                    st.error(f"Smart Sync tool not found: {SYNC_SCRIPT}")
        with c2:
            if st.button("Report", type="secondary", use_container_width=True):
                if REPORT_SCRIPT.exists():
                    subprocess.run([sys.executable, str(REPORT_SCRIPT)])
                    st.toast("Report Sent!")
                else:
                    st.error(f"Report tool not found: {REPORT_SCRIPT}")

    view_options = ["Cases", "Help", "Finance"]
    pending_view_mode = st.session_state.pop("pending_view_mode", None)
    if pending_view_mode in view_options:
        st.session_state["view_mode"] = pending_view_mode
    view_mode = st.sidebar.radio("View", view_options, index=0, key="view_mode")

    help_path = PROJECT_ROOT / "docs" / "HELP.md"

    def _ensure_help_file(path: Path) -> None:
        if path.exists():
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        template = (
            "# Help\n\n"
            "## 1) What you're building\n"
            "A Windows-based system that scrapes e-Urbanizam cases, stores them in a local SQLite DB + per-case JSON files, detects status-only changes, and exposes everything through an Admin panel with daily or on-demand email summaries, plus (planned) Telegram conversational access and scheduled daily runs.\n\n"
            "## 2) Project folder vs Runtime folder\n\n"
            "## 3) Daily flow: Full Scrape / Smart Sync / Report\n\n"
            "## 4) Snapshots: what they are (status-only) and why we use them\n\n"
            "## 5) Tools list + purpose + status (Used Now / Planned / Deprecated)\n\n"
            "## 6) BAT files: what each one does (start_app.bat and planned StartNewPC.bat)\n\n"
            "## 7) Roadmap (Finished vs Planned)\n\n"
            "## 8) Git sync (Planned)\n"
        )
        path.write_text(template, encoding="utf-8")

    def _backup_file(path: Path) -> None:
        if not path.exists():
            return
        bak_dir = PROJECT_ROOT / "bak"
        bak_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = bak_dir / f"{path.name}.bak_{ts}"
        backup_path.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")

    _ensure_help_file(help_path)

    def _slugify(text: str) -> str:
        cleaned = []
        last_dash = False
        for ch in text.strip().lower():
            if ch.isalnum():
                cleaned.append(ch)
                last_dash = False
            else:
                if not last_dash:
                    cleaned.append("-")
                    last_dash = True
        slug = "".join(cleaned).strip("-")
        return slug or "section"

    def _extract_headings(markdown_text: str):
        headings = []
        for line in markdown_text.splitlines():
            if line.startswith("## "):
                title = line[3:].strip()
                if title:
                    headings.append((title, _slugify(title)))
        return headings

    def _inject_anchors(markdown_text: str):
        lines = []
        for line in markdown_text.splitlines():
            if line.startswith("## "):
                title = line[3:].strip()
                if title:
                    lines.append(f'<a id="{_slugify(title)}"></a>')
            lines.append(line)
        return "\n".join(lines)

    help_content = help_path.read_text(encoding="utf-8") if help_path.exists() else ""

    if "finance_authenticated" not in st.session_state:
        st.session_state["finance_authenticated"] = False

    if view_mode == "Finance":
        configured_finance_pin = _resolve_finance_pin(raw)
        if configured_finance_pin is None:
            st.warning("Finance PIN not configured. Set EURBANIZAM_FINANCE_PIN or finance_pin in settings.json.")
            st.session_state["finance_authenticated"] = False
            st.sidebar.markdown("---")
            _render_sidebar_bot_scrapers()
            return

        if st.session_state.get("finance_authenticated", False):
            if render_finance_page is None:
                st.error("Finance module not available. Check admin_pages/finance.py")
                st.sidebar.markdown("---")
                _render_sidebar_bot_scrapers()
                return
            db_path_finance = Path(settings["local_db_path"])
            json_dir = Path(settings.get("local_json_dir")) if settings.get("local_json_dir") else None
            db_mtime_finance = db_path_finance.stat().st_mtime if db_path_finance.exists() else 0.0
            field_keys_finance = [d["name"] for d in custom_defs if d.get("enabled", True)] + ["Phone"]
            custom_df_finance = _load_custom_fields_cached(
                str(db_path_finance),
                "case_user_data",
                case_key_col,
                field_key_col,
                field_value_col,
                tuple(field_keys_finance),
                db_mtime_finance,
            )
            if not custom_df_finance.empty:
                custom_cols_finance = ["case_id"] + [k for k in field_keys_finance if k in custom_df_finance.columns]
                custom_df_finance = custom_df_finance[custom_cols_finance]
                df_cases_for_finance = df_cases.merge(custom_df_finance, on="case_id", how="left")
            else:
                df_cases_for_finance = df_cases.copy()
                for key in field_keys_finance:
                    if key not in df_cases_for_finance.columns:
                        df_cases_for_finance[key] = None
            df_cases_for_finance = _merge_finance_into_cases(df_cases_for_finance, conn)
            render_finance_page(
                conn,
                db_path_finance,
                json_dir,
                settings,
                df_cases_for_finance,
                custom_defs,
                case_key_col,
                field_key_col,
                field_value_col,
                build_display_columns,
                build_grid_config,
                settings_path=SETTINGS_PATH,
                load_settings_fn=load_settings,
                save_settings_key_fn=save_settings_key,
            )
            st.sidebar.markdown("---")
            _render_sidebar_bot_scrapers()
            return
        else:
            st.title("Finance")
            st.caption("This section is PIN-protected.")
            with st.form("finance_pin_form", clear_on_submit=True):
                entered_pin = st.text_input("Finance PIN", type="password")
                unlock_finance = st.form_submit_button("Unlock Finance", type="primary")

            if unlock_finance:
                if entered_pin == configured_finance_pin:
                    st.session_state["finance_authenticated"] = True
                    st.rerun()
                else:
                    st.warning("Finance is locked. Enter the correct PIN to continue.")
            else:
                st.info("Finance is locked. Enter the PIN to continue.")
            st.sidebar.markdown("---")
            _render_sidebar_bot_scrapers()
            return


    visible_columns_key = "visible_columns_v9"
    column_order_key = "column_order_map"
    column_order_map = settings.get(column_order_key, {})
    if not isinstance(column_order_map, dict):
        column_order_map = {}

    if view_mode == "Help":
        toc_items = _extract_headings(help_content)
        if toc_items:
            st.sidebar.markdown("**Help contents**")
            toc_md = "\n".join([f"- [{title}](#{slug})" for title, slug in toc_items])
            st.sidebar.markdown(toc_md, unsafe_allow_html=True)

        edit_mode = st.sidebar.checkbox("Edit mode", key="help_edit_mode")
        if edit_mode:
            draft = st.text_area("Help content", value=help_content, height=700, key="help_edit_text")
            if st.button("Save Help"):
                if not draft.strip():
                    st.error("Help content cannot be empty.")
                else:
                    _backup_file(help_path)
                    help_path.write_text(draft, encoding="utf-8")
                    st.success("Help saved.")
        else:
            st.markdown(_inject_anchors(help_content), unsafe_allow_html=True)
        return

    st.sidebar.header("Filters")
    req_status = st.session_state.get("_requirements_last_status")
    if req_status:
        label_map = {"ok": "Dependencies OK", "installed": "Dependencies installed", "missing": "Dependencies missing", "failed": "Dependency install failed", "error": "Dependency check error"}
        st.sidebar.caption(f"Requirements: {label_map.get(req_status, req_status)}")

    date_presets = ["All Time", "Today", "This Week", "Last 30 Days", "Custom"]
    preset = last_date_range.get("preset")
    if preset not in date_presets:
        preset = "All Time"

    last_start = _coerce_date(last_date_range.get("start"))
    last_end = _coerce_date(last_date_range.get("end"))
    if preset == "Custom" and (not last_start or not last_end):
        preset = "All Time"

    all_types = []
    default_types = []
    desired_types = []
    if "request_type" in df_cases.columns:
        all_types = sorted([t for t in df_cases["request_type"].dropna().unique() if str(t).strip()])
        if all_types:

            default_exclude_set = {t for t in (default_exclude or []) if isinstance(t, str) and t.strip()}
            default_types = [t for t in all_types if t not in default_exclude_set]

            desired_types = list(default_types)
            if isinstance(last_request_type_selection, list) and last_request_type_selection:

                desired_types = [t for t in last_request_type_selection if t in all_types]
                if not desired_types:
                    desired_types = list(default_types)
            else:
                desired_types = list(default_types)

    all_stats = []
    default_stats = []
    desired_stats = []
    if "status" in df_cases.columns:
        status_series_all = df_cases["status"].fillna("").astype(str)
        non_empty_stats = sorted({s for s in status_series_all if s.strip()})
        has_empty = any(not s.strip() for s in status_series_all)
        all_stats = (["(Empty)"] if has_empty else []) + non_empty_stats
        if all_stats:
            default_stats = list(all_stats)
            desired_stats = list(default_stats)
            if isinstance(last_status_selection, list) and last_status_selection:
                desired_stats = [s for s in last_status_selection if s in all_stats]
                if not desired_stats:
                    desired_stats = list(default_stats)
            else:
                desired_stats = list(default_stats)
            if "(Empty)" in all_stats and "(Empty)" not in desired_stats:
                desired_stats.append("(Empty)")

    if "applied_date_range" not in st.session_state:
        st.session_state["applied_date_range"] = dict(last_date_range)
    if "applied_search_text" not in st.session_state:
        st.session_state["applied_search_text"] = str(last_search_text or "")
    if all_types and "applied_types" not in st.session_state:
        st.session_state["applied_types"] = list(desired_types)
    if all_stats and "applied_stats" not in st.session_state:
        st.session_state["applied_stats"] = list(desired_stats)

    applied_date_range = st.session_state.get("applied_date_range", {})
    applied_preset = applied_date_range.get("preset", preset)
    applied_start = _coerce_date(applied_date_range.get("start")) or last_start
    applied_end = _coerce_date(applied_date_range.get("end")) or last_end
    if applied_preset not in date_presets:
        applied_preset = "All Time"

    with st.sidebar.form("date_filter_form", clear_on_submit=False):
        start_date = None
        end_date = None
        with st.expander("Date Range", expanded=True):
            date_preset = st.selectbox(
                "Date Range",
                date_presets,
                index=date_presets.index(applied_preset),
                key="filter_date_preset",
                label_visibility="collapsed",
            )
            if date_preset == "Custom":
                if not applied_start or not applied_end:
                    applied_start, applied_end = date.today() - timedelta(days=30), date.today()
                date_range = st.date_input(
                    "Custom Range",
                    (applied_start, applied_end),
                    key="filter_date_custom",
                    label_visibility="collapsed",
                )
                if len(date_range) == 2:
                    start_date, end_date = date_range
        apply_date = st.form_submit_button("Apply Date", use_container_width=True, key="apply_date")

    today = date.today()
    if date_preset == "Today":
        start_date, end_date = today, today
    elif date_preset == "This Week":
        start_date, end_date = today - timedelta(days=7), today
    elif date_preset == "Last 30 Days":
        start_date, end_date = today - timedelta(days=30), today

    current_date_range = {
        "preset": date_preset,
        "start": start_date.isoformat() if start_date else None,
        "end": end_date.isoformat() if end_date else None,
    }
    if apply_date:
        st.session_state["applied_date_range"] = dict(current_date_range)
        if current_date_range != last_date_range:
            save_settings_key(SETTINGS_PATH, "last_date_range", current_date_range)

    sel_types = list(st.session_state.get("applied_types", desired_types))
    if all_types:
        with st.sidebar.form("type_filter_form", clear_on_submit=False):
            with st.expander("Request Type", expanded=True):
                _init_checkbox_options("filter_type", all_types, sel_types)
                sel_types = _get_checkbox_selection("filter_type", all_types)
            select_all = st.form_submit_button("Select All", use_container_width=True, key="type_select_all")
            deselect_all = st.form_submit_button("Deselect All", use_container_width=True, key="type_deselect_all")
            apply_types = st.form_submit_button("Apply Types", use_container_width=True, key="apply_types")
        if select_all:
            st.session_state["filter_type_pending"] = list(all_types)
            st.rerun()
        if deselect_all:
            st.session_state["filter_type_pending"] = []
            st.rerun()
        if not sel_types:
            sel_types = list(default_types)
        if apply_types:
            st.session_state["applied_types"] = list(sel_types)
            save_settings_key(SETTINGS_PATH, "last_request_type_selection", list(sel_types))

    sel_stats = list(st.session_state.get("applied_stats", desired_stats))
    st.sidebar.subheader("Status")
    if all_stats:
        with st.sidebar.form("status_filter_form", clear_on_submit=False):
            with st.expander("Status", expanded=True):
                _init_checkbox_options("filter_status", all_stats, sel_stats)
                sel_stats = _get_checkbox_selection("filter_status", all_stats)
            select_all = st.form_submit_button("Select All", use_container_width=True, key="status_select_all")
            deselect_all = st.form_submit_button("Deselect All", use_container_width=True, key="status_deselect_all")
            apply_status = st.form_submit_button("Apply Status", use_container_width=True, key="apply_status")
        if select_all:
            st.session_state["filter_status_pending"] = list(all_stats)
            st.rerun()
        if deselect_all:
            st.session_state["filter_status_pending"] = []
            st.rerun()
        if not sel_stats:
            sel_stats = list(default_stats)
        if "(Empty)" in all_stats and "(Empty)" not in sel_stats:
            sel_stats.append("(Empty)")
        if apply_status:
            st.session_state["applied_stats"] = list(sel_stats)
            save_settings_key(SETTINGS_PATH, "last_status_selection", list(sel_stats))

    st.markdown("#### E-Urbanizam Manager")
    with st.form("search_form", clear_on_submit=False):
        search = st.text_input(
            "Search",
            value=str(st.session_state.get("applied_search_text", "") or ""),
            key="filter_search_text",
            placeholder="Search all fields...",
            label_visibility="collapsed",
        )
        apply_search = st.form_submit_button("Apply Search", use_container_width=True, key="apply_search")
    if apply_search:
        st.session_state["applied_search_text"] = str(search or "")
        save_settings_key(SETTINGS_PATH, "last_search_text", str(search or ""))

    applied_search = str(st.session_state.get("applied_search_text", "") or "")
    applied_types = list(st.session_state.get("applied_types", sel_types))
    applied_stats = list(st.session_state.get("applied_stats", sel_stats))
    applied_date_range = st.session_state.get("applied_date_range", current_date_range)

    if applied_date_range:
        start_date = _coerce_date(applied_date_range.get("start"))
        end_date = _coerce_date(applied_date_range.get("end"))

    df_filtered = df_cases
    mask = pd.Series([True] * len(df_cases), index=df_cases.index)

    if start_date and end_date and "updated_date" in df_cases.columns:
        mask &= (df_cases["updated_date"] >= start_date) & (df_cases["updated_date"] <= end_date)

    if applied_types:
        mask &= df_cases["request_type"].isin(applied_types)

    if applied_stats:
        status_series_filtered = df_cases["status"].fillna("").astype(str)
        if "(Empty)" in applied_stats:
            non_empty_selected = [s for s in applied_stats if s != "(Empty)"]
            mask &= status_series_filtered.isin(non_empty_selected) | ~status_series_filtered.str.strip().astype(bool)
        else:
            mask &= status_series_filtered.isin(applied_stats)

    search_key = str(applied_search or "").strip()
    if search_key:
        q0 = search_key
        q1 = _mk_cyr_to_lat(q0)
        q2 = _mk_lat_to_cyr(q0)
        raw_variants = []
        for q in (q0, q1, q2):
            ql = q.strip().lower()
            if ql and ql not in raw_variants:
                raw_variants.append(ql)
        norm_variants = []
        for q in (q0, q1, q2):
            nq = _normalize_search(q) if q else ""
            if nq and nq not in norm_variants:
                norm_variants.append(nq)

        mask_exact = pd.Series([False] * len(df_cases), index=df_cases.index)
        for q in raw_variants:
            if q:
                mask_exact |= df_cases["__search_blob"].str.contains(q, na=False, regex=False)
        if norm_variants and "__row_norm" in df_cases.columns:
            for nq in norm_variants:
                if nq:
                    mask_exact |= df_cases["__row_norm"].str.contains(nq, na=False, regex=False)

        mask &= mask_exact

        if fuzz is not None and mask_exact.sum() <= 2:
            q_norms = []
            for q in (q0, q1, q2):
                nq = _normalize_search(q)
                if nq and nq not in q_norms:
                    q_norms.append(nq)
                nqc = _collapse_repeats(nq) if nq else ""
                if nqc and nqc not in q_norms:
                    q_norms.append(nqc)
            if q_norms:
                q_len = max(len(q) for q in q_norms)
                if q_len >= 4 and not re.fullmatch(r"[0-9/\-\s]+", q0 or ""):
                    if q_len <= 5:
                        threshold = 90
                    elif q_len <= 8:
                        threshold = 84
                    elif q_len <= 12:
                        threshold = 82
                    else:
                        threshold = 80
                    seen = set(df_cases.loc[mask_exact, "case_id"].astype(str))
                    fuzzy_hits = []
                    focused_norm = df_cases.get("__focused_norm", pd.Series([""] * len(df_cases), index=df_cases.index))
                    for idx, fn in focused_norm.items():
                        if not fn:
                            continue
                        cid = str(df_cases.at[idx, "case_id"])
                        if cid in seen:
                            continue
                        best = 0
                        for nq in q_norms:
                            if len(nq) >= 4 and nq in fn:
                                best = 100
                                break
                        if best == 0:
                            for nq in q_norms:
                                score = fuzz.partial_ratio(nq, fn)
                                if score > best:
                                    best = score
                        if best >= threshold:
                            fuzzy_hits.append(idx)
                    if fuzzy_hits:
                        mask |= df_cases.index.isin(fuzzy_hits)


    df_filtered = df_cases.loc[mask]

    extra_visible = [c for c in visible_columns if c not in base_cols and c != "Denovi (Od Posledna)"]
    field_keys = sorted(set(enabled_custom + extra_visible + ["Phone"]))

    custom_df = _load_custom_fields_cached(
        str(db_path),
        "case_user_data",
        case_key_col,
        field_key_col,
        field_value_col,
        tuple(field_keys),
        db_mtime,
    )

    if not custom_df.empty:
        if len(df_filtered) < len(df_cases):
            custom_df = custom_df[custom_df["case_id"].isin(df_filtered["case_id"])]
        custom_cols = ["case_id"] + [k for k in field_keys if k in custom_df.columns]
        custom_df = custom_df[custom_cols]
        merged_df = df_filtered.merge(custom_df, on="case_id", how="left")
    else:
        merged_df = df_filtered.copy()
    for key in field_keys:
        if key not in merged_df.columns:
            merged_df[key] = None

    df_filtered = merged_df
    latest_document_map = api_case_documents.load_latest_case_document_map(
        conn,
        df_filtered.get("case_id", pd.Series(dtype="object")).tolist(),
        json_dir=settings.get("local_json_dir"),
    )
    if latest_document_map:
        df_filtered["Latest Document"] = (
            df_filtered["case_id"].astype(str).map(latest_document_map)
        )
    elif "Latest Document" not in df_filtered.columns:
        df_filtered["Latest Document"] = None

    all_cols = ["case_id", "status", "title", "request_type", "created_at", "updated_at", "prev_change_at", "First Seen", "Latest Document", "Denovi (Od Posledna)", "Phone"]
    for name in enabled_custom:
        if name not in all_cols:
            all_cols.append(name)
    # Cases view: only case columns (no finance_* or finance-scoped custom)
    all_cols = [c for c in all_cols if not str(c).startswith("finance_")]

    if not visible_columns:
        visible_columns = list(all_cols)

    visible_columns = [c for c in visible_columns if c in all_cols]
    visible_columns = list(dict.fromkeys(visible_columns))
    if not visible_columns:
        visible_columns = list(all_cols)

    with st.sidebar.expander("Columns", expanded=False):
        st.caption("Changes save immediately.")
        mode_key_prefix = "cases"
        order_map = dict(column_order_map) if isinstance(column_order_map, dict) else {}
        prev_visible_columns = list(visible_columns)

        ordered_cols = sorted(all_cols, key=lambda c: int(order_map.get(c, 999)))
        ordered_cols = list(dict.fromkeys(ordered_cols))
        case_ordered = [c for c in ordered_cols if not str(c).startswith("finance_")]
        finance_ordered = [c for c in ordered_cols if str(c).startswith("finance_")]

        def _render_column_section(section_key: str, title: str, section_cols: list, current_visible: list):
            st.markdown(f"**{title}**")
            if not section_cols:
                st.caption("No columns in this section.")
                return section_cols, current_visible, False

            s1, s2 = st.columns(2)
            with s1:
                select_all = st.button("Select All", key=f"{mode_key_prefix}_{section_key}_select_all", use_container_width=True)
            with s2:
                deselect_all = st.button("Deselect All", key=f"{mode_key_prefix}_{section_key}_deselect_all", use_container_width=True)

            if select_all:
                for col in section_cols:
                    if col not in current_visible:
                        current_visible.append(col)
            if deselect_all:
                section_set = set(section_cols)
                current_visible = [c for c in current_visible if c not in section_set]

            moved_local = False
            for idx, col_name in enumerate(section_cols):
                c1, c2, c3 = st.columns([0.12, 0.12, 0.76])
                with c1:
                    up_clicked = st.button("^", key=f"{mode_key_prefix}_{section_key}_col_up_{idx}_{col_name}")
                with c2:
                    down_clicked = st.button("v", key=f"{mode_key_prefix}_{section_key}_col_down_{idx}_{col_name}")
                with c3:
                    vis = st.checkbox(col_name, value=col_name in current_visible, key=f"{mode_key_prefix}_{section_key}_col_vis_{idx}_{col_name}")

                if up_clicked and idx > 0:
                    section_cols[idx - 1], section_cols[idx] = section_cols[idx], section_cols[idx - 1]
                    moved_local = True
                if down_clicked and idx < len(section_cols) - 1:
                    section_cols[idx + 1], section_cols[idx] = section_cols[idx], section_cols[idx + 1]
                    moved_local = True

                if vis and col_name not in current_visible:
                    current_visible.append(col_name)
                if (not vis) and col_name in current_visible:
                    current_visible.remove(col_name)

            return section_cols, current_visible, moved_local

        moved = False
        case_ordered, visible_columns, moved_case = _render_column_section("case", "Case Columns", case_ordered, visible_columns)
        moved = moved or moved_case

        st.markdown("---")
        finance_ordered, visible_columns, moved_finance = _render_column_section("finance", "Finance Columns", finance_ordered, visible_columns)
        moved = moved or moved_finance

        ordered_cols = case_ordered + finance_ordered
        selected_cols = set(visible_columns)
        visible_columns = [c for c in ordered_cols if c in selected_cols]

        if moved:
            new_order_map = {name: i + 1 for i, name in enumerate(ordered_cols)}
            save_settings_key(SETTINGS_PATH, column_order_key, new_order_map)
            save_settings_key(SETTINGS_PATH, visible_columns_key, visible_columns)
            column_order_map = dict(new_order_map)
            st.rerun()
        elif visible_columns != prev_visible_columns:
            save_settings_key(SETTINGS_PATH, visible_columns_key, visible_columns)

    st.sidebar.markdown("---")
    _render_sidebar_bot_scrapers()

    if default_sort_column in df_filtered.columns:
        df_filtered = df_filtered.sort_values(default_sort_column, ascending=not default_sort_desc)

    display_cols = build_display_columns(df_filtered, visible_columns, column_order_map)
    if "case_id" in df_filtered.columns and "case_id" not in display_cols:
        display_cols = ["case_id"] + display_cols

    display_df = df_filtered[display_cols].reset_index(drop=True)

    # Keep raw case_id list for edits (do not rely on display text)
    if "case_id" in df_filtered.columns:
        st.session_state["display_case_ids"] = df_filtered["case_id"].tolist()
    else:
        st.session_state["display_case_ids"] = []

    # Mark updated cases in the case_id display (last 7 days)
    if "case_id" in display_df.columns:
        updated_flags = df_filtered.get("_updated_recent", pd.Series([False]*len(display_df))).fillna(False).reset_index(drop=True)
        created_flags = df_filtered.get("_created_recent", pd.Series([False]*len(display_df))).fillna(False).reset_index(drop=True)
        late_flags = df_filtered.get("_late_case", pd.Series([False]*len(display_df))).fillna(False).reset_index(drop=True)
        def _mark_case(i, val):
            s = str(val)
            if i < len(created_flags) and bool(created_flags[i]):
                return f"^ {s}"
            if i < len(updated_flags) and bool(updated_flags[i]):
                return f"> {s}"
            if i < len(late_flags) and bool(late_flags[i]):
                return f"v {s}"
            return s
        display_df["case_id"] = [ _mark_case(i, v) for i, v in enumerate(display_df["case_id"]) ]

    editable_snapshot = {}
    for _, row in df_filtered.iterrows():
        case_id = row.get("case_id")
        if case_id is None:
            continue
        editable_snapshot[case_id] = {"Phone": row.get("Phone")}
        for d in custom_defs:
            name = d.get("name", "").strip()
            if not name:
                continue
            editable_snapshot[case_id][name] = row.get(name)
    st.session_state["editable_snapshot"] = editable_snapshot

    st.caption("Legend: ^ ID = created in last 7 days. > ID = status updated in last 7 days. v ID = no status change in 20+ days. 'First Seen' shows detection source.")

    st.data_editor(
        display_df,
        key="main_table_editor",
        hide_index=True,
        use_container_width=True,
        height=700,
        column_config=build_grid_config(df_filtered, custom_defs),
    )

    with st.expander("Custom Fields Manager"):
        st.markdown("### Manage Custom Fields")
        st.caption("Edit fields here. Changes save immediately.")

        if "custom_defs_original_names" not in st.session_state or st.session_state.get("_custom_defs_count") != len(custom_defs):
            st.session_state["custom_defs_original_names"] = [d.get("name", "").strip() for d in custom_defs]
            st.session_state["_custom_defs_count"] = len(custom_defs)

        field_rows = []
        for d in custom_defs:
            field_rows.append(
                {
                    "Name": d.get("name", ""),
                    "Type": d.get("type", "Text"),
                    "Options": ", ".join(d.get("options", []) or []),
                    "Enabled": d.get("enabled", True),
                }
            )

        if field_rows:
            fields_df = pd.DataFrame(field_rows)
            edited_fields = st.data_editor(
                fields_df,
                hide_index=True,
                key="fields_editor",
                column_config={
                    "Name": st.column_config.TextColumn("Name", required=True),
                    "Type": st.column_config.SelectboxColumn("Type", options=["Text", "Dropdown"]),
                    "Options": st.column_config.TextColumn("Options (comma-separated)"),
                    "Enabled": st.column_config.CheckboxColumn("Enabled"),
                },
            )

            if "fields_editor" in st.session_state and st.session_state["fields_editor"].get("edited_rows"):
                try:
                    new_defs = []
                    names_seen = set()
                    has_error = False
                    original_names = st.session_state.get("custom_defs_original_names", [])

                    for i, row in edited_fields.iterrows():
                        name = str(row["Name"]).strip()
                        if not name:
                            st.error(f"Row {i+1}: Name cannot be empty.")
                            has_error = True
                            continue

                        if name.lower() == "phone":
                            st.error(f"Row {i+1}: 'Phone' is reserved and cannot be used as a custom field name.")
                            has_error = True
                            continue

                        name_lower = name.lower()
                        if name_lower in names_seen:
                            st.error(f"Duplicate field name: '{name}'. Names must be unique.")
                            has_error = True
                            continue
                        names_seen.add(name_lower)

                        field_type = row["Type"]
                        options_str = str(row.get("Options", "")).strip()
                        options = [o.strip() for o in options_str.split(",") if o.strip()] if options_str else []
                        options = list(dict.fromkeys(options))
                        enabled = bool(row.get("Enabled", True))
                        scope = custom_defs[i].get("scope", "case") if i < len(custom_defs) else "case"

                        new_defs.append(
                            {
                                "name": name,
                                "type": field_type,
                                "options": options,
                                "enabled": enabled,
                                "scope": scope,
                            }
                        )

                    # Re-add permanent fields if user deleted them (they are not deletable)
                    new_names = {nd.get("name", "").strip() for nd in new_defs}
                    for d in custom_defs:
                        pname = (d.get("name") or "").strip()
                        if pname in PERMANENT_CUSTOM_FIELD_NAMES and pname not in new_names:
                            new_defs.append(dict(d))
                            new_names.add(pname)

                    if not has_error:
                        for i in range(min(len(original_names), len(new_defs))):
                            old_name = original_names[i]
                            new_name = new_defs[i].get("name", "").strip()
                            if old_name and new_name and old_name != new_name:
                                conn.execute(
                                    "UPDATE case_user_data SET field_key = ? WHERE field_key = ?",
                                    (new_name, old_name),
                                )
                                conn.commit()

                        current_settings = load_settings(SETTINGS_PATH)
                        visible_cols = current_settings.get("visible_columns_v9", [])
                        order_map = current_settings.get("column_order_map", {})

                        for new_d in new_defs:
                            field_name = new_d.get("name", "").strip()
                            if not field_name:
                                continue

                            if new_d.get("enabled", True):
                                if field_name not in visible_cols:
                                    visible_cols.append(field_name)
                                if field_name not in order_map:
                                    max_order = max(order_map.values()) if order_map else 0
                                    order_map[field_name] = max_order + 1
                            else:
                                if field_name in visible_cols:
                                    visible_cols.remove(field_name)

                        save_settings_key(SETTINGS_PATH, "custom_field_defs", new_defs)
                        save_settings_key(SETTINGS_PATH, "visible_columns_v9", visible_cols)
                        save_settings_key(SETTINGS_PATH, "column_order_map", order_map)

                        st.session_state["fields_editor"]["edited_rows"] = {}
                        st.session_state["custom_defs_original_names"] = [d.get("name", "").strip() for d in new_defs]
                        st.session_state["_custom_defs_count"] = len(new_defs)
                        st.toast("? Custom fields saved!")
                        time.sleep(0.1)
                        st.rerun()
                except Exception as exc:
                    st.error(f"Failed to save custom fields: {exc}")
        else:
            st.info("No custom fields yet. Add one below.")

        st.markdown("### Add New Custom Field")
        cx1, cx2 = st.columns(2)
        with cx1:
            n_name = st.text_input("Name")
            n_type = st.selectbox("Type", ["Text", "Dropdown"])
            n_opt = st.text_input("Options (comma separated)")
            if st.button("Create"):
                name = n_name.strip()
                if not name:
                    st.error("Name cannot be empty.")
                elif name.lower() == "phone":
                    st.error("'Phone' is reserved and cannot be used as a custom field name.")
                else:
                    defs = settings.get("custom_field_defs", []) or []
                    if any(d.get("name", "").strip().lower() == name.lower() for d in defs):
                        st.error(f"Field '{name}' already exists.")
                    else:
                        opts = [o.strip() for o in n_opt.split(",") if o.strip()]
                        defs.append({"name": name, "type": n_type, "options": opts, "enabled": True, "scope": "case"})
                        save_settings_key(SETTINGS_PATH, "custom_field_defs", defs)

                        current_settings = load_settings(SETTINGS_PATH)
                        visible_cols = current_settings.get("visible_columns_v9", [])
                        order_map = current_settings.get("column_order_map", {})

                        if name not in visible_cols:
                            visible_cols.append(name)
                            save_settings_key(SETTINGS_PATH, "visible_columns_v9", visible_cols)

                        if name not in order_map:
                            max_order = max(order_map.values()) if order_map else 0
                            order_map[name] = max_order + 1
                            save_settings_key(SETTINGS_PATH, "column_order_map", order_map)

                        if "custom_defs_original_names" in st.session_state:
                            del st.session_state["custom_defs_original_names"]
                        st.rerun()

        st.caption(f"Local DB: {db_path}")


    conn.close()

if __name__ == "__main__":
    main()



