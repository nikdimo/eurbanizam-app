from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta
from typing import Any, Iterable, Optional

import pandas as pd

from . import case_documents
from .common import (
    build_search_mask,
    first_existing,
    get_table_columns,
    isoformat_or_none,
    normalize_text,
    rebuild_search_cache,
)


def pick_column(cases_cols: Iterable[str], candidates: Iterable[str]) -> Optional[str]:
    case_columns = set(cases_cols)
    for candidate in candidates:
        if candidate in case_columns:
            return candidate
    return None


def load_cases(conn: sqlite3.Connection, case_key_col: str, cases_cols: Iterable[str]) -> pd.DataFrame:
    case_columns = set(cases_cols)
    col_map = {
        "request_type": pick_column(case_columns, ("latest_request_type", "request_type")),
        "title": pick_column(case_columns, ("latest_title", "title")),
        "status": pick_column(case_columns, ("latest_list_state", "status")),
        "created_at": pick_column(case_columns, ("official_created_at", "created_at", "first_seen_at")),
        "updated_at": pick_column(case_columns, ("latest_movement_last_change_dt", "updated_at")),
        "prev_change_at": pick_column(case_columns, ("latest_movement_prev_change_dt", "prev_change_at")),
        "first_seen_at": pick_column(case_columns, ("first_seen_at",)),
        "first_seen_source": pick_column(case_columns, ("first_seen_source",)),
        "phone": pick_column(case_columns, ("phone",)),
    }

    select_cols = [f'"{case_key_col}" AS case_id']
    for alias, column in col_map.items():
        if column:
            select_cols.append(f'"{column}" AS {alias}')

    query = f"SELECT {', '.join(select_cols)} FROM cases"
    return pd.read_sql_query(query, conn)


def load_custom_fields(
    conn: sqlite3.Connection,
    table_name: str,
    case_key_col: str,
    field_key_col: str,
    field_value_col: str,
    field_keys: list[str],
) -> pd.DataFrame:
    if not field_keys:
        return pd.DataFrame(columns=[case_key_col])
    placeholders = ",".join(["?"] * len(field_keys))
    query = (
        f'SELECT "{case_key_col}", "{field_key_col}", "{field_value_col}" '
        f"FROM {table_name} WHERE {field_key_col} IN ({placeholders})"
    )
    df = pd.read_sql_query(query, conn, params=field_keys)
    if df.empty:
        return pd.DataFrame(columns=[case_key_col])
    df[field_key_col] = df[field_key_col].astype(str).str.strip()
    return (
        df.pivot_table(
            index=case_key_col,
            columns=field_key_col,
            values=field_value_col,
            aggfunc="last",
        )
        .reset_index()
    )


def load_user_search_map(conn: sqlite3.Connection) -> pd.DataFrame:
    user_cols = get_table_columns(conn, "case_user_data")
    case_col = first_existing(user_cols, ("case_id", "case_number"))
    key_col = first_existing(user_cols, ("field_key", "key"))
    value_col = first_existing(user_cols, ("field_value", "value", "field_text"))
    if not case_col or not key_col or not value_col:
        return pd.DataFrame(columns=["case_id", "user_blob", "name_blob"])

    query = f"SELECT {case_col} AS case_id, {key_col} AS field_key, {value_col} AS field_value FROM case_user_data"
    df = pd.read_sql_query(query, conn)
    if df.empty:
        return pd.DataFrame(columns=["case_id", "user_blob", "name_blob"])

    df["case_id"] = df["case_id"].astype(str)
    df["field_key"] = df["field_key"].fillna("").astype(str)
    df["field_value"] = df["field_value"].fillna("").astype(str)
    df["pair"] = (df["field_key"] + " " + df["field_value"]).str.strip()
    user_blob = df.groupby("case_id")["pair"].apply(lambda series: " ".join([value for value in series if value])).reset_index()
    user_blob = user_blob.rename(columns={"pair": "user_blob"})

    key_lower = df["field_key"].str.lower().str.strip()
    name_mask = (
        key_lower.str.contains("name", regex=False)
        | key_lower.str.contains("last name", regex=False)
        | key_lower.str.contains("surname", regex=False)
        | key_lower.str.contains("ime", regex=False)
        | key_lower.str.contains("\u043f\u0440\u0435\u0437\u0438\u043c\u0435", regex=False)
        | key_lower.str.contains("\u0438\u043c\u0435", regex=False)
    )
    df_name = df[name_mask].copy()
    if not df_name.empty:
        name_blob = df_name.groupby("case_id")["field_value"].apply(lambda series: " ".join([value for value in series if value])).reset_index()
        name_blob = name_blob.rename(columns={"field_value": "name_blob"})
    else:
        name_blob = pd.DataFrame(columns=["case_id", "name_blob"])

    return user_blob.merge(name_blob, on="case_id", how="left").fillna({"user_blob": "", "name_blob": ""})


