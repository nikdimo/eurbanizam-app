from __future__ import annotations

import html
import json
import re
import sqlite3
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
import streamlit as st
import smtplib
from email.message import EmailMessage

from apps.api.core import email as api_email_core
from apps.api.core import finance_cases as api_finance_cases
from apps.api.core import finance_invoices as api_finance_invoices
from apps.api.core import invoices as api_invoices_core


PROJECT_ROOT = Path(__file__).resolve().parent.parent
FINANCE_SETTINGS_PATH = PROJECT_ROOT / "finance_settings.json"

CURRENCY_OPTIONS = ["MKD", "EUR", "USD"]
STATUS_OPTIONS = ["GRAY", "GREEN", "YELLOW", "RED", "PENDING", "PAID"]
# Custom field names that cannot be deleted (always shown in Contract profile / columns)
PERMANENT_CUSTOM_FIELD_NAMES = frozenset({"Name / Last name", "email"})


def _as_float(value) -> float:
    if value is None:
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _parse_date(value: str) -> Optional[date]:
    if value is None:
        return None
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


def _normalize_text(value) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def _load_finance_settings() -> dict:
    if not FINANCE_SETTINGS_PATH.exists():
        return {}
    try:
        with FINANCE_SETTINGS_PATH.open("r", encoding="utf-8-sig") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}


def _save_finance_settings_key(key: str, value: Any) -> None:
    data = _load_finance_settings() if FINANCE_SETTINGS_PATH.exists() else {}
    data[key] = value
    FINANCE_SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with FINANCE_SETTINGS_PATH.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _get_smtp_settings() -> dict:
    return api_email_core.get_smtp_settings()


def _get_company_settings() -> dict:
    return api_email_core.get_company_settings()


def _build_invoice_html(company: dict, row: dict) -> str:
    return api_invoices_core.build_invoice_html(company, row)


def _invoice_html_to_pdf(html_content: str) -> Optional[bytes]:
    return api_invoices_core.invoice_html_to_pdf(html_content)


def _send_invoice_email_simple(to_email: str, subject: str, body: str, attachment_filename: Optional[str] = None, attachment_bytes: Optional[bytes] = None) -> Optional[str]:
    return api_email_core.send_email_simple(
        to_email=to_email,
        subject=subject,
        body=body,
        attachment_filename=attachment_filename,
        attachment_bytes=attachment_bytes,
    )


def _coerce_date_finance(value) -> Optional[date]:
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


def _normalize_search_finance(text: str) -> str:
    return re.sub(r"[^a-zA-Z0-9Ѐ-ӿ]", "", str(text or "")).lower()


def _mk_cyr_to_lat_finance(s: str) -> str:
    if not s:
        return ""
    m = {
        "А": "A", "а": "a", "Б": "B", "б": "b", "В": "V", "в": "v", "Г": "G", "г": "g",
        "Д": "D", "д": "d", "Ѓ": "Gj", "ѓ": "gj", "Е": "E", "е": "e", "Ж": "Zh", "ж": "zh",
        "З": "Z", "з": "z", "Ѕ": "Dz", "ѕ": "dz", "И": "I", "и": "i", "Ј": "J", "ј": "j",
        "К": "K", "к": "k", "Л": "L", "л": "l", "Љ": "Lj", "љ": "lj", "М": "M", "м": "m",
        "Н": "N", "н": "n", "Њ": "Nj", "њ": "nj", "О": "O", "о": "o", "П": "P", "п": "p",
        "Р": "R", "р": "r", "С": "S", "с": "s", "Т": "T", "т": "t", "Ќ": "Kj", "ќ": "kj",
        "У": "U", "у": "u", "Ф": "F", "ф": "f", "Х": "H", "х": "h", "Ц": "C", "ц": "c",
        "Ч": "Ch", "ч": "ch", "Џ": "Dz", "џ": "dz", "Ш": "Sh", "ш": "sh", "Ђ": "Dj", "ђ": "dj",
    }
    return "".join(m.get(ch, ch) for ch in s)


def _mk_lat_to_cyr_finance(s: str) -> str:
    if not s:
        return ""
    t = s
    for a, b in [
        ("dzh", "џ"), ("Dzh", "Џ"), ("Gj", "Ѓ"), ("gj", "ѓ"), ("Kj", "Ќ"), ("kj", "ќ"),
        ("Lj", "Љ"), ("lj", "љ"), ("Nj", "Њ"), ("nj", "њ"), ("Zh", "Ж"), ("zh", "ж"),
        ("Ch", "Ч"), ("ch", "ч"), ("Sh", "Ш"), ("sh", "ш"), ("Dz", "Ѕ"), ("dz", "ѕ"),
    ]:
        t = t.replace(a, b)
    single = {
        "A": "А", "a": "а", "B": "Б", "b": "б", "V": "В", "v": "в", "G": "Г", "g": "г",
        "D": "Д", "d": "д", "E": "Е", "e": "е", "Z": "З", "z": "з", "I": "И", "i": "и",
        "J": "Ј", "j": "ј", "K": "К", "k": "к", "L": "Л", "l": "л", "M": "М", "m": "м",
        "N": "Н", "n": "н", "O": "О", "o": "о", "P": "П", "p": "п", "R": "Р", "r": "р",
        "S": "С", "s": "с", "T": "Т", "t": "т", "U": "У", "u": "у", "F": "Ф", "f": "ф",
        "H": "Х", "h": "х", "C": "Ц", "c": "ц",
    }
    return "".join(single.get(ch, ch) for ch in t)


def _collapse_repeats_finance(s: str) -> str:
    return re.sub(r"(.)\1+", r"\1", s)


def _init_checkbox_options_finance(key_prefix: str, options: list, default_selected: list) -> None:
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


def _get_checkbox_selection_finance(key_prefix: str, options: list) -> list:
    selected = []
    for idx, opt in enumerate(options):
        if st.checkbox(str(opt), key=f"{key_prefix}_{idx}"):
            selected.append(opt)
    return selected


def _handle_finance_overview_edits(
    conn: sqlite3.Connection,
    case_key_col: str,
    field_key_col: str,
    field_value_col: str,
    custom_defs: list,
) -> bool:
    if "finance_overview_table" not in st.session_state:
        return False
    changes = st.session_state["finance_overview_table"].get("edited_rows", {})
    if not changes:
        return False
    display_case_ids = st.session_state.get("finance_display_case_ids", [])
    if not display_case_ids:
        return False
    editable_case_fields = {"Phone"}
    for d in custom_defs:
        if d.get("enabled", True):
            name = (d.get("name") or "").strip()
            if name:
                editable_case_fields.add(name)
    now_ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    updates = 0
    try:
        for row_idx_str, updated_cols in changes.items():
            try:
                row_idx = int(row_idx_str)
            except (ValueError, TypeError):
                continue
            if row_idx < 0 or row_idx >= len(display_case_ids):
                continue
            case_id = display_case_ids[row_idx]
            for col_name, new_value in (updated_cols or {}).items():
                col_name = (col_name or "").strip()
                if not col_name:
                    continue
                if col_name == "finance_status":
                    new_status = str(new_value).strip() if new_value is not None and str(new_value).strip() else None
                    if new_status not in STATUS_OPTIONS:
                        new_status = "GRAY"
                    conn.execute(
                        """UPDATE finance_cases SET finance_status = ?, updated_at = ? WHERE case_id = ?""",
                        (new_status, now_ts, case_id),
                    )
                    conn.commit()
                    updates += 1
                    _ensure_finance_case_exists(
                        conn,
                        case_id,
                        {
                            "client_name": None,
                            "client_phone": None,
                            "service_type": None,
                            "finance_date": None,
                            "contract_sum": 0.0,
                            "currency": "MKD",
                            "paid_amount": 0.0,
                            "due_date": None,
                            "finance_status": new_status,
                            "notes": None,
                        },
                    )
                    continue
                if col_name not in editable_case_fields:
                    continue
                norm = None
                if new_value is not None and str(new_value).strip() != "":
                    norm = str(new_value).strip()
                try:
                    conn.execute(
                        f"""
                        INSERT INTO case_user_data ({case_key_col}, {field_key_col}, {field_value_col})
                        VALUES (?, ?, ?)
                        ON CONFLICT({case_key_col}, {field_key_col}) DO UPDATE SET {field_value_col}=excluded.{field_value_col}
                        """,
                        (case_id, col_name, norm),
                    )
                    conn.commit()
                    updates += 1
                except sqlite3.OperationalError:
                    pass
        st.session_state["finance_overview_table"]["edited_rows"] = {}
        if updates:
            st.toast("Saved table changes.")
        return updates > 0
    except Exception:
        conn.rollback()
        raise
    return False


def _apply_finance_filters(
    df: pd.DataFrame,
    start_date: Optional[date],
    end_date: Optional[date],
    applied_types: List[str],
    applied_stats: List[str],
    search_text: str,
) -> pd.DataFrame:
    if df.empty:
        return df
    mask = pd.Series([True] * len(df), index=df.index)
    if start_date is not None and end_date is not None and "updated_date" in df.columns:
        mask &= (df["updated_date"] >= start_date) & (df["updated_date"] <= end_date)
    if applied_types:
        mask &= df["request_type"].isin(applied_types)
    if applied_stats:
        status_series = df["status"].fillna("").astype(str)
        if "(Empty)" in applied_stats:
            non_empty = [s for s in applied_stats if s != "(Empty)"]
            mask &= status_series.isin(non_empty) | ~status_series.str.strip().astype(bool)
        else:
            mask &= status_series.isin(applied_stats)
    search_key = (search_text or "").strip()
    if search_key:
        q0 = search_key
        q1 = _mk_cyr_to_lat_finance(q0)
        q2 = _mk_lat_to_cyr_finance(q0)
        raw_variants = []
        for q in (q0, q1, q2):
            ql = q.strip().lower() if q else ""
            if ql and ql not in raw_variants:
                raw_variants.append(ql)
        norm_variants = []
        for q in (q0, q1, q2):
            nq = _normalize_search_finance(q) if q else ""
            if nq and nq not in norm_variants:
                norm_variants.append(nq)
        mask_exact = pd.Series([False] * len(df), index=df.index)
        for q in raw_variants:
            if q and "__search_blob" in df.columns:
                mask_exact |= df["__search_blob"].str.contains(q, na=False, regex=False)
        for nq in norm_variants:
            if nq and "__row_norm" in df.columns:
                mask_exact |= df["__row_norm"].str.contains(nq, na=False, regex=False)
        mask &= mask_exact

        try:
            from rapidfuzz import fuzz as _fuzz
        except ImportError:
            _fuzz = None
        if _fuzz is not None and mask_exact.sum() <= 2:
            q_norms = []
            for q in (q0, q1, q2):
                nq = _normalize_search_finance(q) if q else ""
                if nq and nq not in q_norms:
                    q_norms.append(nq)
                nqc = _collapse_repeats_finance(nq) if nq else ""
                if nqc and nqc not in q_norms:
                    q_norms.append(nqc)
            if q_norms:
                q_len = max(len(x) for x in q_norms)
                if q_len >= 4 and not re.fullmatch(r"[0-9/\-\s]+", q0 or ""):
                    threshold = 90 if q_len <= 5 else (84 if q_len <= 8 else (82 if q_len <= 12 else 80))
                    seen = set(df.loc[mask_exact, "case_id"].astype(str)) if "case_id" in df.columns else set()
                    focused_norm = df.get("__focused_norm", pd.Series([""] * len(df), index=df.index))
                    fuzzy_hits = []
                    for idx, fn in focused_norm.items():
                        if not fn:
                            continue
                        cid = str(df.at[idx, "case_id"]) if "case_id" in df.columns else ""
                        if cid in seen:
                            continue
                        best = 0
                        for nq in q_norms:
                            if len(nq) >= 4 and nq in fn:
                                best = 100
                                break
                        if best == 0:
                            for nq in q_norms:
                                score = _fuzz.partial_ratio(nq, fn)
                                if score > best:
                                    best = score
                        if best >= threshold:
                            fuzzy_hits.append(idx)
                    if fuzzy_hits:
                        mask |= df.index.isin(fuzzy_hits)
    return df.loc[mask].copy()


