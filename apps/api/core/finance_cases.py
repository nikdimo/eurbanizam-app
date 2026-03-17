from __future__ import annotations

import sqlite3
from datetime import date, datetime
from typing import Any, Optional

import pandas as pd

from . import cases as cases_core
from .common import as_float, build_search_mask, first_existing, get_table_columns, normalize_text, parse_date, rebuild_search_cache
from .finance_invoices import (
    ensure_finance_schema,
    get_case_recipients,
    get_invoice_sum_for_case,
    get_paid_invoice_sum_for_case,
    get_payment_sum_for_case,
    list_email_log,
    list_invoices,
    list_payments,
    load_invoices_df,
    load_payments_df,
)


FINANCE_SNAPSHOT_COLUMNS = [
    "finance_contract_sum",
    "finance_currency",
    "finance_paid_total",
    "finance_remaining",
    "finance_overdue_amount",
    "finance_last_payment_date",
    "finance_payments_count",
    "finance_service_type",
    "finance_notes",
    "finance_unallocated_cash",
]


def load_finance_df(conn: sqlite3.Connection) -> pd.DataFrame:
    ensure_finance_schema(conn)
    query = """
        SELECT
            case_id,
            client_name,
            client_phone,
            service_type,
            contract_sum,
            currency,
            paid_amount,
            notes,
            created_at,
            updated_at
        FROM finance_cases
        ORDER BY updated_at DESC, case_id DESC
    """
    return pd.read_sql_query(query, conn)


def apply_payment_totals(finance_df: pd.DataFrame, payments_df: pd.DataFrame) -> pd.DataFrame:
    if finance_df.empty:
        return finance_df.copy()

    out = finance_df.copy()
    out["paid_amount"] = pd.to_numeric(
        out.get("paid_amount", pd.Series(0.0, index=out.index)),
        errors="coerce",
    ).fillna(0.0)
    if payments_df.empty:
        out["payments_count"] = 0
        out["events_paid"] = 0.0
        return out

    pay = payments_df.copy()
    pay["amount"] = pd.to_numeric(pay.get("amount"), errors="coerce").fillna(0.0)
    agg = pay.groupby("case_id", as_index=False).agg(events_paid=("amount", "sum"), payments_count=("amount", "size"))
    out = out.merge(agg, on="case_id", how="left")
    out["events_paid"] = pd.to_numeric(out.get("events_paid"), errors="coerce").fillna(0.0)
    out["payments_count"] = pd.to_numeric(out.get("payments_count"), errors="coerce").fillna(0).astype(int)
    out["paid_amount"] = out.apply(
        lambda row: float(row.get("events_paid", 0.0)) if int(row.get("payments_count", 0)) > 0 else float(row.get("paid_amount", 0.0)),
        axis=1,
    )
    return out