def prepare_cases_dataframe(
    conn: sqlite3.Connection,
    recent_days: int = 7,
    late_days_threshold: int = 20,
) -> pd.DataFrame:
    cases_cols = get_table_columns(conn, "cases")
    case_key_col = first_existing(cases_cols, ("case_id",))
    if not case_key_col:
        return pd.DataFrame(columns=["case_id", "status", "title", "request_type", "created_at", "updated_at"])

    df = load_cases(conn, case_key_col, cases_cols).copy()
    now_dt = datetime.now()

    created_raw = df["created_at"] if "created_at" in df.columns else pd.Series([pd.NaT] * len(df), index=df.index)
    updated_raw = df["updated_at"] if "updated_at" in df.columns else pd.Series([pd.NaT] * len(df), index=df.index)

    created_series = pd.to_datetime(created_raw, errors="coerce")
    updated_series = pd.to_datetime(updated_raw, errors="coerce")

    df["created_at"] = created_series
    df["updated_at"] = updated_series
    df["updated_date"] = updated_series.dt.date
    df["Denovi (Od Posledna)"] = (now_dt - updated_series).dt.days
    df["_late_case"] = df["Denovi (Od Posledna)"].fillna(10**9) >= late_days_threshold
    df["_created_recent"] = created_series.notna() & (created_series >= (now_dt - timedelta(days=recent_days)))
    df["_updated_recent"] = updated_series.notna() & (updated_series >= (now_dt - timedelta(days=recent_days)))

    first_seen_raw = df.get(
        "first_seen_at",
        pd.Series([pd.NaT] * len(df), index=df.index),
    )
    first_seen_dt = pd.to_datetime(first_seen_raw, errors="coerce")
    date_str = first_seen_dt.dt.strftime("%Y-%m-%d").fillna("")
    src = df.get("first_seen_source", pd.Series([""] * len(df), index=df.index)).fillna("").astype(str).str.strip()
    src_map = {
        "scheduled_sync": "Scheduled",
        "manual_sync": "Manual",
        "full_scrape": "Full scrape",
    }
    src_label = src.map(src_map).fillna(src).fillna("")
    both_mask = (date_str != "") & (src_label != "")
    first_seen = pd.Series("", index=df.index, dtype="object")
    first_seen[both_mask] = date_str[both_mask] + " ? " + src_label[both_mask]
    first_seen[~both_mask] = date_str.where(date_str != "", src_label)
    df["First Seen"] = first_seen

    user_map = load_user_search_map(conn)
    if not user_map.empty:
        df = df.merge(user_map, on="case_id", how="left")
    else:
        df["user_blob"] = ""
        df["name_blob"] = ""

    phone_map = load_case_phone_map(conn, df.get("case_id", pd.Series(dtype="object")).tolist())
    if phone_map:
        phone_series = df["case_id"].astype(str).map(phone_map)
        if "phone" not in df.columns:
            df["phone"] = phone_series
        else:
            df["phone"] = df["phone"].where(df["phone"].notna() & df["phone"].astype(str).str.strip().ne(""), phone_series)

    return rebuild_search_cache(df, focus_columns=("title", "name_blob"))


