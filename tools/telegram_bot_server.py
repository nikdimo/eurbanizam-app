import ctypes
import importlib
import importlib.metadata
import subprocess
import time, requests, json, os, re, sys, sqlite3
try:
    from rapidfuzz import fuzz
except Exception:
    fuzz = None
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]  # Go up from tools/ to project root
SETTINGS_PATH = ROOT / "settings.json"
REQUIREMENTS_PATH = ROOT / "requirements.txt"
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
        "local_json_dir": _expand_path(data["local_json_dir"], project_root),
        "raw": data,
    }
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

    missing = []
    for name in reqs:
        pkg = name.replace("_", "-")
        try:
            importlib.metadata.version(pkg)
        except Exception:
            missing.append(name)

    if not missing:
        return

    try:
        res = subprocess.run(
            [sys.executable, "-m", "pip", "install", "-r", str(requirements_path)],
            capture_output=True,
            text=True,
        )
        if res.returncode == 0:
            print("Installed missing dependencies. Restarting bot...")
            os.execv(sys.executable, [sys.executable] + sys.argv)
        else:
            msg = (res.stderr or res.stdout or "").strip()
            print("Missing dependencies; some features may be disabled.")
            if msg:
                print(msg[:300])
    except Exception as e:
        print("Missing dependencies; some features may be disabled.")
        print(str(e)[:300])


_ensure_requirements_installed(REQUIREMENTS_PATH)
SETTINGS = load_settings(SETTINGS_PATH)
RUNTIME_ROOT = SETTINGS["runtime_root"]
DATA_DIR = SETTINGS["local_json_dir"]
DB_PATH = SETTINGS["local_db_path"]
ICON_ID = "\U0001F194"
ICON_HOURGLASS = "\u23F3"
ICON_STATUS = "\U0001F4CC"
ICON_NEW = "\U0001F195"
ICON_LAST = "\U0001F5D3"
ICON_PREV = "\u23EE"
ICON_CREATED = "\U0001F4C5"
ICON_TYPE = "\U0001F3F7"
ICON_PHONE = "\U0001F4DE"
ICON_EMAIL = "\u2709"
ICON_NAME = "\U0001F464"
ICON_MONEY = "\U0001F4B2"
LABEL_STATUS = "\u0421\u043e\u0441\u0442\u043e\u0458\u0431\u0430"


def normalize(text):
    return re.sub(r'[^a-zA-Z0-9Ѐ-ӿ]', '', str(text or '')).lower()
def _safe_json_from_text(text: str):
    if not text:
        return None
    try:
        m = re.search(r"\{.*\}", text, flags=re.S)
        if not m:
            return None
        return json.loads(m.group(0))
    except Exception:
        return None
def _field_key_candidates(field_label: str):
    t = (field_label or "").lower()
    if any(k in t for k in ["payment", "paid", "pay", "uplata", "\u0443\u043f\u043b\u0430\u0442\u0430", "\u043f\u043b\u0430\u0442", "\u043f\u043b\u0430\u045c", "\u0444\u0438\u043d\u0430\u043d\u0441"]):
        return ["finansii", "payment", "uplata", "\u0444\u0438\u043d\u0430\u043d\u0441\u0438\u0438", "\u0444\u0438\u043d\u0430\u043d\u0441"]
    if any(k in t for k in ["phone", "tel", "telephone", "mobile", "kontakt", "\u043a\u043e\u043d\u0442\u0430\u043a\u0442", "\u0442\u0435\u043b", "\u0442\u0435\u043b\u0435\u0444\u043e\u043d", "broj", "\u0431\u0440\u043e\u0458"]):
        return ["phone", "\u0442\u0435\u043b\u0435\u0444\u043e\u043d", "broj", "\u0431\u0440\u043e\u0458"]
    if any(k in t for k in ["name", "last name", "surname", "ime", "\u0438\u043c\u0435", "\u043f\u0440\u0435\u0437\u0438\u043c\u0435"]):
        return ["name / last name", "name", "last name", "surname", "ime", "\u0438\u043c\u0435", "\u043f\u0440\u0435\u0437\u0438\u043c\u0435"]
    return [field_label] if field_label else []
