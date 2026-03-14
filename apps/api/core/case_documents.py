from __future__ import annotations

import json
import sqlite3
from hashlib import sha1
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, Optional

from .common import get_table_columns, normalize_text
from .settings_access import load_app_settings


def ensure_case_documents_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS case_documents (
            document_id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id TEXT NOT NULL,
            document_name TEXT,
            document_type TEXT,
            created_by TEXT,
            created_at TEXT,
            created_at_raw TEXT,
            description TEXT,
            digital_signature TEXT,
            page_index INTEGER NOT NULL DEFAULT 1,
            row_index INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_case_documents_case_created
        ON case_documents(case_id, created_at DESC, page_index ASC, row_index ASC)
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS case_document_sync_state (
            case_id TEXT PRIMARY KEY,
            json_hash TEXT,
            json_path TEXT,
            synced_at TEXT NOT NULL,
            documents_count INTEGER NOT NULL DEFAULT 0
        )
        """
    )


def extract_case_documents(payload: dict[str, Any]) -> list[dict[str, Any]]:
    tabs = payload.get("tabs")
    if not isinstance(tabs, list):
        return []

    documents_section: Optional[dict[str, Any]] = None
    for tab in tabs:
        if not isinstance(tab, dict):
            continue
        subsections = tab.get("subsections")
        if not isinstance(subsections, dict):
            continue
        candidate = subsections.get("documents")
        if isinstance(candidate, dict):
            documents_section = candidate
            break

    if documents_section is None:
        return []

    pages = documents_section.get("pages")
    if not isinstance(pages, list):
        return []

    out: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str, str, str, str]] = set()
    for page_index, page in enumerate(pages, start=1):
        if not isinstance(page, dict):
            continue
        tables = page.get("tables")
        if not isinstance(tables, list):
            continue

        row_index = 0
        for table in tables:
            if not isinstance(table, dict):
                continue
            rows = table.get("rows")
            if not isinstance(rows, list):
                continue

            for raw_row in rows:
                cells = _normalize_document_row(raw_row)
                if not cells:
                    continue

                signature = (
                    cells[0],
                    cells[1],
                    cells[2],
                    cells[3],
                    cells[4],
                    cells[5],
                )
                if signature in seen:
                    continue
                seen.add(signature)

                row_index += 1
                out.append(
                    {
                        "document_name": normalize_text(cells[0]),
                        "document_type": normalize_text(cells[1]),
                        "created_by": normalize_text(cells[2]),
                        "created_at": _parse_document_created_at(cells[3]),
                        "created_at_raw": normalize_text(cells[3]),
                        "description": normalize_text(cells[4]),
                        "digital_signature": normalize_text(cells[5]),
                        "page_index": page_index,
                        "row_index": row_index,
                    }
                )
    return out


def sync_case_documents_from_json(
    conn: sqlite3.Connection,
    case_id: str,
    json_path: str | Path,
    json_hash: Optional[str] = None,
) -> bool:
    cid = str(case_id or "").strip()
    if not cid:
        return False

    path = Path(json_path)
    if not path.exists():
        return False

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False

    documents = extract_case_documents(payload)
    ensure_case_documents_schema(conn)

    conn.execute("DELETE FROM case_documents WHERE case_id = ?", (cid,))
    for document in documents:
        conn.execute(
            """
            INSERT INTO case_documents (
                case_id,
                document_name,
                document_type,
                created_by,
                created_at,
                created_at_raw,
                description,
                digital_signature,
                page_index,
                row_index
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                cid,
                document.get("document_name"),
                document.get("document_type"),
                document.get("created_by"),
                document.get("created_at"),
                document.get("created_at_raw"),
                document.get("description"),
                document.get("digital_signature"),
                int(document.get("page_index") or 1),
                int(document.get("row_index") or 0),
            ),
        )

    conn.execute(
        """
        INSERT INTO case_document_sync_state (
            case_id,
            json_hash,
            json_path,
            synced_at,
            documents_count
        )
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(case_id) DO UPDATE SET
            json_hash = excluded.json_hash,
            json_path = excluded.json_path,
            synced_at = excluded.synced_at,
            documents_count = excluded.documents_count
        """,
        (
            cid,
            normalize_text(json_hash),
            str(path),
            _now_iso(),
            len(documents),
        ),
    )
    return True


def ensure_case_documents_for_cases(
    conn: sqlite3.Connection,
    case_ids: Iterable[str],
    json_dir: str | Path | None = None,
) -> None:
    normalized_case_ids = sorted(
        {str(case_id).strip() for case_id in case_ids if str(case_id).strip()}
    )
    if not normalized_case_ids:
        return

    ensure_case_documents_schema(conn)

    json_index_map = _load_case_json_index_rows(conn, normalized_case_ids)
    if not json_index_map:
        return

    sync_state_map = _load_case_document_sync_state(conn, normalized_case_ids)
    fallback_dir = _resolve_json_dir(json_dir)

    for case_id in normalized_case_ids:
        index_row = json_index_map.get(case_id, {})

        resolved_path = _resolve_case_json_path(
            case_id=case_id,
            raw_json_path=index_row.get("json_path"),
            fallback_dir=fallback_dir,
        )
        if resolved_path is None:
            continue

        json_hash = normalize_text(index_row.get("json_hash")) or _json_file_hash(
            resolved_path
        )
        sync_state = sync_state_map.get(case_id)
        if (
            sync_state is not None
            and sync_state.get("json_hash") == json_hash
            and sync_state.get("json_path") == str(resolved_path)
        ):
            continue

        sync_case_documents_from_json(
            conn,
            case_id=case_id,
            json_path=resolved_path,
            json_hash=json_hash,
        )