def apply_case_filters(
    df: pd.DataFrame,
    search: Optional[str] = None,
    request_types: Optional[list[str]] = None,
    statuses: Optional[list[str]] = None,
    date_from: Optional[Any] = None,
    date_to: Optional[Any] = None,
) -> pd.DataFrame:
    if df.empty:
        return df.copy()

    mask = pd.Series([True] * len(df), index=df.index)

    start_date = pd.to_datetime(date_from, errors="coerce").date() if date_from else None
    end_date = pd.to_datetime(date_to, errors="coerce").date() if date_to else None
    if start_date and end_date and "updated_date" in df.columns:
        mask &= (df["updated_date"] >= start_date) & (df["updated_date"] <= end_date)

    if request_types:
        mask &= df["request_type"].isin(request_types)

    if statuses:
        status_series = df["status"].fillna("").astype(str)
        if "(Empty)" in statuses:
            non_empty = [status for status in statuses if status != "(Empty)"]
            mask &= status_series.isin(non_empty) | ~status_series.str.strip().astype(bool)
        else:
            mask &= status_series.isin(statuses)

    if search:
        mask &= build_search_mask(df, search)

    return df.loc[mask].copy()


def load_case_custom_fields(conn: sqlite3.Connection, case_id: str) -> dict[str, Optional[str]]:
    user_cols = get_table_columns(conn, "case_user_data")
    case_col = first_existing(user_cols, ("case_id", "case_number"))
    key_col = first_existing(user_cols, ("field_key", "key"))
    value_col = first_existing(user_cols, ("field_value", "value", "field_text"))
    if not case_col or not key_col or not value_col:
        return {}

    query = f"""
        SELECT {key_col} AS field_key, {value_col} AS field_value
        FROM case_user_data
        WHERE {case_col} = ?
        ORDER BY rowid DESC
    """
    try:
        cursor = conn.execute(query, (str(case_id).strip(),))
        columns = [entry[0] for entry in (cursor.description or [])]
        rows = cursor.fetchall()
    except sqlite3.Error:
        return {}

    out: dict[str, Optional[str]] = {}
    for raw_row in rows:
        row = _row_to_mapping(raw_row, columns)
        key = str(row.get("field_key") or "").strip()
        if not key or key in out:
            continue
        out[key] = normalize_text(row.get("field_value"))
    return out


def load_case_custom_fields_map(
    conn: sqlite3.Connection,
    case_ids: Iterable[str],
    field_keys: list[str],
) -> dict[str, dict[str, Optional[str]]]:
    normalized_case_ids = [str(case_id).strip() for case_id in case_ids if str(case_id).strip()]
    normalized_field_keys = [str(field_key).strip() for field_key in field_keys if str(field_key).strip()]
    if not normalized_case_ids or not normalized_field_keys:
        return {}

    user_cols = get_table_columns(conn, "case_user_data")
    case_col = first_existing(user_cols, ("case_id", "case_number"))
    key_col = first_existing(user_cols, ("field_key", "key"))
    value_col = first_existing(user_cols, ("field_value", "value", "field_text"))
    if not case_col or not key_col or not value_col:
        return {}

    custom_df = load_custom_fields(
        conn,
        "case_user_data",
        case_col,
        key_col,
        value_col,
        normalized_field_keys,
    )
    if custom_df.empty:
        return {}

    custom_df[case_col] = custom_df[case_col].astype(str).str.strip()
    custom_df = custom_df[custom_df[case_col].isin(normalized_case_ids)]

    out: dict[str, dict[str, Optional[str]]] = {}
    for _, row in custom_df.iterrows():
        case_id = str(row.get(case_col) or "").strip()
        if not case_id:
            continue
        values: dict[str, Optional[str]] = {}
        for field_key in normalized_field_keys:
            values[field_key] = normalize_text(row.get(field_key))
        out[case_id] = values
    return out


