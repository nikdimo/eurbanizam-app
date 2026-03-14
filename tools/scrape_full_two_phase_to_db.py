import os, re, time, json, argparse, sqlite3, sys
from pathlib import Path
from datetime import datetime
from playwright.sync_api import sync_playwright

# --- FIX: FORCE UTF-8 OUTPUT ON WINDOWS ---
try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

# ============================
# VERSIONING
# ============================
VERSION = "v3_X1_two_phase_list_plus_cases_json_db"
BUILD_AT = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

# ============================
# PATHS
# ============================
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
SETTINGS_PATH = ROOT / "settings.json"

from apps.api.core import case_documents as api_case_documents


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
    runtime_root = _expand_path(data.get("runtime_root", "%USERPROFILE%\.eurbanizam"), project_root)
    return {
        "project_root": project_root,
        "runtime_root": runtime_root,
        "local_db_path": _expand_path(data["local_db_path"], runtime_root),
        "local_json_dir": _expand_path(data["local_json_dir"], runtime_root),
        "local_logs_dir": _expand_path(data["local_logs_dir"], runtime_root),
        "raw": data,
    }


SETTINGS = load_settings(SETTINGS_PATH)
RUNTIME_ROOT = SETTINGS["runtime_root"]
DB_PATH = SETTINGS["local_db_path"]
CASES_OUT_DIR = SETTINGS["local_json_dir"]
LOGS_DIR = SETTINGS["local_logs_dir"] / "scraper"
LIST_JSONL_PATH = LOGS_DIR / "list_rows_v3_X1.jsonl"
LINKS_FILE = LOGS_DIR / "all_case_links_v3_X1.txt"
PROGRESS_FILE = LOGS_DIR / "full_scrape_progress_v3_X1.json"

DT_RX = re.compile(r"\b(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?\b")
ISO_RX = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\b")

# ============================
# UTIL
# ============================
def now_iso() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())

def parse_dt_mk(text: str):
    """Parses DD.MM.YYYY HH:MM:SS, returns datetime or None."""
    m = DT_RX.search(text or "")
    if not m:
        return None
    dd, mm, yyyy, HH, MM, SS = m.group(1), m.group(2), m.group(3), m.group(4), m.group(5), m.group(6)
    if HH is None:
        HH, MM, SS = "00", "00", "00"
    try:
        return datetime(int(yyyy), int(mm), int(dd), int(HH), int(MM), int(SS))
    except Exception:
        return None

def extract_label_value(raw_text: str, label: str):
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


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ[k.strip()] = v.strip()