def _connect_db(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path), timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_finance_schema(conn: sqlite3.Connection) -> None:
    api_finance_invoices.ensure_finance_schema(conn)


def _load_finance_df(conn: sqlite3.Connection) -> pd.DataFrame:
    return api_finance_cases.load_finance_df(conn)


def _load_invoices_df(conn: sqlite3.Connection, case_id: Optional[str] = None) -> pd.DataFrame:
    return api_finance_invoices.load_invoices_df(conn, case_id)


def _load_payments_df(conn: sqlite3.Connection, case_id: Optional[str] = None) -> pd.DataFrame:
    return api_finance_invoices.load_payments_df(conn, case_id)


def _insert_payment(conn: sqlite3.Connection, case_id: str, payment_date: date, amount: float, currency: str, note: str) -> None:
    api_finance_invoices.insert_payment(conn, case_id, payment_date, amount, currency, note)


def _delete_payment(conn: sqlite3.Connection, payment_id: int) -> bool:
    return api_finance_invoices.delete_payment_record(conn, payment_id) is not None


def _sync_paid_amount_from_events(conn: sqlite3.Connection, case_id: str) -> None:
    api_finance_invoices.sync_paid_amount_from_events(conn, case_id)


def _log_sent_email(
    conn: sqlite3.Connection,
    case_id: str,
    to_email: str,
    email_type: str,
    subject: str = "",
    body_preview: str = "",
    attachment_filename: Optional[str] = None,
    attachment_size_bytes: Optional[int] = None,
    invoice_id: Optional[int] = None,
    reminder_sequence: Optional[int] = None,
) -> None:
    api_finance_invoices.log_sent_email(
        conn,
        case_id=case_id,
        to_email=to_email,
        email_type=email_type,
        subject=subject,
        body_preview=body_preview,
        attachment_filename=attachment_filename,
        attachment_size_bytes=attachment_size_bytes,
        invoice_id=invoice_id,
        reminder_sequence=reminder_sequence,
    )


def _load_email_log_df(conn: sqlite3.Connection, case_id: Optional[str] = None, invoice_id: Optional[int] = None) -> pd.DataFrame:
    return api_finance_invoices.load_email_log_df(conn, case_id, invoice_id)


def _get_case_recipients(conn: sqlite3.Connection, case_id: str) -> List[tuple]:
    return api_finance_invoices.get_case_recipients(conn, case_id)


def _upsert_case_recipient(conn: sqlite3.Connection, case_id: str, email: str) -> None:
    api_finance_invoices.upsert_case_recipient(conn, case_id, email)


def _get_invoice_sum_for_case(conn: sqlite3.Connection, case_id: str) -> float:
    return api_finance_invoices.get_invoice_sum_for_case(conn, case_id)


def _get_payment_sum_for_case(conn: sqlite3.Connection, case_id: str) -> float:
    return api_finance_invoices.get_payment_sum_for_case(conn, case_id)


def _get_paid_invoice_sum_for_case(conn: sqlite3.Connection, case_id: str) -> float:
    return api_finance_invoices.get_paid_invoice_sum_for_case(conn, case_id)


def _ensure_finance_case_exists(conn: sqlite3.Connection, case_id: str, seed: Dict[str, object]) -> None:
    api_finance_cases.ensure_finance_case_exists(conn, case_id, seed)


def _upsert_finance_row(conn: sqlite3.Connection, data: Dict[str, object]) -> None:
    api_finance_cases.upsert_finance_row(conn, data)


def _sync_case_contact_from_finance(
    conn: sqlite3.Connection,
    case_id: str,
    client_name: Optional[str],
    client_phone: Optional[str],
    case_key_col: str,
    field_key_col: str,
    field_value_col: str,
) -> None:
    api_finance_cases.sync_case_contact_from_finance(
        conn,
        case_id,
        client_name,
        client_phone,
        case_key_col,
        field_key_col,
        field_value_col,
    )


def _sync_custom_fields_to_case_user_data(
    conn: sqlite3.Connection,
    case_id: str,
    field_updates: Dict[str, Optional[str]],
    case_key_col: str,
    field_key_col: str,
    field_value_col: str,
) -> None:
    api_finance_cases.sync_custom_fields_to_case_user_data(
        conn,
        case_id,
        field_updates,
        case_key_col,
        field_key_col,
        field_value_col,
    )


def _delete_finance_row(conn: sqlite3.Connection, case_id: str) -> bool:
    return api_finance_cases.delete_finance_row(conn, case_id)


def _with_calculated_fields(df: pd.DataFrame) -> pd.DataFrame:
    return api_finance_cases.with_calculated_fields(df)


def _priority_label(days_overdue: int, remaining: float) -> str:
    return api_finance_cases.priority_label(days_overdue, remaining)


def _get_table_columns(conn: sqlite3.Connection, table_name: str):
    try:
        rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    except sqlite3.Error:
        return set()
    return {str(row[1]) for row in rows if len(row) > 1}


def _first_existing(columns, candidates) -> Optional[str]:
    for candidate in candidates:
        if candidate in columns:
            return candidate
    return None


def _coalesce_expr(alias: str, columns) -> str:
    parts = [f"{alias}.{col}" for col in columns if col]
    if not parts:
        return "''"
    return "COALESCE(" + ", ".join(parts + ["''"]) + ")"


def _search_cases_in_db(conn: sqlite3.Connection, search_text: str, limit: int = 50):
    term = (search_text or "").strip().lower()
    if not term:
        return []

    cases_cols = _get_table_columns(conn, "cases")
    if "case_id" not in cases_cols:
        return []

    title_expr = _coalesce_expr("c", [c for c in ("latest_title", "title") if c in cases_cols])
    request_expr = _coalesce_expr("c", [c for c in ("latest_request_type", "request_type") if c in cases_cols])
    status_expr = _coalesce_expr("c", [c for c in ("latest_list_state", "status") if c in cases_cols])

    user_cols = _get_table_columns(conn, "case_user_data")
    user_case_col = _first_existing(user_cols, ("case_id", "case_number"))
    user_value_col = _first_existing(user_cols, ("field_value", "value", "field_text"))

    join_sql = ""
    search_exprs = [
        "lower(c.case_id)",
        f"lower({title_expr})",
        f"lower({request_expr})",
        f"lower({status_expr})",
    ]

    if "latest_detail_url" in cases_cols:
        search_exprs.append("lower(COALESCE(c.latest_detail_url, ''))")

    if user_case_col and user_value_col:
        join_sql = f"LEFT JOIN case_user_data u ON c.case_id = u.{user_case_col}"
        search_exprs.append(f"lower(COALESCE(u.{user_value_col}, ''))")

    where_sql = " OR ".join(f"{expr} LIKE ?" for expr in search_exprs)
    sql = f"""
        SELECT
            c.case_id AS case_id,
            {title_expr} AS title,
            {request_expr} AS request_type,
            {status_expr} AS status
        FROM cases c
        {join_sql}
        WHERE {where_sql}
        GROUP BY c.case_id
        ORDER BY
            CASE
                WHEN lower(c.case_id) = ? THEN 0
                WHEN lower(c.case_id) LIKE ? THEN 1
                ELSE 2
            END,
            c.case_id DESC
        LIMIT ?
    """
    params = [f"%{term}%"] * len(search_exprs) + [term, f"{term}%", int(limit)]

    try:
        rows = conn.execute(sql, params).fetchall()
    except sqlite3.Error:
        return []

    out = []
    for row in rows:
        out.append(
            {
                "case_id": str(row["case_id"] or "").strip(),
                "title": str(row["title"] or "").strip(),
                "request_type": str(row["request_type"] or "").strip(),
                "status": str(row["status"] or "").strip(),
                "source": "DB",
                "snippet": "",
            }
        )
    return out


def _search_cases_in_json(json_dir: Optional[Path], search_text: str, limit: int = 50):
    if json_dir is None:
        return []

    root = Path(json_dir)
    if not root.exists() or not root.is_dir():
        return []

    term = (search_text or "").strip().lower()
    if not term:
        return []

    matches = []
    for path in sorted(root.glob("*.json")):
        try:
            raw = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue

        lower = raw.lower()
        idx = lower.find(term)
        if idx < 0:
            continue

        start = max(0, idx - 60)
        end = min(len(raw), idx + 140)
        snippet = raw[start:end].replace("\n", " ").replace("\r", " ").strip()
        if len(snippet) > 180:
            snippet = snippet[:177] + "..."

        matches.append(
            {
                "case_id": path.stem,
                "title": "",
                "request_type": "",
                "status": "",
                "source": "JSON",
                "snippet": snippet,
            }
        )
        if len(matches) >= int(limit):
            break
    return matches


def _load_case_meta_map(conn: sqlite3.Connection, case_ids) -> Dict[str, Dict[str, str]]:
    normalized = sorted({str(cid).strip() for cid in case_ids if str(cid).strip()})
    if not normalized:
        return {}

    cases_cols = _get_table_columns(conn, "cases")
    if "case_id" not in cases_cols:
        return {}

    title_expr = _coalesce_expr("c", [c for c in ("latest_title", "title") if c in cases_cols])
    request_expr = _coalesce_expr("c", [c for c in ("latest_request_type", "request_type") if c in cases_cols])
    status_expr = _coalesce_expr("c", [c for c in ("latest_list_state", "status") if c in cases_cols])

    placeholders = ",".join(["?"] * len(normalized))
    sql = f"""
        SELECT
            c.case_id AS case_id,
            {title_expr} AS title,
            {request_expr} AS request_type,
            {status_expr} AS status
        FROM cases c
        WHERE c.case_id IN ({placeholders})
    """

    try:
        rows = conn.execute(sql, normalized).fetchall()
    except sqlite3.Error:
        return {}

    out = {}
    for row in rows:
        cid = str(row["case_id"] or "").strip()
        if not cid:
            continue
        out[cid] = {
            "title": str(row["title"] or "").strip(),
            "request_type": str(row["request_type"] or "").strip(),
            "status": str(row["status"] or "").strip(),
        }
    return out