def load_case_meta_map(conn: sqlite3.Connection, case_ids: Iterable[str]) -> dict[str, dict[str, str]]:
    normalized = sorted({str(case_id).strip() for case_id in case_ids if str(case_id).strip()})
    if not normalized:
        return {}

    cases_cols = get_table_columns(conn, "cases")
    if "case_id" not in cases_cols:
        return {}

    placeholders = ",".join(["?"] * len(normalized))
    title_expr = _preferred_expr("c", cases_cols, ("latest_title", "title"))
    request_expr = _preferred_expr("c", cases_cols, ("latest_request_type", "request_type"))
    status_expr = _preferred_expr("c", cases_cols, ("latest_list_state", "status"))
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
        cursor = conn.execute(sql, normalized)
        columns = [entry[0] for entry in (cursor.description or [])]
        rows = cursor.fetchall()
    except sqlite3.Error:
        return {}

    out: dict[str, dict[str, str]] = {}
    for raw_row in rows:
        row = _row_to_mapping(raw_row, columns)
        case_id = str(row.get("case_id") or "").strip()
        if not case_id:
            continue
        out[case_id] = {
            "title": str(row.get("title") or "").strip(),
            "request_type": str(row.get("request_type") or "").strip(),
            "status": str(row.get("status") or "").strip(),
        }
    return out


def load_case_phone_map(conn: sqlite3.Connection, case_ids: Iterable[str]) -> dict[str, str]:
    normalized = sorted({str(case_id).strip() for case_id in case_ids if str(case_id).strip()})
    if not normalized:
        return {}

    user_cols = get_table_columns(conn, "case_user_data")
    case_col = first_existing(user_cols, ("case_id", "case_number"))
    key_col = first_existing(user_cols, ("field_key", "key"))
    value_col = first_existing(user_cols, ("field_value", "value", "field_text"))
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
        cursor = conn.execute(sql, normalized)
        columns = [entry[0] for entry in (cursor.description or [])]
        rows = cursor.fetchall()
    except sqlite3.Error:
        return {}

    out: dict[str, str] = {}
    for raw_row in rows:
        row = _row_to_mapping(raw_row, columns)
        case_id = str(row.get("case_id") or "").strip()
        if not case_id or case_id in out:
            continue
        out[case_id] = str(row.get("phone_value") or "").strip()
    return out


def get_case_detail_dict(
    conn: sqlite3.Connection,
    case_id: str,
    custom_field_names: Optional[list[str]] = None,
) -> Optional[dict[str, Any]]:
    row = load_case_detail_row(conn, case_id)
    if row is None:
        return None

    custom_fields = load_case_custom_fields(conn, case_id)
    if custom_field_names:
        ordered_names = list(dict.fromkeys([*custom_field_names, *custom_fields.keys()]))
        custom_fields = {name: custom_fields.get(name) for name in ordered_names}
    latest_document_name = case_documents.load_latest_case_document_map(conn, [case_id]).get(
        str(case_id).strip()
    )

    return {
        "case_id": str(row.get("case_id") or "").strip(),
        "status": normalize_text(row.get("status")),
        "title": normalize_text(row.get("title")),
        "request_type": normalize_text(row.get("request_type")),
        "created_at": isoformat_or_none(row.get("created_at")),
        "updated_at": isoformat_or_none(row.get("updated_at")),
        "prev_change_at": isoformat_or_none(row.get("prev_change_at")),
        "first_seen": normalize_text(row.get("First Seen")),
        "days_since_update": None if pd.isna(row.get("Denovi (Od Posledna)")) else int(row.get("Denovi (Od Posledna)")),
        "phone": normalize_text(row.get("phone")),
        "latest_document_name": latest_document_name,
        "custom_fields": custom_fields,
    }