def save_json(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")

def save_progress(obj: dict) -> None:
    PROGRESS_FILE.parent.mkdir(parents=True, exist_ok=True)
    save_json(PROGRESS_FILE, obj)

def load_progress() -> dict | None:
    if not PROGRESS_FILE.exists():
        return None
    try:
        return json.loads(PROGRESS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return None

def extract_case_id_from_url(url: str) -> str | None:
    m = re.search(r"/detail/\d+/(\d+)", url or "")
    return m.group(1) if m else None

def is_hash_home_url(u: str) -> bool:
    u = (u or "").lower()
    return "#/home" in u or "#/request" in u or "#/administration" in u

# ============================
# SESSION PERSISTENCE (remembers login, incl. Outlook/Microsoft SSO)
# ============================
STORAGE_STATE_PATH = RUNTIME_ROOT / "state" / "storage_state.json"

def is_logged_in_quick(page, timeout_ms: int = 3000) -> bool:
    """Quick check if we're already logged in (reuses session)."""
    try:
        if is_hash_home_url(page.url):
            return True
        for sel in ["a:has-text('Одјава')", "a:has-text('Logout')", "text=Пребарај", "text=Пребарување"]:
            try:
                loc = page.locator(sel).first
                if loc.count() > 0 and loc.is_visible(timeout=min(500, timeout_ms)):
                    return True
            except Exception:
                pass
    except Exception:
        pass
    return False

def create_context_with_session(browser, storage_state_path: Path = None):
    """Create browser context, loading stored session if available."""
    path = storage_state_path or STORAGE_STATE_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        try:
            return browser.new_context(storage_state=str(path))
        except Exception:
            pass
    return browser.new_context()

def ensure_logged_in(page, context, login_url: str, user: str, pw: str, storage_state_path: Path = None) -> None:
    """Login if needed, then save session so next run reuses it."""
    path = storage_state_path or STORAGE_STATE_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    page.goto(login_url, wait_until="domcontentloaded")
    dismiss_popup_hard(page, 8000)
    page.wait_for_timeout(1500)
    if is_logged_in_quick(page):
        print("Using saved session (already logged in).")
        try:
            context.storage_state(path=str(path))
        except Exception:
            pass
        return
    login(page, login_url, user, pw)
    try:
        context.storage_state(path=str(path))
        print("Session saved for next run.")
    except Exception:
        pass

# ============================
# POPUP DISMISS
# ============================
def dismiss_popup_hard(page, max_wait_ms: int = 60_000) -> bool:
    candidates = [
        "button[ng-click='Dismiss()']",
        "button.btn.btn-primary:has-text('OK')",
        "text=OK",
    ]
    deadline = time.time() + (max_wait_ms / 1000.0)
    while time.time() < deadline:
        for sel in candidates:
            try:
                loc = page.locator(sel).first
                if loc.count() > 0 and loc.is_visible(timeout=400):
                    loc.click(force=True, timeout=5000)
                    page.wait_for_timeout(250)
                    return True
            except Exception:
                pass
        page.wait_for_timeout(250)
    return False

def wait_for_login_success(page, timeout_ms: int = 240_000) -> None:
    deadline = time.time() + (timeout_ms / 1000.0)
    ui_candidates = [
        "a:has-text('Одјава')",
        "a:has-text('Logout')",
        "text=Пребарај",
        "text=Пребарување",
        "ul.nav",
        "div.sidebar",
    ]
    while time.time() < deadline:
        dismiss_popup_hard(page, 2000)
        try:
            if is_hash_home_url(page.url):
                return
        except Exception:
            pass
        for sel in ui_candidates:
            try:
                loc = page.locator(sel).first
                if loc.count() > 0 and loc.is_visible(timeout=300):
                    return
            except Exception:
                pass
        page.wait_for_timeout(500)
    raise TimeoutError(f"Login success not detected (url={page.url}).")

def login(page, login_url: str, user: str, pw: str) -> None:
    print("Go to login:", login_url)
    page.goto(login_url, wait_until="domcontentloaded")
    dismiss_popup_hard(page, 120000)

    page.wait_for_selector("#exampleInputEmail1", timeout=180000)
    page.wait_for_selector("#exampleInputPassword1", timeout=180000)

    page.fill("#exampleInputEmail1", user)
    page.fill("#exampleInputPassword1", pw)

    dismiss_popup_hard(page, 5000)

    print("Click login...")
    page.locator("button:has-text('Најави се')").first.click(force=True)
    print("Waiting for login success (hash-safe)...")
    wait_for_login_success(page, timeout_ms=240000)
    print("Login confirmed. URL:", page.url)

# ============================
# DB
# ============================
def db_connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn

def db_init(conn: sqlite3.Connection) -> None:
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS runs (
      run_id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      mode TEXT NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS cases (
      case_id TEXT PRIMARY KEY,
      first_seen_at TEXT,
      last_seen_at TEXT,
      official_created_at TEXT,
      latest_detail_url TEXT,
      latest_request_type TEXT,
      latest_title TEXT,
      latest_list_state TEXT,
      latest_movement_last_change_dt TEXT,
      latest_movement_prev_change_dt TEXT,
      latest_movement_to_state TEXT
    );

    CREATE TABLE IF NOT EXISTS list_snapshots (
      snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      scraped_at TEXT NOT NULL,
      case_id TEXT NOT NULL,
      detail_url TEXT,
      request_type TEXT,
      title TEXT,
      list_state TEXT,
      row_json TEXT,
      row_hash TEXT,
      FOREIGN KEY(run_id) REFERENCES runs(run_id)
    );

    CREATE TABLE IF NOT EXISTS case_json_index (
      case_id TEXT PRIMARY KEY,
      last_scraped_at TEXT,
      json_path TEXT,
      json_hash TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_list_snapshots_case_id ON list_snapshots(case_id);
    CREATE INDEX IF NOT EXISTS idx_list_snapshots_run_id ON list_snapshots(run_id);
    """)
    # Ensure new columns exist on older DBs
    try:
        existing = {r[1] for r in conn.execute("PRAGMA table_info(cases)").fetchall()}
        desired = {"official_created_at": "TEXT", "latest_movement_prev_change_dt": "TEXT"}
        for col, coltype in desired.items():
            if col not in existing:
                conn.execute(f"ALTER TABLE cases ADD COLUMN {col} {coltype}")
    except Exception:
        pass
    api_case_documents.ensure_case_documents_schema(conn)
    conn.commit()

def sha1_text(s: str) -> str:
    import hashlib
    return hashlib.sha1((s or "").encode("utf-8", errors="ignore")).hexdigest()

# ============================
# LIST PHASE (Phase 1)
# ============================
def open_filter_panel_robust(page):
    candidates = [
        "button:has-text('Пребарај')",
        "a:has-text('Пребарај')",
        "button:has-text('Пребарување')",
        "a:has-text('Пребарување')",
        "text=Пребарај",
        "text=Пребарување",
    ]
    for _ in range(6):
        dismiss_popup_hard(page, 2000)
        for sel in candidates:
            try:
                b = page.locator(sel).first
                if b.count() > 0 and b.is_visible(timeout=400):
                    b.click(force=True, timeout=5000)
                    page.wait_for_timeout(500)
                    if page.locator("#status-select").count() > 0:
                        return True
            except Exception:
                pass
        page.wait_for_timeout(500)
    return True

def set_status_zero_and_clear_type(page):
    print("Setting status = 0 ...")
    page.wait_for_selector("#status-select", timeout=180000)
    page.select_option("#status-select", "0")
    page.wait_for_timeout(250)

    if page.locator("#request-type-select").count() > 0:
        print("Clearing request-type-select -> empty ...")
        try:
            page.select_option("#request-type-select", "")
        except Exception:
            page.evaluate("""
                () => {
                    const sel = document.querySelector('#request-type-select');
                    if (!sel) return;
                    const opt = Array.from(sel.options).find(o => !o.value);
                    if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', {bubbles:true})); }
                }
            """)
    page.wait_for_timeout(250)

def click_search_requests(page):
    print("Clicking SearchRequests...")
    btn = page.locator("button[ng-click='SearchRequests()'], button[ng-click=\"SearchRequests()\"]").first
    if btn.count() == 0:
        btn = page.locator("button:has-text('Пребарај')").first
    btn.click(force=True, timeout=15000)
    page.wait_for_timeout(600)

def wait_for_real_results(page, timeout_ms: int = 180_000):
    print("Waiting for real results (table rows)...")
    deadline = time.time() + (timeout_ms / 1000.0)
    last_rows = None
    while time.time() < deadline:
        dismiss_popup_hard(page, 1500)
        rows = page.locator("table tbody tr")
        n = rows.count()
        sample = ""
        if n > 0:
            try:
                sample = norm(rows.first.inner_text(timeout=800))[:140]
            except Exception:
                sample = ""
        if last_rows != n:
            last_rows = n
            # Safe print to avoid UnicodeEncodeError on Windows CP1252 consoles
            try:
                print(f"  ...rows={n}, sample='{sample}'")
            except Exception:
                print(f"  ...rows={n}, sample='(unicode content)'")
                
        if n >= 1 and "Нема резултати" not in sample:
            return
        page.wait_for_timeout(600)
    raise TimeoutError("Timed out waiting for real results.")

def next_link_locator(page):
    # List pagination next: "Следни →" or "Следни" or "Следна"
    # Keep broad but prefer ul.pagination
    rx = re.compile(r"Следни|Следна", re.I)
    return page.locator("ul.pagination a").filter(has_text=rx).first if page.locator("ul.pagination").count() > 0 else page.locator("a").filter(has_text=rx).first

def is_next_disabled(next_a):
    try:
        li = next_a.locator("xpath=ancestor::li[1]")
        if li.count() > 0:
            cls = (li.get_attribute("class") or "").lower()
            if "disabled" in cls:
                return True
    except Exception:
        pass
    try:
        aria = (next_a.get_attribute("aria-disabled") or "").lower()
        if aria == "true":
            return True
    except Exception:
        pass
    return False

def click_next_page(page) -> bool:
    next_a = next_link_locator(page)
    if next_a.count() == 0:
        return False
    try:
        if not next_a.is_visible(timeout=500):
            return False
    except Exception:
        return False
    if is_next_disabled(next_a):
        return False
    try:
        next_a.scroll_into_view_if_needed(timeout=2000)
    except Exception:
        pass
    next_a.click(force=True)
    page.wait_for_timeout(700)
    dismiss_popup_hard(page, 2000)
    return True

def collect_list_page_rows(page, base_origin: str) -> list[dict]:
    """
    Reads the visible list table and returns list of dicts based on headers + tds.
    Also extracts detail_url from 'Детали' anchor/icon if present in row.
    """
    out = []
    table = page.locator("table").first
    if table.count() == 0:
        return out

    # headers
    headers = []
    ths = table.locator("thead th")
    if ths.count() == 0:
        # fallback: first row th/td
        first_tr = table.locator("tr").first
        fths = first_tr.locator("th,td")
        for i in range(fths.count()):
            headers.append(norm(fths.nth(i).inner_text()))
    else:
        for i in range(ths.count()):
            headers.append(norm(ths.nth(i).inner_text()))

    # rows
    trs = table.locator("tbody tr")
    for i in range(trs.count()):
        tr = trs.nth(i)
        try:
            row_text = norm(tr.inner_text(timeout=1500))
        except Exception:
            row_text = ""
        if not row_text or "Нема резултати" in row_text:
            continue

        tds = tr.locator("td")
        cells = []
        for c in range(tds.count()):
            try:
                cells.append(norm(tds.nth(c).inner_text(timeout=1500)))
            except Exception:
                cells.append("")

        row = {}
        # map header->cell (best effort)
        for idx, h in enumerate(headers):
            if not h:
                h = f"COL_{idx+1}"
            row[h] = cells[idx] if idx < len(cells) else ""

        # detail url
        detail = tr.locator("a[title='Детали'], a:has(i.la-angle-right), a:has-text('Детали')").first
        detail_url = ""
        try:
            href = (detail.get_attribute("href") or "").strip() if detail.count() > 0 else ""
        except Exception:
            href = ""

        if href:
            if href.startswith("http://") or href.startswith("https://"):
                detail_url = href
            else:
                # base_origin like "https://www.e-urbanizam.mk/admin/"
                # if href starts with "#/..." -> append
                if href.startswith("#/"):
                    detail_url = base_origin.rstrip("/") + "/" + href
                else:
                    # relative
                    detail_url = base_origin.rstrip("/") + "/" + href.lstrip("/")
        row["_detail_url"] = detail_url

        # normalize common fields (based on your Excel/labels)
        # These keys depend on site header text; we store also "row" raw.
        # We'll try a few known Macedonian labels:
        def pick(*keys):
            for k in keys:
                if k in row and row[k]:
                    return row[k]
            return ""

        case_id = pick("Број на постапка", "Број на предмет", "Број на постапката", "Број")
        title = pick("Наслов")
        request_type = pick("Тип на барање", "Тип на барање ", "Тип")
        list_state = pick("Состојба", "Статус")  # in list column it’s "Состојба"

        # If case_id is empty, try to extract from detail_url
        if not case_id:
            cid = extract_case_id_from_url(detail_url)
            if cid:
                case_id = cid

        row["_case_id"] = case_id
        row["_title"] = title
        row["_request_type"] = request_type
        row["_list_state"] = list_state

        out.append(row)

    return out

def phase1_collect_all_list_pages(page, list_url: str, admin_base_origin: str, run_id: int, conn: sqlite3.Connection, max_pages: int | None = None):
    """
    FULL list crawl: apply filters -> iterate Next until disabled -> collect rows+urls.
    Writes:
      - DB list_snapshots
      - JSONL raw list rows
      - all_case_links file
      - upserts cases table with latest list fields
    Returns: ordered unique list of detail_urls
    """
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    LIST_JSONL_PATH.write_text("", encoding="utf-8")  # overwrite each full run

    print("Go to list:", list_url)
    page.goto(list_url, wait_until="domcontentloaded", timeout=240000)
    dismiss_popup_hard(page, 10000)
    page.wait_for_timeout(800)

    open_filter_panel_robust(page)
    set_status_zero_and_clear_type(page)
    click_search_requests(page)
    wait_for_real_results(page, 180000)
    print("Real results detected.")

    seen_urls = set()
    all_urls = []
    scraped_at = now_iso()

    page_idx = 1
    while True:
        if max_pages is not None and page_idx > max_pages:
            break
        wait_for_real_results(page, 180000)
        rows = collect_list_page_rows(page, admin_base_origin)

        added_urls = 0
        added_rows = 0

        with LIST_JSONL_PATH.open("a", encoding="utf-8") as jf:
            for r in rows:
                case_id = r.get("_case_id", "") or ""
                detail_url = r.get("_detail_url", "") or ""
                if not case_id or not detail_url:
                    continue

                # write jsonl (raw list row)
                jf.write(json.dumps({
                    "run_id": run_id,
                    "scraped_at": scraped_at,
                    "case_id": case_id,
                    "detail_url": detail_url,
                    "list_row": r
                }, ensure_ascii=False) + "\n")

                row_json = json.dumps(r, ensure_ascii=False, sort_keys=True)
                row_hash = sha1_text(row_json)

                # DB snapshot insert
                conn.execute("""
                  INSERT INTO list_snapshots(run_id, scraped_at, case_id, detail_url, request_type, title, list_state, row_json, row_hash)
                  VALUES(?,?,?,?,?,?,?,?,?)
                """, (
                    run_id,
                    scraped_at,
                    case_id,
                    detail_url,
                    r.get("_request_type",""),
                    r.get("_title",""),
                    r.get("_list_state",""),
                    row_json,
                    row_hash
                ))
                added_rows += 1

                # Upsert cases (list-view latest)
                conn.execute("""
                  INSERT INTO cases(case_id, first_seen_at, last_seen_at, latest_detail_url, latest_request_type, latest_title, latest_list_state)
                  VALUES(?,?,?,?,?,?,?)
                  ON CONFLICT(case_id) DO UPDATE SET
                    last_seen_at=excluded.last_seen_at,
                    latest_detail_url=excluded.latest_detail_url,
                    latest_request_type=excluded.latest_request_type,
                    latest_title=excluded.latest_title,
                    latest_list_state=excluded.latest_list_state
                """, (
                    case_id, scraped_at, scraped_at, detail_url,
                    r.get("_request_type",""),
                    r.get("_title",""),
                    r.get("_list_state",""),
                ))

                if detail_url not in seen_urls:
                    seen_urls.add(detail_url)
                    all_urls.append(detail_url)
                    added_urls += 1

        conn.commit()

        print(f"List page {page_idx}: rows_saved={added_rows}, urls_added={added_urls}, total_urls={len(all_urls)}")

        if not click_next_page(page):
            print("Reached last page (Next disabled / not found).")
            break
        page_idx += 1

    # write links file
    LINKS_FILE.write_text("\n".join(all_urls) + ("\n" if all_urls else ""), encoding="utf-8")
    print(f"Saved links: {LINKS_FILE} (unique={len(all_urls)})")
    print(f"Saved list JSONL: {LIST_JSONL_PATH}")

    return all_urls

# ============================
# CASE PHASE (Phase 2) - FULL TAB SCRAPE (v11-style)
# ============================
def click_main_tab(page, tab_text: str) -> bool:
    ok = page.evaluate(
        """
        (t) => {
          const anchors = Array.from(document.querySelectorAll('ul.nav-tabs a'));
          const norm = (s) => (s||'').replace(/\\s+/g,' ').trim();
          const el = anchors.find(a => norm(a.innerText) === norm(t));
          if (!el) return false;
          el.scrollIntoView({block:'center', inline:'center'});
          el.click();
          return true;
        }
        """,
        tab_text
    )
    return bool(ok)

def list_main_tab_names(page) -> list:
    names = []
    locs = page.locator("ul.nav-tabs a")
    for i in range(locs.count()):
        try:
            t = norm(locs.nth(i).inner_text())
            if t:
                names.append(t)
        except Exception:
            pass
    out, seen = [], set()
    for n in names:
        if n not in seen:
            out.append(n)
            seen.add(n)
    return out

def active_pane_locator(page):
    return page.locator("div.tab-content .tab-pane.active, div.tab-content .tab-pane.show").first

def active_pane_text(page) -> str:
    pane = active_pane_locator(page)
    try:
        txt = pane.inner_text(timeout=20000) if pane.count() > 0 else page.locator("div.tab-content").first.inner_text(timeout=20000)
    except Exception:
        txt = ""
    return txt.replace("\r", "").strip()

def extract_tables(locator, max_tables=25, max_rows=2500) -> list:
    tables = []
    tbls = locator.locator("table")
    for ti in range(min(tbls.count(), max_tables)):
        t = tbls.nth(ti)
        try:
            headers = []
            ths = t.locator("thead th")
            for i in range(ths.count()):
                headers.append(norm(ths.nth(i).inner_text()))

            if not any(headers):
                first_tr = t.locator("tr").first
                ftds = first_tr.locator("th,td")
                headers = [norm(ftds.nth(i).inner_text()) for i in range(ftds.count())]

            rows = []
            trs = t.locator("tbody tr")
            if trs.count() == 0:
                trs = t.locator("tr")
            for ri in range(min(trs.count(), max_rows)):
                tr = trs.nth(ri)
                tds = tr.locator("td")
                if tds.count() == 0:
                    continue
                row = [norm(tds.nth(i).inner_text()) for i in range(tds.count())]
                if any(row):
                    rows.append(row)

            if any(headers) or rows:
                tables.append({"headers": headers, "rows": rows})
        except Exception:
            continue
    return tables

# ---- Movement paging (Angular pager) ----
def signature_first_row(container):
    try:
        tr = container.locator("table tbody tr").first
        if tr.count() > 0:
            return norm(tr.inner_text(timeout=2000))[:260]
    except Exception:
        pass
    return ""

def snapshot_tables_and_text(container):
    tables = extract_tables(container, max_tables=25, max_rows=2500)
    raw = ""
    try:
        raw = container.inner_text(timeout=20000).replace("\r","").strip()
    except Exception:
        raw = ""
    return raw, tables

def find_visible_angular_pager(container):
    try:
        a = container.locator("a[ng-click*='selectPage']").first
        if a.count() == 0:
            return None
        ul = a.locator("xpath=ancestor-or-self::ul[1]")
        if ul.count() > 0 and ul.is_visible(timeout=500):
            return ul
    except Exception:
        pass

    try:
        uls = container.locator("ul")
        for i in range(min(25, uls.count())):
            ul = uls.nth(i)
            try:
                if not ul.is_visible(timeout=200):
                    continue
                if ul.locator("a[ng-click*='selectPage']").count() > 0:
                    return ul
            except Exception:
                continue
    except Exception:
        pass
    return None

def is_next_disabled_arrow(arrow_a):
    try:
        li = arrow_a.locator("xpath=ancestor::li[1]")
        if li.count() > 0:
            cls = (li.get_attribute("class") or "").lower()
            if "disabled" in cls:
                return True
    except Exception:
        pass
    try:
        aria = (arrow_a.get_attribute("aria-disabled") or "").lower()
        if aria == "true":
            return True
    except Exception:
        pass
    return False

def movement_collect_by_arrow(page, container, max_pages=80):
    pages = []
    sig_seen = set()

    pager = find_visible_angular_pager(container)
    if not pager or pager.count() == 0:
        raw, tables = snapshot_tables_and_text(container)
        pages.append({"page_index": 1, "raw_text": raw, "tables": tables, "note": "no_visible_angular_pager_found"})
        return pages

    raw, tables = snapshot_tables_and_text(container)
    sig = signature_first_row(container)
    if sig:
        sig_seen.add(sig)
    pages.append({"page_index": 1, "raw_text": raw, "tables": tables, "note": "initial"})

    for step in range(2, max_pages + 1):
        pager = find_visible_angular_pager(container)
        if not pager or pager.count() == 0:
            pages[-1]["note2"] = "pager_disappeared"
            break

        arrow = pager.locator("a[ng-click*='selectPage(page + 1)'], a[ng-click*='selectPage(page+1)']").first
        if arrow.count() == 0:
            pages[-1]["note2"] = "arrow_not_found"
            break
        if not arrow.is_visible(timeout=300):
            pages[-1]["note2"] = "arrow_not_visible"
            break
        if is_next_disabled_arrow(arrow):
            pages[-1]["note2"] = "arrow_disabled"
            break

        prev_sig = signature_first_row(container)

        try:
            arrow.scroll_into_view_if_needed(timeout=2000)
        except Exception:
            pass

        arrow.click(force=True)
        page.wait_for_timeout(700)
        dismiss_popup_hard(page, 2000)

        deadline = time.time() + 12
        changed = False
        new_sig = ""
        while time.time() < deadline:
            new_sig = signature_first_row(container)
            if new_sig and new_sig != prev_sig:
                changed = True
                break
            page.wait_for_timeout(300)

        raw, tables = snapshot_tables_and_text(container)

        if not changed:
            pages.append({"page_index": step, "raw_text": raw, "tables": tables, "note": "arrow_click_no_change_stopping"})
            break

        if new_sig and new_sig in sig_seen:
            pages.append({"page_index": step, "raw_text": raw, "tables": tables, "note": "duplicate_signature_stopping"})
            break

        if new_sig:
            sig_seen.add(new_sig)

        pages.append({"page_index": step, "raw_text": raw, "tables": tables})

    return pages

def movement_collect_all_pages(page, max_pages=80):
    pane = active_pane_locator(page)
    if pane.count() == 0:
        return [], None, None, None

    pages = movement_collect_by_arrow(page, pane, max_pages=max_pages)

    earliest = None
    latest = None
    all_dts = []

    # Additionally capture "newest/top row" fields for monitoring:
    newest_dt = None
    newest_to_state = None

    # Convention: top row of first page is newest
    if pages:
        # Prefer the table that actually contains movement timestamps (some pages include other tables).
        try:
            tables = pages[0].get("tables") or []
            movement_rows = None
            for t in tables:
                rows = t.get("rows") or []
                if not rows:
                    continue
                for r in rows:
                    if any(parse_dt_mk(cell) for cell in (r or [])):
                        movement_rows = rows
                        break
                if movement_rows:
                    break

            if movement_rows:
                # Use the first row that actually contains a parsable date.
                r0 = None
                for row in movement_rows:
                    if any(parse_dt_mk(cell) for cell in (row or [])):
                        r0 = row
                        break

                if r0:
                    # date may not be in column 0; take the first parsable cell
                    for cell in r0:
                        dt = parse_dt_mk(cell)
                        if dt:
                            newest_dt = dt.strftime("%Y-%m-%d %H:%M:%S")
                            break
                    # "?????? ????????" often column 2
                    if len(r0) >= 3:
                        newest_to_state = r0[2]
        except Exception:
            pass

    for pg in pages:
        for tb in pg.get("tables", []):
            for row in tb.get("rows", []):
                for cell in row:
                    dt = parse_dt_mk(cell)
                    if dt:
                        all_dts.append(dt)
                        if earliest is None or dt < earliest:
                            earliest = dt
                        if latest is None or dt > latest:
                            latest = dt

    earliest_iso = earliest.strftime("%Y-%m-%d %H:%M:%S") if earliest else None
    latest_iso   = latest.strftime("%Y-%m-%d %H:%M:%S") if latest else None
    uniq = sorted(set(all_dts), reverse=True)
    prev = uniq[1] if len(uniq) > 1 else None
    prev_iso = prev.strftime("%Y-%m-%d %H:%M:%S") if prev else None
    return pages, earliest_iso, latest_iso, prev_iso, newest_dt, newest_to_state

# ---- Documents paging (DataTables) ----
def find_documents_table_and_wrapper(info_pane):
    candidates = info_pane.locator("table").filter(has_text=re.compile(r"Име на документот|Тип на документ|Документи за барањето", re.I))
    tbl = candidates.first if candidates.count() > 0 else info_pane.locator("table").first
    if tbl.count() == 0:
        return None, None
    wrap = tbl.locator("xpath=ancestor::*[contains(@class,'dataTables_wrapper')][1]")
    if wrap.count() > 0:
        return tbl, wrap
    wrap2 = tbl.locator("xpath=ancestor-or-self::*[self::div or self::section][1]")
    return tbl, (wrap2 if wrap2.count() > 0 else info_pane)

def table_first_row_signature(tbl):
    try:
        tr = tbl.locator("tbody tr").first
        if tr.count() > 0:
            return norm(tr.inner_text(timeout=2000))[:260]
    except Exception:
        pass
    return ""

def datatables_pager_next(wrapper):
    pag = wrapper.locator(".dataTables_paginate").first
    if pag.count() > 0 and pag.is_visible(timeout=200):
        return pag.locator("a", has_text=re.compile(r"Следни", re.I)).first
    pag2 = wrapper.locator(".pagination, ul.pagination").first
    if pag2.count() > 0 and pag2.is_visible(timeout=200):
        return pag2.locator("a", has_text=re.compile(r"Следни", re.I)).first
    return wrapper.locator("a", has_text=re.compile(r"Следни", re.I)).first

def is_datatables_next_disabled(next_a):
    try:
        if next_a.count() == 0:
            return True
        li = next_a.locator("xpath=ancestor::li[1]")
        if li.count() > 0:
            cls = (li.get_attribute("class") or "").lower()
            if "disabled" in cls:
                return True
    except Exception:
        pass
    try:
        aria = (next_a.get_attribute("aria-disabled") or "").lower()
        if aria == "true":
            return True
    except Exception:
        pass
    return False

def collect_documents_pages_next_until_end(page, info_pane, max_pages=200):
    tbl, wrapper = find_documents_table_and_wrapper(info_pane)
    if not tbl or tbl.count() == 0:
        return {"pages": [], "error": "documents_table_not_found", "paged": False, "pages_collected": 0}

    pages = []
    sig_seen = set()

    raw, tables = snapshot_tables_and_text(wrapper)
    sig = table_first_row_signature(tbl)
    if sig:
        sig_seen.add(sig)
    pages.append({"page_index": 1, "raw_text": raw, "tables": tables, "note": "initial"})

    for idx in range(2, max_pages + 1):
        next_a = datatables_pager_next(wrapper)

        if next_a.count() == 0:
            pages[-1]["note2"] = "next_link_not_found"
            break
        if not next_a.is_visible(timeout=500):
            pages[-1]["note2"] = "next_link_not_visible"
            break
        if is_datatables_next_disabled(next_a):
            pages[-1]["note2"] = "next_disabled"
            break

        prev_sig = table_first_row_signature(tbl)

        try:
            next_a.scroll_into_view_if_needed(timeout=2000)
        except Exception:
            pass

        next_a.click(force=True)
        page.wait_for_timeout(700)
        dismiss_popup_hard(page, 2000)

        deadline = time.time() + 12
        changed = False
        new_sig = ""
        while time.time() < deadline:
            new_sig = table_first_row_signature(tbl)
            if new_sig and new_sig != prev_sig:
                changed = True
                break
            page.wait_for_timeout(300)

        raw, tables = snapshot_tables_and_text(wrapper)

        if not changed:
            pages.append({"page_index": idx, "raw_text": raw, "tables": tables, "note": "next_click_no_change_stopping"})
            break

        if new_sig and new_sig in sig_seen:
            pages.append({"page_index": idx, "raw_text": raw, "tables": tables, "note": "duplicate_signature_stopping"})
            break

        if new_sig:
            sig_seen.add(new_sig)

        pages.append({"page_index": idx, "raw_text": raw, "tables": tables})

    return {"pages": pages, "error": None, "paged": True, "pages_collected": len(pages)}

def collect_info_subsections(page):
    info = {
        "documents": {"paged": False, "pages": [], "error": None, "pages_collected": 0},
        "discussion": {"raw_text": None, "tables": [], "error": None}
    }
    pane = active_pane_locator(page)
    if pane.count() == 0:
        info["documents"]["error"] = "no_active_pane"
        info["discussion"]["error"] = "no_active_pane"
        return info

    try:
        res = collect_documents_pages_next_until_end(page, pane, max_pages=200)
        info["documents"].update(res)
    except Exception as e:
        info["documents"]["error"] = str(e)

    try:
        h = pane.locator(":scope *", has_text=re.compile(r"Дискусија", re.I)).first
        block = h.locator("xpath=ancestor-or-self::*[self::div or self::section][1]") if h.count() > 0 else None
        if block and block.count() > 0:
            info["discussion"]["raw_text"] = block.inner_text(timeout=20000).replace("\r","").strip()
            info["discussion"]["tables"] = extract_tables(block, max_tables=10, max_rows=800)
        else:
            info["discussion"]["raw_text"] = ""
            info["discussion"]["tables"] = []
    except Exception as e:
        info["discussion"]["error"] = str(e)

    return info

def scrape_single_case_to_json(page, case_url: str, out_dir: Path, max_movement_pages: int = 80):
    case_id = extract_case_id_from_url(case_url) or "unknown"

    page.goto(case_url, wait_until="domcontentloaded", timeout=240000)
    dismiss_popup_hard(page, 10000)
    page.wait_for_timeout(800)

    main_tabs = list_main_tab_names(page)

    data = {
        "meta": {
            "version": VERSION,
            "build_at": BUILD_AT,
            "scraped_at_iso": now_iso(),
            "portal_case_id_from_url": case_id,
            "detail_url": case_url,
            "main_tabs": main_tabs,
            "official_created_at": None,
        },
        "tabs": []
    }

    movement_newest_dt = None
    movement_newest_to_state = None
    movement_prev_dt = None
    official_created_at = None

    for tn in main_tabs:
        tab_obj = {"tab_name": tn, "paged": False, "raw_text": None, "tables": [], "error": None}
        try:
            ok = click_main_tab(page, tn)
            page.wait_for_timeout(650)
            if not ok:
                tab_obj["error"] = "main_tab_click_failed"
                data["tabs"].append(tab_obj)
                continue

            dismiss_popup_hard(page, 2000)

            if tn.upper() == "ИСТОРИЈА НА ДВИЖЕЊЕ":
                pages, earliest_iso, latest_iso, prev_iso, newest_dt, newest_to_state = movement_collect_all_pages(page, max_pages=max_movement_pages)
                movement_newest_dt = latest_iso or newest_dt
                movement_newest_to_state = newest_to_state
                movement_prev_dt = prev_iso

                tab_obj["paged"] = True
                tab_obj["pages"] = pages
                tab_obj["summary"] = {
                    "pages_collected": len(pages),
                    "earliest_dt_iso": earliest_iso,
                    "latest_dt_iso": latest_iso,
                    "prev_dt_iso": prev_iso,
                    "newest_top_row_dt_iso": newest_dt,
                    "newest_top_row_to_state": newest_to_state
                }
                tab_obj["raw_text"] = pages[0]["raw_text"] if pages else active_pane_text(page)
                tab_obj["tables"] = pages[0]["tables"] if pages else []
            else:
                pane = active_pane_locator(page)
                tab_obj["raw_text"] = active_pane_text(page)
                tab_obj["tables"] = extract_tables(pane if pane.count() > 0 else page.locator("div.tab-content"))

                if tn.upper() == "ИНФОРМАЦИИ":
                    tab_obj["subsections"] = collect_info_subsections(page)
                    raw = tab_obj.get("raw_text") or ""
                    created_raw = (
                        extract_label_value(raw, "Датум на креирање")
                        or extract_label_value(raw, "Креирано на")
                        or extract_label_value(raw, "Креирано")
                    )
                    if created_raw:
                        dt = parse_dt_mk(created_raw)
                        if dt:
                            official_created_at = dt.strftime("%Y-%m-%d %H:%M:%S")

            data["tabs"].append(tab_obj)

        except Exception as e:
            tab_obj["error"] = str(e)
            data["tabs"].append(tab_obj)

    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{case_id}.json"
    data["meta"]["official_created_at"] = official_created_at
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    return case_id, str(out_path), movement_newest_dt, movement_newest_to_state, sha1_text(out_path.read_text(encoding="utf-8")), official_created_at, movement_prev_dt

# ============================
# MAIN
# ============================
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out-dir", default=str(CASES_OUT_DIR))
    ap.add_argument("--headless", default=None)
    ap.add_argument("--slowmo-ms", type=int, default=None)
    ap.add_argument("--max-movement-pages", type=int, default=80)
    ap.add_argument("--max-pages", type=int, default=None, help="Limit list pagination pages (Phase 1), for test runs.")
    ap.add_argument("--test-mode", action="store_true", help="Write outputs to test_db/test_jsons/test_logs under runtime root.")
    ap.add_argument("--resume", action="store_true", help="Resume case scraping from progress next_index (Phase 2). Phase 1 is always re-collected for a full run.")
    args = ap.parse_args()

    load_env_file(RUNTIME_ROOT / "secrets" / ".eurbanizam_secrets.env")

    login_url = os.environ.get("PORTAL_LOGIN_URL", "https://www.e-urbanizam.mk/admin/")
    list_url  = os.environ.get("PORTAL_LIST_URL_1", "https://www.e-urbanizam.mk/admin/#/home/administration/requestList")

    user = (os.environ.get("PORTAL_USERNAME") or os.environ.get("EURB_USER") or "").strip()
    pw   = (os.environ.get("PORTAL_PASSWORD") or os.environ.get("EURB_PASS") or "").strip()
    if not user or not pw:
        raise SystemExit("Missing credentials in .env (PORTAL_USERNAME/PORTAL_PASSWORD or EURB_USER/EURB_PASS)")

    # headless/slowmo: CLI > ENV > defaults
    env_headless = (os.environ.get("HEADLESS") or os.environ.get("HEADLESS_MODE") or "").strip().lower()
    env_slowmo = (os.environ.get("SLOWMO_MS") or os.environ.get("SLOW_MO") or "").strip()

    headless = False
    if args.headless is not None:
        headless = str(args.headless).lower() == "true"
    elif env_headless in ("true","false"):
        headless = env_headless == "true"

    slowmo_ms = 250
    if args.slowmo_ms is not None:
        slowmo_ms = int(args.slowmo_ms)
    elif env_slowmo.isdigit():
        slowmo_ms = int(env_slowmo)

    if args.test_mode:
        test_root = RUNTIME_ROOT / "test_logs"
        test_db = RUNTIME_ROOT / "test_db" / "eurbanizam_local.sqlite"
        test_jsons = RUNTIME_ROOT / "test_jsons"
        globals()["DB_PATH"] = test_db
        globals()["CASES_OUT_DIR"] = test_jsons
        globals()["LOGS_DIR"] = test_root / "scraper"
        globals()["LIST_JSONL_PATH"] = globals()["LOGS_DIR"] / "list_rows_v3_X1.jsonl"
        globals()["LINKS_FILE"] = globals()["LOGS_DIR"] / "all_case_links_v3_X1.txt"
        globals()["PROGRESS_FILE"] = globals()["LOGS_DIR"] / "full_scrape_progress_v3_X1.json"
        args.out_dir = str(globals()["CASES_OUT_DIR"])

    print("EURBANIZAM v3 FULL SCRAPER", VERSION)
    print("  db=", DB_PATH)
    print("  out_dir=", args.out_dir)
    print("  list_url=", list_url)
    print("  headless=", headless, "slowmo_ms=", slowmo_ms)
    print("  max_movement_pages=", args.max_movement_pages)
    print("  resume=", args.resume)

    conn = db_connect(DB_PATH)
    db_init(conn)

    # create run
    cur = conn.execute("INSERT INTO runs(version, started_at, mode, notes) VALUES(?,?,?,?)",
                       (VERSION, now_iso(), "full", "phase1(list+urls)+phase2(case json)"))
    run_id = cur.lastrowid
    conn.commit()
    print("RUN_ID:", run_id)

    # browser (reuses saved session if still valid)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless, slow_mo=slowmo_ms)
        ctx = create_context_with_session(browser)
        page = ctx.new_page()
        page.set_default_timeout(180000)
        page.set_default_navigation_timeout(180000)

        ensure_logged_in(page, ctx, login_url, user, pw)

        # admin base origin (for joining hash routes)
        # we keep "https://www.e-urbanizam.mk/admin/" style
        base_origin = login_url.split("#")[0]
        if not base_origin.endswith("/"):
            base_origin += "/"

        # ============= Phase 1 =============
        print("=" * 70)
        print("PHASE 1: Collect ALL list pages -> list rows + urls")
        all_urls = phase1_collect_all_list_pages(page, list_url, base_origin, run_id, conn, max_pages=args.max_pages)

        # progress init
        prog = load_progress() if args.resume else None
        start_index = 0
        if args.resume and prog and prog.get("version") == VERSION and prog.get("total_urls") == len(all_urls):
            start_index = int(prog.get("next_index", 0) or 0)

        save_progress({
            "version": VERSION,
            "run_id": run_id,
            "mode": "full",
            "collected_at": now_iso(),
            "total_urls": len(all_urls),
            "next_index": start_index,
            "errors_count": int((prog or {}).get("errors_count", 0) or 0)
        })

        # ============= Phase 2 =============
        print("=" * 70)
        print("PHASE 2: Scrape ALL cases -> one FULL JSON per case")
        out_dir = Path(args.out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)

        ok = 0
        errors = int((prog or {}).get("errors_count", 0) or 0)

        for idx in range(start_index, len(all_urls)):
            url = all_urls[idx]
            print("=" * 70)
            print(f"[{idx+1}/{len(all_urls)}] CASE:", url)
            try:
                case_id, json_path, newest_dt_iso, newest_to_state, json_hash, official_created_at, prev_dt_iso = scrape_single_case_to_json(
                    page, url, out_dir=out_dir, max_movement_pages=int(args.max_movement_pages)
                )
                ok += 1

                # update case_json_index
                conn.execute("""
                  INSERT INTO case_json_index(case_id, last_scraped_at, json_path, json_hash)
                  VALUES(?,?,?,?)
                  ON CONFLICT(case_id) DO UPDATE SET
                    last_scraped_at=excluded.last_scraped_at,
                    json_path=excluded.json_path,
                    json_hash=excluded.json_hash
                """, (case_id, now_iso(), json_path, json_hash))
                api_case_documents.sync_case_documents_from_json(
                    conn,
                    case_id=case_id,
                    json_path=json_path,
                    json_hash=json_hash,
                )

                if official_created_at:
                    conn.execute("UPDATE cases SET official_created_at = COALESCE(?, official_created_at) WHERE case_id = ?", (official_created_at, case_id))

                # update monitoring fields from movement top row
                if newest_dt_iso or newest_to_state or prev_dt_iso:
                    conn.execute("""
                      UPDATE cases
                      SET latest_movement_last_change_dt = COALESCE(?, latest_movement_last_change_dt),
                          latest_movement_prev_change_dt = COALESCE(?, latest_movement_prev_change_dt),
                          latest_movement_to_state = COALESCE(?, latest_movement_to_state)
                      WHERE case_id = ?
                    """, (newest_dt_iso, prev_dt_iso, newest_to_state, case_id))

                conn.commit()

            except Exception as e:
                errors += 1
                print("ERROR:", repr(e))
                dismiss_popup_hard(page, 5000)
                page.wait_for_timeout(1500)

            # progress after each case
            save_progress({
                "version": VERSION,
                "run_id": run_id,
                "mode": "full",
                "collected_at": now_iso(),
                "total_urls": len(all_urls),
                "next_index": idx + 1,
                "errors_count": errors
            })

        # finish run
        conn.execute("UPDATE runs SET finished_at=? WHERE run_id=?", (now_iso(), run_id))
        conn.commit()

        print("=" * 70)
        print("DONE.")
        print("  ok=", ok, "errors=", errors)
        print("  db=", DB_PATH)
        print("  list_jsonl=", LIST_JSONL_PATH)
        print("  links=", LINKS_FILE)
        print("  cases_out_dir=", out_dir)
        print("  progress=", PROGRESS_FILE)

        ctx.close()
        browser.close()

    conn.close()

if __name__ == "__main__":
    main()