def _load_case_phone_map(conn: sqlite3.Connection, case_ids) -> Dict[str, str]:
    normalized = sorted({str(cid).strip() for cid in case_ids if str(cid).strip()})
    if not normalized:
        return {}

    user_cols = _get_table_columns(conn, "case_user_data")
    case_col = _first_existing(user_cols, ("case_id", "case_number"))
    key_col = _first_existing(user_cols, ("field_key", "key"))
    value_col = _first_existing(user_cols, ("field_value", "value", "field_text"))
    if not case_col or not key_col or not value_col:
        return {}

    placeholders = ",".join(["?"] * len(normalized))
    sql = f"""
        SELECT {case_col} AS case_id, {value_col} AS phone_value
        FROM case_user_data
        WHERE lower({key_col}) = 'phone' AND {case_col} IN ({placeholders})
        ORDER BY rowid DESC
    """

    try:
        rows = conn.execute(sql, normalized).fetchall()
    except sqlite3.Error:
        return {}

    out = {}
    for row in rows:
        cid = str(row["case_id"] or "").strip()
        if not cid or cid in out:
            continue
        out[cid] = str(row["phone_value"] or "").strip()
    return out


def _format_search_result(result: Dict[str, str]) -> str:
    case_id = str(result.get("case_id") or "-")
    title = str(result.get("title") or "-")
    request_type = str(result.get("request_type") or "-")
    status = str(result.get("status") or "-")
    source = str(result.get("source") or "-")
    return f"{case_id} | {title} | {request_type} | {status} | {source}"


def _ensure_finance_form_state_defaults() -> None:
    defaults = {
        "finance_form_loaded_case_id": "",
        "finance_form_case_id": "",
        "finance_form_client_name": "",
        "finance_form_client_phone": "",
        "finance_form_service_type": "",
        "finance_form_finance_date": date.today(),
        "finance_form_due_enabled": False,
        "finance_form_due_date": date.today(),
        "finance_form_contract_sum": 0.0,
        "finance_form_currency": CURRENCY_OPTIONS[0],
        "finance_form_status": STATUS_OPTIONS[0],
        "finance_form_notes": "",
        "finance_payment_loaded_case_id": "",
        "finance_payment_date": date.today(),
        "finance_payment_amount": 0.0,
        "finance_payment_currency": CURRENCY_OPTIONS[0],
        "finance_payment_note": "",
    }
    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value