def list_case_dicts(
    conn: sqlite3.Connection,
    search: Optional[str] = None,
    request_types: Optional[list[str]] = None,
    statuses: Optional[list[str]] = None,
    date_from: Optional[Any] = None,
    date_to: Optional[Any] = None,
    custom_field_names: Optional[list[str]] = None,
    limit: Optional[int] = None,
    offset: int = 0,
    sort_by: Optional[str] = None,
    sort_desc: bool = True,
) -> tuple[list[dict[str, Any]], int]:
    df = prepare_cases_dataframe(conn)
    filtered = apply_case_filters(
        df,
        search=search,
        request_types=request_types,
        statuses=statuses,
        date_from=date_from,
        date_to=date_to,
    )
    total = len(filtered)
    if sort_by and sort_by in filtered.columns:
        filtered = filtered.sort_values(
            [sort_by, "case_id"],
            ascending=[not sort_desc, not sort_desc],
            na_position="last",
        )
    elif "updated_at" in filtered.columns:
        filtered = filtered.sort_values(["updated_at", "case_id"], ascending=[False, False], na_position="last")
    elif "case_id" in filtered.columns:
        filtered = filtered.sort_values(["case_id"], ascending=[False])

    if offset > 0:
        filtered = filtered.iloc[offset:]
    if limit is not None:
        filtered = filtered.iloc[:limit]

    case_ids = filtered.get("case_id", pd.Series(dtype="object")).tolist()
    custom_field_map = load_case_custom_fields_map(
        conn,
        case_ids,
        custom_field_names or [],
    )
    latest_document_map = case_documents.load_latest_case_document_map(conn, case_ids)

    out: list[dict[str, Any]] = []
    for _, row in filtered.iterrows():
        case_id = str(row.get("case_id") or "").strip()
        out.append(
            {
                "case_id": case_id,
                "title": normalize_text(row.get("title")),
                "status": normalize_text(row.get("status")),
                "request_type": normalize_text(row.get("request_type")),
                "created_at": isoformat_or_none(row.get("created_at")),
                "updated_at": isoformat_or_none(row.get("updated_at")),
                "prev_change_at": isoformat_or_none(row.get("prev_change_at")),
                "first_seen": normalize_text(row.get("First Seen")),
                "days_since_update": None if pd.isna(row.get("Denovi (Od Posledna)")) else int(row.get("Denovi (Od Posledna)")),
                "phone": normalize_text(row.get("phone")),
                "latest_document_name": latest_document_map.get(case_id),
                "custom_fields": custom_field_map.get(case_id, {}),
            }
        )
    return out, total


def get_case_filter_options(conn: sqlite3.Connection) -> dict[str, Any]:
    cases_cols = get_table_columns(conn, "cases")
    if "case_id" not in cases_cols:
        return {"request_types": [], "statuses": []}

    request_type_col = pick_column(cases_cols, ("latest_request_type", "request_type"))
    status_col = pick_column(cases_cols, ("latest_list_state", "status"))

    request_types = _load_distinct_case_values(conn, request_type_col)
    statuses = _load_distinct_case_values(conn, status_col)

    if status_col and _has_empty_case_value(conn, status_col):
        statuses = ["(Empty)", *statuses]

    return {
        "request_types": request_types,
        "statuses": statuses,
    }


def update_case_record(conn: sqlite3.Connection, case_id: str, updates: dict[str, Any]) -> bool:
    cid = str(case_id or "").strip()
    if not cid:
        return False

    cases_cols = get_table_columns(conn, "cases")
    if "case_id" not in cases_cols:
        return False

    user_updates = updates.get("custom_fields", {})
    if not isinstance(user_updates, dict):
        user_updates = {}
    if "phone" in updates:
        user_updates = dict(user_updates)
        user_updates["Phone"] = updates.get("phone")

    column_map = {
        "title": first_existing(cases_cols, ("latest_title", "title")),
        "request_type": first_existing(cases_cols, ("latest_request_type", "request_type")),
        "status": first_existing(cases_cols, ("latest_list_state", "status")),
    }

    set_parts: list[str] = []
    params: list[Any] = []
    for key, column in column_map.items():
        if column and key in updates and updates[key] is not None:
            set_parts.append(f"{column} = ?")
            params.append(normalize_text(updates[key]))

    updated = False
    if set_parts:
        params.append(cid)
        cur = conn.execute(f"UPDATE cases SET {', '.join(set_parts)} WHERE case_id = ?", params)
        updated = updated or cur.rowcount > 0

    if "phone" in updates:
        phone_column = first_existing(cases_cols, ("phone",))
        if phone_column:
            cur = conn.execute(
                f"UPDATE cases SET {phone_column} = ? WHERE case_id = ?",
                (normalize_text(updates.get("phone")), cid),
            )
            updated = updated or cur.rowcount > 0

    if user_updates:
        for field_key, value in user_updates.items():
            key = str(field_key or "").strip()
            if not key:
                continue
            _upsert_case_user_field(conn, cid, key, value)
            updated = True

    conn.commit()
    return updated