def _gemini_plan(text: str):
    """
    Ask Gemini to return a compact JSON search plan based ONLY on the user text
    and a schema description (no DB data is sent).
    """
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key or not text:
        return None
    schema = (
        "You are given a user message and must return a JSON plan for searching a local "
        "SQLite DB of e-Urbanizam cases.\n"
        "Available tables/fields:\n"
        "- cases: case_id, latest_list_state (status), latest_title (title), request_type\n"
        "- case_user_data: case_id, field_key, field_value (custom fields like payment, phone, name)\n"
        "Allowed intents:\n"
        "- case_details (needs case_id)\n"
        "- search_cases (query text + optional filters)\n"
        "- list_paid_cases (no query; filter by payment status)\n"
        "- custom_field_lookup (needs case_id + field)\n"
        "Return JSON only (no markdown), schema:\n"
        "{\"intent\":\"...\",\"query\":\"...\",\"case_id\":\"...\","
        "\"field\":\"...\",\"filters\":{\"status\":\"...\",\"request_type\":\"...\"}}\n"
        "Rules:\n"
        "- Keep fields empty string if unknown\n"
        "- Do not invent data\n"
    )
    prompt = f"{schema}\nUser text: {text}\n"
    url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
    payload = {"contents": [{"parts": [{"text": prompt}]}]}
    headers = {"x-goog-api-key": key, "content-type": "application/json"}
    try:
        r = requests.post(url, headers=headers, json=payload, timeout=12)
        if r.status_code != 200:
            return None
        j = r.json()
        cand = (j.get("candidates") or [{}])[0]
        content = cand.get("content") or {}
        parts = content.get("parts") or []
        txt = (parts[0].get("text") if parts and isinstance(parts[0], dict) else "") or ""
        return _safe_json_from_text(txt)
    except Exception:
        return None
def _parse_local_plan(text: str):
    t = (text or "").strip()
    if not t:
        return None
    # numeric-only: treat as case_details only if it exists
    if re.fullmatch(r"\d{4,10}", t):
        if _is_case_id(t):
            return {"intent": "case_details", "case_id": t, "query": "", "field": "", "filters": {}}
        return {"intent": "search_cases", "case_id": "", "query": t, "field": "", "filters": {}}
    tl = t.lower()
    if any(k in tl for k in ["paid cases", "list paid", "all paid", "\u043f\u043b\u0430\u0442\u0435\u043d\u0438"]):
        return {"intent": "list_paid_cases", "case_id": "", "query": "", "field": "", "filters": {}}
    # status changed in time window
    time_intent = _intent_time_status(t)
    if time_intent:
        return time_intent
    return None
def _fetch_case_fields(case_ids):
    if not case_ids:
        return {}
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        placeholders = ",".join(["?"] * len(case_ids))
        cur.execute(
            f"SELECT case_id, latest_list_state, latest_title, request_type FROM cases WHERE case_id IN ({placeholders})",
            [str(c) for c in case_ids],
        )
        rows = cur.fetchall()
        conn.close()
        return {
            str(r["case_id"]): {
                "status": r["latest_list_state"] or "",
                "title": r["latest_title"] or "",
                "request_type": r["request_type"] or "",
            }
            for r in rows
        }
    except Exception:
        try:
            conn.close()
        except Exception:
            pass
        return {}
def _apply_filters_to_matches(matches, filters):
    if not matches:
        return matches
    if not filters:
        return matches
    status_f = (filters.get("status") or "").strip().lower()
    reqtype_f = (filters.get("request_type") or "").strip().lower()
    if not status_f and not reqtype_f:
        return matches
    ids = [cid for cid, _, _ in matches]
    case_map = _fetch_case_fields(ids)
    out = []
    for cid, state, title in matches:
        info = case_map.get(str(cid), {})
        st = (info.get("status") or state or "").lower()
        rt = (info.get("request_type") or "").lower()
        if status_f and status_f not in st:
            continue
        if reqtype_f and reqtype_f not in rt:
            continue
        out.append((cid, info.get("status") or state or "", info.get("title") or title or ""))
    return out
def _extract_time_window(text: str):
    t = (text or "").lower()
    # simple patterns: last 7 days, past 7 days, last week, today, yesterday
    m = re.search(r"(last|past)\s+(\d{1,3})\s+days", t)
    if m:
        return int(m.group(2))
    if "last week" in t:
        return 7
    if "yesterday" in t:
        return 1
    if "today" in t:
        return 0
    return None
def _intent_time_status(text: str):
    t = (text or "").lower()
    if "status" in t and ("change" in t or "changed" in t or "updated" in t):
        days = _extract_time_window(t)
        if days is not None:
            return {"intent": "status_changed_recent", "days": days}
    return None
def _recent_status_changes(days: int, limit=10):
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        # Prefer change_events if present
        has_changes = cur.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='change_events'"
        ).fetchone() is not None
        if has_changes:
            cur.execute(
                "SELECT case_id, timestamp, old_value, new_value FROM change_events "
                "WHERE field_name IN ('status','latest_list_state') AND timestamp >= datetime('now', ?) "
                "ORDER BY timestamp DESC",
                (f'-{int(days)} days',),
            )
            rows = cur.fetchall()
            case_ids = []
            seen = set()
            for r in rows:
                cid = str(r["case_id"])
                if cid not in seen:
                    seen.add(cid)
                    case_ids.append(cid)
                if len(case_ids) >= limit:
                    break
        else:
            case_ids = []
        # fallback to cases.latest_movement_last_change_dt
        if not case_ids:
            cur.execute(
                "SELECT case_id FROM cases WHERE latest_movement_last_change_dt IS NOT NULL "
                "AND latest_movement_last_change_dt >= datetime('now', ?) "
                "ORDER BY latest_movement_last_change_dt DESC",
                (f'-{int(days)} days',),
            )
            case_ids = [str(r[0]) for r in cur.fetchall()[:limit]]
        if not case_ids:
            conn.close()
            return []
        placeholders = ",".join(["?"] * len(case_ids))
        cur.execute(
            f"SELECT case_id, latest_list_state, latest_title FROM cases WHERE case_id IN ({placeholders})",
            case_ids,
        )
        rows = cur.fetchall()
        conn.close()
        out = [(str(r["case_id"]), r["latest_list_state"] or "", r["latest_title"] or "") for r in rows]
        return out[:limit]
    except Exception:
        try:
            conn.close()
        except Exception:
            pass
        return []