def load_latest_case_document_map(
    conn: sqlite3.Connection,
    case_ids: Iterable[str],
    json_dir: str | Path | None = None,
) -> dict[str, Optional[str]]:
    normalized_case_ids = sorted(
        {str(case_id).strip() for case_id in case_ids if str(case_id).strip()}
    )
    if not normalized_case_ids:
        return {}

    ensure_case_documents_for_cases(conn, normalized_case_ids, json_dir=json_dir)
    ensure_case_documents_schema(conn)

    placeholders = ",".join(["?"] * len(normalized_case_ids))
    try:
        cursor = conn.execute(
            f"""
            SELECT case_id, document_name
            FROM case_documents
            WHERE case_id IN ({placeholders})
            ORDER BY
                case_id ASC,
                COALESCE(created_at, '') DESC,
                page_index ASC,
                row_index ASC,
                document_id ASC
            """,
            normalized_case_ids,
        )
        rows = cursor.fetchall()
    except sqlite3.Error:
        return {}

    out: dict[str, Optional[str]] = {}
    for row in rows:
        case_id = str(row[0] or "").strip()
        if not case_id or case_id in out:
            continue
        out[case_id] = normalize_text(row[1])
    return out


def _load_case_json_index_rows(
    conn: sqlite3.Connection,
    case_ids: list[str],
) -> dict[str, dict[str, Optional[str]]]:
    columns = get_table_columns(conn, "case_json_index")
    if "case_id" not in columns:
        return {}

    placeholders = ",".join(["?"] * len(case_ids))
    try:
        cursor = conn.execute(
            f"""
            SELECT case_id, json_path, json_hash
            FROM case_json_index
            WHERE case_id IN ({placeholders})
            """,
            case_ids,
        )
        rows = cursor.fetchall()
    except sqlite3.Error:
        return {}

    out: dict[str, dict[str, Optional[str]]] = {}
    for row in rows:
        case_id = str(row[0] or "").strip()
        if not case_id:
            continue
        out[case_id] = {
            "json_path": normalize_text(row[1]),
            "json_hash": normalize_text(row[2]),
        }
    return out


def _load_case_document_sync_state(
    conn: sqlite3.Connection,
    case_ids: list[str],
) -> dict[str, dict[str, Optional[str]]]:
    columns = get_table_columns(conn, "case_document_sync_state")
    if "case_id" not in columns:
        return {}

    placeholders = ",".join(["?"] * len(case_ids))
    try:
        cursor = conn.execute(
            f"""
            SELECT case_id, json_hash, json_path
            FROM case_document_sync_state
            WHERE case_id IN ({placeholders})
            """,
            case_ids,
        )
        rows = cursor.fetchall()
    except sqlite3.Error:
        return {}

    out: dict[str, dict[str, Optional[str]]] = {}
    for row in rows:
        case_id = str(row[0] or "").strip()
        if not case_id:
            continue
        out[case_id] = {
            "json_hash": normalize_text(row[1]),
            "json_path": normalize_text(row[2]),
        }
    return out


def _resolve_case_json_path(
    case_id: str,
    raw_json_path: Optional[str],
    fallback_dir: Optional[Path],
) -> Optional[Path]:
    if raw_json_path:
        candidate = Path(raw_json_path)
        if candidate.exists():
            return candidate

    if fallback_dir is not None:
        fallback_path = fallback_dir / f"{case_id}.json"
        if fallback_path.exists():
            return fallback_path

    if raw_json_path and fallback_dir is not None:
        candidate_name = Path(raw_json_path).name
        if candidate_name:
            fallback_by_name = fallback_dir / candidate_name
            if fallback_by_name.exists():
                return fallback_by_name

    return None


def _resolve_json_dir(json_dir: str | Path | None) -> Optional[Path]:
    if json_dir is not None:
        path = Path(json_dir)
        return path if path.exists() else None

    try:
        settings = load_app_settings()
    except Exception:
        return None

    path = Path(settings.get("local_json_dir") or "")
    return path if path.exists() else None


def _normalize_document_row(raw_row: Any) -> list[str]:
    if isinstance(raw_row, (list, tuple)):
        values = [str(cell or "").strip() for cell in raw_row]
    elif isinstance(raw_row, dict):
        values = [str(value or "").strip() for _, value in sorted(raw_row.items())]
    else:
        values = [str(raw_row or "").strip()]

    if not any(values):
        return []

    while len(values) < 6:
        values.append("")
    return values


def _parse_document_created_at(value: Any) -> Optional[str]:
    text = str(value or "").strip()
    if not text:
        return None

    for fmt in ("%d.%m.%Y %H:%M:%S", "%d.%m.%Y %H:%M", "%d.%m.%Y"):
        try:
            return datetime.strptime(text, fmt).strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue

    try:
        return datetime.fromisoformat(text).strftime("%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None


def _now_iso() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _json_file_hash(path: Path) -> Optional[str]:
    try:
        return sha1(path.read_bytes()).hexdigest()
    except OSError:
        return None
