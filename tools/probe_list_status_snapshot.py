import os, json, argparse, importlib.util, time, sys
from pathlib import Path
from datetime import datetime
from playwright.sync_api import sync_playwright

# --- CONFIGURATION ---
ROOT = Path(__file__).resolve().parents[1]
TOOLS_DIR = Path(__file__).parent
SETTINGS_PATH = ROOT / "settings.json"


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
        "local_logs_dir": _expand_path(data["local_logs_dir"], project_root),
        "raw": data,
    }


SETTINGS = load_settings(SETTINGS_PATH)
RUNTIME_ROOT = SETTINGS["runtime_root"]
REPORTS_DIR = SETTINGS["runtime_root"] / "snapshots"

# --- AUTO-DETECT SCRAPER ---
POSSIBLE_NAMES = [
    "scrape_full_two_phase_to_db.py",
    "full_scrape_v3_X1_two_phase_list_plus_cases_json_db.py"
]

SCRAPER_PATH = None

# 1. Check TOOLS folder (Priority - since the file is likely here)
for name in POSSIBLE_NAMES:
    candidate = TOOLS_DIR / name
    if candidate.exists():
        SCRAPER_PATH = candidate
        break

# 2. Check ROOT folder (Fallback)
if not SCRAPER_PATH:
    for name in POSSIBLE_NAMES:
        candidate = ROOT / name
        if candidate.exists():
            SCRAPER_PATH = candidate
            break

# 3. Crash if not found
if not SCRAPER_PATH:
    print("\n[CRITICAL ERROR] Authoritative scraper not found!")
    print(f"   Checked in: {TOOLS_DIR}")
    print(f"   Checked in: {ROOT}")
    sys.exit(1)

def load_scraper_module():
    spec = importlib.util.spec_from_file_location("eurb_full_scraper", str(SCRAPER_PATH))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

def first_row_signature(page) -> str:
    # lightweight "did the visible table change?" signature
    try:
        loc = page.locator("table tbody tr").first
        if loc.count() == 0:
            return ""
        txt = loc.inner_text(timeout=1500) or ""
        return " ".join(txt.split())[:220]
    except Exception:
        return ""