def _is_case_id(value: str) -> bool:
    if not value:
        return False
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        row = cur.execute("SELECT 1 FROM cases WHERE case_id=? LIMIT 1", (str(value),)).fetchone()
        conn.close()
        return row is not None
    except Exception:
        try:
            conn.close()
        except Exception:
            pass
        return False
def _list_paid_cases(limit=10):
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        has_cud = cur.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='case_user_data'"
        ).fetchone() is not None
        if not has_cud:
            conn.close()
            return []
        key_like = ["%finans%", "%payment%", "%uplat%", "%\u0443\u043f\u043b\u0430\u0442%", "%\u043f\u043b\u0430\u0442%"]
        val_like = ["%paid%", "%uplata%", "%\u0443\u043f\u043b\u0430\u0442\u0430%", "%\u043f\u043b\u0430\u0442\u0435\u043d%", "%\u043f\u043b\u0430\u0442\u0435\u043d\u0430%", "%\u043f\u043b\u0430\u0442\u0435\u043d\u043e%", "%\u043f\u043b\u0430\u045c%"]
        rows = []
        for kpat in key_like:
            for vpat in val_like:
                rows += cur.execute(
                    "SELECT case_id FROM case_user_data "
                    "WHERE lower(field_key) LIKE ? AND lower(field_value) LIKE ?",
                    (kpat, vpat),
                ).fetchall()
        case_ids = []
        seen = set()
        for r in rows:
            cid = str(r["case_id"] or "")
            if cid and cid not in seen:
                seen.add(cid)
                case_ids.append(cid)
            if len(case_ids) >= limit:
                break
        if not case_ids:
            conn.close()
            return []
        placeholders = ",".join(["?"] * len(case_ids))
        cur.execute(
            f"SELECT case_id, latest_list_state, latest_title FROM cases WHERE case_id IN ({placeholders})",
            case_ids,
        )
        rows = cur.fetchall()
        conn.close()
        out = []
        for r in rows:
            out.append((str(r["case_id"]), r["latest_list_state"] or "", r["latest_title"] or ""))
        return out[:limit]
    except Exception:
        try:
            conn.close()
        except Exception:
            pass
        return []
def _db_case_basic(case_id):
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        row = cur.execute(
            "SELECT case_id, latest_list_state, latest_title, latest_request_type, latest_movement_last_change_dt, latest_movement_prev_change_dt, official_created_at FROM cases WHERE case_id=?",
            (str(case_id),),
        ).fetchone()
        conn.close()
        return dict(row) if row else {}
    except Exception:
        try:
            conn.close()
        except Exception:
            pass
        return {}
def _db_case_custom_fields(case_id):
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        has_cud = cur.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='case_user_data'"
        ).fetchone() is not None
        if not has_cud:
            conn.close()
            return []
        rows = cur.execute(
            "SELECT field_key, field_value FROM case_user_data WHERE case_id=? ORDER BY rowid DESC",
            (str(case_id),),
        ).fetchall()
        conn.close()
        seen = set()
        out = []
        for r in rows:
            k = (r["field_key"] or "").strip()
            v = r["field_value"]
            if not k or k in seen:
                continue
            seen.add(k)
            out.append((k, "" if v is None else str(v)))
        return out
    except Exception:
        try:
            conn.close()
        except Exception:
            pass
        return []
def _db_case_new_ts(case_id):
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        has_changes = cur.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='change_events'"
        ).fetchone() is not None
        if not has_changes:
            conn.close()
            return None
        row = cur.execute(
            "SELECT timestamp FROM change_events WHERE change_type='NEW_CASE' AND case_id=? ORDER BY timestamp DESC LIMIT 1",
            (str(case_id),),
        ).fetchone()
        conn.close()
        return row[0] if row else None
    except Exception:
        try:
            conn.close()
        except Exception:
            pass
        return None