def with_calculated_fields(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df.copy()

    out = df.copy()
    out["contract_sum"] = pd.to_numeric(
        out.get("contract_sum", pd.Series(0.0, index=out.index)),
        errors="coerce",
    ).fillna(0.0)
    out["paid_amount"] = pd.to_numeric(
        out.get("paid_amount", pd.Series(0.0, index=out.index)),
        errors="coerce",
    ).fillna(0.0)
    out["remaining"] = (out["contract_sum"] - out["paid_amount"]).clip(lower=0.0)
    out["days_overdue"] = 0
    return out


def priority_label(days_overdue: int, remaining: float) -> str:
    if days_overdue >= 7 or (days_overdue > 0 and remaining >= 50000):
        return "HIGH"
    if days_overdue > 0 or remaining >= 20000:
        return "MED"
    return "LOW"


def ensure_finance_case_exists(conn: sqlite3.Connection, case_id: str, seed: dict[str, object]) -> None:
    ensure_finance_schema(conn)
    cid = (case_id or "").strip()
    if not cid:
        return
    now = datetime.now().isoformat(timespec="seconds")
    conn.execute(
        """
        INSERT INTO finance_cases (
            case_id, client_name, client_phone, service_type,
            contract_sum, currency, paid_amount,
            notes, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(case_id) DO NOTHING
        """,
        (
            cid,
            seed.get("client_name"),
            seed.get("client_phone"),
            seed.get("service_type"),
            as_float(seed.get("contract_sum")),
            str(seed.get("currency") or "MKD"),
            as_float(seed.get("paid_amount")),
            seed.get("notes"),
            now,
            now,
        ),
    )
    conn.commit()


def upsert_finance_row(conn: sqlite3.Connection, data: dict[str, object]) -> None:
    ensure_finance_schema(conn)
    now = datetime.now().isoformat(timespec="seconds")
    client_phone = normalize_text(data.get("client_phone"))
    conn.execute(
        """
        INSERT INTO finance_cases (
            case_id, client_name, client_phone, service_type,
            contract_sum, currency, paid_amount,
            notes, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(case_id) DO UPDATE SET
            client_name=excluded.client_name,
            client_phone=excluded.client_phone,
            service_type=excluded.service_type,
            contract_sum=excluded.contract_sum,
            currency=excluded.currency,
            paid_amount=excluded.paid_amount,
            notes=excluded.notes,
            updated_at=excluded.updated_at
        """,
        (
            str(data["case_id"]),
            normalize_text(data.get("client_name")),
            client_phone,
            normalize_text(data.get("service_type")),
            as_float(data.get("contract_sum")),
            str(data.get("currency") or "MKD"),
            as_float(data.get("paid_amount")),
            normalize_text(data.get("notes")),
            now,
            now,
        ),
    )
    conn.commit()


def sync_case_contact_from_finance(
    conn: sqlite3.Connection,
    case_id: str,
    client_name: Optional[str],
    client_phone: Optional[str],
    case_key_col: str,
    field_key_col: str,
    field_value_col: str,
) -> None:
    user_cols = get_table_columns(conn, "case_user_data")
    if not user_cols or {case_key_col, field_key_col, field_value_col} - user_cols:
        return

    rows: list[tuple[str, str, Optional[str]]] = []
    phone_norm = normalize_text(client_phone)
    name_norm = normalize_text(client_name)
    if phone_norm is not None:
        rows.append((str(case_id), "Phone", phone_norm))
    if name_norm is not None:
        rows.append((str(case_id), "Client", name_norm))
    if not rows:
        return

    try:
        sql = f"""
            INSERT INTO case_user_data ({case_key_col}, {field_key_col}, {field_value_col})
            VALUES (?, ?, ?)
            ON CONFLICT({case_key_col}, {field_key_col}) DO UPDATE SET {field_value_col}=excluded.{field_value_col}
        """
        conn.executemany(sql, rows)
        conn.commit()
    except sqlite3.OperationalError:
        conn.rollback()


def sync_custom_fields_to_case_user_data(
    conn: sqlite3.Connection,
    case_id: str,
    field_updates: dict[str, Optional[str]],
    case_key_col: str,
    field_key_col: str,
    field_value_col: str,
) -> None:
    if not field_updates:
        return
    user_cols = get_table_columns(conn, "case_user_data")
    if not user_cols or {case_key_col, field_key_col, field_value_col} - user_cols:
        return
    try:
        sql = f"""
            INSERT INTO case_user_data ({case_key_col}, {field_key_col}, {field_value_col})
            VALUES (?, ?, ?)
            ON CONFLICT({case_key_col}, {field_key_col}) DO UPDATE SET {field_value_col}=excluded.{field_value_col}
        """
        rows = []
        for field_key, value in field_updates.items():
            if not (field_key and str(field_key).strip()):
                continue
            rows.append((str(case_id), str(field_key).strip(), normalize_text(value)))
        if rows:
            conn.executemany(sql, rows)
            conn.commit()
    except sqlite3.OperationalError:
        conn.rollback()


def delete_finance_row(conn: sqlite3.Connection, case_id: str) -> bool:
    ensure_finance_schema(conn)
    result = conn.execute("DELETE FROM finance_cases WHERE case_id = ?", (case_id,))
    conn.commit()
    return result.rowcount > 0


def build_finance_case_aggregates(conn: sqlite3.Connection) -> pd.DataFrame:
    ensure_finance_schema(conn)

    try:
        finance_df = load_finance_df(conn)
    except Exception:
        finance_df = pd.DataFrame()
    try:
        payments_df = load_payments_df(conn)
    except Exception:
        payments_df = pd.DataFrame()
    try:
        invoices_df = load_invoices_df(conn)
    except Exception:
        invoices_df = pd.DataFrame()

    case_ids: set[str] = set()
    for frame in (finance_df, payments_df, invoices_df):
        if not frame.empty and "case_id" in frame.columns:
            case_ids.update(frame["case_id"].fillna("").astype(str).tolist())
    case_ids = {case_id for case_id in case_ids if case_id}

    if not case_ids:
        return pd.DataFrame(
            columns=[
                "case_id",
                "client_name",
                "client_phone",
                "service_type",
                "contract_sum",
                "currency",
                "paid_amount",
                "notes",
                "created_at",
                "updated_at",
                "events_paid_total",
                "payments_count",
                "last_payment_date",
                "invoice_total",
                "paid_invoice_total",
                "overdue_invoice_count",
                "overdue_invoice_amount",
                "paid_total",
                "remaining",
                "overdue_amount",
            ]
        )

    out = pd.DataFrame({"case_id": sorted(case_ids)})
    if not finance_df.empty:
        out = out.merge(finance_df, on="case_id", how="left")

    if not payments_df.empty:
        pay = payments_df.copy()
        pay["case_id"] = pay["case_id"].fillna("").astype(str)
        pay["amount"] = pd.to_numeric(pay.get("amount"), errors="coerce").fillna(0.0)
        pay["payment_date"] = pd.to_datetime(pay.get("payment_date"), errors="coerce")
        pay_agg = pay.groupby("case_id", as_index=False).agg(
            events_paid_total=("amount", "sum"),
            payments_count=("amount", "size"),
            last_payment_date=("payment_date", "max"),
        )
        out = out.merge(pay_agg, on="case_id", how="left")
    else:
        out["events_paid_total"] = 0.0
        out["payments_count"] = 0
        out["last_payment_date"] = pd.NaT

    if not invoices_df.empty:
        inv = invoices_df.copy()
        inv["case_id"] = inv["case_id"].fillna("").astype(str)
        inv["amount"] = pd.to_numeric(inv.get("amount"), errors="coerce").fillna(0.0)
        inv["status_norm"] = inv.get("status", "").fillna("").astype(str).str.upper()
        inv["due_date_dt"] = pd.to_datetime(inv.get("due_date"), errors="coerce")
        today = pd.Timestamp(date.today())
        overdue_mask = (
            inv["due_date_dt"].notna()
            & (inv["due_date_dt"].dt.normalize() < today)
            & ~inv["status_norm"].isin(["PAID", "CANCELLED"])
        )
        inv["paid_invoice_total"] = inv["amount"].where(inv["status_norm"] == "PAID", 0.0)
        inv["overdue_invoice_count"] = overdue_mask.astype(int)
        inv["overdue_invoice_amount"] = inv["amount"].where(overdue_mask, 0.0)
        inv_agg = inv.groupby("case_id", as_index=False).agg(
            invoice_total=("amount", "sum"),
            paid_invoice_total=("paid_invoice_total", "sum"),
            overdue_invoice_count=("overdue_invoice_count", "sum"),
            overdue_invoice_amount=("overdue_invoice_amount", "sum"),
        )
        out = out.merge(inv_agg, on="case_id", how="left")
    else:
        out["invoice_total"] = 0.0
        out["paid_invoice_total"] = 0.0
        out["overdue_invoice_count"] = 0
        out["overdue_invoice_amount"] = 0.0

    out["contract_sum"] = pd.to_numeric(
        out.get("contract_sum", pd.Series(0.0, index=out.index)),
        errors="coerce",
    ).fillna(0.0)
    out["paid_amount"] = pd.to_numeric(
        out.get("paid_amount", pd.Series(0.0, index=out.index)),
        errors="coerce",
    ).fillna(0.0)
    out["events_paid_total"] = pd.to_numeric(
        out.get("events_paid_total", pd.Series(0.0, index=out.index)),
        errors="coerce",
    ).fillna(0.0)
    out["payments_count"] = pd.to_numeric(
        out.get("payments_count", pd.Series(0.0, index=out.index)),
        errors="coerce",
    ).fillna(0).astype(int)
    out["paid_invoice_total"] = pd.to_numeric(
        out.get("paid_invoice_total", pd.Series(0.0, index=out.index)),
        errors="coerce",
    ).fillna(0.0)
    out["invoice_total"] = pd.to_numeric(
        out.get("invoice_total", pd.Series(0.0, index=out.index)),
        errors="coerce",
    ).fillna(0.0)
    out["overdue_invoice_count"] = pd.to_numeric(
        out.get("overdue_invoice_count", pd.Series(0, index=out.index)),
        errors="coerce",
    ).fillna(0).astype(int)
    out["overdue_invoice_amount"] = pd.to_numeric(
        out.get("overdue_invoice_amount", pd.Series(0.0, index=out.index)),
        errors="coerce",
    ).fillna(0.0)

    out["paid_total"] = out.apply(
        lambda row: (float(row.get("events_paid_total", 0.0)) if int(row.get("payments_count", 0)) > 0 else float(row.get("paid_amount", 0.0)))
        + float(row.get("paid_invoice_total", 0.0)),
        axis=1,
    )
    out["remaining"] = (out["contract_sum"] - out["paid_total"]).clip(lower=0.0)
    out["overdue_amount"] = pd.to_numeric(
        out.get("overdue_invoice_amount", pd.Series(0.0, index=out.index)),
        errors="coerce",
    ).fillna(0.0)

    for column in ["currency", "service_type", "notes"]:
        series = out.get(column)
        if isinstance(series, pd.Series):
            out[column] = series.fillna("").astype(str)
        else:
            out[column] = pd.Series(
                [str(series) if series is not None else ""] * len(out),
                index=out.index,
            )

    return out


def load_finance_snapshot(conn: sqlite3.Connection) -> pd.DataFrame:
    aggregates = build_finance_case_aggregates(conn)
    if aggregates.empty:
        return pd.DataFrame(columns=["case_id"] + FINANCE_SNAPSHOT_COLUMNS)

    out = pd.DataFrame({"case_id": aggregates["case_id"].astype(str)})
    out["finance_contract_sum"] = aggregates["contract_sum"]
    out["finance_currency"] = aggregates["currency"].fillna("").astype(str)
    out["finance_paid_total"] = aggregates["paid_total"]
    out["finance_remaining"] = aggregates["remaining"]
    out["finance_overdue_amount"] = aggregates["overdue_amount"]
    out["finance_last_payment_date"] = pd.to_datetime(aggregates.get("last_payment_date"), errors="coerce")
    out["finance_payments_count"] = aggregates["payments_count"]
    out["finance_service_type"] = aggregates["service_type"].fillna("").astype(str)
    out["finance_notes"] = aggregates["notes"].fillna("").astype(str)
    out["finance_unallocated_cash"] = 0.0
    return out[["case_id"] + FINANCE_SNAPSHOT_COLUMNS]


def merge_finance_into_cases(df_cases: pd.DataFrame, conn: sqlite3.Connection) -> pd.DataFrame:
    out = df_cases.copy()
    finance_df = load_finance_snapshot(conn)
    if not finance_df.empty:
        out = out.merge(finance_df, on="case_id", how="left")

    for column in FINANCE_SNAPSHOT_COLUMNS:
        if column not in out.columns:
            out[column] = None

    for column in [
        "finance_contract_sum",
        "finance_paid_total",
        "finance_remaining",
        "finance_overdue_amount",
        "finance_payments_count",
        "finance_unallocated_cash",
    ]:
        out[column] = pd.to_numeric(
            out.get(column, pd.Series(0.0, index=out.index)),
            errors="coerce",
        ).fillna(0.0)

    out["finance_last_payment_date"] = pd.to_datetime(out.get("finance_last_payment_date"), errors="coerce")
    out["finance_currency"] = out.get("finance_currency", "").fillna("").astype(str)
    out["finance_service_type"] = out.get("finance_service_type", "").fillna("").astype(str)
    out["finance_notes"] = out.get("finance_notes", "").fillna("").astype(str)
    return rebuild_search_cache(out, focus_columns=("title", "name_blob", "finance_notes"))


def build_finance_workspace_dataframe(
    conn: sqlite3.Connection,
    recent_days: int = 7,
    late_days_threshold: int = 20,
) -> pd.DataFrame:
    cases_df = cases_core.prepare_cases_dataframe(conn, recent_days=recent_days, late_days_threshold=late_days_threshold)
    return merge_finance_into_cases(cases_df, conn)


def summarize_dashboard(conn: sqlite3.Connection) -> dict[str, Any]:
    aggregates = build_finance_case_aggregates(conn)
    if aggregates.empty:
        return {
            "contract_total": 0.0,
            "paid_total": 0.0,
            "outstanding_total": 0.0,
            "overdue_invoices": 0,
            "needs_action_count": 0,
        }

    needs_action_mask = (aggregates["remaining"] > 0) & (aggregates["overdue_amount"] > 0)
    return {
        "contract_total": float(aggregates["contract_sum"].sum()),
        "paid_total": float(aggregates["paid_total"].sum()),
        "outstanding_total": float(aggregates["remaining"].sum()),
        "overdue_invoices": int(aggregates["overdue_invoice_count"].sum()),
        "needs_action_count": int(needs_action_mask.sum()),
    }


def list_finance_case_summaries(
    conn: sqlite3.Connection,
    search: Optional[str] = None,
    request_types: Optional[list[str]] = None,
    statuses: Optional[list[str]] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    overdue_only: bool = False,
    needs_action_only: bool = False,
    custom_field_names: Optional[list[str]] = None,
    limit: Optional[int] = None,
    offset: int = 0,
    sort_by: Optional[str] = None,
    sort_desc: bool = True,
) -> tuple[list[dict[str, Any]], int]:
    df = build_finance_workspace_dataframe(conn)
    if df.empty:
        return [], 0

    mask = pd.Series([True] * len(df), index=df.index)
    start_date = pd.to_datetime(date_from, errors="coerce").date() if date_from else None
    end_date = pd.to_datetime(date_to, errors="coerce").date() if date_to else None
    if start_date and end_date and "updated_date" in df.columns:
        mask &= (df["updated_date"] >= start_date) & (df["updated_date"] <= end_date)

    if request_types:
        mask &= df["request_type"].isin(request_types)

    if statuses:
        case_status = df["status"].fillna("").astype(str)
        if "(Empty)" in statuses:
            non_empty = [status for status in statuses if status != "(Empty)"]
            case_mask = case_status.isin(non_empty) | ~case_status.str.strip().astype(bool)
        else:
            case_mask = case_status.isin(statuses)
        mask &= case_mask

    if overdue_only:
        mask &= pd.to_numeric(df.get("finance_overdue_amount"), errors="coerce").fillna(0.0) > 0

    if needs_action_only:
        mask &= (pd.to_numeric(df.get("finance_remaining"), errors="coerce").fillna(0.0) > 0) & (pd.to_numeric(df.get("finance_overdue_amount"), errors="coerce").fillna(0.0) > 0)

    if search:
        mask &= build_search_mask(df, search)

    filtered = df.loc[mask].copy()
    if filtered.empty:
        return [], 0

    total = len(filtered)

    custom_field_map = cases_core.load_case_custom_fields_map(
        conn,
        filtered.get("case_id", pd.Series(dtype="object")).tolist(),
        custom_field_names or [],
    )
    if sort_by and sort_by in filtered.columns:
        filtered = filtered.sort_values(
            [sort_by, "case_id"],
            ascending=[not sort_desc, not sort_desc],
            na_position="last",
        )
    else:
        filtered = filtered.sort_values(
            ["finance_overdue_amount", "finance_remaining", "updated_at"],
            ascending=[False, False, False],
            na_position="last",
        )
    if offset > 0:
        filtered = filtered.iloc[offset:]
    if limit is not None:
        filtered = filtered.iloc[:limit]

    out: list[dict[str, Any]] = []
    for _, row in filtered.iterrows():
        out.append(
            {
                "case_id": str(row.get("case_id") or "").strip(),
                "title": normalize_text(row.get("title")),
                "status": normalize_text(row.get("status")),
                "request_type": normalize_text(row.get("request_type")),
                "created_at": cases_core.isoformat_or_none(row.get("created_at")),
                "updated_at": cases_core.isoformat_or_none(row.get("updated_at")),
                "first_seen": normalize_text(row.get("First Seen")),
                "days_since_update": None if pd.isna(row.get("Denovi (Od Posledna)")) else int(row.get("Denovi (Od Posledna)")),
                "phone": normalize_text(row.get("phone")),
                "contract_sum": as_float(row.get("finance_contract_sum")),
                "contract_amount": as_float(row.get("finance_contract_sum")),
                "paid_total": as_float(row.get("finance_paid_total")),
                "remaining": as_float(row.get("finance_remaining")),
                "payments_count": int(as_float(row.get("finance_payments_count"))),
                "overdue_amount": as_float(row.get("finance_overdue_amount")),
                "currency": normalize_text(row.get("finance_currency")),
                "service_type": normalize_text(row.get("finance_service_type")),
                "custom_fields": custom_field_map.get(
                    str(row.get("case_id") or "").strip(),
                    {},
                ),
            }
        )
    return out, total


def get_finance_filter_options(conn: sqlite3.Connection) -> dict[str, Any]:
    return cases_core.get_case_filter_options(conn)


def get_finance_case_detail_dict(
    conn: sqlite3.Connection,
    case_id: str,
    custom_field_names: Optional[list[str]] = None,
) -> Optional[dict[str, Any]]:
    cid = str(case_id or "").strip()
    if not cid:
        return None

    aggregates = build_finance_case_aggregates(conn)
    aggregate_row = {}
    if not aggregates.empty:
        match = aggregates[aggregates["case_id"].astype(str) == cid]
        if not match.empty:
            aggregate_row = match.iloc[0].to_dict()

    finance_row = _load_finance_row(conn, cid)

    case_detail = cases_core.get_case_detail_dict(
        conn,
        cid,
        custom_field_names=custom_field_names,
    )
    meta = case_detail or {}
    phone = case_detail.get("phone") if case_detail else cases_core.load_case_phone_map(conn, [cid]).get(cid)
    custom_fields = case_detail.get("custom_fields", {}) if case_detail else {}
    payments = list_payments(conn, cid)
    invoices = list_invoices(conn, cid)
    email_log = list_email_log(conn, cid, None)
    recipients = get_case_recipients(conn, cid)
    if not (meta or finance_row or aggregate_row or payments or invoices or email_log):
        return None

    contract_sum = as_float(finance_row.get("contract_sum", aggregate_row.get("contract_sum", 0.0)))
    payment_sum = get_payment_sum_for_case(conn, cid)
    paid_invoice_sum = get_paid_invoice_sum_for_case(conn, cid)
    paid_total = payment_sum + paid_invoice_sum
    if paid_total == 0.0:
        paid_total = as_float(aggregate_row.get("paid_total", finance_row.get("paid_amount", 0.0)))
    remaining = max(0.0, contract_sum - paid_total)
    if not contract_sum and aggregate_row:
        contract_sum = as_float(aggregate_row.get("contract_sum"))
        remaining = as_float(aggregate_row.get("remaining"))

    shared_name = normalize_text(custom_fields.get("Name / Last name")) or normalize_text(
        finance_row.get("client_name")
    )
    shared_phone = normalize_text(phone) or normalize_text(finance_row.get("client_phone"))

    return {
        "case_id": cid,
        "title": normalize_text(meta.get("title")),
        "status": normalize_text(meta.get("status")),
        "request_type": normalize_text(meta.get("request_type")),
        "created_at": normalize_text(meta.get("created_at")),
        "updated_at": normalize_text(meta.get("updated_at", finance_row.get("updated_at"))),
        "first_seen": normalize_text(meta.get("first_seen")),
        "days_since_update": meta.get("days_since_update"),
        "phone": shared_phone,
        "client_name": shared_name,
        "client_phone": shared_phone,
        "service_type": normalize_text(finance_row.get("service_type")),
        "contract_sum": contract_sum,
        "contract_amount": contract_sum,
        "currency": normalize_text(finance_row.get("currency")) or "MKD",
        "paid_total": paid_total,
        "remaining": remaining,
        "notes": normalize_text(finance_row.get("notes")),
        "invoiced_total": get_invoice_sum_for_case(conn, cid),
        "payments_count": len(payments),
        "overdue_amount": as_float(aggregate_row.get("overdue_amount")),
        "custom_fields": custom_fields,
        "payments": payments,
        "invoices": invoices,
        "email_log": email_log,
        "recipients": recipients,
    }


def upsert_finance_profile(conn: sqlite3.Connection, case_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    cid = str(case_id or "").strip()
    existing = _load_finance_row(conn, cid)
    data = {
        "case_id": cid,
        "client_name": payload.get("client_name", existing.get("client_name")),
        "client_phone": payload.get("client_phone", existing.get("client_phone")),
        "service_type": payload.get("service_type", existing.get("service_type")),
        "contract_sum": as_float(payload.get("contract_sum", existing.get("contract_sum"))),
        "currency": payload.get("currency", existing.get("currency")) or "MKD",
        "paid_amount": as_float(payload.get("paid_amount", existing.get("paid_amount"))),
        "notes": payload.get("notes", existing.get("notes")),
    }
    upsert_finance_row(conn, data)
    case_updates: dict[str, Any] = {}
    if "client_phone" in payload:
        case_updates["phone"] = payload.get("client_phone")
    if "client_name" in payload:
        case_updates["custom_fields"] = {
            "Name / Last name": payload.get("client_name"),
        }
    if case_updates:
        cases_core.update_case_record(conn, cid, case_updates)
    return get_finance_case_detail_dict(conn, cid) or {"case_id": cid}


def _load_distinct_finance_values(
    conn: sqlite3.Connection,
    column: str,
) -> list[str]:
    ensure_finance_schema(conn)
    sql = f"""
        SELECT DISTINCT TRIM(COALESCE({column}, '')) AS value
        FROM finance_cases
        WHERE TRIM(COALESCE({column}, '')) <> ''
        ORDER BY value
    """
    try:
        rows = conn.execute(sql).fetchall()
    except sqlite3.Error:
        return []
    return [str(row["value"]).strip() for row in rows if str(row["value"]).strip()]


def _load_finance_row(conn: sqlite3.Connection, case_id: str) -> dict[str, Any]:
    ensure_finance_schema(conn)
    try:
        row = conn.execute(
            """
            SELECT
                case_id,
                client_name,
                client_phone,
                service_type,
                contract_sum,
                currency,
                paid_amount,
                notes,
                created_at,
                updated_at
            FROM finance_cases
            WHERE case_id = ?
            LIMIT 1
            """,
            (case_id,),
        ).fetchone()
    except sqlite3.Error:
        return {}
    return dict(row) if row else {}