def render_finance_page(
    conn: sqlite3.Connection,
    db_path: Path,
    json_dir: Optional[Path],
    settings: dict,
    df_cases: pd.DataFrame,
    custom_defs: list,
    case_key_col: str,
    field_key_col: str,
    field_value_col: str,
    build_display_columns,
    build_grid_config,
    settings_path: Optional[Path] = None,
    load_settings_fn=None,
    save_settings_key_fn=None,
) -> None:
    st.title("Finance")
    _ensure_finance_schema(conn)

    if "finance_view_mode" not in st.session_state:
        st.session_state["finance_view_mode"] = "list"

    fin_settings = _load_finance_settings()
    visible_columns_key = "visible_columns"
    column_order_key = "column_order_map"
    visible_columns = fin_settings.get(visible_columns_key, [])
    column_order_map = fin_settings.get(column_order_key, {})
    if not isinstance(column_order_map, dict):
        column_order_map = {}
    last_date_range = fin_settings.get("last_date_range", {"preset": "All Time", "start": None, "end": None})
    if not isinstance(last_date_range, dict):
        last_date_range = {"preset": "All Time", "start": None, "end": None}
    last_request_type = fin_settings.get("last_request_type_selection", [])
    last_status = fin_settings.get("last_status_selection", [])
    last_search = str(fin_settings.get("last_search_text", "") or "")

    base_cols = ["case_id", "status", "title", "request_type", "created_at", "updated_at", "First Seen", "Phone"]
    finance_cols = [
        "finance_contract_sum", "finance_currency", "finance_paid_total", "finance_remaining",
        "finance_overdue_amount", "finance_due_date", "finance_status", "finance_last_payment_date",
        "finance_payments_count", "finance_service_type", "finance_notes",
    ]
    present_finance_cols = [c for c in finance_cols if c in df_cases.columns]
    enabled_custom = [d["name"] for d in custom_defs if d.get("enabled", True)]
    all_cols = base_cols + present_finance_cols + [c for c in enabled_custom if c not in base_cols]
    if "Denovi (Od Posledna)" in df_cases.columns and "Denovi (Od Posledna)" not in all_cols:
        all_cols.append("Denovi (Od Posledna)")
    virtual_cols = set()
    if not visible_columns:
        visible_columns = [c for c in all_cols if c in df_cases.columns]
    visible_columns = [c for c in visible_columns if c in df_cases.columns or c in virtual_cols]
    for c in enabled_custom:
        if c in df_cases.columns and c not in visible_columns:
            visible_columns.append(c)
    visible_columns = list(dict.fromkeys(visible_columns))
    if not visible_columns:
        visible_columns = list(all_cols)

    date_presets = ["All Time", "Today", "This Week", "Last 30 Days", "Custom"]
    preset = last_date_range.get("preset", "All Time")
    if preset not in date_presets:
        preset = "All Time"
    last_start = _coerce_date_finance(last_date_range.get("start"))
    last_end = _coerce_date_finance(last_date_range.get("end"))
    if preset == "Custom" and (not last_start or not last_end):
        preset = "All Time"

    all_types = sorted([t for t in df_cases["request_type"].dropna().unique() if str(t).strip()]) if "request_type" in df_cases.columns else []
    all_stats = []
    if "status" in df_cases.columns:
        status_series = df_cases["status"].fillna("").astype(str)
        non_empty = sorted({s for s in status_series if s.strip()})
        has_empty = any(not s.strip() for s in status_series)
        all_stats = (["(Empty)"] if has_empty else []) + non_empty
    desired_types = list(all_types) if all_types else []
    if isinstance(last_request_type, list) and last_request_type:
        desired_types = [t for t in last_request_type if t in all_types] or desired_types
    desired_stats = list(all_stats) if all_stats else []
    if isinstance(last_status, list) and last_status:
        desired_stats = [s for s in last_status if s in all_stats] or desired_stats

    if "finance_applied_date_range" not in st.session_state:
        st.session_state["finance_applied_date_range"] = dict(last_date_range)
    if "finance_applied_search_text" not in st.session_state:
        st.session_state["finance_applied_search_text"] = last_search
    if all_types and "finance_applied_types" not in st.session_state:
        st.session_state["finance_applied_types"] = list(desired_types)
    if all_stats and "finance_applied_stats" not in st.session_state:
        st.session_state["finance_applied_stats"] = list(desired_stats)

    st.sidebar.header("Filters")

    # Company info used on invoices
    with st.sidebar.expander("Company info (invoices)", expanded=False):
        st.caption("Saved once and reused on all invoices.")
        company_name = fin_settings.get("company_name", "")
        company_addr = fin_settings.get("company_address", "")
        company_city = fin_settings.get("company_city", "")
        company_tax = fin_settings.get("company_tax_number", "")
        company_bank = fin_settings.get("company_bank_name", "")
        company_account = fin_settings.get("company_bank_account", "")
        company_iban = fin_settings.get("company_iban", "")
        company_email = fin_settings.get("company_email", "")
        company_phone = fin_settings.get("company_phone", "")

        c1, c2 = st.columns(2)
        with c1:
            company_name = st.text_input("Company name", value=company_name, key="finance_company_name")
            company_addr = st.text_input("Address", value=company_addr, key="finance_company_address")
            company_city = st.text_input("City", value=company_city, key="finance_company_city")
            company_tax = st.text_input("Tax number / ЕДБ", value=company_tax, key="finance_company_tax")
        with c2:
            company_bank = st.text_input("Bank name", value=company_bank, key="finance_company_bank")
            company_account = st.text_input("Bank account", value=company_account, key="finance_company_account")
            company_iban = st.text_input("IBAN (optional)", value=company_iban, key="finance_company_iban")
            company_email = st.text_input("Company email", value=company_email, key="finance_company_email")
            company_phone = st.text_input("Company phone", value=company_phone, key="finance_company_phone")

        if st.button("Save company info", use_container_width=True, key="finance_company_save"):
            _save_finance_settings_key("company_name", company_name.strip())
            _save_finance_settings_key("company_address", company_addr.strip())
            _save_finance_settings_key("company_city", company_city.strip())
            _save_finance_settings_key("company_tax_number", company_tax.strip())
            _save_finance_settings_key("company_bank_name", company_bank.strip())
            _save_finance_settings_key("company_bank_account", company_account.strip())
            _save_finance_settings_key("company_iban", company_iban.strip())
            _save_finance_settings_key("company_email", company_email.strip())
            _save_finance_settings_key("company_phone", company_phone.strip())
            st.success("Company info saved.")

    # Email / invoice global settings
    with st.sidebar.expander("Email / Invoice settings", expanded=False):
        st.caption("Used for sending invoice emails.")
        smtp = _get_smtp_settings()
        col_e1, col_e2 = st.columns(2)
        with col_e1:
            smtp_host = st.text_input("SMTP host", value=smtp["host"], key="finance_smtp_host")
            smtp_username = st.text_input("SMTP username", value=smtp["username"], key="finance_smtp_username")
            smtp_from = st.text_input("From email", value=smtp["from_email"], key="finance_smtp_from")
        with col_e2:
            smtp_port = st.number_input("SMTP port", value=int(smtp["port"]), key="finance_smtp_port", step=1)
            smtp_password = st.text_input("SMTP password", value=smtp["password"], type="password", key="finance_smtp_password")
            smtp_use_tls = st.checkbox("Use TLS", value=smtp["use_tls"], key="finance_smtp_tls")
        smtp_bcc = st.text_input("BCC (optional)", value=smtp["bcc"], key="finance_smtp_bcc")
        if st.button("Save email settings", use_container_width=True, key="finance_smtp_save"):
            _save_finance_settings_key("smtp_host", smtp_host.strip())
            _save_finance_settings_key("smtp_username", smtp_username.strip())
            _save_finance_settings_key("smtp_from_email", smtp_from.strip())
            _save_finance_settings_key("smtp_port", int(smtp_port or 587))
            _save_finance_settings_key("smtp_password", smtp_password)
            _save_finance_settings_key("smtp_use_tls", bool(smtp_use_tls))
            _save_finance_settings_key("smtp_bcc", smtp_bcc.strip())
            st.success("Email settings saved.")

        st.markdown("---")
        st.caption("QA: Send a test email using your **saved** settings above. Check inbox and Spam.")
        test_to = st.text_input("Send test email to", value=smtp["from_email"] or "", key="finance_smtp_test_to", placeholder="your@email.com")
        if st.button("Send test email", use_container_width=True, key="finance_smtp_test_btn"):
            if not test_to or not test_to.strip():
                st.error("Enter an email address.")
            else:
                err = _send_invoice_email_simple(
                    test_to.strip(),
                    "E-Urbanizam Finance – test",
                    "This is a test email from your Finance app. If you received this, SMTP is working.",
                )
                if err:
                    st.error(f"Test failed: {err}")
                else:
                    st.success("Test email sent. Check inbox and Spam/Junk.")

    applied_date_range = st.session_state.get("finance_applied_date_range", last_date_range)
    applied_preset = applied_date_range.get("preset", preset)
    applied_start = _coerce_date_finance(applied_date_range.get("start")) or last_start
    applied_end = _coerce_date_finance(applied_date_range.get("end")) or last_end
    if applied_preset not in date_presets:
        applied_preset = "All Time"
    today = date.today()

    with st.sidebar.form("finance_date_filter_form", clear_on_submit=False):
        start_date = None
        end_date = None
        with st.expander("Date Range", expanded=False):
            date_preset = st.selectbox(
                "Date Range",
                date_presets,
                index=date_presets.index(applied_preset),
                key="finance_filter_date_preset",
                label_visibility="collapsed",
            )
            if date_preset == "Custom":
                if not applied_start or not applied_end:
                    applied_start, applied_end = today - timedelta(days=30), today
                date_range = st.date_input(
                    "Custom Range",
                    (applied_start, applied_end),
                    key="finance_filter_date_custom",
                    label_visibility="collapsed",
                )
                if len(date_range) == 2:
                    start_date, end_date = date_range
            apply_d = st.form_submit_button("Apply Date", use_container_width=True, key="finance_apply_date")
    if date_preset == "Today":
        applied_start, applied_end = today, today
    elif date_preset == "This Week":
        applied_start, applied_end = today - timedelta(days=7), today
    elif date_preset == "Last 30 Days":
        applied_start, applied_end = today - timedelta(days=30), today
    if start_date is not None and end_date is not None:
        applied_start, applied_end = start_date, end_date
    current_date_range = {"preset": date_preset, "start": applied_start.isoformat() if applied_start else None, "end": applied_end.isoformat() if applied_end else None}
    if apply_d:
        st.session_state["finance_applied_date_range"] = current_date_range
        _save_finance_settings_key("last_date_range", current_date_range)
        st.rerun()

    sel_types = list(st.session_state.get("finance_applied_types", desired_types))
    if all_types:
        with st.sidebar.form("finance_type_filter_form", clear_on_submit=False):
            with st.expander("Request Type", expanded=False):
                _init_checkbox_options_finance("finance_filter_type", all_types, sel_types)
                sel_types = _get_checkbox_selection_finance("finance_filter_type", all_types)
                select_all_t = st.form_submit_button("Select All", use_container_width=True, key="finance_type_select_all")
                deselect_all_t = st.form_submit_button("Deselect All", use_container_width=True, key="finance_type_deselect_all")
                apply_t = st.form_submit_button("Apply Types", use_container_width=True, key="finance_apply_types")
        if select_all_t:
            st.session_state["finance_filter_type_pending"] = list(all_types)
            st.rerun()
        if deselect_all_t:
            st.session_state["finance_filter_type_pending"] = []
            st.rerun()
        if not sel_types:
            sel_types = list(desired_types)
        if apply_t:
            st.session_state["finance_applied_types"] = list(sel_types)
            _save_finance_settings_key("last_request_type_selection", list(sel_types))
            st.rerun()

    sel_stats = list(st.session_state.get("finance_applied_stats", desired_stats))
    if all_stats:
        with st.sidebar.form("finance_status_filter_form", clear_on_submit=False):
            with st.expander("Status", expanded=False):
                _init_checkbox_options_finance("finance_filter_status", all_stats, sel_stats)
                sel_stats = _get_checkbox_selection_finance("finance_filter_status", all_stats)
                select_all_s = st.form_submit_button("Select All", use_container_width=True, key="finance_status_select_all")
                deselect_all_s = st.form_submit_button("Deselect All", use_container_width=True, key="finance_status_deselect_all")
                apply_s = st.form_submit_button("Apply Status", use_container_width=True, key="finance_apply_status")
        if select_all_s:
            st.session_state["finance_filter_status_pending"] = list(all_stats)
            st.rerun()
        if deselect_all_s:
            st.session_state["finance_filter_status_pending"] = []
            st.rerun()
        if not sel_stats:
            sel_stats = list(desired_stats)
        if "(Empty)" in all_stats and "(Empty)" not in sel_stats:
            sel_stats.append("(Empty)")
        if apply_s:
            st.session_state["finance_applied_stats"] = list(sel_stats)
            _save_finance_settings_key("last_status_selection", list(sel_stats))
            st.rerun()

    applied_search = str(st.session_state.get("finance_applied_search_text", "") or "")
    applied_types = list(st.session_state.get("finance_applied_types", sel_types))
    applied_stats = list(st.session_state.get("finance_applied_stats", sel_stats))

    df_filtered = _apply_finance_filters(df_cases, applied_start, applied_end, applied_types, applied_stats, applied_search)

    with st.sidebar.form("finance_columns_form", clear_on_submit=False):
        with st.expander("Columns", expanded=False):
            st.caption("Same custom columns as Cases. Add or edit in **Cases** → Columns.")
            mode_key_prefix = "finance"
            order_map = dict(column_order_map) if isinstance(column_order_map, dict) else {}
            valid_cols = set(df_cases.columns) | virtual_cols
            ordered_cols = sorted([c for c in all_cols if c in valid_cols], key=lambda c: int(order_map.get(c, 999)))
            ordered_cols = list(dict.fromkeys(ordered_cols))

            custom_finance_names = {d["name"] for d in custom_defs if d.get("scope") == "finance"}
            case_ordered = [c for c in ordered_cols if not str(c).startswith("finance_") and c not in custom_finance_names]
            finance_ordered = [c for c in ordered_cols if str(c).startswith("finance_") or c in custom_finance_names]

            pending_visible_key = "finance_columns_pending_visible"
            if pending_visible_key in st.session_state:
                pending_vis = st.session_state.pop(pending_visible_key)
                for idx, col_name in enumerate(ordered_cols):
                    st.session_state[f"{mode_key_prefix}_col_vis_{idx}_{col_name}"] = col_name in pending_vis

            def _render_column_section(section_key: str, title: str, section_cols: list):
                st.markdown(f"**{title}**")
                if not section_cols:
                    st.caption("No columns in this section.")
                    return section_cols, False

                moved_local = False
                for idx_s, col_name in enumerate(section_cols):
                    global_idx = ordered_cols.index(col_name) if col_name in ordered_cols else idx_s
                    c1, c2, c3 = st.columns([0.12, 0.12, 0.76])
                    with c1:
                        up_b = st.form_submit_button("^", key=f"{mode_key_prefix}_{section_key}_up_{idx_s}_{col_name}")
                    with c2:
                        down_b = st.form_submit_button("v", key=f"{mode_key_prefix}_{section_key}_down_{idx_s}_{col_name}")
                    with c3:
                        st.checkbox(col_name, value=col_name in visible_columns, key=f"{mode_key_prefix}_col_vis_{global_idx}_{col_name}")

                    if up_b and idx_s > 0:
                        section_cols[idx_s - 1], section_cols[idx_s] = section_cols[idx_s], section_cols[idx_s - 1]
                        moved_local = True
                    if down_b and idx_s < len(section_cols) - 1:
                        section_cols[idx_s + 1], section_cols[idx_s] = section_cols[idx_s], section_cols[idx_s + 1]
                        moved_local = True

                return section_cols, moved_local

            case_ordered, moved_case = _render_column_section("case", "Case Columns", case_ordered)
            st.markdown("---")
            finance_ordered, moved_finance = _render_column_section("finance", "Finance Columns", finance_ordered)
            moved = moved_case or moved_finance

            select_all_col = st.form_submit_button("Select All", use_container_width=True, key="finance_col_select_all")
            deselect_all_col = st.form_submit_button("Deselect All", use_container_width=True, key="finance_col_deselect_all")
            apply_col = st.form_submit_button("Apply Columns", use_container_width=True, key="finance_col_apply")

    final_ordered = case_ordered + finance_ordered
    if select_all_col:
        st.session_state[pending_visible_key] = list(final_ordered)
        st.rerun()
    if deselect_all_col:
        st.session_state[pending_visible_key] = [final_ordered[0]] if final_ordered else []
        st.rerun()
    if apply_col or moved:
        new_visible = []
        for idx, col_name in enumerate(ordered_cols):
            if st.session_state.get(f"{mode_key_prefix}_col_vis_{idx}_{col_name}", col_name in visible_columns):
                new_visible.append(col_name)
        if moved:
            new_order = {n: i + 1 for i, n in enumerate(final_ordered)}
            _save_finance_settings_key(column_order_key, new_order)
            column_order_map = dict(new_order)
        visible_columns = new_visible
        _save_finance_settings_key(visible_columns_key, visible_columns)
        st.rerun()

    finance_sub = st.radio("Finance", ["Overview", "Action Center"], key="finance_sub_nav", horizontal=True)
    view_mode = st.session_state.get("finance_view_mode", "list")

    display_cols = build_display_columns(df_filtered, visible_columns, column_order_map)
    if "case_id" in df_filtered.columns and "case_id" not in display_cols:
        display_cols = ["case_id"] + display_cols
    display_cols = [c for c in display_cols if c in df_filtered.columns]
    display_df = df_filtered[[c for c in display_cols if c in df_filtered.columns]].reset_index(drop=True)

    if finance_sub == "Overview" and view_mode == "list":
        st.subheader("Overview")
        st.markdown("#### E-Urbanizam Manager")
        with st.form("finance_search_form", clear_on_submit=False):
            search_col, btn_col = st.columns([1, 0.2])
            with search_col:
                search = st.text_input(
                    "Search",
                    value=str(st.session_state.get("finance_applied_search_text", "") or ""),
                    key="finance_filter_search_text",
                    placeholder="Search all fields...",
                    label_visibility="collapsed",
                )
            with btn_col:
                apply_search = st.form_submit_button("Apply", use_container_width=True, key="finance_apply_search")
                clear_search = st.form_submit_button("×", use_container_width=True, key="finance_clear_search")
        if apply_search:
            st.session_state["finance_applied_search_text"] = str(search or "")
            _save_finance_settings_key("last_search_text", str(search or ""))
            st.rerun()
        if clear_search:
            st.session_state["finance_applied_search_text"] = ""
            _save_finance_settings_key("last_search_text", "")
            st.rerun()

        if df_filtered.empty:
            st.info("No cases match the current filters.")
        else:
            st.session_state["finance_display_case_ids"] = df_filtered["case_id"].tolist()
            grid_config = build_grid_config(df_filtered, custom_defs)

            st.caption("Click a row to open its finance detail.")
            event = st.dataframe(
                display_df,
                key="finance_overview_table",
                hide_index=True,
                use_container_width=True,
                height=500,
                column_config=grid_config,
                on_select="rerun",
                selection_mode="single-row",
            )

            if event and event.selection and event.selection.rows:
                sel_idx = event.selection.rows[0]
                if sel_idx < len(display_df) and "case_id" in display_df.columns:
                    selected_cid = str(display_df.iloc[sel_idx]["case_id"])
                    st.session_state["finance_detail_case_id"] = selected_cid
                    st.session_state["finance_view_mode"] = "detail"
                    st.rerun()

        if settings_path and load_settings_fn and save_settings_key_fn:
            with st.expander("Custom Fields Manager", expanded=True):
                st.markdown("### Manage Custom Fields")
                st.caption("Edit fields here. Changes save when you edit the table below. Same definitions as Cases.")
                if "finance_custom_defs_original_names" not in st.session_state or st.session_state.get("finance_custom_defs_count") != len(custom_defs):
                    st.session_state["finance_custom_defs_original_names"] = [d.get("name", "").strip() for d in custom_defs]
                    st.session_state["finance_custom_defs_count"] = len(custom_defs)
                field_rows = []
                for d in custom_defs:
                    field_rows.append({
                        "Name": d.get("name", ""),
                        "Type": d.get("type", "Text"),
                        "Options": ", ".join(d.get("options", []) or []),
                        "Enabled": d.get("enabled", True),
                    })
                if field_rows:
                    fields_df = pd.DataFrame(field_rows)
                    edited_fields = st.data_editor(
                        fields_df,
                        hide_index=True,
                        key="finance_fields_editor",
                        column_config={
                            "Name": st.column_config.TextColumn("Name", required=True),
                            "Type": st.column_config.SelectboxColumn("Type", options=["Text", "Dropdown"]),
                            "Options": st.column_config.TextColumn("Options (comma-separated)"),
                            "Enabled": st.column_config.CheckboxColumn("Enabled"),
                        },
                    )
                    if "finance_fields_editor" in st.session_state and st.session_state["finance_fields_editor"].get("edited_rows"):
                        try:
                            new_defs = []
                            names_seen = set()
                            has_error = False
                            original_names = st.session_state.get("finance_custom_defs_original_names", [])
                            for i, row in edited_fields.iterrows():
                                name = str(row["Name"]).strip()
                                if not name:
                                    st.error(f"Row {i+1}: Name cannot be empty.")
                                    has_error = True
                                    continue
                                if name.lower() == "phone":
                                    st.error(f"Row {i+1}: 'Phone' is reserved.")
                                    has_error = True
                                    continue
                                name_lower = name.lower()
                                if name_lower in names_seen:
                                    st.error(f"Duplicate field name: '{name}'.")
                                    has_error = True
                                    continue
                                names_seen.add(name_lower)
                                field_type = row["Type"]
                                options_str = str(row.get("Options", "")).strip()
                                options = [o.strip() for o in options_str.split(",") if o.strip()] if options_str else []
                                options = list(dict.fromkeys(options))
                                enabled = bool(row.get("Enabled", True))
                                scope = custom_defs[i].get("scope", "case") if i < len(custom_defs) else "case"
                                new_defs.append({"name": name, "type": field_type, "options": options, "enabled": enabled, "scope": scope})
                            # Re-add permanent fields if user deleted them (they are not deletable)
                            new_names = {(nd.get("name") or "").strip() for nd in new_defs}
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
                                current_settings = load_settings_fn(settings_path)
                                visible_cols = list(current_settings.get("visible_columns_v9", []) or [])
                                order_map = dict(current_settings.get("column_order_map", {}) or {})
                                for new_d in new_defs:
                                    field_name = new_d.get("name", "").strip()
                                    if not field_name:
                                        continue
                                    if new_d.get("enabled", True):
                                        if field_name not in visible_cols:
                                            visible_cols.append(field_name)
                                        if field_name not in order_map:
                                            order_map[field_name] = max(order_map.values(), default=0) + 1
                                    else:
                                        if field_name in visible_cols:
                                            visible_cols.remove(field_name)
                                save_settings_key_fn(settings_path, "custom_field_defs", new_defs)
                                save_settings_key_fn(settings_path, "visible_columns_v9", visible_cols)
                                save_settings_key_fn(settings_path, "column_order_map", order_map)
                                fin_vis = list(fin_settings.get(visible_columns_key, []) or [])
                                for new_d in new_defs:
                                    fn = new_d.get("name", "").strip()
                                    if fn and new_d.get("enabled", True) and fn not in fin_vis:
                                        fin_vis.append(fn)
                                _save_finance_settings_key(visible_columns_key, fin_vis)
                                st.session_state["finance_fields_editor"]["edited_rows"] = {}
                                st.session_state["finance_custom_defs_original_names"] = [d.get("name", "").strip() for d in new_defs]
                                st.session_state["finance_custom_defs_count"] = len(new_defs)
                                st.toast("Custom fields saved.")
                                time.sleep(0.1)
                                st.rerun()
                        except Exception as exc:
                            st.error(f"Failed to save custom fields: {exc}")
                else:
                    st.info("No custom fields yet. Add one below.")
                st.markdown("### Add New Custom Field")
                cx1, cx2 = st.columns(2)
                with cx1:
                    n_name = st.text_input("Field name", key="finance_new_field_name")
                    n_type = st.selectbox("Field type", ["Text", "Dropdown"], key="finance_new_field_type")
                    n_opt = st.text_input("Options (comma separated)", key="finance_new_field_options")
                with cx2:
                    st.caption("For Dropdown type, enter options separated by commas.")
                    if st.button("Create", key="finance_create_custom_field"):
                        name = (n_name or "").strip()
                        if not name:
                            st.error("Name cannot be empty.")
                        elif name.lower() == "phone":
                            st.error("'Phone' is reserved.")
                        else:
                            defs = list(settings.get("custom_field_defs", []) or [])
                            if any((d.get("name") or "").strip().lower() == name.lower() for d in defs):
                                st.error(f"Field '{name}' already exists.")
                            else:
                                opts = [o.strip() for o in (n_opt or "").split(",") if o.strip()]
                                defs.append({"name": name, "type": n_type or "Text", "options": opts, "enabled": True, "scope": "finance"})
                                save_settings_key_fn(settings_path, "custom_field_defs", defs)
                                current_settings = load_settings_fn(settings_path)
                                visible_cols = list(current_settings.get("visible_columns_v9", []) or [])
                                order_map = dict(current_settings.get("column_order_map", {}) or {})
                                if name not in visible_cols:
                                    visible_cols.append(name)
                                    save_settings_key_fn(settings_path, "visible_columns_v9", visible_cols)
                                if name not in order_map:
                                    order_map[name] = max(order_map.values(), default=0) + 1
                                    save_settings_key_fn(settings_path, "column_order_map", order_map)
                                fin_vis = list(fin_settings.get(visible_columns_key, []) or [])
                                if name not in fin_vis:
                                    fin_vis.append(name)
                                    _save_finance_settings_key(visible_columns_key, fin_vis)
                                st.toast(f"Added field '{name}'.")
                                st.rerun()
                st.caption(f"Local DB: {db_path}")

    elif finance_sub == "Overview" and view_mode == "detail":
        st.subheader("Finance · Case detail")
        st.info("Use **Back to list** below to return to the overview.")

    else:
        st.subheader("Action Center (Queue)")
        if "finance_remaining" in df_filtered.columns and "finance_due_date" in df_filtered.columns:
            queue_mask = (df_filtered["finance_remaining"].fillna(0) > 0) & df_filtered["finance_due_date"].notna()
            queue_df = df_filtered.loc[queue_mask].copy()
            if not queue_df.empty:
                queue_df["_due_dt"] = pd.to_datetime(queue_df["finance_due_date"], errors="coerce")
                queue_df["_days_overdue"] = (today - queue_df["_due_dt"].dt.date).dt.days.clip(lower=0)
                queue_df = queue_df.sort_values(["_days_overdue", "finance_remaining"], ascending=[False, False])
                queue_df["_priority"] = queue_df.apply(
                    lambda r: _priority_label(int(r.get("_days_overdue", 0)), float(r.get("finance_remaining", 0))),
                    axis=1,
                )
                qcols = ["_priority", "case_id", "title", "finance_remaining", "finance_due_date", "_days_overdue", "finance_status"]
                qcols = [c for c in qcols if c in queue_df.columns]
                st.dataframe(queue_df[qcols].rename(columns={"case_id": "Case #", "title": "Title", "finance_remaining": "Balance", "finance_due_date": "Due", "_days_overdue": "Days Overdue", "finance_status": "Status", "_priority": "Priority"}), use_container_width=True, hide_index=True)
                ac_case_options = queue_df["case_id"].astype(str).tolist()
                ac_picked = st.selectbox("Open case detail", [""] + ac_case_options, key="finance_queue_case_pick", format_func=lambda x: x or "(select)")
                if ac_picked:
                    st.session_state["finance_detail_case_id"] = str(ac_picked).strip()
                    st.session_state["finance_view_mode"] = "detail"
                    st.session_state["finance_sub_nav"] = "Overview"
                    st.rerun()
            else:
                st.info("No cases with balance and due date in the current filters.")
        else:
            st.info("Finance columns not available.")

        with st.expander("Invoice reminders (manual send)", expanded=False):
            st.caption("Finds overdue invoices with reminders enabled. Nothing is sent until you approve and click send.")
            all_invoices = _load_invoices_df(conn)
            if all_invoices.empty:
                st.info("No invoices in the system yet.")
            else:
                today_dt = date.today()
                inv_df = all_invoices.copy()
                inv_df["due_dt"] = inv_df["due_date"].apply(_coerce_date_finance)
                inv_df["last_rem_dt"] = inv_df["last_reminder_sent_at"].apply(_coerce_date_finance)

                def _needs_reminder(row):
                    if not bool(row.get("reminders_enabled")):
                        return False
                    status = str(row.get("status") or "").upper()
                    if status not in ("SENT", "PARTIAL"):
                        return False
                    due = row.get("due_dt")
                    if not isinstance(due, date) or due >= today_dt:
                        return False
                    max_count = int(row.get("reminder_max_count") or 0)
                    sent_count = int(row.get("reminder_sent_count") or 0)
                    if max_count and sent_count >= max_count:
                        return False
                    first_after = int(row.get("reminder_first_after_days") or 0)
                    repeat_days = int(row.get("reminder_repeat_days") or 0)
                    days_overdue = (today_dt - due).days
                    if days_overdue < max(first_after, 0):
                        return False
                    last_sent = row.get("last_rem_dt")
                    if isinstance(last_sent, date):
                        since_last = (today_dt - last_sent).days
                        if repeat_days and since_last < repeat_days:
                            return False
                    return True

                inv_df["_needs_reminder"] = inv_df.apply(_needs_reminder, axis=1)
                due_df = inv_df[inv_df["_needs_reminder"]].copy()
                if due_df.empty:
                    st.info("No invoices currently eligible for reminders based on settings.")
                else:
                    preview_cols = ["invoice_id", "case_id", "invoice_number", "due_date", "amount", "currency", "status", "reminder_sent_count"]
                    preview_cols = [c for c in preview_cols if c in due_df.columns]
                    st.dataframe(due_df[preview_cols], hide_index=True, use_container_width=True)
                    with st.form("finance_send_reminders_form", clear_on_submit=False):
                        st.caption(f"{len(due_df)} invoice(s) will receive a reminder email if you approve and send.")
                        approve_rem = st.checkbox("I have reviewed the list above and approve sending reminders.", key="finance_reminders_approve")
                        do_send_rem = st.form_submit_button("Send reminders now")
                    if do_send_rem:
                        if not approve_rem:
                            st.error("Please confirm approval before sending reminders.")
                        else:
                            errors = 0
                            sent = 0
                            for _, row in due_df.iterrows():
                                to_email = str(row.get("client_email") or "").strip()
                                if not to_email:
                                    errors += 1
                                    continue
                                subject = f"Потсетник за фактура {row.get('invoice_number') or row.get('invoice_id')}"
                                body_lines = [
                                    f"Почитувани {row.get('client_name') or ''},".strip(),
                                    "",
                                    "Ова е потсетник за доспеана фактура.",
                                    f"Фактура: {row.get('invoice_number') or row.get('invoice_id')}",
                                    f"Предмет (case): {row.get('case_id')}",
                                    f"Износ: {row.get('amount')} {row.get('currency') or ''}".strip(),
                                    f"Рок за плаќање: {row.get('due_date') or ''}",
                                    "",
                                    "Ве молиме контактирајте нè доколку имате прашања или веќе сте извршиле уплата.",
                                ]
                                err = _send_invoice_email_simple(to_email, subject, "\n".join(body_lines))
                                if err:
                                    errors += 1
                                    continue
                                try:
                                    now_ts = datetime.now().isoformat(timespec="seconds")
                                    inv_id = int(row.get("invoice_id"))
                                    cur_count = int(row.get("reminder_sent_count") or 0)
                                    new_count = cur_count + 1
                                    conn.execute(
                                        """
                                        UPDATE finance_invoices
                                        SET reminder_sent_count = COALESCE(reminder_sent_count, 0) + 1,
                                            last_reminder_sent_at = ?,
                                            updated_at = ?
                                        WHERE invoice_id = ?
                                        """,
                                        (now_ts, now_ts, inv_id),
                                    )
                                    conn.commit()
                                    _log_sent_email(
                                        conn,
                                        str(row.get("case_id") or ""),
                                        to_email,
                                        "reminder",
                                        subject=subject,
                                        body_preview="\n".join(body_lines),
                                        invoice_id=inv_id,
                                        reminder_sequence=new_count,
                                    )
                                    _upsert_case_recipient(conn, str(row.get("case_id") or ""), to_email)
                                except Exception:
                                    errors += 1
                                    continue
                                sent += 1
                            if sent:
                                st.success(f"Sent {sent} reminder email(s).")
                            if errors:
                                st.warning(f"{errors} reminder(s) failed or were skipped (missing email or error).")

    detail_case_id = st.session_state.get("finance_detail_case_id")
    if st.session_state.get("finance_view_mode", "list") == "detail" and detail_case_id:
        st.divider()
        st.subheader(f"Case {detail_case_id} · Finance detail")
        if st.button("Back to list", key="finance_back_to_list"):
            st.session_state["finance_view_mode"] = "list"
            st.session_state.pop("finance_detail_case_id", None)
            st.rerun()

        finance_df = _load_finance_df(conn)
        payments_df = _load_payments_df(conn, detail_case_id)
        invoices_df = _load_invoices_df(conn, detail_case_id)
        finance_df = _apply_payment_totals(finance_df, payments_df)
        calc_df = _with_calculated_fields(finance_df)
        case_row = df_filtered[df_filtered["case_id"].astype(str) == str(detail_case_id)].iloc[0] if not df_filtered[df_filtered["case_id"].astype(str) == str(detail_case_id)].empty else None
        detail_fin = {}
        fc = calc_df[calc_df["case_id"].astype(str) == str(detail_case_id)]
        if not fc.empty:
            detail_fin = fc.iloc[0].to_dict()
        elif not finance_df[finance_df["case_id"].astype(str) == str(detail_case_id)].empty:
            detail_fin = finance_df[finance_df["case_id"].astype(str) == str(detail_case_id)].iloc[0].to_dict()
        contract_sum = _as_float(detail_fin.get("contract_sum", 0))
        payment_sum = _get_payment_sum_for_case(conn, detail_case_id)
        paid_invoice_sum = _get_paid_invoice_sum_for_case(conn, detail_case_id)
        paid_amount = payment_sum + paid_invoice_sum
        invoiced_amount = _get_invoice_sum_for_case(conn, detail_case_id)
        remaining = max(0.0, contract_sum - paid_amount)
        currency = str(detail_fin.get("currency") or "MKD")

        d1, d2, d3, d4 = st.columns(4)
        d1.metric("Contract Sum", f"{contract_sum:,.0f} {currency}")
        d2.metric("Invoiced", f"{invoiced_amount:,.0f} {currency}")
        d3.metric("Paid", f"{paid_amount:,.0f} {currency}")
        d4.metric("Remaining", f"{remaining:,.0f} {currency}")

        _ensure_finance_form_state_defaults()
        existing = finance_df[finance_df["case_id"].astype(str) == str(detail_case_id)]
        existing_row = existing.iloc[0].to_dict() if not existing.empty else {}

        need_load = (
            st.session_state.get("finance_form_loaded_case_id") != detail_case_id
            or st.session_state.get("finance_form_just_saved") is True
        )
        st.session_state.pop("finance_form_just_saved", None)

        if need_load:
            st.session_state["finance_form_client_name"] = str((existing_row.get("client_name") or (case_row.get("Name / Last name") if case_row is not None else "") or "") or "")
            st.session_state["finance_form_client_phone"] = str((existing_row.get("client_phone") or (case_row.get("Phone") if case_row is not None else "") or "") or "")
            st.session_state["finance_form_client_email"] = str((case_row.get("email") if case_row is not None else "") or "")
            st.session_state["finance_form_service_type"] = str((existing_row.get("service_type") or "") or "")
            st.session_state["finance_form_finance_date"] = _parse_date(str(existing_row.get("finance_date") or "")) or date.today()
            st.session_state["finance_form_due_enabled"] = bool(existing_row.get("due_date"))
            st.session_state["finance_form_due_date"] = _parse_date(str(existing_row.get("due_date") or "")) or date.today()
            _cs = _as_float(existing_row.get("contract_sum"))
            st.session_state["finance_form_contract_sum"] = _cs if _cs != 0 else 0.0
            st.session_state.pop("finance_form_contract_sum_input", None)
            st.session_state["finance_form_currency"] = str(existing_row.get("currency") or "MKD")
            if st.session_state["finance_form_currency"] not in CURRENCY_OPTIONS:
                st.session_state["finance_form_currency"] = CURRENCY_OPTIONS[0]
            st.session_state["finance_form_status"] = str(existing_row.get("finance_status") or "GRAY")
            if st.session_state["finance_form_status"] not in STATUS_OPTIONS:
                st.session_state["finance_form_status"] = STATUS_OPTIONS[0]
            st.session_state["finance_form_notes"] = str((existing_row.get("notes") or "") or "")
            for d in custom_defs:
                if not d.get("enabled", True):
                    continue
                name = (d.get("name") or "").strip()
                if not name or name in ("Client", "Phone", "email"):
                    continue
                val = ""
                if case_row is not None and name in case_row.index:
                    val = str(case_row.get(name) or "")
                st.session_state["finance_form_custom_" + name] = val
            st.session_state["finance_form_loaded_case_id"] = detail_case_id

        has_contract = not existing.empty
        with st.expander("Contract profile", expanded=not has_contract):
            st.caption("Defines client, phone, contract amount, currency, due date, and finance status for this case.")
            with st.form("finance_contract_form", clear_on_submit=False):
                c1, c2, c3 = st.columns(3)
                with c1:
                    client_name = st.text_input("Client", key="finance_form_client_name")
                    client_phone = st.text_input("Client Phone", key="finance_form_client_phone")
                    client_email = st.text_input("Email", key="finance_form_client_email")
                with c2:
                    service_type = st.text_input("Service Type", key="finance_form_service_type")
                    finance_date = st.date_input("Finance Date", key="finance_form_finance_date")
                    due_enabled = st.checkbox("Set Due Date", key="finance_form_due_enabled", help="Check to set a payment deadline. Used in Action Center to show cases with balance due and overdue.")
                    due_date = st.date_input("Due Date", key="finance_form_due_date", disabled=not due_enabled)
                with c3:
                    _cs_val = st.session_state.get("finance_form_contract_sum", 0)
                    try:
                        _contract_display = "" if _as_float(_cs_val) == 0 else str(_cs_val)
                    except (TypeError, ValueError):
                        _contract_display = ""
                    if not isinstance(_contract_display, str):
                        _contract_display = "" if not _contract_display else str(_contract_display)
                    if "finance_form_contract_sum_input" in st.session_state:
                        _contract_display = st.session_state["finance_form_contract_sum_input"]
                    contract_sum_raw = st.text_input("Contract Sum", value=_contract_display, key="finance_form_contract_sum_input", placeholder="0")
                    contract_sum_val = _as_float(contract_sum_raw)
                    st.text_input("Paid (total)", value=f"{paid_amount:,.2f}", disabled=True, key="finance_form_paid_display", help="Payments + amounts from invoices marked Paid")
                    currency = st.selectbox("Currency", CURRENCY_OPTIONS, key="finance_form_currency")
                    finance_status = st.selectbox(
                        "Status",
                        STATUS_OPTIONS,
                        key="finance_form_status",
                        help="GRAY = not started, GREEN/YELLOW = in progress, RED = attention, PENDING = waiting, PAID = completed.",
                    )
                notes = st.text_area("Notes", key="finance_form_notes", height=80)
                custom_vals: Dict[str, Optional[str]] = {}
                for d in custom_defs:
                    if not d.get("enabled", True):
                        continue
                    name = (d.get("name") or "").strip()
                    if not name or name in ("Client", "Phone", "email"):
                        continue
                    key = "finance_form_custom_" + name
                    if d.get("type") == "Dropdown":
                        opts = list(d.get("options") or [])
                        cur = st.session_state.get(key, "")
                        if cur and str(cur) not in opts:
                            opts = [str(cur)] + opts
                        if not opts:
                            opts = [""]
                        v = st.selectbox(name, options=opts, key=key)
                        custom_vals[name] = str(v) if v else None
                    else:
                        v = st.text_input(name, key=key)
                        custom_vals[name] = str(v).strip() or None
                submit_contract = st.form_submit_button("Save contract")
        if submit_contract:
            clean_name = _normalize_text(client_name)
            clean_phone = _normalize_text(client_phone)
            custom_vals_submit: Dict[str, Optional[str]] = {}
            for d in custom_defs:
                if not d.get("enabled", True):
                    continue
                name = (d.get("name") or "").strip()
                if not name or name in ("Client", "Phone", "email"):
                    continue
                v = st.session_state.get("finance_form_custom_" + name)
                custom_vals_submit[name] = (str(v).strip() or None) if v is not None else None
            if "email" not in custom_vals_submit:
                custom_vals_submit["email"] = _normalize_text(st.session_state.get("finance_form_client_email"))
            _upsert_finance_row(
                conn,
                {
                    "case_id": detail_case_id,
                    "client_name": clean_name,
                    "client_phone": clean_phone,
                    "service_type": _normalize_text(service_type),
                    "finance_date": finance_date.isoformat() if isinstance(finance_date, date) else None,
                    "contract_sum": contract_sum_val,
                    "currency": str(currency or "MKD"),
                    "paid_amount": paid_amount,
                    "due_date": due_date.isoformat() if due_enabled and isinstance(due_date, date) else None,
                    "finance_status": str(finance_status or "GRAY"),
                    "notes": _normalize_text(notes),
                },
            )
            _sync_case_contact_from_finance(
                conn,
                detail_case_id,
                clean_name,
                clean_phone,
                case_key_col,
                field_key_col,
                field_value_col,
            )
            if custom_vals_submit:
                _sync_custom_fields_to_case_user_data(
                    conn,
                    detail_case_id,
                    custom_vals_submit,
                    case_key_col,
                    field_key_col,
                    field_value_col,
                )
            st.session_state["finance_form_just_saved"] = True
            st.toast("Contract saved.")
            st.rerun()

        st.markdown("#### Payment events")
        with st.form("finance_payment_form", clear_on_submit=False):
            py1, py2, py3, py4 = st.columns([1, 1, 1, 2])
            with py1:
                payment_date = st.date_input("Payment Date", key="finance_payment_date")
            with py2:
                _pay_val = st.session_state.get("finance_payment_amount", 0)
                try:
                    _pay_display = "" if _as_float(_pay_val) == 0 else str(_pay_val)
                except (TypeError, ValueError):
                    _pay_display = ""
                if not isinstance(_pay_display, str):
                    _pay_display = "" if not _pay_display else str(_pay_display)
                if "finance_payment_amount_input" in st.session_state:
                    _pay_display = st.session_state["finance_payment_amount_input"]
                payment_amount_raw = st.text_input("Amount", value=_pay_display, key="finance_payment_amount_input", placeholder="0")
                payment_amount = _as_float(payment_amount_raw)
            with py3:
                payment_currency = st.selectbox("Currency", CURRENCY_OPTIONS, key="finance_payment_currency")
            with py4:
                payment_note = st.text_input("Note", key="finance_payment_note")
            submit_payment = st.form_submit_button("Add payment")
        if submit_payment:
            if payment_amount <= 0:
                st.error("Amount must be > 0.")
            else:
                _ensure_finance_case_exists(
                    conn,
                    detail_case_id,
                    {
                        "client_name": st.session_state.get("finance_form_client_name"),
                        "client_phone": st.session_state.get("finance_form_client_phone"),
                        "service_type": st.session_state.get("finance_form_service_type"),
                        "finance_date": st.session_state.get("finance_form_finance_date").isoformat() if isinstance(st.session_state.get("finance_form_finance_date"), date) else None,
                        "contract_sum": st.session_state.get("finance_form_contract_sum"),
                        "currency": st.session_state.get("finance_form_currency"),
                        "paid_amount": 0.0,
                        "due_date": st.session_state.get("finance_form_due_date").isoformat() if st.session_state.get("finance_form_due_enabled") and isinstance(st.session_state.get("finance_form_due_date"), date) else None,
                        "finance_status": st.session_state.get("finance_form_status"),
                        "notes": st.session_state.get("finance_form_notes"),
                    },
                )
                _insert_payment(
                    conn,
                    detail_case_id,
                    payment_date,
                    payment_amount,
                    str(st.session_state.get("finance_payment_currency") or "MKD"),
                    str(st.session_state.get("finance_payment_note") or ""),
                )
                _sync_paid_amount_from_events(conn, detail_case_id)
                st.session_state.pop("finance_payment_amount_input", None)
                st.session_state["finance_payment_amount"] = 0
                st.success("Payment added.")
                st.rerun()

        if not payments_df.empty:
            st.dataframe(
                payments_df[["payment_id", "payment_date", "amount", "currency", "note", "updated_at"]],
                use_container_width=True,
                hide_index=True,
            )
            pay_ids = payments_df["payment_id"].astype(int).tolist()
            del_id = st.selectbox("Delete payment", [""] + [str(i) for i in pay_ids], key="finance_delete_payment")
            if del_id and st.button("Delete selected payment", key="finance_do_delete_payment"):
                if _delete_payment(conn, int(del_id)):
                    _sync_paid_amount_from_events(conn, detail_case_id)
                    st.success("Payment deleted.")
                    st.rerun()
                else:
                    st.warning("Payment not found.")
        else:
            st.info("No payments yet for this case.")

        st.markdown("#### Invoices")
        invoice_sum = _get_invoice_sum_for_case(conn, detail_case_id)
        payment_sum = _get_payment_sum_for_case(conn, detail_case_id)
        proposed_amount = contract_sum - invoice_sum - payment_sum
        if proposed_amount < 0:
            proposed_amount = 0.0
        st.caption(f"Contract total: {contract_sum:,.2f} {detail_fin.get('currency') or 'MKD'} | Invoiced: {invoice_sum:,.2f} | Paid: {payment_sum:,.2f} | Proposed next amount: {proposed_amount:,.2f}")
        with st.expander("Create invoice", expanded=bool(invoices_df.empty)):
            inv_c1, inv_c2 = st.columns(2)
            with inv_c1:
                inv_number = st.text_input("Invoice number", key="finance_invoice_number")
                inv_issue_date = st.date_input("Issue date", key="finance_invoice_issue_date", value=date.today())
                inv_due_date = st.date_input("Due date", key="finance_invoice_due_date", value=date.today())
            with inv_c2:
                inv_amount = st.text_input("Amount", key="finance_invoice_amount", value=str(proposed_amount), help="Proposed: contract sum minus existing invoices and payments. Edit as needed.")
                inv_currency = st.selectbox("Currency", CURRENCY_OPTIONS, key="finance_invoice_currency", index=CURRENCY_OPTIONS.index(str(detail_fin.get("currency") or "MKD")) if str(detail_fin.get("currency") or "MKD") in CURRENCY_OPTIONS else 0)
                inv_status = st.selectbox("Status", ["DRAFT", "SENT", "PAID", "CANCELLED"], key="finance_invoice_status")
            inv_desc = st.text_input("Description", key="finance_invoice_description", value=str(detail_fin.get("service_type") or ""))
            inv_client_name = st.text_input("Client name", key="finance_invoice_client_name", value=str(st.session_state.get("finance_form_client_name") or ""))
            inv_client_email = st.text_input("Client email", key="finance_invoice_client_email", value=str(st.session_state.get("finance_form_client_email") or ""))
            inv_client_address = st.text_area("Client address", key="finance_invoice_client_address", value="")
            st.markdown("**Reminders (optional)**")
            col_r1, col_r2, col_r3, col_r4 = st.columns(4)
            with col_r1:
                inv_rem_enabled = st.checkbox("Enable", key="finance_invoice_rem_enabled", value=False)
            with col_r2:
                inv_rem_first = st.number_input("First after days", key="finance_invoice_rem_first", min_value=0, max_value=365, value=3)
            with col_r3:
                inv_rem_repeat = st.number_input("Repeat every days", key="finance_invoice_rem_repeat", min_value=0, max_value=365, value=7)
            with col_r4:
                inv_rem_max = st.number_input("Max count", key="finance_invoice_rem_max", min_value=0, max_value=20, value=3)
            create_invoice = st.button("Save invoice", key="finance_invoice_save")

        if create_invoice:
            try:
                amount_val = _as_float(inv_amount)
                if amount_val <= 0:
                    st.error("Invoice amount must be > 0.")
                else:
                    now = datetime.now().isoformat(timespec="seconds")
                    conn.execute(
                        """
                        INSERT INTO finance_invoices (
                            case_id, invoice_number, issue_date, due_date,
                            amount, currency, status,
                            client_name, client_email, client_address,
                            service_description, items_json, file_path,
                            created_at, updated_at
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            str(detail_case_id).strip(),
                            str(inv_number or "").strip(),
                            inv_issue_date.isoformat() if isinstance(inv_issue_date, date) else None,
                            inv_due_date.isoformat() if isinstance(inv_due_date, date) else None,
                            amount_val,
                            str(inv_currency or "MKD"),
                            str(inv_status or "DRAFT"),
                            str(inv_client_name or "").strip(),
                            str(inv_client_email or "").strip(),
                            str(inv_client_address or "").strip(),
                            str(inv_desc or "").strip(),
                            None,
                            None,
                            now,
                            now,
                        ),
                    )
                    # apply reminder preferences on the newly created invoice
                    try:
                        inv_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                        conn.execute(
                            """
                            UPDATE finance_invoices
                            SET reminders_enabled = ?,
                                reminder_first_after_days = ?,
                                reminder_repeat_days = ?,
                                reminder_max_count = ?
                            WHERE invoice_id = ?
                            """,
                            (
                                1 if inv_rem_enabled else 0,
                                int(inv_rem_first or 0),
                                int(inv_rem_repeat or 0),
                                int(inv_rem_max or 0),
                                int(inv_id),
                            ),
                        )
                    except Exception:
                        pass
                    conn.commit()
                    st.success("Invoice saved.")
                    st.rerun()
            except Exception as exc:
                st.error(f"Failed to save invoice: {exc}")

        if not invoices_df.empty:
            show_cols = ["invoice_id", "invoice_number", "issue_date", "due_date", "amount", "currency", "status", "client_name", "client_email", "updated_at"]
            show_cols = [c for c in show_cols if c in invoices_df.columns]
            st.dataframe(invoices_df[show_cols], use_container_width=True, hide_index=True)

            inv_ids = invoices_df["invoice_id"].astype(int).tolist()

            st.markdown("##### Set invoice status")
            st.caption("Sent is set automatically when you send by email. Set to Paid when you see the amount on your bank statement.")
            status_c1, status_c2, status_c3 = st.columns([2, 2, 1])
            with status_c1:
                status_inv = st.selectbox("Invoice", [""] + [str(i) for i in inv_ids], key="finance_quick_status_inv", format_func=lambda x: "(select)" if not x else f"Invoice #{x}")
            with status_c2:
                new_status = st.selectbox("Status", ["DRAFT", "SENT", "PAID", "CANCELLED"], key="finance_quick_status_val")
            with status_c3:
                st.write("")
                apply_status = st.button("Apply", key="finance_quick_status_apply")
            if apply_status and status_inv:
                try:
                    conn.execute("UPDATE finance_invoices SET status = ?, updated_at = ? WHERE invoice_id = ?", (new_status, datetime.now().isoformat(timespec="seconds"), int(status_inv)))
                    conn.commit()
                    st.success(f"Invoice #{status_inv} set to **{new_status}**.")
                    st.rerun()
                except Exception as exc:
                    st.error(f"Failed to update status: {exc}")

            st.markdown("##### Edit invoice")
            edit_inv = st.selectbox(
                "Select invoice to edit",
                [""] + [str(i) for i in inv_ids],
                key="finance_edit_invoice_pick",
                format_func=lambda x: "(select)" if not x else f"Invoice #{x}",
            )
            if edit_inv:
                edit_row = invoices_df[invoices_df["invoice_id"] == int(edit_inv)].iloc[0].to_dict()
                with st.form("finance_edit_invoice_form", clear_on_submit=False):
                    e_c1, e_c2 = st.columns(2)
                    with e_c1:
                        e_number = st.text_input("Invoice number", value=str(edit_row.get("invoice_number") or ""), key="finance_edit_inv_number")
                        e_issue = st.date_input("Issue date", value=_coerce_date_finance(edit_row.get("issue_date")) or date.today(), key="finance_edit_inv_issue")
                        e_due = st.date_input("Due date", value=_coerce_date_finance(edit_row.get("due_date")) or date.today(), key="finance_edit_inv_due")
                    with e_c2:
                        e_amount = st.text_input("Amount", value=str(edit_row.get("amount") or "0"), key="finance_edit_inv_amount")
                        e_currency = st.selectbox("Currency", CURRENCY_OPTIONS, index=CURRENCY_OPTIONS.index(str(edit_row.get("currency") or "MKD")) if str(edit_row.get("currency") or "MKD") in CURRENCY_OPTIONS else 0, key="finance_edit_inv_currency")
                        _status_opt = ["DRAFT", "SENT", "PAID", "CANCELLED"]
                        _status_val = str(edit_row.get("status") or "DRAFT")
                        e_status = st.selectbox("Status", _status_opt, index=_status_opt.index(_status_val) if _status_val in _status_opt else 0, key="finance_edit_inv_status")
                    e_desc = st.text_input("Description", value=str(edit_row.get("service_description") or ""), key="finance_edit_inv_desc")
                    e_client_name = st.text_input("Client name", value=str(edit_row.get("client_name") or ""), key="finance_edit_inv_client_name")
                    e_client_email = st.text_input("Client email", value=str(edit_row.get("client_email") or ""), key="finance_edit_inv_client_email")
                    e_client_address = st.text_area("Client address", value=str(edit_row.get("client_address") or ""), key="finance_edit_inv_client_address")
                    edit_submit = st.form_submit_button("Save changes")
                if edit_submit:
                    try:
                        amt = _as_float(e_amount)
                        conn.execute(
                            """
                            UPDATE finance_invoices
                            SET invoice_number = ?, issue_date = ?, due_date = ?, amount = ?, currency = ?, status = ?,
                                client_name = ?, client_email = ?, client_address = ?, service_description = ?, updated_at = ?
                            WHERE invoice_id = ?
                            """,
                            (
                                str(e_number or "").strip(),
                                e_issue.isoformat() if isinstance(e_issue, date) else None,
                                e_due.isoformat() if isinstance(e_due, date) else None,
                                amt,
                                str(e_currency or "MKD"),
                                str(e_status or "DRAFT"),
                                str(e_client_name or "").strip(),
                                str(e_client_email or "").strip(),
                                str(e_client_address or "").strip(),
                                str(e_desc or "").strip(),
                                datetime.now().isoformat(timespec="seconds"),
                                int(edit_inv),
                            ),
                        )
                        conn.commit()
                        st.success("Invoice updated.")
                        st.rerun()
                    except Exception as exc:
                        st.error(f"Failed to update invoice: {exc}")

            st.markdown("##### Send invoice by email")
            selected_inv = st.selectbox(
                "Select invoice",
                [""] + [str(i) for i in inv_ids],
                key="finance_send_invoice_pick",
                format_func=lambda x: "(select invoice)" if not x else f"Invoice #{x}",
            )
            if selected_inv:
                row = invoices_df[invoices_df["invoice_id"] == int(selected_inv)].iloc[0].to_dict()
                client_email = str(row.get("client_email") or "").strip()
                saved_recipients = _get_case_recipients(conn, detail_case_id)
                default_to = saved_recipients[0][0] if saved_recipients else client_email
                # Reset To when switching to another invoice, or apply a suggestion from previous run
                if st.session_state.get("finance_send_invoice_last_inv") != selected_inv:
                    st.session_state["finance_send_invoice_last_inv"] = selected_inv
                    st.session_state["finance_send_invoice_to"] = default_to
                if "finance_send_invoice_prefill" in st.session_state:
                    st.session_state["finance_send_invoice_to"] = st.session_state.pop("finance_send_invoice_prefill")
                # Single text box: always type or paste the email here
                st.text_input(
                    "To (email address)",
                    key="finance_send_invoice_to",
                    placeholder="e.g. dimovski.niko@gmail.com",
                    help="Type or paste the recipient email. Any address you send to is saved for this case.",
                )
                # Optional: click a suggestion to fill the box (store in prefill; applied on next run before widget)
                suggestion_emails = []
                seen = set()
                for em, _ in saved_recipients:
                    if em and em not in seen:
                        suggestion_emails.append(em)
                        seen.add(em)
                if client_email and client_email not in seen:
                    suggestion_emails.append(client_email)
                if suggestion_emails:
                    st.caption("Or click to use:")
                    sugg_cols = st.columns(min(len(suggestion_emails), 4))
                    for i, em in enumerate(suggestion_emails[:4]):
                        with sugg_cols[i % len(sugg_cols)]:
                            if st.button(f"📧 {em}", key=f"finance_send_use_{selected_inv}_{i}"):
                                st.session_state["finance_send_invoice_prefill"] = em
                                st.rerun()
                default_subject = f"Invoice {row.get('invoice_number') or selected_inv} for case {detail_case_id}"
                default_body = "\n".join(
                    [
                        f"Почитувани {row.get('client_name') or ''},".strip(),
                        "",
                        f"Ви ја испраќаме фактурата {row.get('invoice_number') or selected_inv} за предмет {detail_case_id}.",
                        f"Износ: {row.get('amount')} {row.get('currency') or ''}".strip(),
                        f"Датум на издавање: {row.get('issue_date') or ''}",
                        f"Рок за плаќање: {row.get('due_date') or ''}",
                        "",
                        "Ве молиме контактирајте нè доколку имате прашања.",
                    ]
                )
                with st.form("finance_send_invoice_form", clear_on_submit=False):
                    subject = st.text_input("Subject", value=default_subject, key="finance_send_invoice_subject")
                    body = st.text_area("Body", value=default_body, key="finance_send_invoice_body", height=160)
                    approve = st.checkbox("I have reviewed and approve sending this email.", key="finance_send_invoice_approve")
                    do_send = st.form_submit_button("Send email")
                if do_send:
                    to_email = st.session_state.get("finance_send_invoice_to", "").strip()
                    if not to_email:
                        st.error("Enter an email address in the **To (email address)** field above.")
                    elif not approve:
                        st.error("Please confirm approval before sending.")
                    else:
                        attachment_filename = None
                        attachment_bytes = None
                        company = _get_company_settings()
                        inv_html = _build_invoice_html(company, row)
                        pdf_bytes = _invoice_html_to_pdf(inv_html)
                        if pdf_bytes:
                            attachment_filename = f"Invoice_{row.get('invoice_number') or selected_inv}.pdf"
                            attachment_bytes = pdf_bytes
                        err = _send_invoice_email_simple(to_email.strip(), subject.strip(), body, attachment_filename=attachment_filename, attachment_bytes=attachment_bytes)
                        if err:
                            st.error(f"Failed to send email: {err}")
                            st.session_state["finance_invoice_send_message"] = ("error", f"Failed to send email: {err}")
                        else:
                            try:
                                conn.execute(
                                    "UPDATE finance_invoices SET status = ?, updated_at = ? WHERE invoice_id = ?",
                                    ("SENT", datetime.now().isoformat(timespec='seconds'), int(selected_inv)),
                                )
                                conn.commit()
                            except Exception:
                                pass
                            _log_sent_email(
                                conn,
                                detail_case_id,
                                to_email.strip(),
                                "invoice",
                                subject=subject.strip(),
                                body_preview=body,
                                attachment_filename=attachment_filename,
                                attachment_size_bytes=len(attachment_bytes) if attachment_bytes else None,
                                invoice_id=int(selected_inv),
                            )
                            _upsert_case_recipient(conn, detail_case_id, to_email.strip())
                            msg_text = "Invoice email sent with PDF attachment." if attachment_bytes else "Invoice email sent (PDF could not be generated; install wkhtmltopdf for PDF attachment)."
                            st.session_state["finance_invoice_send_message"] = ("success", msg_text)
                        st.rerun()

            st.markdown("##### Delete invoice")
            del_inv = st.selectbox(
                "Select invoice to delete",
                [""] + [str(i) for i in inv_ids],
                key="finance_delete_invoice_pick",
                format_func=lambda x: "(select invoice)" if not x else f"Invoice #{x}",
            )
            confirm_del = st.checkbox("I understand this will permanently delete the invoice record.", key="finance_delete_invoice_confirm")
            if del_inv and st.button("Delete selected invoice", key="finance_delete_invoice_button"):
                if not confirm_del:
                    st.error("Please confirm deletion before proceeding.")
                else:
                    try:
                        conn.execute("DELETE FROM finance_invoices WHERE invoice_id = ?", (int(del_inv),))
                        conn.commit()
                        st.success("Invoice deleted.")
                        st.rerun()
                    except Exception as exc:
                        st.error(f"Failed to delete invoice: {exc}")

            st.markdown("##### Email history (sent for this case)")
            email_filter_inv = st.selectbox(
                "Show emails for",
                ["All"] + [str(i) for i in inv_ids],
                key="finance_email_log_filter_inv",
                format_func=lambda x: "All invoices" if x == "All" else f"Invoice #{x}",
            )
            email_log_df = _load_email_log_df(
                conn,
                case_id=detail_case_id,
                invoice_id=int(email_filter_inv) if email_filter_inv and email_filter_inv != "All" else None,
            )
            if not email_log_df.empty:
                cols = ["sent_at", "email_type", "to_email", "subject", "attachment_filename", "attachment_size_bytes", "reminder_sequence", "invoice_id"]
                display_cols = [c for c in cols if c in email_log_df.columns]
                st.dataframe(
                    email_log_df[display_cols].rename(columns={"sent_at": "Sent at", "email_type": "Type", "to_email": "To", "attachment_filename": "Attachment", "attachment_size_bytes": "Size (B)", "reminder_sequence": "Reminder #", "invoice_id": "Invoice ID"}),
                    use_container_width=True,
                    hide_index=True,
                )
                with st.expander("View body preview and full details"):
                    for _, log_row in email_log_df.iterrows():
                        st.markdown(f"**{log_row.get('sent_at')}** — {log_row.get('email_type')} → {log_row.get('to_email')} (Invoice ID: {log_row.get('invoice_id') or '—'})")
                        st.text(f"Subject: {log_row.get('subject') or ''}")
                        if log_row.get("attachment_filename"):
                            st.caption(f"Attachment: {log_row.get('attachment_filename')} ({log_row.get('attachment_size_bytes') or 0} bytes)")
                        body_preview = str(log_row.get("body_preview") or "")
                        st.text_area("Body preview", value=body_preview, height=80, disabled=True, key=f"finance_email_log_body_{int(log_row.get('log_id', 0))}")
                        st.divider()
            else:
                st.caption("No emails sent yet for this case." + (" No emails for this invoice." if email_filter_inv and email_filter_inv != "All" else ""))
        else:
            st.info("No invoices yet for this case.")
            st.markdown("##### Email history (sent for this case)")
            email_log_df = _load_email_log_df(conn, case_id=detail_case_id)
            if not email_log_df.empty:
                cols = ["sent_at", "email_type", "to_email", "subject", "attachment_filename", "attachment_size_bytes", "reminder_sequence", "invoice_id"]
                display_cols = [c for c in cols if c in email_log_df.columns]
                st.dataframe(email_log_df[display_cols].rename(columns={"sent_at": "Sent at", "email_type": "Type", "to_email": "To", "attachment_filename": "Attachment", "attachment_size_bytes": "Size (B)", "reminder_sequence": "Reminder #", "invoice_id": "Invoice ID"}), use_container_width=True, hide_index=True)
                with st.expander("View body preview and full details"):
                    for _, log_row in email_log_df.iterrows():
                        st.markdown(f"**{log_row.get('sent_at')}** — {log_row.get('email_type')} → {log_row.get('to_email')} (Invoice ID: {log_row.get('invoice_id') or '—'})")
                        st.text(f"Subject: {log_row.get('subject') or ''}")
                        if log_row.get("attachment_filename"):
                            st.caption(f"Attachment: {log_row.get('attachment_filename')} ({log_row.get('attachment_size_bytes') or 0} bytes)")
                        st.text_area("Body preview", value=str(log_row.get("body_preview") or ""), height=80, disabled=True, key=f"finance_email_log_body_else_{int(log_row.get('log_id', 0))}")
                        st.divider()
            else:
                st.caption("No emails sent yet for this case.")

        # Show success/error from send (after rerun so message is visible)
        if not invoices_df.empty and "finance_invoice_send_message" in st.session_state:
            kind, msg = st.session_state.pop("finance_invoice_send_message", (None, None))
            if kind == "success":
                st.success(msg)
            elif kind == "error":
                st.error(msg)
        # (No-invoices case and email history are handled in the else block above.)

    # End of render_finance_page