def parse_case_data(case_id, data):
    # Returns HTML-safe Telegram message for a case.
    # Uses DB fields (status/title/last change) and all custom fields.
    # Falls back to JSON parsing if needed.
    def h(s):
        s = "" if s is None else str(s)
        return (
            s.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        )
    def extract_field(raw_text: str, label: str):
        if not raw_text:
            return None
        m = re.search(rf"^{re.escape(label)}\s*:\s*(.+)$", raw_text, flags=re.MULTILINE)
        if m and m.group(1).strip():
            return m.group(1).strip()
        m = re.search(rf"^{re.escape(label)}\s*$", raw_text, flags=re.MULTILINE)
        if not m:
            return None
        rest = raw_text[m.end():]
        for line in rest.splitlines():
            t = line.strip()
            if t:
                return t
        return None
    db = _db_case_basic(case_id)
    status = (db.get("latest_list_state") or "").strip()
    title = (db.get("latest_title") or "").strip()
    req_type = (db.get("latest_request_type") or "").strip()
    last_change = db.get("latest_movement_last_change_dt")
    prev_change = db.get("latest_movement_prev_change_dt")
    created_at = db.get("official_created_at")
    new_ts = _db_case_new_ts(case_id)
    # Fallback to JSON if DB fields missing
    tabs = data.get("tabs") if isinstance(data, dict) else None
    raw_text = None
    if isinstance(tabs, list):
        info_tab = next(
            (t for t in tabs if str(t.get("tab_name", "")).strip() == "??????????"),
            None,
        )
        if info_tab:
            raw_text = info_tab.get("raw_text") or ""
    if not status and raw_text:
        status = extract_field(raw_text, "????????") or extract_field(raw_text, "??????") or status
    if not title and raw_text:
        title = extract_field(raw_text, "??????") or title
    from datetime import datetime
    def _date_only(val):
        if not val:
            return None
        try:
            return str(val).split(" ")[0]
        except Exception:
            return str(val)
    def _days_since(val):
        if not val:
            return None
        try:
            dt = datetime.strptime(str(val).split(" ")[0], "%Y-%m-%d")
            return (datetime.now() - dt).days
        except Exception:
            return None
    lines = []
    lines.append(f"<b>{ICON_ID} {h(case_id)}</b>")
    ds = _days_since(last_change)
    if ds is not None:
        lines.append(f"{ICON_HOURGLASS} {ds} days since last update")

    if status or last_change or new_ts:
        if new_ts:
            lines.append(f"<b>{ICON_STATUS} {LABEL_STATUS}:</b> {h(status) if status else '(Empty)'} <b>{ICON_NEW} NEW</b>")
        else:
            lines.append(f"<b>{ICON_STATUS} {LABEL_STATUS}:</b> {h(status) if status else '(Empty)'}")

    if last_change:
        lines.append(f"{ICON_LAST} Posledna: {_date_only(last_change)}")
    if prev_change:
        lines.append(f"{ICON_PREV} Prethodna: {_date_only(prev_change)}")
    if created_at:
        lines.append(f"{ICON_CREATED} Kreirano: {_date_only(created_at)}")
    if req_type:
        lines.append(f"{ICON_TYPE} Tip: {h(req_type)}")

    if title:
        lines.append(h(title))

    custom = _db_case_custom_fields(case_id)
    if custom:
        icon_map = {
            "phone": ICON_PHONE,
            "телефон": ICON_PHONE,
            "tel": ICON_PHONE,
            "email": ICON_EMAIL,
            "e-mail": ICON_EMAIL,
            "mail": ICON_EMAIL,
            "name": ICON_NAME,
            "ime": ICON_NAME,
            "презиме": ICON_NAME,
            "finans": ICON_MONEY,
            "payment": ICON_MONEY,
            "uplata": ICON_MONEY,
            "финанс": ICON_MONEY,
        }

        def _icon_for(key):
            k = key.lower()
            for needle, icon in icon_map.items():
                if needle in k:
                    return icon
            return "*"

        preferred = []
        rest = []
        for k, v in custom:
            if any(x in k.lower() for x in ["phone", "телефон", "tel", "email", "mail", "name", "ime", "презиме", "finans", "payment", "uplata", "финанс"]):
                preferred.append((k, v))
            else:
                rest.append((k, v))
        ordered = preferred + rest

        for k, v in ordered:
            k_lower = k.lower()
            icon = _icon_for(k)
            if any(x in k_lower for x in ["phone", "телефон", "tel", "email", "mail", "name", "ime", "презиме", "finans", "payment", "uplata", "финанс"]):
                lines.append(f"{icon} {h(v)}")
            else:
                lines.append(f"{icon} <b>{h(k)}:</b> {h(v)}")

    if not status and not title and not custom:
        lines.append("")
        lines.append("<i>Could not extract details for this case.</i>")
    return "\n".join(lines)