def _preferred_expr(alias: str, cases_cols: Iterable[str], candidates: Iterable[str]) -> str:
    columns = set(cases_cols)
    for column in candidates:
        if column in columns:
            return f"COALESCE({alias}.{column}, '')"
    return "''"


def _row_to_mapping(row: Any, columns: Optional[Iterable[str]] = None) -> dict[str, Any]:
    if row is None:
        return {}
    if isinstance(row, dict):
        return dict(row)
    if hasattr(row, "keys"):
        try:
            return {str(key): row[key] for key in row.keys()}
        except Exception:
            pass
    if columns is not None and isinstance(row, (tuple, list)):
        column_list = list(columns)
        return {
            str(column): row[index] if index < len(row) else None
            for index, column in enumerate(column_list)
        }
    return {}


def _load_distinct_case_values(
    conn: sqlite3.Connection,
    column: Optional[str],
) -> list[str]:
    if not column:
        return []

    sql = f"""
        SELECT DISTINCT TRIM(COALESCE({column}, '')) AS value
        FROM cases
        WHERE TRIM(COALESCE({column}, '')) <> ''
        ORDER BY value
    """
    try:
        cursor = conn.execute(sql)
        columns = [entry[0] for entry in (cursor.description or [])]
        rows = cursor.fetchall()
    except sqlite3.Error:
        return []
    values: list[str] = []
    for raw_row in rows:
        row = _row_to_mapping(raw_row, columns)
        value = str(row.get("value") or "").strip()
        if value:
            values.append(value)
    return values


def _has_empty_case_value(conn: sqlite3.Connection, column: str) -> bool:
    sql = f"""
        SELECT 1
        FROM cases
        WHERE TRIM(COALESCE({column}, '')) = ''
        LIMIT 1
    """
    try:
        return conn.execute(sql).fetchone() is not None
    except sqlite3.Error:
        return False


def _upsert_case_user_field(
    conn: sqlite3.Connection,
    case_id: str,
    field_key: str,
    value: Any,
) -> None:
    user_cols = get_table_columns(conn, "case_user_data")
    case_col = first_existing(user_cols, ("case_id", "case_number"))
    key_col = first_existing(user_cols, ("field_key", "key"))
    value_col = first_existing(user_cols, ("field_value", "value", "field_text"))
    updated_at_col = first_existing(user_cols, ("updated_at",))
    if not case_col or not key_col or not value_col:
        return

    normalized_value = normalize_text(value)
    raw_row = conn.execute(
        f"""
        SELECT rowid
        FROM case_user_data
        WHERE {case_col} = ? AND {key_col} = ?
        ORDER BY rowid DESC
        LIMIT 1
        """,
        (case_id, field_key),
    ).fetchone()
    row = _row_to_mapping(raw_row, ("rowid",))

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if row:
        if updated_at_col:
            conn.execute(
                f"""
                UPDATE case_user_data
                SET {value_col} = ?, {updated_at_col} = ?
                WHERE rowid = ?
                """,
                (normalized_value, timestamp, row["rowid"]),
            )
        else:
            conn.execute(
                f"UPDATE case_user_data SET {value_col} = ? WHERE rowid = ?",
                (normalized_value, row["rowid"]),
            )
        return

    if updated_at_col:
        conn.execute(
            f"""
            INSERT INTO case_user_data ({case_col}, {key_col}, {value_col}, {updated_at_col})
            VALUES (?, ?, ?, ?)
            """,
            (case_id, field_key, normalized_value, timestamp),
        )
    else:
        conn.execute(
            f"""
            INSERT INTO case_user_data ({case_col}, {key_col}, {value_col})
            VALUES (?, ?, ?)
            """,
            (case_id, field_key, normalized_value),
        )


