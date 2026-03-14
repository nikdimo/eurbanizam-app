from __future__ import annotations

import re
import sqlite3
from datetime import date, datetime
from typing import Any, Iterable, Optional

import pandas as pd


SEARCH_NORMALIZE_RE = re.compile(r"[^a-zA-Z0-9\u0400-\u04FF]")
REPEATS_RE = re.compile(r"(.)\1+")


def as_float(value: Any) -> float:
    if value is None:
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def normalize_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def parse_date(value: Any) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, pd.Timestamp):
        return None if pd.isna(value) else value.date()
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


def isoformat_or_none(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, pd.Timestamp):
        if pd.isna(value):
            return None
        value = value.to_pydatetime()
    if isinstance(value, datetime):
        return value.isoformat(sep=" ", timespec="seconds")
    if isinstance(value, date):
        return value.isoformat()
    try:
        if pd.isna(value):
            return None
    except TypeError:
        pass
    text = str(value).strip()
    return text or None


def get_table_columns(conn: sqlite3.Connection, table_name: str) -> set[str]:
    try:
        rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    except sqlite3.Error:
        return set()
    return {str(row[1]) for row in rows if len(row) > 1}


def first_existing(columns: Iterable[str], candidates: Iterable[str]) -> Optional[str]:
    column_set = set(columns)
    for candidate in candidates:
        if candidate in column_set:
            return candidate
    return None


def coalesce_expr(alias: str, columns: Iterable[Optional[str]]) -> str:
    parts = [f"{alias}.{column}" for column in columns if column]
    if not parts:
        return "''"
    return "COALESCE(" + ", ".join(parts + ["''"]) + ")"


def normalize_search(text: Any) -> str:
    return SEARCH_NORMALIZE_RE.sub("", str(text or "")).lower()


def mk_cyr_to_lat(text: str) -> str:
    if not text:
        return ""
    mapping = {
        "\u0410": "A",
        "\u0430": "a",
        "\u0411": "B",
        "\u0431": "b",
        "\u0412": "V",
        "\u0432": "v",
        "\u0413": "G",
        "\u0433": "g",
        "\u0414": "D",
        "\u0434": "d",
        "\u0403": "Gj",
        "\u0453": "gj",
        "\u0415": "E",
        "\u0435": "e",
        "\u0416": "Zh",
        "\u0436": "zh",
        "\u0417": "Z",
        "\u0437": "z",
        "\u0405": "Dz",
        "\u0455": "dz",
        "\u0418": "I",
        "\u0438": "i",
        "\u0408": "J",
        "\u0458": "j",
        "\u041A": "K",
        "\u043A": "k",
        "\u041B": "L",
        "\u043B": "l",
        "\u0409": "Lj",
        "\u0459": "lj",
        "\u041C": "M",
        "\u043C": "m",
        "\u041D": "N",
        "\u043D": "n",
        "\u040A": "Nj",
        "\u045A": "nj",
        "\u041E": "O",
        "\u043E": "o",
        "\u041F": "P",
        "\u043F": "p",
        "\u0420": "R",
        "\u0440": "r",
        "\u0421": "S",
        "\u0441": "s",
        "\u0422": "T",
        "\u0442": "t",
        "\u040C": "Kj",
        "\u045C": "kj",
        "\u0423": "U",
        "\u0443": "u",
        "\u0424": "F",
        "\u0444": "f",
        "\u0425": "H",
        "\u0445": "h",
        "\u0426": "C",
        "\u0446": "c",
        "\u0427": "Ch",
        "\u0447": "ch",
        "\u040F": "Dzh",
        "\u045F": "dzh",
        "\u0428": "Sh",
        "\u0448": "sh",
        "\u0402": "Dj",
        "\u0452": "dj",
    }
    return "".join(mapping.get(char, char) for char in text)


def collapse_repeats(text: str) -> str:
    return REPEATS_RE.sub(r"\1", text or "")


def mk_lat_to_cyr(text: str) -> str:
    if not text:
        return ""

    out = text
    replacements = [
        ("dzh", "\u045F"),
        ("Dzh", "\u040F"),
        ("DZH", "\u040F"),
        ("gj", "\u0453"),
        ("Gj", "\u0403"),
        ("GJ", "\u0403"),
        ("kj", "\u045C"),
        ("Kj", "\u040C"),
        ("KJ", "\u040C"),
        ("lj", "\u0459"),
        ("Lj", "\u0409"),
        ("LJ", "\u0409"),
        ("nj", "\u045A"),
        ("Nj", "\u040A"),
        ("NJ", "\u040A"),
        ("zh", "\u0436"),
        ("Zh", "\u0416"),
        ("ZH", "\u0416"),
        ("ch", "\u0447"),
        ("Ch", "\u0427"),
        ("CH", "\u0427"),
        ("sh", "\u0448"),
        ("Sh", "\u0428"),
        ("SH", "\u0428"),
        ("dz", "\u0455"),
        ("Dz", "\u0405"),
        ("DZ", "\u0405"),
    ]
    for latin, cyrillic in replacements:
        out = out.replace(latin, cyrillic)

    single = {
        "A": "\u0410",
        "a": "\u0430",
        "B": "\u0411",
        "b": "\u0431",
        "V": "\u0412",
        "v": "\u0432",
        "G": "\u0413",
        "g": "\u0433",
        "D": "\u0414",
        "d": "\u0434",
        "E": "\u0415",
        "e": "\u0435",
        "Z": "\u0417",
        "z": "\u0437",
        "I": "\u0418",
        "i": "\u0438",
        "J": "\u0408",
        "j": "\u0458",
        "K": "\u041A",
        "k": "\u043A",
        "L": "\u041B",
        "l": "\u043B",
        "M": "\u041C",
        "m": "\u043C",
        "N": "\u041D",
        "n": "\u043D",
        "O": "\u041E",
        "o": "\u043E",
        "P": "\u041F",
        "p": "\u043F",
        "R": "\u0420",
        "r": "\u0440",
        "S": "\u0421",
        "s": "\u0441",
        "T": "\u0422",
        "t": "\u0442",
        "U": "\u0423",
        "u": "\u0443",
        "F": "\u0424",
        "f": "\u0444",
        "H": "\u0425",
        "h": "\u0445",
        "C": "\u0426",
        "c": "\u0446",
        "Q": "\u040C",
        "q": "\u045C",
        "W": "\u0412",
        "w": "\u0432",
        "Y": "\u0408",
        "y": "\u0458",
        "X": "\u041A\u0441",
        "x": "\u043A\u0441",
    }
    return "".join(single.get(char, char) for char in out)