def search_database(query_text, limit=10):
    """Search across cases + user-managed fields (case_user_data). Hybrid exact + fuzzy fallback."""
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

    conn = sqlite3.connect(DB_PATH)


    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    q0 = (query_text or "").strip()
    q1 = _mk_cyr_to_lat(q0)
    q2 = _mk_lat_to_cyr(q0)
    raw_variants = []
    for q in (q0, q1, q2):
        ql = q.strip().lower()
        if ql and ql not in raw_variants:
            raw_variants.append(ql)
    norm_variants = []
    for q in (q0, q1, q2):
        nq = normalize(q) if q else ""
        if nq and nq not in norm_variants:
            norm_variants.append(nq)
    # Load user-managed fields once (names, phones, payment, etc.)
    user_map = {}
    name_map = {}
    try:
        cur.execute("SELECT case_id, field_key, field_value FROM case_user_data")
        for r in cur.fetchall():
            cid = r["case_id"]
            if cid is None:
                continue
            cid = str(cid)
            parts = user_map.setdefault(cid, [])
            key = str(r["field_key"] or "")
            val = str(r["field_value"] or "")
            if key:
                parts.append(key)
            if val:
                parts.append(val)
            key_l = key.lower().strip()
            if key_l and any(k in key_l for k in ["name", "last name", "surname", "ime", "???????", "??????", "???"]):
                if val:
                    name_map[cid] = (name_map.get(cid, "") + " " + val).strip()
    except Exception:
        user_map = {}
    cur.execute("SELECT * FROM cases")
    rows = cur.fetchall()
    conn.close()
    matches = []
    fuzzy_candidates = []
    for r in rows:
        d = dict(r)
        cid = str(d.get("case_id") or "")
        parts = [str(v).lower() for v in d.values() if v is not None and str(v).strip() != ""]
        extra = " ".join(user_map.get(cid, []))
        if extra:
            parts.append(extra.lower())
        row_str = " ".join(parts)
        row_norm = normalize(row_str) if row_str else ""
        if row_norm:
            title_norm = normalize(d.get("latest_title") or "")
            name_norm = normalize(name_map.get(cid, ""))
            focused_norm = " ".join([t for t in [title_norm, name_norm] if t])
            fuzzy_candidates.append((cid, d.get("latest_list_state") or "", d.get("latest_title") or "", row_norm, focused_norm))
        hit = False
        for q in raw_variants:
            if q and q in row_str:
                hit = True
                break
        if (not hit) and norm_variants and row_norm:
            for nq in norm_variants:
                if nq and nq in row_norm:
                    hit = True
                    break
        if hit:
            matches.append((cid, d.get("latest_list_state") or "", d.get("latest_title") or ""))
        if limit is not None and len(matches) >= limit:
            break
    # Fuzzy fallback (typo-tolerant) when exact hits are few
    if fuzz is not None and len(matches) <= 2:
        q_norms = []
        for q in (q0, q1, q2):
            nq = normalize(q)
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
                seen = set(cid for cid, _, _ in matches)
                scored = []
                for cid, state, title, row_norm, focused_norm in fuzzy_candidates:
                    if cid in seen:
                        continue
                    if not focused_norm:
                        continue
                    # Strong substring hit (4+ chars) on normalized name/title
                    best = 0
                    for nq in q_norms:
                        if len(nq) >= 4 and nq in focused_norm:
                            best = 100
                            break
                    if best == 0:
                        for nq in q_norms:
                            score = fuzz.partial_ratio(nq, focused_norm)
                            if score > best:
                                best = score
                    if best >= threshold:
                        scored.append((best, cid, state, title))
                scored.sort(reverse=True)
                for _, cid, state, title in scored[:50]:
                    matches.append((cid, state, title))
                if limit is not None and len(matches) > limit:
                    matches = matches[:limit]
    return matches

def parse_field_intent(text: str):
    t = (text or "").lower()
    if any(k in t for k in ["payment", "paid", "pay", "uplata", "\u0443\u043f\u043b\u0430\u0442\u0430", "\u0443\u043f\u043b\u0430\u0442", "\u043f\u043b\u0430\u0442", "\u043f\u043b\u0430\u045c", "\u0444\u0438\u043d\u0430\u043d\u0441"]):
        return ("Payment", ["finansii", "payment", "uplata", "\u0444\u0438\u043d\u0430\u043d\u0441\u0438\u0438", "\u0444\u0438\u043d\u0430\u043d\u0441"])
    if any(k in t for k in ["phone", "tel", "telephone", "mobile", "kontakt", "\u043a\u043e\u043d\u0442\u0430\u043a\u0442", "\u0442\u0435\u043b", "\u0442\u0435\u043b\u0435\u0444\u043e\u043d", "broj", "\u0431\u0440\u043e\u0458"]):
        return ("Phone", ["phone", "\u0442\u0435\u043b\u0435\u0444\u043e\u043d", "broj", "\u0431\u0440\u043e\u0458"])
    if any(k in t for k in ["name", "last name", "surname", "ime", "\u0438\u043c\u0435", "\u043f\u0440\u0435\u0437\u0438\u043c\u0435"]):
        return ("Name / Last name", ["name / last name", "name", "last name", "surname", "ime", "\u0438\u043c\u0435", "\u043f\u0440\u0435\u0437\u0438\u043c\u0435"])
    return None
