import argparse
import json
import os
import smtplib
import sqlite3
import sys
from datetime import datetime
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from io import BytesIO
from pathlib import Path

import pandas as pd

from runtime_identity import get_runtime_identity

# --- FIX: FORCE UTF-8 OUTPUT ON WINDOWS ---
try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

# --- PATHS ---
ROOT = Path(__file__).resolve().parents[1]
SETTINGS_PATH = ROOT / "settings.json"
LATE_DAYS_THRESHOLD = 20


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


SETTINGS = load_settings(SETTINGS_PATH)
RUNTIME_ROOT = SETTINGS["runtime_root"]
DB_PATH = SETTINGS["local_db_path"]
ENV_PATH = RUNTIME_ROOT / "secrets" / ".eurbanizam_secrets.env"


# --- LOAD ENV FILE ---
def load_env():
    if not ENV_PATH.exists():
        print(f"[WARNING] .env file not found at {ENV_PATH}")
        return

    text = None
    for enc in ('utf-8', 'utf-8-sig', 'cp1252', 'latin-1'):
        try:
            text = ENV_PATH.read_text(encoding=enc)
            break
        except Exception:
            text = None
    if text is None:
        print(f"[WARNING] Could not decode env file at {ENV_PATH}")
        return

    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        os.environ[k.strip()] = v.strip()


load_env()

# --- CONFIGURATION ---
SMTP_SERVER = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
try:
    SMTP_PORT = int(os.environ.get("SMTP_PORT", "587") or "587")
except Exception:
    SMTP_PORT = 587
SENDER_EMAIL = os.environ.get("EMAIL_USER")
SENDER_PASS = os.environ.get("EMAIL_PASS")
RECEIVER_EMAIL = os.environ.get("EMAIL_RECEIVER", SENDER_EMAIL)


def parse_recipients(raw):
    if raw is None:
        return []
    if isinstance(raw, (list, tuple, set)):
        items = []
        for r in raw:
            items.extend(parse_recipients(r))
        return items
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


def get_table_columns(conn: sqlite3.Connection, table_name: str):
    try:
        rows = conn.execute(f"PRAGMA table_info('{table_name}')").fetchall()
        return [r[1] for r in rows]
    except Exception:
        return []


def pick_column(cases_cols, candidates):
    for col in candidates:
        if col in cases_cols:
            return col
    return None



def build_display_columns(df, visible_columns, column_order_map):
    if visible_columns:
        display_cols = [col for col in visible_columns if col in df.columns]
    else:
        display_cols = list(df.columns)
    if isinstance(column_order_map, dict) and column_order_map:
        def sort_key(col_name):
            try:
                return int(column_order_map.get(col_name, 999))
            except Exception:
                return 999
        display_cols = sorted(display_cols, key=sort_key)
    if "case_id" in df.columns and "case_id" not in display_cols:
        display_cols = ["case_id"] + display_cols
    return display_cols


def load_cases(conn: sqlite3.Connection):
    cases_cols = get_table_columns(conn, "cases")
    if not cases_cols:
        return pd.DataFrame(columns=["case_id"])

    case_key_col = pick_column(cases_cols, ["case_id", "id"])
    if not case_key_col:
        return pd.DataFrame(columns=["case_id"])

    col_map = {
        "request_type": pick_column(cases_cols, ["latest_request_type", "request_type"]),
        "title": pick_column(cases_cols, ["latest_title", "title"]),
        "status": pick_column(cases_cols, ["latest_list_state", "status"]),
        "created_at": pick_column(cases_cols, ["official_created_at", "created_at", "first_seen_at"]),
        "updated_at": pick_column(cases_cols, ["latest_movement_last_change_dt"]),
        "prev_change_at": pick_column(cases_cols, ["latest_movement_prev_change_dt"]),
        "first_seen_at": pick_column(cases_cols, ["first_seen_at"]),
        "first_seen_source": pick_column(cases_cols, ["first_seen_source"]),
        "Phone": pick_column(cases_cols, ["phone", "Phone"]),
    }

    select_cols = [f'"{case_key_col}" as case_id']
    for alias, col_name in col_map.items():
        if col_name:
            select_cols.append(f'"{col_name}" as "{alias}"')

    query = f"SELECT {', '.join(select_cols)} FROM cases"
    df = pd.read_sql_query(query, conn)
    if "case_id" in df.columns:
        df["case_id"] = df["case_id"].astype(str)
    return df