def series_or_blank(df: pd.DataFrame, column: str) -> pd.Series:
    if column in df.columns:
        return df[column].fillna("").astype(str)
    return pd.Series([""] * len(df), index=df.index, dtype="object")


def rebuild_search_cache(df: pd.DataFrame, focus_columns: Iterable[str]) -> pd.DataFrame:
    out = df.copy()
    search_cols = [
        column
        for column in out.columns
        if not column.startswith("_") and column not in {"__search_blob", "__row_norm", "__focused_norm"}
    ]
    row_str = out[search_cols].astype(str).agg(" ".join, axis=1) if search_cols else pd.Series([""] * len(out), index=out.index)
    out["__search_blob"] = row_str.str.casefold()
    out["__row_norm"] = row_str.apply(normalize_search)

    focus_series = [series_or_blank(out, column) for column in focus_columns]
    if focus_series:
        focused = focus_series[0]
        for part in focus_series[1:]:
            focused = (focused + " " + part).str.strip()
    else:
        focused = pd.Series([""] * len(out), index=out.index, dtype="object")
    out["__focused_norm"] = focused.apply(normalize_search)
    return out


def build_search_mask(df: pd.DataFrame, search_text: Optional[str]) -> pd.Series:
    if df.empty:
        return pd.Series([], dtype=bool, index=df.index)

    search_key = str(search_text or "").strip()
    if not search_key:
        return pd.Series([True] * len(df), index=df.index)

    q0 = search_key
    q1 = mk_cyr_to_lat(q0)
    q2 = mk_lat_to_cyr(q0)

    raw_variants: list[str] = []
    for query in (q0, q1, q2):
        lowered = query.strip().lower() if query else ""
        if lowered and lowered not in raw_variants:
            raw_variants.append(lowered)

    norm_variants: list[str] = []
    for query in (q0, q1, q2):
        normalized = normalize_search(query) if query else ""
        if normalized and normalized not in norm_variants:
            norm_variants.append(normalized)

    mask_exact = pd.Series([False] * len(df), index=df.index)
    if "__search_blob" in df.columns:
        for query in raw_variants:
            mask_exact |= df["__search_blob"].str.contains(query, na=False, regex=False)
    if "__row_norm" in df.columns:
        for normalized in norm_variants:
            mask_exact |= df["__row_norm"].str.contains(normalized, na=False, regex=False)

    try:
        from rapidfuzz import fuzz
    except ImportError:
        fuzz = None

    if fuzz is None or mask_exact.sum() > 2:
        return mask_exact

    q_norms: list[str] = []
    for query in (q0, q1, q2):
        normalized = normalize_search(query)
        if normalized and normalized not in q_norms:
            q_norms.append(normalized)
        collapsed = collapse_repeats(normalized) if normalized else ""
        if collapsed and collapsed not in q_norms:
            q_norms.append(collapsed)

    if not q_norms:
        return mask_exact

    q_len = max(len(query) for query in q_norms)
    if q_len < 4 or re.fullmatch(r"[0-9/\-\s]+", q0 or ""):
        return mask_exact

    if q_len <= 5:
        threshold = 90
    elif q_len <= 8:
        threshold = 84
    elif q_len <= 12:
        threshold = 82
    else:
        threshold = 80

    seen = set(df.loc[mask_exact, "case_id"].astype(str)) if "case_id" in df.columns else set()
    focused_norm = df.get("__focused_norm", pd.Series([""] * len(df), index=df.index, dtype="object"))
    fuzzy_hits: list[Any] = []
    for idx, focused in focused_norm.items():
        if not focused:
            continue
        case_id = str(df.at[idx, "case_id"]) if "case_id" in df.columns else ""
        if case_id in seen:
            continue
        best = 0
        for normalized in q_norms:
            if len(normalized) >= 4 and normalized in focused:
                best = 100
                break
        if best == 0:
            for normalized in q_norms:
                score = fuzz.partial_ratio(normalized, focused)
                if score > best:
                    best = score
        if best >= threshold:
            fuzzy_hits.append(idx)

    if fuzzy_hits:
        return mask_exact | df.index.isin(fuzzy_hits)
    return mask_exact