def get_case_user_value(case_id: str, key_candidates):
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        has_cud = cur.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='case_user_data'"
        ).fetchone() is not None
        if not has_cud:
            conn.close()
            return None
        for k in key_candidates or []:
            if not k:
                continue
            row = cur.execute(
                "SELECT field_value FROM case_user_data WHERE case_id=? AND lower(field_key)=? ORDER BY rowid DESC LIMIT 1",
                (str(case_id), str(k).lower()),
            ).fetchone()
            if row and row[0] is not None and str(row[0]).strip():
                conn.close()
                return str(row[0]).strip()
        for k in key_candidates or []:
            if not k:
                continue
            row = cur.execute(
                "SELECT field_value FROM case_user_data WHERE case_id=? AND lower(field_key) LIKE ? ORDER BY rowid DESC LIMIT 1",
                (str(case_id), f"%{str(k).lower()}%"),
            ).fetchone()
            if row and row[0] is not None and str(row[0]).strip():
                conn.close()
                return str(row[0]).strip()
        conn.close()
        return None
    except Exception:
        try:
            conn.close()
        except Exception:
            pass
        return None
def main():
    # Best-effort UTF-8 console safety (Windows)
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
        # --- Single-instance guard (Telegram getUpdates cannot run twice) ---
    try:
        _k32 = ctypes.windll.kernel32
        _mutex = _k32.CreateMutexW(None, True, "Global\\EUrbanizamTelegramBot")
        if _mutex:
            _err = _k32.GetLastError()
            if _err == 183:  # ERROR_ALREADY_EXISTS
                print("Another bot instance is already running. Exiting.")
                return 0
        else:
            print("WARN: Could not create mutex; continuing without single-instance guard.")
    except Exception:
        pass
