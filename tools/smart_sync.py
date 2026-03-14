import sys
import os
import json
import sqlite3
import subprocess
import time
import argparse
from pathlib import Path
from datetime import datetime
from playwright.sync_api import sync_playwright
import importlib.util

# --- CONFIGURATION ---
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
TOOLS_DIR = Path(__file__).parent
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
    return {
        "project_root": project_root,
        "runtime_root": _expand_path(data.get("runtime_root", "%USERPROFILE%\.eurbanizam"), project_root),
        "local_db_path": _expand_path(data["local_db_path"], project_root),
        "local_json_dir": _expand_path(data["local_json_dir"], project_root),
        "local_logs_dir": _expand_path(data["local_logs_dir"], project_root),
        "raw": data,
    }


SETTINGS = load_settings(SETTINGS_PATH)
RUNTIME_ROOT = SETTINGS["runtime_root"]
DB_PATH = SETTINGS["local_db_path"]
JSON_DIR = SETTINGS["local_json_dir"]
REPORTS_DIR = SETTINGS["runtime_root"] / "snapshots"

# PATHS TO YOUR EXISTING TOOLS
PROBE_SCRIPT = TOOLS_DIR / "probe_list_status_snapshot.py"

# --- AUTO-DETECT SCRAPER FILE ---
# We check both the main folder AND the tools folder
POSSIBLE_NAMES = [
    "scrape_full_two_phase_to_db.py",
    "full_scrape_v3_X1_two_phase_list_plus_cases_json_db.py"
]

SCRAPER_SCRIPT = None

# 1. Check in TOOLS folder (Priority)
for name in POSSIBLE_NAMES:
    candidate = TOOLS_DIR / name
    if candidate.exists():
        SCRAPER_SCRIPT = candidate
        break

# 2. If not found, check in ROOT folder
if not SCRAPER_SCRIPT:
    for name in POSSIBLE_NAMES:
        candidate = ROOT / name
        if candidate.exists():
            SCRAPER_SCRIPT = candidate
            break

# DEBUGGING IF NOT FOUND
if not SCRAPER_SCRIPT:
    print("\n[CRITICAL ERROR] Could not find the scraper file!")
    print(f"   Checked in: {TOOLS_DIR}")
    print(f"   Checked in: {ROOT}")
    print("   Looked for these names:")
    for n in POSSIBLE_NAMES:
        print(f"    - {n}")
    
    print(f"\n   Files actually found in {TOOLS_DIR}:")
    try:
        for f in TOOLS_DIR.glob("*.py"):
            print(f"    - {f.name}")
    except: pass
    
    sys.exit(1)

print(f"[OK] Found scraper: {SCRAPER_SCRIPT.name}")

# Import the single case scraper logic dynamically
spec = importlib.util.spec_from_file_location("full_scraper", str(SCRAPER_SCRIPT))
scraper_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scraper_mod)

def now_iso():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _coerce_headless(val):
    if val is None:
        return None
    if isinstance(val, bool):
        return val
    v = str(val).strip().lower()
    if v in ("1", "true", "yes", "y", "on"):
        return True
    if v in ("0", "false", "no", "n", "off"):
        return False
    return None