def wait_table_advanced(page, prev_sig: str, timeout_ms: int = 60000) -> bool:
    deadline = time.time() + (timeout_ms / 1000.0)
    last_sig = ""
    while time.time() < deadline:
        sig = first_row_signature(page)
        if sig and sig != prev_sig:
            return True
        if sig and sig != last_sig:
            last_sig = sig
        page.wait_for_timeout(400)
    return False

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--headless", default=None)     # expects "true"/"false"
    ap.add_argument("--slowmo-ms", type=int, default=None)
    ap.add_argument("--max-pages", type=int, default=0, help="0 = no limit")
    ap.add_argument("--no-dedupe", action="store_true", help="Write duplicates (not recommended)")
    args = ap.parse_args()

    mod = load_scraper_module()

    # Load .env exactly like the full scraper
    secrets_env = RUNTIME_ROOT / "secrets" / ".eurbanizam_secrets.env"
    mod.load_env_file(secrets_env)

    login_url = os.environ.get("PORTAL_LOGIN_URL", "https://www.e-urbanizam.mk/admin/")
    list_url  = os.environ.get("PORTAL_LIST_URL_1", "https://www.e-urbanizam.mk/admin/#/home/administration/requestList")

    user = (os.environ.get("PORTAL_USERNAME") or os.environ.get("EURB_USER") or "").strip()
    pw   = (os.environ.get("PORTAL_PASSWORD") or os.environ.get("EURB_PASS") or "").strip()
    if not user or not pw:
        raise SystemExit("Missing credentials in .env (PORTAL_USERNAME/PORTAL_PASSWORD or EURB_USER/EURB_PASS)")

    # headless/slowmo: CLI > ENV > defaults (same policy as full scraper)
    env_headless = (os.environ.get("HEADLESS") or os.environ.get("HEADLESS_MODE") or "").strip().lower()
    env_slowmo   = (os.environ.get("SLOWMO_MS") or os.environ.get("SLOW_MO") or "").strip()

    headless = False
    if args.headless is not None:
        headless = str(args.headless).lower() == "true"
    elif env_headless in ("true", "false"):
        headless = env_headless == "true"

    slowmo_ms = 250
    if args.slowmo_ms is not None:
        slowmo_ms = int(args.slowmo_ms)
    elif env_slowmo.isdigit():
        slowmo_ms = int(env_slowmo)

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = REPORTS_DIR / f"list_status_snapshot_{ts}.jsonl"

    print(f"PROBE v3 (read-only) - Using scraper: {SCRAPER_PATH.name}")
    
    # base_origin like full scraper: "https://www.e-urbanizam.mk/admin/"
    base_origin = login_url.split("#")[0]
    if not base_origin.endswith("/"):
        base_origin += "/"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless, slow_mo=slowmo_ms)
        ctx = mod.create_context_with_session(browser)
        page = ctx.new_page()
        page.set_default_timeout(180000)
        page.set_default_navigation_timeout(180000)

        mod.ensure_logged_in(page, ctx, login_url, user, pw)

        # EXACT Phase 1 list navigation flow (same helper calls)
        print("Go to list:", list_url)
        page.goto(list_url, wait_until="domcontentloaded", timeout=240000)
        mod.dismiss_popup_hard(page, 10000)
        page.wait_for_timeout(800)

        mod.open_filter_panel_robust(page)
        mod.set_status_zero_and_clear_type(page)
        mod.click_search_requests(page)
        mod.wait_for_real_results(page, 180000)
        print("Real results detected.")

        scraped_at = datetime.now().isoformat(timespec="seconds")
        page_idx = 1
        total_rows_seen = 0
        total_written = 0
        seen_case_ids = set()

        # capture initial signature
        prev_sig = first_row_signature(page)

        with out_path.open("w", encoding="utf-8") as f:
            while True:
                if args.max_pages and args.max_pages > 0 and page_idx > args.max_pages:
                    print(f"Reached max_pages={args.max_pages}. Stopping.")
                    break

                mod.wait_for_real_results(page, 180000)
                rows = mod.collect_list_page_rows(page, base_origin)

                total_rows_seen += len(rows)

                written_this_page = 0
                for r in rows:
                    case_id = (r.get("_case_id") or "").strip()
                    if not case_id:
                        continue

                    if not args.no_dedupe:
                        if case_id in seen_case_ids:
                            continue
                        seen_case_ids.add(case_id)

                    f.write(json.dumps({
                        "case_id": case_id,
                        "request_type": (r.get("_request_type") or "").strip(),
                        "title": (r.get("_title") or "").strip(),
                        "list_state": (r.get("_list_state") or "").strip(),
                        "detail_url": (r.get("_detail_url") or "").strip(),
                        "scraped_at": scraped_at,
                        "page_idx": page_idx,
                    }, ensure_ascii=False) + "\n")
                    written_this_page += 1

                total_written += written_this_page
                print(f"List page {page_idx}: rows_seen={len(rows)} rows_written={written_this_page} total_written={total_written}")

                # EXACT stop logic from authoritative scraper (Next disabled -> stop)
                if not mod.click_next_page(page):
                    print("Reached last page (Next disabled / not found).")
                    break

                # Small gate: wait until the table actually changes before counting the next page
                if not wait_table_advanced(page, prev_sig, timeout_ms=90000):
                    print("WARNING: 'Next' click did not advance the table within timeout. Stopping to avoid duplicate pages.")
                    break

                prev_sig = first_row_signature(page)
                page_idx += 1

        ctx.close()
        browser.close()

    print("OK snapshot:", out_path)
    print(f"Summary: total_rows_seen={total_rows_seen} total_rows_written={total_written} (dedupe={'off' if args.no_dedupe else 'on'})")

if __name__ == "__main__":
    main()