# --- Token loading (never print secrets) ---
    token_keys = ["TELEGRAM_BOT_TOKEN", "BOT_TOKEN", "TELEGRAM_TOKEN"]
    def try_load_dotenv(dotenv_path: Path):
        # Minimal .env reader (KEY=VALUE), does not override existing env vars.
        try:
            if not dotenv_path.exists():
                return
            for line in dotenv_path.read_text(encoding="utf-8", errors="ignore").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k and (k not in os.environ):
                    os.environ[k] = v
        except Exception:
            return
    # Optional: load local .env (no printing)
    try_load_dotenv(ROOT / ".env")
    try_load_dotenv(RUNTIME_ROOT / "secrets" / ".eurbanizam_secrets.env")
    token = ""
    for k in token_keys:
        v = os.environ.get(k)
        if v:
            token = v
            break
    if not token:
        print("ERROR: No bot token found. Set TELEGRAM_BOT_TOKEN (preferred).")
        return 2
    # --- Telegram API helpers ---
    api_base = f"https://api.telegram.org/bot{token}/"
    def tg_post(method: str, data=None, timeout=60):
        return requests.post(api_base + method, json=data or {}, timeout=timeout)
    TG_MAX_LEN = 4096
    TG_SAFE_LEN = 4000
    def _html_to_text(s: str) -> str:
        if s is None:
            return ""
        t = str(s)
        # Basic HTML to plain text for Telegram fallback
        t = t.replace("<br>", "\n").replace("<br/>", "\n").replace("<br />", "\n")
        t = re.sub(r"</?(b|i|u|em|strong)>", "", t)
        t = re.sub(r"</?pre>", "", t)
        t = re.sub(r"</?code>", "", t)
        t = re.sub(r"<[^>]+>", "", t)
        return t
    def _chunk_text(s: str, limit: int) -> list:
        chunks = []
        text = "" if s is None else str(s)
        while text:
            if len(text) <= limit:
                chunks.append(text)
                break
            cut = text.rfind("\n", 0, limit)
            if cut < 1:
                cut = text.rfind(" ", 0, limit)
            if cut < 1:
                cut = limit
            chunk = text[:cut].rstrip()
            chunks.append(chunk)
            text = text[cut:].lstrip()
        return chunks
    def _send_once(chat_id: int, text: str, reply_to: int = None, html: bool = False):
        payload = {"chat_id": chat_id, "text": text}
        if reply_to is not None:
            payload["reply_to_message_id"] = reply_to
        if html:
            payload["parse_mode"] = "HTML"
            payload["disable_web_page_preview"] = True
        r = tg_post("sendMessage", payload, timeout=30)
        ok = False
        desc = None
        try:
            j = r.json()
            ok = bool(j.get("ok"))
            if not ok:
                desc = j.get("description")
                print(f"sendMessage failed: HTTP {r.status_code} desc={desc}")
        except Exception:
            print(f"sendMessage failed: HTTP {r.status_code} body={r.text[:120]}")
        return r, ok, desc
    def send_message(chat_id: int, text: str, reply_to: int = None, html: bool = False):
        msg = "" if text is None else str(text)
        if html and len(msg) > TG_SAFE_LEN:
            html = False
            msg = _html_to_text(msg)
        if len(msg) <= TG_SAFE_LEN:
            r, ok, desc = _send_once(chat_id, msg, reply_to=reply_to, html=html)
            if ok:
                return r
            if html:
                r2, ok2, desc2 = _send_once(chat_id, _html_to_text(msg), reply_to=reply_to, html=False)
                if ok2:
                    return r2
                desc = desc2 or desc
                r = r2
                html = False
                msg = _html_to_text(msg)
            if desc and "message is too long" not in desc.lower():
                return r
        # Chunking fallback for oversized messages
        chunks = _chunk_text(msg, TG_SAFE_LEN)
        last_r = None
        for i, chunk in enumerate(chunks):
            r, ok, desc = _send_once(chat_id, chunk, reply_to=reply_to if i == 0 else None, html=html)
            if ok:
                last_r = r
                continue
            if html:
                r2, ok2, _ = _send_once(chat_id, _html_to_text(chunk), reply_to=reply_to if i == 0 else None, html=False)
                last_r = r2
                if ok2:
                    continue
            last_r = r
        return last_r
    def load_case_json(case_id: str):
        p = DATA_DIR / f"{case_id}.json"
        if not p.exists():
            return None, f"?? JSON not found: {p}"
        try:
            return json.loads(p.read_text(encoding="utf-8")), None
        except Exception as e:
            return None, f"?? Failed reading JSON for {case_id}: {e}"
    print(f"ROOT: {ROOT}")
    print(f"RUNTIME_ROOT: {RUNTIME_ROOT}")
    print(f"DB: {DB_PATH}")
    print(f"DATA_DIR: {DATA_DIR}")
    print("Bot running (Telegram getUpdates long-poll). Press Ctrl+C to stop.")
    def _send_results_page(chat_id, mid, query_text, matches, offset=0):
        total = len(matches)
        page = matches[offset:offset + PAGE_SIZE]
        lines = [f"Top matches for: {query_text}", ""]
        for cid, state, title in page:
            data, err = load_case_json(cid)
            if err:
                lines.append(f"{cid}")
                if state:
                    lines.append(f"{state}")
                if title:
                    lines.append(f"{title}")
            else:
                lines.append(parse_case_data(cid, data))
            lines.append("------------------------------")
        if total > offset + PAGE_SIZE:
            lines.append(f"Found {total} matches. Reply 'more' for next 10 or refine your search.")
        else:
            lines.append("Reply with ID for full details.")
        send_message(chat_id, "\n".join(lines), reply_to=mid, html=True)

    offset = None
    search_sessions = {}
    PAGE_SIZE = 10
    while True:
        try:
            params = {"timeout": 50}
            if offset is not None:
                params["offset"] = offset
            r = tg_post("getUpdates", params, timeout=60)
            if r.status_code != 200:
                print(f"getUpdates HTTP {r.status_code}: {r.text[:200]}")
                time.sleep(2)
                continue
            payload = r.json()
            if not payload.get("ok"):
                print(f"getUpdates not ok: {str(payload)[:200]}")
                time.sleep(2)
                continue
            for upd in payload.get("result", []):
                offset = upd.get("update_id", 0) + 1
                msg = upd.get("message") or upd.get("edited_message")
                if not msg:
                    continue
                chat = msg.get("chat") or {}
                chat_id = chat.get("id")
                text = (msg.get("text") or "").strip()
                mid = msg.get("message_id")
                if not chat_id:
                    continue
                if text.lower() in ("more", "next"):
                    sess = search_sessions.get(chat_id)
                    if not sess:
                        send_message(chat_id, "No active search. Send a new search term.", reply_to=mid)
                        continue
                    page_offset = sess.get("offset", 0) + PAGE_SIZE
                    if page_offset >= len(sess["matches"]):
                        send_message(chat_id, "No more results.", reply_to=mid)
                        search_sessions.pop(chat_id, None)
                        continue
                    sess["offset"] = page_offset
                    _send_results_page(chat_id, mid, sess["query"], sess["matches"], offset=page_offset)
                    continue

                # Commands:
                # /ping
                # /case <id>
                if text.lower().startswith("/ping"):
                    send_message(chat_id, "pong ?", reply_to=mid)
                    continue
                if text.lower().startswith("/case"):
                    parts = text.split(maxsplit=1)
                    if len(parts) < 2 or not parts[1].strip():
                        send_message(chat_id, "Usage: /case <case_id>", reply_to=mid)
                        continue
                    case_id = parts[1].strip()
                    data, err = load_case_json(case_id)
                    if err:
                        send_message(chat_id, err, reply_to=mid)
                        continue
                    # Use your existing formatter
                    html_msg = parse_case_data(case_id, data)
                    send_message(chat_id, html_msg, reply_to=mid, html=True)
                    continue
                # Fallback: search DB
                if not text:
                    send_message(chat_id, "Send /ping, /case <id>, or any search text.", reply_to=mid)
                    continue
                # Field + case id quick lookup (payment/phone/name)
                intent = parse_field_intent(text)
                m_id = re.search(r"\b(\d{4,10})\b", text)
                if intent and m_id:
                    case_id = m_id.group(1)
                    if _is_case_id(case_id):
                        label, keys = intent
                        val = get_case_user_value(case_id, keys)
                        if val is None:
                            send_message(chat_id, f"No {label} stored for case {case_id}.", reply_to=mid)
                        else:
                            send_message(chat_id, f"{label} for {case_id} is: {val}", reply_to=mid)
                        continue
                # A) Local intent parse
                plan = _parse_local_plan(text)
                matches = []
                if plan:
                    if plan.get("intent") == "status_changed_recent":
                        days = int(plan.get("days") or 0)
                        matches = _recent_status_changes(days, limit=10)
                        if not matches:
                            send_message(chat_id, f"No status changes in the last {days} day(s).", reply_to=mid)
                            continue
                        lines = [f"Status changes in last {days} day(s):", ""]
                        for cid, state, title in matches:
                            lines.append(f"?? {cid}")
                            if state:
                                lines.append(f"?? {state}")
                            if title:
                                lines.append(f"?? {title}")
                            lines.append("------------------------------")
                        lines.append("Reply with ID for full details.")
                        send_message(chat_id, "\n".join(lines), reply_to=mid)
                        continue
                    if plan.get("intent") == "case_details" and plan.get("case_id"):
                        data, err = load_case_json(plan["case_id"])
                        if err:
                            send_message(chat_id, err, reply_to=mid)
                        else:
                            html_msg = parse_case_data(plan["case_id"], data)
                            send_message(chat_id, html_msg, reply_to=mid, html=True)
                        continue
                    if plan.get("intent") == "list_paid_cases":
                        matches = _list_paid_cases(limit=10)
                    if plan.get("intent") == "search_cases":
                        q = plan.get("query") or text
                        matches = search_database(q, limit=None)
                        matches = _apply_filters_to_matches(matches, plan.get("filters") or {})
                # B) Local search fallback
                if not matches:
                    try:
                        matches = search_database(text, limit=None)
                    except Exception as e:
                        send_message(chat_id, f"DB search error: {e}", reply_to=mid)
                        continue
                # C) Gemini plan if local intent + local search didn't help
                if not matches:
                    gplan = _gemini_plan(text)
                    if gplan:
                        g_intent = (gplan.get("intent") or "").strip()
                        g_case_id = (gplan.get("case_id") or "").strip()
                        g_field = (gplan.get("field") or "").strip()
                        g_filters = gplan.get("filters") or {}
                        if g_intent == "case_details" and g_case_id:
                            data, err = load_case_json(g_case_id)
                            if err:
                                send_message(chat_id, err, reply_to=mid)
                            else:
                                html_msg = parse_case_data(g_case_id, data)
                                send_message(chat_id, html_msg, reply_to=mid, html=True)
                            continue
                        if g_intent == "custom_field_lookup" and g_case_id and g_field:
                            keys = _field_key_candidates(g_field)
                            val = get_case_user_value(g_case_id, keys)
                            if val is None:
                                send_message(chat_id, f"No {g_field} stored for case {g_case_id}.", reply_to=mid)
                            else:
                                send_message(chat_id, f"{g_field} for {g_case_id} is: {val}", reply_to=mid)
                            continue
                        if g_intent == "list_paid_cases":
                            matches = _list_paid_cases(limit=10)
                        else:
                            q = (gplan.get("query") or text).strip()
                            matches = search_database(q, limit=None)
                            matches = _apply_filters_to_matches(matches, g_filters)
                if not matches:
                    t = (text or "").strip()
                    tl = t.lower()
                    help_msg = ""
                    help_msg += "Hi! I can search your local E-Urbanizam database.\n"
                    help_msg += "\n"
                    help_msg += "Examples:\n"
                    help_msg += "- 76352  (case details)\n"
                    help_msg += "- \u041a\u041f 2062/2  (search)\n"
                    help_msg += "- payment 76352  (shows Payment if stored)\n"
                    help_msg += "- list paid cases  (payment status)\n"
                    help_msg += "\n"
                    help_msg += "Tip: If I show a list of results, reply with an ID for full details.\n"
                    if tl in ("hello","hi","hey","hej","/start","start","/help","help","?"):
                        send_message(chat_id, help_msg.strip(), reply_to=mid)
                    else:
                        send_message(chat_id, f"No matches for: {text}\n\nTry: a case ID (e.g. 76352) or a keyword (e.g. \u041a\u041f 2062/2).", reply_to=mid)
                    continue

                search_sessions[chat_id] = {
                    "query": text,
                    "matches": matches,
                    "offset": 0,
                }
                _send_results_page(chat_id, mid, text, matches, offset=0)
        except KeyboardInterrupt:
            print("Stopping bot.")
            return 0
        except Exception as e:
            print(f"Loop error: {e}")
            time.sleep(2)
if __name__ == "__main__":
    raise SystemExit(main())
