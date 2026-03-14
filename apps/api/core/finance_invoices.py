from __future__ import annotations

import sqlite3
from datetime import date, datetime
from typing import Any, Optional

import pandas as pd

from .common import as_float, isoformat_or_none, normalize_text, parse_date
from .email import get_company_settings, send_email_simple
from .invoices import build_invoice_html, invoice_html_to_pdf
from .settings_access import load_finance_settings


INVOICE_COLUMNS = (
    "invoice_id, case_id, invoice_number, issue_date, due_date, amount, currency, status, "
    "client_name, client_email, client_address, service_description, items_json, file_path, "
    "reminders_enabled, reminder_first_after_days, reminder_repeat_days, reminder_max_count, "
    "reminder_sent_count, last_reminder_sent_at, created_at, updated_at"
)


def ensure_finance_schema(conn: sqlite3.Connection) -> None:
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
        CREATE TABLE IF NOT EXISTS finance_invoices (
            invoice_id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id TEXT NOT NULL,
            invoice_number TEXT NOT NULL,
            issue_date TEXT NOT NULL,
            due_date TEXT,
            amount REAL NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'MKD',
            status TEXT NOT NULL DEFAULT 'DRAFT',
            client_name TEXT,
            client_email TEXT,
            client_address TEXT,
            service_description TEXT,
            items_json TEXT,
            file_path TEXT,
            reminders_enabled INTEGER NOT NULL DEFAULT 0,
            reminder_first_after_days INTEGER NOT NULL DEFAULT 3,
            reminder_repeat_days INTEGER NOT NULL DEFAULT 7,
            reminder_max_count INTEGER NOT NULL DEFAULT 3,
            reminder_sent_count INTEGER NOT NULL DEFAULT 0,
            last_reminder_sent_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_finance_invoices_case_id ON finance_invoices(case_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_finance_invoices_status ON finance_invoices(status)")
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
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS finance_email_log (
            log_id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id TEXT NOT NULL,
            invoice_id INTEGER,
            email_type TEXT NOT NULL,
            to_email TEXT NOT NULL,
            subject TEXT,
            body_preview TEXT,
            attachment_filename TEXT,
            attachment_size_bytes INTEGER,
            reminder_sequence INTEGER,
            sent_at TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_finance_email_log_case_id ON finance_email_log(case_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_finance_email_log_invoice_id ON finance_email_log(invoice_id)")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS finance_case_recipients (
            case_id TEXT NOT NULL,
            email TEXT NOT NULL,
            last_used_at TEXT NOT NULL,
            PRIMARY KEY (case_id, email)
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_finance_case_recipients_case_id ON finance_case_recipients(case_id)")
    # Add label column if missing (migration for existing DBs)
    try:
        cursor = conn.execute("PRAGMA table_info(finance_case_recipients)")
        columns = [row[1] for row in cursor.fetchall()]
        if "label" not in columns:
            conn.execute("ALTER TABLE finance_case_recipients ADD COLUMN label TEXT")
    except Exception:
        pass
    conn.commit()


def load_invoices_df(conn: sqlite3.Connection, case_id: Optional[str] = None) -> pd.DataFrame:
    ensure_finance_schema(conn)
    if case_id:
        query = f"""
            SELECT {INVOICE_COLUMNS}
            FROM finance_invoices
            WHERE case_id = ?
            ORDER BY issue_date DESC, invoice_id DESC
        """
        return pd.read_sql_query(query, conn, params=[str(case_id)])

    query = f"""
        SELECT {INVOICE_COLUMNS}
        FROM finance_invoices
        ORDER BY issue_date DESC, invoice_id DESC
    """
    return pd.read_sql_query(query, conn)


def load_payments_df(conn: sqlite3.Connection, case_id: Optional[str] = None) -> pd.DataFrame:
    ensure_finance_schema(conn)
    if case_id:
        query = """
            SELECT payment_id, case_id, payment_date, amount, currency, note, created_at, updated_at
            FROM finance_payments
            WHERE case_id = ?
            ORDER BY payment_date DESC, payment_id DESC
        """
        return pd.read_sql_query(query, conn, params=[str(case_id)])

    query = """
        SELECT payment_id, case_id, payment_date, amount, currency, note, created_at, updated_at
        FROM finance_payments
        ORDER BY payment_date DESC, payment_id DESC
    """
    return pd.read_sql_query(query, conn)


def load_email_log_df(conn: sqlite3.Connection, case_id: Optional[str] = None, invoice_id: Optional[int] = None) -> pd.DataFrame:
    ensure_finance_schema(conn)
    if case_id and invoice_id is not None:
        return pd.read_sql_query(
            """
            SELECT log_id, case_id, invoice_id, email_type, to_email, subject, body_preview,
                   attachment_filename, attachment_size_bytes, reminder_sequence, sent_at, created_at
            FROM finance_email_log
            WHERE case_id = ? AND invoice_id = ?
            ORDER BY sent_at DESC, log_id DESC
            """,
            conn,
            params=[str(case_id), int(invoice_id)],
        )
    if case_id:
        return pd.read_sql_query(
            """
            SELECT log_id, case_id, invoice_id, email_type, to_email, subject, body_preview,
                   attachment_filename, attachment_size_bytes, reminder_sequence, sent_at, created_at
            FROM finance_email_log
            WHERE case_id = ?
            ORDER BY sent_at DESC, log_id DESC
            """,
            conn,
            params=[str(case_id)],
        )
    return pd.read_sql_query(
        """
        SELECT log_id, case_id, invoice_id, email_type, to_email, subject, body_preview,
               attachment_filename, attachment_size_bytes, reminder_sequence, sent_at, created_at
        FROM finance_email_log
        ORDER BY sent_at DESC, log_id DESC
        """,
        conn,
    )


def insert_payment(conn: sqlite3.Connection, case_id: str, payment_date: Any, amount: float, currency: str, note: str) -> None:
    ensure_finance_schema(conn)
    now = datetime.now().isoformat(timespec="seconds")
    conn.execute(
        """
        INSERT INTO finance_payments (case_id, payment_date, amount, currency, note, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            str(case_id).strip(),
            _date_string(payment_date) or date.today().isoformat(),
            as_float(amount),
            str(currency or "MKD"),
            normalize_text(note),
            now,
            now,
        ),
    )
    conn.commit()


def delete_payment_record(conn: sqlite3.Connection, payment_id: int) -> Optional[str]:
    ensure_finance_schema(conn)
    row = conn.execute(
        "SELECT case_id FROM finance_payments WHERE payment_id = ?",
        (int(payment_id),),
    ).fetchone()
    if not row:
        return None
    case_id = str(row["case_id"])
    conn.execute("DELETE FROM finance_payments WHERE payment_id = ?", (int(payment_id),))
    conn.commit()
    return case_id


def sync_paid_amount_from_events(conn: sqlite3.Connection, case_id: str) -> None:
    ensure_finance_schema(conn)
    cid = str(case_id or "").strip()
    if not cid:
        return
    total = conn.execute(
        "SELECT COALESCE(SUM(amount), 0) FROM finance_payments WHERE case_id = ?",
        (cid,),
    ).fetchone()[0]
    conn.execute(
        "UPDATE finance_cases SET paid_amount = ?, updated_at = ? WHERE case_id = ?",
        (as_float(total), datetime.now().isoformat(timespec="seconds"), cid),
    )
    conn.commit()


def get_invoice_sum_for_case(conn: sqlite3.Connection, case_id: str) -> float:
    ensure_finance_schema(conn)
    row = conn.execute(
        "SELECT COALESCE(SUM(amount), 0) FROM finance_invoices WHERE case_id = ?",
        (str(case_id).strip(),),
    ).fetchone()
    return as_float(row[0]) if row else 0.0


def get_payment_sum_for_case(conn: sqlite3.Connection, case_id: str) -> float:
    ensure_finance_schema(conn)
    row = conn.execute(
        "SELECT COALESCE(SUM(amount), 0) FROM finance_payments WHERE case_id = ?",
        (str(case_id).strip(),),
    ).fetchone()
    return as_float(row[0]) if row else 0.0


def get_paid_invoice_sum_for_case(conn: sqlite3.Connection, case_id: str) -> float:
    ensure_finance_schema(conn)
    row = conn.execute(
        "SELECT COALESCE(SUM(amount), 0) FROM finance_invoices WHERE case_id = ? AND status = 'PAID'",
        (str(case_id).strip(),),
    ).fetchone()
    return as_float(row[0]) if row else 0.0


def log_sent_email(
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
    ensure_finance_schema(conn)
    now = datetime.now().isoformat(timespec="seconds")
    conn.execute(
        """
        INSERT INTO finance_email_log (
            case_id, invoice_id, email_type, to_email, subject, body_preview,
            attachment_filename, attachment_size_bytes, reminder_sequence, sent_at, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            str(case_id).strip(),
            invoice_id,
            str(email_type).strip(),
            str(to_email).strip(),
            (subject or "")[:500],
            (body_preview or "")[:2000],
            (attachment_filename or "")[:255] or None,
            attachment_size_bytes,
            reminder_sequence,
            now,
            now,
        ),
    )
    conn.commit()


def get_case_recipients(conn: sqlite3.Connection, case_id: str) -> list[dict[str, Any]]:
    ensure_finance_schema(conn)
    rows = conn.execute(
        "SELECT email, last_used_at, COALESCE(label, '') FROM finance_case_recipients WHERE case_id = ? ORDER BY last_used_at DESC",
        (str(case_id).strip(),),
    ).fetchall()
    return [
        {
            "email": str(row[0]),
            "last_used_at": str(row[1]),
            "label": (str(row[2]).strip() or None) if len(row) > 2 and row[2] else None,
        }
        for row in rows
    ]


def upsert_case_recipient(
    conn: sqlite3.Connection, case_id: str, email: str, label: Optional[str] = None
) -> None:
    ensure_finance_schema(conn)
    email_value = str(email or "").strip()
    if not email_value:
        return
    now = datetime.now().isoformat(timespec="seconds")
    label_value = str(label or "").strip() or None
    conn.execute(
        """
        INSERT INTO finance_case_recipients (case_id, email, last_used_at, label)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(case_id, email) DO UPDATE SET
            last_used_at = excluded.last_used_at,
            label = COALESCE(excluded.label, label)
        """,
        (str(case_id).strip(), email_value, now, label_value),
    )
    conn.commit()


def delete_case_recipient(conn: sqlite3.Connection, case_id: str, email: str) -> bool:
    ensure_finance_schema(conn)
    email_value = str(email or "").strip()
    if not email_value:
        return False
    cursor = conn.execute(
        "DELETE FROM finance_case_recipients WHERE case_id = ? AND email = ?",
        (str(case_id).strip(), email_value),
    )
    conn.commit()
    return cursor.rowcount > 0


def update_case_recipient_label(
    conn: sqlite3.Connection, case_id: str, email: str, label: Optional[str] = None
) -> bool:
    ensure_finance_schema(conn)
    email_value = str(email or "").strip()
    if not email_value:
        return False
    label_value = str(label or "").strip() or None
    cursor = conn.execute(
        "UPDATE finance_case_recipients SET label = ? WHERE case_id = ? AND email = ?",
        (label_value, str(case_id).strip(), email_value),
    )
    conn.commit()
    return cursor.rowcount > 0


def list_payments(conn: sqlite3.Connection, case_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT payment_id, case_id, payment_date, amount, currency, note, created_at, updated_at
        FROM finance_payments
        WHERE case_id = ?
        ORDER BY payment_date DESC, payment_id DESC
        """,
        (str(case_id).strip(),),
    ).fetchall()
    return [_payment_row_to_dict(row) for row in rows]


def list_invoices(conn: sqlite3.Connection, case_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        f"""
        SELECT {INVOICE_COLUMNS}
        FROM finance_invoices
        WHERE case_id = ?
        ORDER BY issue_date DESC, invoice_id DESC
        """,
        (str(case_id).strip(),),
    ).fetchall()
    return [_invoice_row_to_dict(row) for row in rows]


def list_email_log(conn: sqlite3.Connection, case_id: str, invoice_id: Optional[int] = None) -> list[dict[str, Any]]:
    params: list[Any] = [str(case_id).strip()]
    query = """
        SELECT log_id, case_id, invoice_id, email_type, to_email, subject, body_preview,
               attachment_filename, attachment_size_bytes, reminder_sequence, sent_at, created_at
        FROM finance_email_log
        WHERE case_id = ?
    """
    if invoice_id is not None:
        query += " AND invoice_id = ?"
        params.append(int(invoice_id))
    query += " ORDER BY sent_at DESC, log_id DESC"
    rows = conn.execute(query, params).fetchall()
    return [_email_log_row_to_dict(row) for row in rows]


def get_invoice_record(conn: sqlite3.Connection, invoice_id: int) -> Optional[dict[str, Any]]:
    row = conn.execute(
        f"SELECT {INVOICE_COLUMNS} FROM finance_invoices WHERE invoice_id = ?",
        (int(invoice_id),),
    ).fetchone()
    if not row:
        return None
    return _invoice_row_to_dict(row)


def generate_invoice_html(conn: sqlite3.Connection, invoice_id: int) -> Optional[str]:
    """Build invoice HTML for the given invoice. Returns HTML string or None."""
    invoice = get_invoice_record(conn, invoice_id)
    if invoice is None:
        return None
    company = get_company_settings()
    return build_invoice_html(company, invoice)


def generate_invoice_pdf(
    conn: sqlite3.Connection, invoice_id: int
) -> tuple[Optional[bytes], Optional[str]]:
    """Build invoice PDF for the given invoice. Returns (pdf_bytes, filename) or (None, None)."""
    invoice = get_invoice_record(conn, invoice_id)
    if invoice is None:
        return (None, None)
    company = get_company_settings()
    html_content = build_invoice_html(company, invoice)
    pdf_bytes = invoice_html_to_pdf(html_content)
    if not pdf_bytes:
        return (None, None)
    filename = f"Invoice_{invoice.get('invoice_number') or invoice_id}.pdf"
    return (pdf_bytes, filename)


def create_invoice(conn: sqlite3.Connection, case_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    ensure_finance_schema(conn)
    now = datetime.now().isoformat(timespec="seconds")
    cur = conn.execute(
        """
        INSERT INTO finance_invoices (
            case_id, invoice_number, issue_date, due_date, amount, currency, status,
            client_name, client_email, client_address, service_description, items_json, file_path,
            created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            str(case_id).strip(),
            str(payload.get("invoice_number") or "").strip(),
            _date_string(payload.get("issue_date")) or date.today().isoformat(),
            _date_string(payload.get("due_date")),
            as_float(payload.get("amount")),
            str(payload.get("currency") or "MKD"),
            str(payload.get("status") or "DRAFT"),
            normalize_text(payload.get("client_name")),
            normalize_text(payload.get("client_email")),
            normalize_text(payload.get("client_address")),
            normalize_text(payload.get("service_description")),
            normalize_text(payload.get("items_json")),
            normalize_text(payload.get("file_path")),
            now,
            now,
        ),
    )
    invoice_id = int(cur.lastrowid)
    _apply_invoice_reminder_settings(conn, invoice_id, payload)
    conn.commit()
    return get_invoice_record(conn, invoice_id) or {"invoice_id": invoice_id, "case_id": str(case_id).strip()}


def update_invoice(conn: sqlite3.Connection, invoice_id: int, payload: dict[str, Any]) -> Optional[dict[str, Any]]:
    current = get_invoice_record(conn, invoice_id)
    if current is None:
        return None

    merged = dict(current)
    merged.update({key: value for key, value in payload.items() if value is not None})
    conn.execute(
        """
        UPDATE finance_invoices
        SET invoice_number = ?,
            issue_date = ?,
            due_date = ?,
            amount = ?,
            currency = ?,
            status = ?,
            client_name = ?,
            client_email = ?,
            client_address = ?,
            service_description = ?,
            items_json = ?,
            file_path = ?,
            updated_at = ?
        WHERE invoice_id = ?
        """,
        (
            str(merged.get("invoice_number") or "").strip(),
            _date_string(merged.get("issue_date")) or current.get("issue_date") or date.today().isoformat(),
            _date_string(merged.get("due_date")),
            as_float(merged.get("amount")),
            str(merged.get("currency") or "MKD"),
            str(merged.get("status") or "DRAFT"),
            normalize_text(merged.get("client_name")),
            normalize_text(merged.get("client_email")),
            normalize_text(merged.get("client_address")),
            normalize_text(merged.get("service_description")),
            normalize_text(merged.get("items_json")),
            normalize_text(merged.get("file_path")),
            datetime.now().isoformat(timespec="seconds"),
            int(invoice_id),
        ),
    )
    _apply_invoice_reminder_settings(conn, invoice_id, merged)
    conn.commit()
    return get_invoice_record(conn, invoice_id)


def delete_invoice(conn: sqlite3.Connection, invoice_id: int) -> bool:
    ensure_finance_schema(conn)
    cur = conn.execute("DELETE FROM finance_invoices WHERE invoice_id = ?", (int(invoice_id),))
    conn.commit()
    return cur.rowcount > 0


def send_invoice_email(conn: sqlite3.Connection, invoice_id: int, payload: dict[str, Any]) -> Optional[dict[str, Any]]:
    invoice = get_invoice_record(conn, invoice_id)
    if invoice is None:
        return None

    to_email = normalize_text(payload.get("to_email")) or normalize_text(invoice.get("client_email"))
    if not to_email:
        return {
            "ok": False,
            "invoice_id": int(invoice_id),
            "case_id": invoice.get("case_id"),
            "error": "Recipient email is empty.",
            "dry_run": bool(payload.get("dry_run", True)),
        }

    subject = normalize_text(payload.get("subject")) or _default_invoice_subject(invoice)
    body = payload.get("body") or _default_invoice_body(invoice)
    company = get_company_settings()
    html_content = build_invoice_html(company, invoice)
    pdf_bytes = invoice_html_to_pdf(html_content)
    attachment_filename = None
    if pdf_bytes:
        attachment_filename = f"Invoice_{invoice.get('invoice_number') or invoice_id}.pdf"
    attachment_size_bytes = len(pdf_bytes) if pdf_bytes else None
    dry_run = bool(payload.get("dry_run", True))

    result = {
        "ok": True,
        "dry_run": dry_run,
        "invoice_id": int(invoice_id),
        "case_id": invoice.get("case_id"),
        "to_email": to_email,
        "subject": subject,
        "attachment_filename": attachment_filename,
        "attachment_size_bytes": attachment_size_bytes,
        "pdf_generated": bool(pdf_bytes),
    }
    if dry_run:
        result["message"] = "Dry run only. No email was sent."
        return result

    error = send_email_simple(
        to_email=to_email,
        subject=subject,
        body=str(body),
        attachment_filename=attachment_filename,
        attachment_bytes=pdf_bytes,
    )
    if error:
        result["ok"] = False
        result["error"] = error
        return result

    conn.execute(
        "UPDATE finance_invoices SET status = ?, updated_at = ? WHERE invoice_id = ?",
        ("SENT", datetime.now().isoformat(timespec="seconds"), int(invoice_id)),
    )
    conn.commit()
    log_sent_email(
        conn,
        str(invoice.get("case_id") or "").strip(),
        to_email,
        "invoice",
        subject=subject,
        body_preview=str(body),
        attachment_filename=attachment_filename,
        attachment_size_bytes=attachment_size_bytes,
        invoice_id=int(invoice_id),
    )
    upsert_case_recipient(conn, str(invoice.get("case_id") or "").strip(), to_email)
    result["message"] = "Invoice email sent."
    return result


def send_invoice_reminder(conn: sqlite3.Connection, invoice_id: int, payload: dict[str, Any]) -> Optional[dict[str, Any]]:
    invoice = get_invoice_record(conn, invoice_id)
    if invoice is None:
        return None

    to_email = normalize_text(payload.get("to_email")) or normalize_text(invoice.get("client_email"))
    if not to_email:
        return {
            "ok": False,
            "invoice_id": int(invoice_id),
            "case_id": invoice.get("case_id"),
            "error": "Recipient email is empty.",
            "dry_run": bool(payload.get("dry_run", True)),
        }

    subject = normalize_text(payload.get("subject")) or _default_reminder_subject(invoice)
    body = payload.get("body") or _default_reminder_body(invoice)
    company = get_company_settings()
    html_content = build_invoice_html(company, invoice)
    pdf_bytes = invoice_html_to_pdf(html_content)
    attachment_filename = None
    if pdf_bytes:
        attachment_filename = f"Invoice_{invoice.get('invoice_number') or invoice_id}.pdf"
    attachment_size_bytes = len(pdf_bytes) if pdf_bytes else None
    dry_run = bool(payload.get("dry_run", True))
    reminder_sequence = int(invoice.get("reminder_sent_count") or 0) + 1

    result = {
        "ok": True,
        "dry_run": dry_run,
        "invoice_id": int(invoice_id),
        "case_id": invoice.get("case_id"),
        "to_email": to_email,
        "subject": subject,
        "attachment_filename": attachment_filename,
        "attachment_size_bytes": attachment_size_bytes,
        "pdf_generated": bool(pdf_bytes),
        "reminder_sequence": reminder_sequence,
    }
    if dry_run:
        result["message"] = "Dry run only. No reminder email was sent."
        return result

    error = send_email_simple(
        to_email=to_email,
        subject=subject,
        body=str(body),
        attachment_filename=attachment_filename,
        attachment_bytes=pdf_bytes,
    )
    if error:
        result["ok"] = False
        result["error"] = error
        return result

    now = datetime.now().isoformat(timespec="seconds")
    conn.execute(
        """
        UPDATE finance_invoices
        SET reminder_sent_count = COALESCE(reminder_sent_count, 0) + 1,
            last_reminder_sent_at = ?,
            updated_at = ?
        WHERE invoice_id = ?
        """,
        (now, now, int(invoice_id)),
    )
    conn.commit()
    log_sent_email(
        conn,
        str(invoice.get("case_id") or "").strip(),
        to_email,
        "reminder",
        subject=subject,
        body_preview=str(body),
        attachment_filename=attachment_filename,
        attachment_size_bytes=attachment_size_bytes,
        invoice_id=int(invoice_id),
        reminder_sequence=reminder_sequence,
    )
    upsert_case_recipient(conn, str(invoice.get("case_id") or "").strip(), to_email)
    result["message"] = "Reminder email sent."
    return result


def _payment_row_to_dict(row: Any) -> dict[str, Any]:
    return {
        "payment_id": int(row["payment_id"]),
        "case_id": str(row["case_id"] or "").strip(),
        "payment_date": _date_string(row["payment_date"]),
        "amount": as_float(row["amount"]),
        "currency": str(row["currency"] or "MKD"),
        "note": normalize_text(row["note"]),
        "created_at": isoformat_or_none(row["created_at"]),
        "updated_at": isoformat_or_none(row["updated_at"]),
    }


def _invoice_row_to_dict(row: Any) -> dict[str, Any]:
    return {
        "invoice_id": int(row["invoice_id"]),
        "case_id": str(row["case_id"] or "").strip(),
        "invoice_number": normalize_text(row["invoice_number"]),
        "issue_date": _date_string(row["issue_date"]),
        "due_date": _date_string(row["due_date"]),
        "amount": as_float(row["amount"]),
        "currency": str(row["currency"] or "MKD"),
        "status": normalize_text(row["status"]),
        "client_name": normalize_text(row["client_name"]),
        "client_email": normalize_text(row["client_email"]),
        "client_address": normalize_text(row["client_address"]),
        "service_description": normalize_text(row["service_description"]),
        "items_json": normalize_text(row["items_json"]),
        "file_path": normalize_text(row["file_path"]),
        "reminders_enabled": int(row["reminders_enabled"] or 0),
        "reminder_first_after_days": int(row["reminder_first_after_days"] or 0),
        "reminder_repeat_days": int(row["reminder_repeat_days"] or 0),
        "reminder_max_count": int(row["reminder_max_count"] or 0),
        "reminder_sent_count": int(row["reminder_sent_count"] or 0),
        "last_reminder_sent_at": isoformat_or_none(row["last_reminder_sent_at"]),
        "created_at": isoformat_or_none(row["created_at"]),
        "updated_at": isoformat_or_none(row["updated_at"]),
    }


def _email_log_row_to_dict(row: Any) -> dict[str, Any]:
    invoice_id = row["invoice_id"]
    reminder_sequence = row["reminder_sequence"]
    return {
        "log_id": int(row["log_id"]),
        "case_id": str(row["case_id"] or "").strip(),
        "invoice_id": None if invoice_id is None else int(invoice_id),
        "email_type": normalize_text(row["email_type"]),
        "to_email": normalize_text(row["to_email"]),
        "subject": normalize_text(row["subject"]),
        "body_preview": normalize_text(row["body_preview"]),
        "attachment_filename": normalize_text(row["attachment_filename"]),
        "attachment_size_bytes": None if row["attachment_size_bytes"] is None else int(row["attachment_size_bytes"]),
        "reminder_sequence": None if reminder_sequence is None else int(reminder_sequence),
        "sent_at": isoformat_or_none(row["sent_at"]),
        "created_at": isoformat_or_none(row["created_at"]),
    }


def _apply_invoice_reminder_settings(conn: sqlite3.Connection, invoice_id: int, payload: dict[str, Any]) -> None:
    if not any(key in payload for key in ("reminders_enabled", "reminder_first_after_days", "reminder_repeat_days", "reminder_max_count")):
        return
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
            1 if bool(payload.get("reminders_enabled", False)) else 0,
            int(payload.get("reminder_first_after_days", 3) or 0),
            int(payload.get("reminder_repeat_days", 7) or 0),
            int(payload.get("reminder_max_count", 3) or 0),
            int(invoice_id),
        ),
    )


def _date_string(value: Any) -> Optional[str]:
    parsed = parse_date(value)
    if parsed:
        return parsed.isoformat()
    text = normalize_text(value)
    return text


def _default_invoice_subject(invoice: dict[str, Any]) -> str:
    invoice_label = invoice.get("invoice_number") or invoice.get("invoice_id")
    return f"Invoice {invoice_label} for case {invoice.get('case_id')}"


def _default_invoice_body(invoice: dict[str, Any]) -> str:
    settings = load_finance_settings()
    template = normalize_text(settings.get("invoice_email_body_template"))
    if template:
        return _render_email_template(template, invoice)
    lines = [
        f"Please find attached invoice {invoice.get('invoice_number') or invoice.get('invoice_id')} for case {invoice.get('case_id')}.",
        f"Amount: {as_float(invoice.get('amount')):,.2f} {invoice.get('currency') or 'MKD'}",
    ]
    if invoice.get("issue_date"):
        lines.append(f"Issue date: {invoice.get('issue_date')}")
    if invoice.get("due_date"):
        lines.append(f"Due date: {invoice.get('due_date')}")
    return "\n".join(lines)


def _default_reminder_subject(invoice: dict[str, Any]) -> str:
    settings = load_finance_settings()
    template = normalize_text(settings.get("reminder_email_subject_template"))
    if template:
        return _render_email_template(template, invoice)
    invoice_label = invoice.get("invoice_number") or invoice.get("invoice_id")
    return f"Payment reminder for invoice {invoice_label}"


def _default_reminder_body(invoice: dict[str, Any]) -> str:
    settings = load_finance_settings()
    template = normalize_text(settings.get("reminder_email_body_template"))
    if template:
        return _render_email_template(template, invoice)
    lines = [
        f"Hello {invoice.get('client_name') or ''},".strip(),
        "",
        "This is a reminder that the invoice below is overdue.",
        f"Invoice: {invoice.get('invoice_number') or invoice.get('invoice_id')}",
        f"Case: {invoice.get('case_id')}",
        f"Amount: {as_float(invoice.get('amount')):,.2f} {invoice.get('currency') or 'MKD'}",
    ]
    if invoice.get("due_date"):
        lines.append(f"Due date: {invoice.get('due_date')}")
    lines.extend(
        [
            "",
            "If payment has already been made, please disregard this reminder.",
        ],
    )
    return "\n".join(lines)


def _render_email_template(template: str, invoice: dict[str, Any]) -> str:
    values = {
        "invoice_number": invoice.get("invoice_number") or invoice.get("invoice_id") or "",
        "invoice_id": invoice.get("invoice_id") or "",
        "case_id": invoice.get("case_id") or "",
        "amount": f"{as_float(invoice.get('amount')):,.2f}",
        "currency": invoice.get("currency") or "MKD",
        "due_date": invoice.get("due_date") or "",
        "issue_date": invoice.get("issue_date") or "",
        "client_name": invoice.get("client_name") or "",
        "client_email": invoice.get("client_email") or "",
        "service_description": invoice.get("service_description") or "",
    }
    try:
        return template.format(**values)
    except KeyError:
        return template
