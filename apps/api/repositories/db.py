from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


def get_connection(db_path: str | Path) -> sqlite3.Connection:
    path = Path(db_path)
    conn = sqlite3.connect(str(path), timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn


@contextmanager
def db_session(db_path: str | Path) -> Iterator[sqlite3.Connection]:
    conn = get_connection(db_path)
    try:
        yield conn
    finally:
        conn.close()