def resolve_case_user_columns(conn: sqlite3.Connection):
    user_cols = get_table_columns(conn, "case_user_data")
    if not user_cols:
        return None
    case_key_col = pick_column(user_cols, ["case_id", "case_key", "id"])
    field_key_col = pick_column(user_cols, ["field_key", "key", "field_name"])
    field_value_col = pick_column(user_cols, ["field_value", "value"])
    if not case_key_col or not field_key_col or not field_value_col:
        return None
    return case_key_col, field_key_col, field_value_col


def load_custom_fields(conn: sqlite3.Connection, custom_defs):
    resolved = resolve_case_user_columns(conn)
    if not resolved:
        return pd.DataFrame(columns=["case_id"])

    enabled_field_names = []
    for item in (custom_defs or []):
        name = str((item or {}).get("name", "")).strip()
        if name and bool((item or {}).get("enabled", True)):
            enabled_field_names.append(name)
    if not enabled_field_names:
        return pd.DataFrame(columns=["case_id"])

    case_key_col, field_key_col, field_value_col = resolved
    placeholders = ",".join(["?"] * len(enabled_field_names))
    query = (
        f'SELECT "{case_key_col}" as case_id, "{field_key_col}" as field_key, '
        f'"{field_value_col}" as field_value FROM case_user_data '
        f'WHERE "{field_key_col}" IN ({placeholders})'
    )
    df = pd.read_sql_query(query, conn, params=enabled_field_names)
    if df.empty:
        return pd.DataFrame(columns=["case_id"])
    df["case_id"] = df["case_id"].astype(str)
    pivot = (
        df.pivot_table(
            index="case_id",
            columns="field_key",
            values="field_value",
            aggfunc="last",
        )
        .reset_index()
    )
    return pivot


def parse_dt_series(series):
    # DB contains mixed date formats (ISO and localized), so parse in mixed mode first.
    try:
        return pd.to_datetime(series, errors="coerce", format="mixed")
    except TypeError:
        # Fallback for pandas versions without format="mixed"
        return pd.to_datetime(series, errors="coerce")


def compute_admin_columns(df: pd.DataFrame):
    out = df.copy()
    now_dt = datetime.now()
    created_series = parse_dt_series(out.get("created_at"))
    updated_series = parse_dt_series(out.get("updated_at"))
    out["created_at"] = created_series
    out["updated_at"] = updated_series
    out["Denovi (Od Posledna)"] = (now_dt - updated_series).dt.days
    out["_late_case"] = out["Denovi (Od Posledna)"].fillna(10**9) >= LATE_DAYS_THRESHOLD

    first_seen_dt = parse_dt_series(out.get("first_seen_at"))
    date_str = first_seen_dt.dt.strftime("%Y-%m-%d").fillna("")
    src = out.get("first_seen_source", pd.Series([""] * len(out), index=out.index))
    src = src.fillna("").astype(str).str.strip()
    src_map = {"scheduled_sync": "Scheduled", "manual_sync": "Manual", "full_scrape": "Full scrape"}
    src_label = src.map(src_map).fillna(src).fillna("")
    both_mask = (date_str != "") & (src_label != "")
    first_seen = pd.Series("", index=out.index)
    first_seen[both_mask] = date_str[both_mask] + " ? " + src_label[both_mask]
    first_seen[~both_mask] = date_str.where(date_str != "", src_label)
    out["First Seen"] = first_seen
    return out


def apply_case_filters(df: pd.DataFrame, settings_raw: dict):
    out = df.copy()
    if "request_type" not in out.columns and "status" not in out.columns:
        return out

    req = out.get("request_type", pd.Series([""] * len(out), index=out.index)).fillna("").astype(str)
    status = out.get("status", pd.Series([""] * len(out), index=out.index)).fillna("").astype(str)
    mask = pd.Series(True, index=out.index)

    # Always exclude terminated cases (Прекинат)
    status_norm = status.str.strip().str.casefold()
    mask &= status_norm != "прекинат"

    excluded = []
    if bool(settings_raw.get("force_exclude_request_types", True)):
        raw_excluded = settings_raw.get("default_request_type_exclude", [])
        if isinstance(raw_excluded, list):
            excluded = [str(v).strip() for v in raw_excluded if str(v).strip()]
    if excluded:
        req_norm = req.str.strip().str.casefold()
        excluded_norm = {v.casefold() for v in excluded}
        mask &= ~req_norm.isin(excluded_norm)
    return out[mask].copy()