def init_change_log_table(conn):
    """Creates the table that powers the Activity Feed."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS change_events (
            event_id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id INTEGER,
            timestamp TEXT,
            case_id TEXT,
            change_type TEXT, 
            field_name TEXT,
            old_value TEXT,
            new_value TEXT
        );
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_events_ts ON change_events(timestamp);")
    conn.commit()

def ensure_cases_columns(conn):
    try:
        existing = {r[1] for r in conn.execute("PRAGMA table_info(cases)").fetchall()}
        desired = {"official_created_at": "TEXT", "latest_movement_prev_change_dt": "TEXT"}
        for col, coltype in desired.items():
            if col not in existing:
                conn.execute(f"ALTER TABLE cases ADD COLUMN {col} {coltype}")
    except Exception:
        pass




def run_probe(headless=None, max_pages=None):
    """Runs the Phase 1 Probe via subprocess to get a fresh JSONL snapshot."""
    print("[Step 1/3] Running Probe to scan list...")
    
    # Check if probe exists
    if not PROBE_SCRIPT.exists():
        raise Exception(f"Probe script missing at {PROBE_SCRIPT}")

    cmd = [sys.executable, str(PROBE_SCRIPT)]
    if headless is not None:
        cmd += ["--headless", "true" if headless else "false"]
    if max_pages is not None:
        cmd += ["--max-pages", str(int(max_pages))]
    if max_pages is not None:
        cmd += ["--max-pages", str(int(max_pages))]
    # Use utf-8 encoding explicitly for subprocess to avoid charmap errors
    result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    
    print(result.stdout)
    if result.stderr:
        print("Probe Errors:", result.stderr)
        
    if result.returncode != 0:
        raise Exception("Probe failed.")

    # Find the newest JSONL file in reports/
    files = list(REPORTS_DIR.glob("list_status_snapshot_*.jsonl"))
    if not files:
        raise Exception("Probe finished but no JSONL file found.")
    
    newest_file = max(files, key=os.path.getmtime)
    print(f"[OK] Probe finished. Snapshot: {newest_file.name}")
    return newest_file

def load_db_state(conn):
    """Loads current state of all cases from DB for comparison."""
    cur = conn.cursor()
    cur.execute("SELECT case_id, latest_list_state, latest_title FROM cases")
    return {row[0]: {'status': row[1], 'title': row[2]} for row in cur.fetchall()}

def detect_changes(snapshot_path, db_state):
    """Compares snapshot JSONL vs DB State."""
    print("[Step 2/3] Analyzing changes...")
    
    changes = []
    seen_ids = set()
    
    with open(snapshot_path, 'r', encoding='utf-8') as f:
        for line in f:
            if not line.strip(): continue
            row = json.loads(line)
            
            cid = row.get('case_id')
            status = row.get('list_state', '').strip()
            url = row.get('detail_url', '')
            
            if not cid: continue
            seen_ids.add(cid)
            
            # CHECK 1: NEW CASE
            if cid not in db_state:
                changes.append({
                    'case_id': cid,
                    'type': 'NEW_CASE',
                    'field': 'status',
                    'old': None,
                    'new': status,
                    'url': url
                })
                continue
                
            # CHECK 2: STATUS CHANGE
            current_db = db_state[cid]
            db_status = (current_db['status'] or "").strip()
            
            if status != db_status:
                changes.append({
                    'case_id': cid,
                    'type': 'STATUS_CHANGE',
                    'field': 'status',
                    'old': db_status,
                    'new': status,
                    'url': url
                })
    return changes



def collect_backfill_created(snapshot_path, conn):
    """Return {case_id: detail_url} for page 1 cases missing official_created_at."""
    page1 = []
    with open(snapshot_path, 'r', encoding='utf-8') as f:
        for line in f:
            if not line.strip():
                continue
            row = json.loads(line)
            if row.get("page_idx") != 1:
                continue
            cid = (row.get("case_id") or "").strip()
            url = (row.get("detail_url") or "").strip()
            if cid and url:
                page1.append((cid, url))

    if not page1:
        return {}

    ids = [cid for cid, _ in page1]
    placeholders = ",".join(["?"] * len(ids))
    cur = conn.execute(
        f"SELECT case_id FROM cases WHERE case_id IN ({placeholders}) AND official_created_at IS NULL",
        ids,
    )
    missing = {row[0] for row in cur.fetchall()}
    return {cid: url for cid, url in page1 if cid in missing}


def apply_snapshot_to_db(snapshot_path, conn):
    """Upsert latest list fields from snapshot into cases table."""
    cur = conn.cursor()
    with open(snapshot_path, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            row = json.loads(line)
            cid = (row.get("case_id") or "").strip()
            if not cid:
                continue
            status = (row.get("list_state") or "").strip()
            title = (row.get("title") or "").strip()
            request_type = (row.get("request_type") or "").strip()
            detail_url = (row.get("detail_url") or "").strip()

            cur.execute(
                """
                INSERT INTO cases(case_id, first_seen_at, last_seen_at, latest_detail_url, latest_request_type, latest_title, latest_list_state)
                VALUES(?,?,?,?,?,?,?)
                ON CONFLICT(case_id) DO UPDATE SET
                    last_seen_at=excluded.last_seen_at,
                    latest_detail_url=excluded.latest_detail_url,
                    latest_request_type=excluded.latest_request_type,
                    latest_title=excluded.latest_title,
                    latest_list_state=excluded.latest_list_state
                """,
                (cid, now_iso(), now_iso(), detail_url, request_type, title, status),
            )
    conn.commit()
    print("[OK] Snapshot applied to DB.")

def perform_smart_updates(changes, run_id, conn, headless=None, backfill_cases=None):
    """Logs changes to DB and runs Phase 2 scraper ONLY for affected cases."""
    backfill_cases = backfill_cases or {}
    if not changes and not backfill_cases:
        print("[INFO] No updates found. Database is in sync.")
        return

    total_targets = len(changes) + len(backfill_cases)
    print(f"[Step 3/3] Performing targeted updates for {total_targets} cases...")
    
    ts = now_iso()
    events = []
    cases_to_scrape = {}
    
    for c in changes:
        events.append((
            run_id, ts, c['case_id'], c['type'], c['field'], c['old'], c['new']
        ))
        cases_to_scrape[c['case_id']] = c['url']

    # Backfill created date for page 1 cases missing it
    for cid, url in backfill_cases.items():
        if cid not in cases_to_scrape:
            cases_to_scrape[cid] = url
    
    conn.executemany("""
        INSERT INTO change_events (run_id, timestamp, case_id, change_type, field_name, old_value, new_value)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, events)
    conn.commit()
    print(f"   Saved {len(events)} events to Activity Log.")

    # Run Phase 2 Scraper (Targeted)
    secrets_env = RUNTIME_ROOT / "secrets" / ".eurbanizam_secrets.env"
    scraper_mod.load_env_file(secrets_env)
    login_url = os.environ.get("PORTAL_LOGIN_URL", "https://www.e-urbanizam.mk/admin/")
    user = os.environ.get("PORTAL_USERNAME") or os.environ.get("EURB_USER")
    pw = os.environ.get("PORTAL_PASSWORD") or os.environ.get("EURB_PASS")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True if headless is None else headless)
        ctx = scraper_mod.create_context_with_session(browser)
        page = ctx.new_page()
        page.set_default_timeout(120000)
        page.set_default_navigation_timeout(120000)

        print("   Logging in for targeted scrape...")
        scraper_mod.ensure_logged_in(page, ctx, login_url, user, pw)
        
        count = 0
        for cid, url in cases_to_scrape.items():
            count += 1
            print(f"   [{count}/{len(cases_to_scrape)}] Updating Case {cid}...")
            try:
                out_dir = JSON_DIR
                case_id, json_path, newest_dt_iso, newest_to_state, json_hash, official_created_at, prev_dt_iso = scraper_mod.scrape_single_case_to_json(
                    page, url, out_dir=out_dir, max_movement_pages=50
                )
                print(f"      movement newest_dt={newest_dt_iso} newest_to_state={newest_to_state}")
                api_case_documents.sync_case_documents_from_json(
                    conn,
                    case_id=case_id,
                    json_path=json_path,
                    json_hash=json_hash,
                )
                conn.execute("UPDATE cases SET last_seen_at = ? WHERE case_id = ?", (ts, cid))
                if official_created_at:
                    conn.execute("UPDATE cases SET official_created_at = COALESCE(?, official_created_at) WHERE case_id = ?", (official_created_at, case_id))
                if newest_dt_iso or newest_to_state or prev_dt_iso:
                    conn.execute(
                        """
                        UPDATE cases
                        SET latest_movement_last_change_dt = COALESCE(?, latest_movement_last_change_dt),
                            latest_movement_prev_change_dt = COALESCE(?, latest_movement_prev_change_dt),
                            latest_movement_to_state = COALESCE(?, latest_movement_to_state)
                        WHERE case_id = ?
                        """,
                        (newest_dt_iso, prev_dt_iso, newest_to_state, case_id),
                    )
                else:
                    print("      [WARN] No movement timestamp parsed for this case.")
                conn.commit()
            except Exception as e:
                print(f"   [ERROR] Failed to scrape {cid}: {e}")
        
        browser.close()
    
    print("[OK] Smart Sync Completed Successfully.")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--headless", default=None)
    ap.add_argument("--max-pages", type=int, default=None)
    args = ap.parse_args()
    headless = _coerce_headless(args.headless)
    max_pages = args.max_pages
    max_pages = args.max_pages

    print("--- E-Urbanizam SMART SYNC ---")
    
    conn = sqlite3.connect(DB_PATH)
    init_change_log_table(conn)
    ensure_cases_columns(conn)
    
    cur = conn.execute("INSERT INTO runs (version, started_at, mode, notes) VALUES (?, ?, ?, ?)", 
                       ("v5.25", now_iso(), "smart_sync", "probe_diff_update"))
    run_id = cur.lastrowid
    conn.commit()

    try:
        snapshot_path = run_probe(headless=headless, max_pages=max_pages)
        db_state = load_db_state(conn)
        changes = detect_changes(snapshot_path, db_state)
        apply_snapshot_to_db(snapshot_path, conn)
        backfill_cases = collect_backfill_created(snapshot_path, conn)
        if backfill_cases:
            print(f"[INFO] Backfill created_at for page 1: {len(backfill_cases)} cases.")
        perform_smart_updates(changes, run_id, conn, headless=headless, backfill_cases=backfill_cases)
        
        conn.execute("UPDATE runs SET finished_at = ? WHERE run_id = ?", (now_iso(), run_id))
        conn.commit()
        
    except Exception as e:
        print(f"\n[FATAL ERROR] {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    main()