def load_case_detail_row(conn: sqlite3.Connection, case_id: str) -> Optional[dict[str, Any]]:
    cid = str(case_id or "").strip()
    if not cid:
        return None

    cases_cols = get_table_columns(conn, "cases")
    case_key_col = first_existing(cases_cols, ("case_id",))
    if not case_key_col:
        return None

    col_map = {
        "request_type": pick_column(cases_cols, ("latest_request_type", "request_type")),
        "title": pick_column(cases_cols, ("latest_title", "title")),
        "status": pick_column(cases_cols, ("latest_list_state", "status")),
        "created_at": pick_column(cases_cols, ("official_created_at", "created_at", "first_seen_at")),
        "updated_at": pick_column(cases_cols, ("latest_movement_last_change_dt", "updated_at")),
        "prev_change_at": pick_column(cases_cols, ("latest_movement_prev_change_dt", "prev_change_at")),
        "first_seen_at": pick_column(cases_cols, ("first_seen_at",)),
        "first_seen_source": pick_column(cases_cols, ("first_seen_source",)),
        "phone": pick_column(cases_cols, ("phone",)),
    }

    select_cols = [f'"{case_key_col}" AS case_id']
    for alias, column in col_map.items():
        if column:
            select_cols.append(f'"{column}" AS {alias}')

    sql = f"""
        SELECT {", ".join(select_cols)}
        FROM cases
        WHERE "{case_key_col}" = ?
        LIMIT 1
    """
    try:
        cursor = conn.execute(sql, (cid,))
        columns = [entry[0] for entry in (cursor.description or [])]
        raw_row = cursor.fetchone()
    except sqlite3.Error:
        return None
    if raw_row is None:
        return None
    row = _row_to_mapping(raw_row, columns)

    created_dt = pd.to_datetime(row.get("created_at"), errors="coerce")
    updated_dt = pd.to_datetime(row.get("updated_at"), errors="coerce")
    first_seen_dt = pd.to_datetime(row.get("first_seen_at"), errors="coerce")
    now_dt = datetime.now()
    days_since_update = None
    if not pd.isna(updated_dt):
        days_since_update = int((now_dt - updated_dt.to_pydatetime()).days)

    date_str = first_seen_dt.strftime("%Y-%m-%d") if not pd.isna(first_seen_dt) else ""
    src = str(row.get("first_seen_source") or "").strip()
    src_map = {
        "scheduled_sync": "Scheduled",
        "manual_sync": "Manual",
        "full_scrape": "Full scrape",
    }
    src_label = src_map.get(src, src)
    if date_str and src_label:
        first_seen = f"{date_str} ? {src_label}"
    else:
        first_seen = date_str or src_label

    phone = normalize_text(row.get("phone"))
    if not phone:
        phone = load_case_phone_map(conn, [cid]).get(cid)

    return {
        "case_id": cid,
        "status": normalize_text(row.get("status")),
        "title": normalize_text(row.get("title")),
        "request_type": normalize_text(row.get("request_type")),
        "created_at": isoformat_or_none(created_dt),
        "updated_at": isoformat_or_none(updated_dt),
        "prev_change_at": isoformat_or_none(pd.to_datetime(row.get("prev_change_at"), errors="coerce")),
        "first_seen": normalize_text(first_seen),
        "days_since_update": days_since_update,
        "phone": normalize_text(phone),
    }