def get_recent_event_case_sets(conn: sqlite3.Connection, hours: int = 24):
    window = f"-{int(hours)} hours"
    query = """
        SELECT case_id, change_type, MAX(timestamp) as ts
        FROM change_events
        WHERE timestamp >= datetime('now', ?)
          AND change_type IN ('NEW_CASE', 'STATUS_CHANGE')
        GROUP BY case_id, change_type
    """
    try:
        events = pd.read_sql_query(query, conn, params=(window,))
    except Exception:
        events = pd.DataFrame(columns=["case_id", "change_type", "ts"])

    new_map = {}
    upd_map = {}
    for _, row in events.iterrows():
        cid = str(row.get("case_id") or "").strip()
        if not cid:
            continue
        if row.get("change_type") == "NEW_CASE":
            new_map[cid] = row.get("ts")
        elif row.get("change_type") == "STATUS_CHANGE":
            upd_map[cid] = row.get("ts")
    return new_map, upd_map


def format_section_df(df: pd.DataFrame, visible_columns):
    out = df.copy()
    if out.empty:
        return pd.DataFrame(columns=visible_columns)
    for col in out.columns:
        if pd.api.types.is_datetime64_any_dtype(out[col]):
            out[col] = out[col].dt.strftime("%d %b %Y")
    out = out.fillna("")
    return out[visible_columns]


def section_html(title: str, df: pd.DataFrame):
    if df.empty:
        return f"<h3>{title}</h3><p>No cases.</p>"
    table_html = df.to_html(index=False, escape=False, border=0)
    return f"<h3>{title} ({len(df)})</h3>{table_html}"


def build_report_payload(hours: int = 24):
    conn = sqlite3.connect(DB_PATH)
    try:
        cases_df = load_cases(conn)
        custom_df = load_custom_fields(conn, SETTINGS["raw"].get("custom_field_defs", []))
        if not custom_df.empty:
            cases_df = cases_df.merge(custom_df, on="case_id", how="left")
        cases_df = compute_admin_columns(cases_df)
        cases_df = apply_case_filters(cases_df, SETTINGS["raw"])

        new_map, upd_map = get_recent_event_case_sets(conn, hours=hours)
        cases_df["__new_ts"] = cases_df["case_id"].map(new_map)
        cases_df["__upd_ts"] = cases_df["case_id"].map(upd_map)

        visible_columns = build_display_columns(
            cases_df,
            SETTINGS["raw"].get("visible_columns_v9", []),
            SETTINGS["raw"].get("column_order_map", {}),
        )

        new_df = cases_df[cases_df["case_id"].isin(set(new_map.keys()))].copy()
        upd_df = cases_df[cases_df["case_id"].isin(set(upd_map.keys()))].copy()
        late_df = cases_df[cases_df["_late_case"] == True].copy()

        new_df["__new_ts"] = parse_dt_series(new_df["__new_ts"])
        upd_df["__upd_ts"] = parse_dt_series(upd_df["__upd_ts"])
        late_df["updated_at"] = parse_dt_series(late_df["updated_at"])
        late_df["created_at"] = parse_dt_series(late_df["created_at"])

        new_df = new_df.sort_values("__new_ts", ascending=False, na_position="last")
        upd_df = upd_df.sort_values("__upd_ts", ascending=False, na_position="last")
        late_df = late_df.sort_values(["created_at", "updated_at"], ascending=[False, False], na_position="last")

        new_out = format_section_df(new_df, visible_columns)
        upd_out = format_section_df(upd_df, visible_columns)
        late_out = format_section_df(late_df, visible_columns)
        return {
            "visible_columns": visible_columns,
            "new_df": new_out,
            "updated_df": upd_out,
            "late_df": late_out,
            "new_count": len(new_out),
            "updated_count": len(upd_out),
            "late_count": len(late_out),
        }
    finally:
        conn.close()


def build_excel_attachment(payload: dict):
    xlsx_bytes = BytesIO()
    with pd.ExcelWriter(xlsx_bytes, engine="openpyxl") as writer:
        payload["new_df"].to_excel(writer, sheet_name="New Cases", index=False)
        payload["updated_df"].to_excel(writer, sheet_name="Updated Cases", index=False)
        payload["late_df"].to_excel(writer, sheet_name="Late Cases", index=False)
    xlsx_bytes.seek(0)
    return xlsx_bytes.read()


def build_html_body(payload: dict, hours: int, identity: dict[str, str]):
    return f"""
    <html>
    <head>
      <style>
        body {{ font-family: Arial, sans-serif; }}
        h2, h3 {{ margin-bottom: 8px; }}
        table {{ border-collapse: collapse; width: 100%; margin-bottom: 16px; }}
        th {{ background-color: #f2f2f2; }}
        th, td {{ padding: 8px; border: 1px solid #ddd; text-align: left; font-size: 13px; }}
      </style>
    </head>
    <body>
      <h2>E-Urbanizam Activity Report</h2>
      <p><strong>Source:</strong> {identity["source"]}</p>
      <p>Window for New/Updated sections: last {hours} hours.</p>
      <p><strong>Excel:</strong> Download the attached file with sheets: New Cases, Updated Cases, Late Cases.</p>
      {section_html("1. New Cases", payload["new_df"])}
      {section_html("2. Updated Cases", payload["updated_df"])}
      {section_html("3. Late Cases", payload["late_df"])}
      <p style="font-size:12px;color:#888;">Generated by E-Urbanizam Manager</p>
    </body>
    </html>
    """


def send_email(receiver_override=None, dry_run=False, hours=24):
    print("[INFO] Generating Daily Report...")
    payload = build_report_payload(hours=hours)
    identity = get_runtime_identity(SETTINGS["raw"], os.environ)
    receiver_raw = receiver_override or RECEIVER_EMAIL
    recipients = parse_recipients(receiver_raw)
    total = payload["new_count"] + payload["updated_count"] + payload["late_count"]
    print(
        f"   New: {payload['new_count']} | Updated: {payload['updated_count']} | "
        f"Late: {payload['late_count']}"
    )

    report_ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    snapshots_dir = RUNTIME_ROOT / "snapshots"
    snapshots_dir.mkdir(parents=True, exist_ok=True)
    html_body = build_html_body(payload, hours=hours, identity=identity)
    xlsx_blob = build_excel_attachment(payload)
    xlsx_name = f"eurbanizam_report_{report_ts}.xlsx"

    if dry_run:
        html_path = snapshots_dir / f"eurbanizam_report_{report_ts}.html"
        xlsx_path = snapshots_dir / xlsx_name
        html_path.write_text(html_body, encoding="utf-8")
        xlsx_path.write_bytes(xlsx_blob)
        print(f"[DRY RUN] HTML preview: {html_path}")
        print(f"[DRY RUN] Excel file:   {xlsx_path}")
        return "Dry run completed."

    if not SENDER_EMAIL or not SENDER_PASS:
        print("[ERROR] Missing email credentials in .env file!")
        return "Error: Missing credentials in .env"
    if not recipients:
        print("[ERROR] Missing receiver email.")
        return "Error: Missing receiver email"

    msg = MIMEMultipart()
    msg["From"] = SENDER_EMAIL
    msg["To"] = ", ".join(recipients)
    msg["Subject"] = (
        f"[{identity['label']}] E-Urbanizam Daily Report - "
        f"{datetime.now().strftime('%d %b %Y')}"
    )
    msg["X-Eurbanizam-Source"] = identity["source"]
    msg["X-Eurbanizam-Host"] = identity["hostname"]
    msg.attach(MIMEText(html_body, "html"))

    attachment = MIMEBase(
        "application",
        "vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    attachment.set_payload(xlsx_blob)
    encoders.encode_base64(attachment)
    attachment.add_header("Content-Disposition", f'attachment; filename="{xlsx_name}"')
    msg.attach(attachment)

    try:
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(SENDER_EMAIL, SENDER_PASS)
        server.send_message(msg, to_addrs=recipients)
        server.quit()
        print(
            f"[SUCCESS] Email sent successfully from {identity['source']} "
            f"to {', '.join(recipients)}."
        )
        print(f"   Included {total} rows across 3 sections.")
        return "Email sent successfully!"
    except Exception as e:
        print(f"[ERROR] Failed to send email: {e}")
        return f"Error: {e}"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--receiver", default=None, help="Override receiver email for this run.")
    parser.add_argument("--dry-run", action="store_true", help="Generate HTML+XLSX previews without sending email.")
    parser.add_argument("--hours", type=int, default=24, help="Window for New/Updated sections (default: 24).")
    args = parser.parse_args()
    send_email(receiver_override=args.receiver, dry_run=args.dry_run, hours=args.hours)
