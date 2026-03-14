## 1) What you're building
A Windows-based system that scrapes e-Urbanizam cases, stores them in a local SQLite DB + per-case JSON files, detects status-only changes, and exposes everything through an Admin panel with daily or on-demand email summaries, plus (planned) Telegram conversational access and scheduled daily runs.

## 2) Project folder vs Runtime folder
The project is intentionally split into two parts: (A) code and (B) runtime data.

A) Project folder (code – shared across machines)
This is where the application code lives and is typically synced across machines (currently via Google Drive, later via Git).
Example:
G:\My Drive\eurbanizam-tracker-Codex_v2\

Typical contents:
- admin.py (Admin panel UI)
- requirements.txt (Python dependencies)
- start_app.bat (smart launcher)
- settings.json (configuration)
- tools\ (scrapers, sync, reporting, notifications)
- docs\HELP.md (this Help text, editable from Admin)
- bak\ (automatic backups of changed files)

B) Runtime folder (data – per PC/server)
This is where all data and secrets live for a specific PC or server.
Location:
%USERPROFILE%\.eurbanizam\

Expected structure:
- db\ (SQLite database: eurbanizam_local.sqlite)
- json\cases_full_json\ (one JSON file per case with full details)
- snapshots\ (status-only snapshots used for change detection)
- logs\ (log files)
- secrets\ (email, Telegram, portal credentials)

Important rules:
- Runtime data is never committed to Git.
- Secrets are stored only under %USERPROFILE%\.eurbanizam\secrets\ (not in the repo).
- Each machine has its own runtime folder and can run independently.

## 3) Daily flow: Full Scrape / Smart Sync / Report
This section explains what each Admin button does and which tool it activates.

Full Scrape (Admin button) - authoritative rebuild (confirmation required)
Activates:
- tools\scrape_full_two_phase_to_db.py

Modes:
- Test (2 pages): writes ONLY to test folders
  - %USERPROFILE%\.eurbanizam\test_db\eurbanizam_local.sqlite
  - %USERPROFILE%\.eurbanizam\test_jsons\
  - %USERPROFILE%\.eurbanizam\test_logs\scraper\
- Full: runs the full rebuild after explicit confirmation

What it does:
- Creates runtime folders if missing (db, json, logs, snapshots, secrets, test_*).
- Logs into the e-Urbanizam portal (if required).
- Phase 1: scans ALL list pages and collects all cases (IDs + list fields + links).
- Phase 2: visits EVERY case detail page and extracts full details.
- Writes outputs (Full mode):
  - SQLite DB: %USERPROFILE%\.eurbanizam\db\eurbanizam_local.sqlite
  - Full case JSON files: %USERPROFILE%\.eurbanizam\json\cases_full_json\*.json

Warning:
- Full Scrape overwrites the local DB and case JSON files if they already exist.
- Admin shows a warning and requires explicit confirmation before running Full mode.

When to use:
- First time setup on a machine.
- Full rebuild is required (corruption, major changes, recovery).

Smart Sync (Admin button) — daily incremental update (status-only)
Activates:
- tools\smart_sync.py
  (internally relies on the list probe / snapshot logic, e.g. probe_list_status_snapshot.py)

Authoritative change rule:
- A case is considered changed ONLY if its STATUS changes.

What it does:
- Runs a list-only probe (fast).
- Creates a snapshot file in: %USERPROFILE%\.eurbanizam\snapshots\
- Applies snapshot to DB (updates latest_list_state/title/request_type for ALL cases).
- Compares the new snapshot against the previous snapshot / DB.
- Detects:
  - new cases
  - cases whose STATUS changed
- Scrapes only those changed/new cases (detail pages).
- Updates:
  - DB rows for those cases
  - JSON files for those cases
  - Movement timestamps in cases.latest_movement_last_change_dt (from Историја на движење top row)

Admin UI rule (Posledna column):
- Uses `cases.latest_movement_last_change_dt` only.
- Scraper sets this from movement-history top row; if that is missing, it now falls back to the latest movement date (`latest_dt_iso`).
- If movement history is empty, `Posledna` can remain blank until a movement exists.

Created date (Kreirano):
- Derived from INFO tab `Датум на креирање` and stored in `cases.official_created_at`.
- Admin column `Kreirano` uses `official_created_at` when available.

Status change dates:
- Latest change: `cases.latest_movement_last_change_dt` (max movement timestamp).
- Previous change: `cases.latest_movement_prev_change_dt` (2nd newest movement timestamp).


Admin Status filter:
- Includes `(Empty)` to show cases with blank status values from the list view.


Why this exists:
- List scanning is cheap and fast.
- Detail scraping is slow and heavy.
- Smart Sync prevents scraping every case every day.

Report (Admin button) — email summaries
Activates:
- tools\daily_report.py

What it does:
- Reads change history from the DB (e.g., change_events / changes since last run).
- Generates an email summary of:
  - new cases
  - status changes
- Sends email using SMTP credentials and recipients configured in:
  %USERPROFILE%\.eurbanizam\secrets\

## 3.5) Session persistence (remember login)
The scraper, probe, and Smart Sync save the browser session after successful login so that subsequent runs reuse it. This reduces sign-in prompts (including Microsoft/Outlook if the portal uses it).

Where it is stored:
%USERPROFILE%\.eurbanizam\state\storage_state.json

Behavior:
- First run: you sign in as usual; the session is saved.
- Next runs: the stored session is loaded; if still valid, login is skipped.
- If the session expires, you will be prompted to sign in again; the new session is then saved.

To force a fresh login (e.g. after password change), delete:
%USERPROFILE%\.eurbanizam\state\storage_state.json

How it is used:
- On-demand: click Report in Admin at any time.
- Planned: automatically after Smart Sync in a daily scheduled run.

## 4) Snapshots: what they are (status-only) and why we use them
A snapshot is a lightweight JSONL record of the current list view captured from the portal.
It contains minimal fields per case, with STATUS being the authoritative change signal.

Authoritative rule:
- Change detection uses STATUS ONLY.
- Even if title/url are included in the snapshot, they do not trigger a change.

Why snapshots exist:
- They allow fast detection of change without opening all case pages.
- They are the basis for Smart Sync to decide what to scrape.

Where snapshots are stored:
%USERPROFILE%\.eurbanizam\snapshots\

## 5) Tools list + purpose + status (Used Now / Planned / Deprecated)

Used Now:
- scrape_full_two_phase_to_db.py
  Full authoritative scraper (Phase 1 list scan + Phase 2 detail scrape). Produces DB + full JSONs.

- probe_list_status_snapshot.py
  List-only probe that produces snapshot files used for change detection (status-only rule).

- smart_sync.py
  Incremental updater. Runs probe/snapshot, compares, scrapes only changed/new cases, updates DB + JSON.

- daily_report.py
  Sends email summaries (daily or on-demand). Requires secrets in %USERPROFILE%\.eurbanizam\secrets\.

Planned / In Progress:
- notifications.py (Telegram bot)
  Conversational interface that can search and show case info via Telegram, and (planned) update user-managed fields with confirmation.

Deprecated / Not Used in v2:
- daily_scraper.py
  Duplicate of the full scraper; superseded by Full Scrape + Smart Sync.

- sync_phones.py
  Not needed because phones are manual user data and must not be stored in JSON.

Other utilities (internal / optional):
- merge_docs.ps1
  Utility for documentation merging (not part of daily operations).

- _check_phone_schema_ro.py
  Read-only schema check tool (diagnostics only).

## 6) BAT files: what each one does (start_app.bat and planned StartNewPC.bat)

start_app.bat (current)
Main entry point to run the system on any machine.

What it does:
- Checks if the required environment exists (venv + packages).
- Installs dependencies only when needed (does not reinstall on every run).
- Ensures runtime folders exist under %USERPROFILE%\.eurbanizam\.
- Ensures Playwright is installed and installs browsers automatically.
- Creates test folders: test_db, test_jsons, test_logs.
- Starts the Admin panel (admin.py) in a separate window.
- Starts the Telegram bot in a separate window (if tools\telegram_bot_server.py exists).
- Admin sidebar includes a Bot toggle (hard start/stop):
  - Windows: starts/stops the python process running tools\telegram_bot_server.py.
  - VPS/Linux: calls systemctl start/stop eurbanizam-bot.service.
  - Optional setting: bot_service_name in settings.json to override service name.

Planned: StartNewPC.bat
One-click setup for a new PC/server (minimal effort onboarding).

Planned behavior:
- Creates venv.
- Installs Python dependencies and Playwright browsers needed for scraping.
- Creates full runtime folder structure under %USERPROFILE%\.eurbanizam\.
- Creates/validates secrets template in %USERPROFILE%\.eurbanizam\secrets\.
- Starts the Admin panel automatically.
- (Planned) Offers to set up a scheduled daily run at 04:00 CET.

- Columns can be reordered in the sidebar (up/down controls) and visibility toggled.

## 6.5) VPS deployment decisions (current)
- VPS now hosts two projects on one nginx instance:
  - wiseplan.dk / www.wiseplan.dk -> WisePlan static app
  - 207.180.222.248 -> eurbanizam Streamlit Admin (proxy to 127.0.0.1:8501)
- Nginx source of truth is managed from the WisePlan repo:
  - RouteCopilot2/vps-landing/nginx-multi-project.conf
  - Deployed as /etc/nginx/sites-available/wiseplan (single enabled site)
- Security: HTTP Basic Auth is enabled for the eurbanizam IP block via /etc/nginx/.htpasswd.
- eurbanizam services are unchanged:
  - Admin service: eurbanizam-admin.service
  - Bot service: eurbanizam-bot.service
  - Daily service: eurbanizam-daily.service (timer: eurbanizam-daily.timer)
- Scheduling: Daily Smart Sync + Report via systemd timer or cron.
- Repo path on VPS: /home/nikola/eurbanizam-tracker
- Runtime root on VPS: /home/nikola/.eurbanizam
- Secrets file on VPS (not in repo): /home/nikola/.eurbanizam/secrets/.eurbanizam_secrets.env (chmod 600)
- Streamlit binds to 127.0.0.1:8501; nginx proxies public HTTP by host routing.

VPS setup pitfalls + fixes (Feb 2026):
- Do not deploy a standalone /etc/nginx/sites-available/eurbanizam config from this repo; it can override/break shared routing.
- If IP access shows WisePlan instead of Admin, verify the IP/default_server block exists in /etc/nginx/sites-available/wiseplan.
- If Admin fails with "Port 8501 not available", check for SSH tunnel using 8501 and stop it.
- If daily timer fails to start, ensure eurbanizam-daily.service uses Type=oneshot when multiple ExecStart lines are used.
- Playwright is required on Linux: install `playwright` in the venv and run `python -m playwright install --with-deps`.
- If scraper says "Missing credentials", confirm secrets file is read and has PORTAL_USERNAME and PORTAL_PASSWORD set.
- On VPS, settings.json must use Linux paths and runtime_root must be:
  - "/home/nikola/.eurbanizam"
- Admin shows "Local DB not found" until DB + JSON files are copied or a Full Scrape creates them.

## 7) Roadmap (Finished vs Planned)

Finished / Current:
- Admin panel in admin.py
- Editable Help file (docs\HELP.md) managed from Admin
- Full Scrape tool exists (may still need final Admin wiring + confirmation)
- Smart Sync tool exists (status-only change detection)
- Local SQLite DB + JSON storage approach is established
- Email report tool exists (may still need standardized secrets location and final Admin wiring)
- View switch in sidebar: Cases / Help
- Full Scrape confirmation + Test mode (2 pages)
- Test outputs go to test_db/test_jsons/test_logs

Planned:
- Finalize Admin buttons and names:
  - Full Scrape → scrape_full_two_phase_to_db.py (with confirmation)
  - Smart Sync → smart_sync.py (status-only change trigger)
  - Report → daily_report.py (email send)

- Automated daily schedule (04:00 CET):
  - Run Smart Sync
  - Then send Report email
  - Log output in %USERPROFILE%\.eurbanizam\logs\

- Telegram / Conversational Assistant:
  - AI interprets user requests (natural language).
  - Reads from DB and JSON as required.
  - Supports updating user-managed fields (Payment, Phone, Name, etc.).
  - Mandatory confirmation before any DB write:
    - show proposed change (old → new)
    - require explicit Yes/No
    - only write after confirmation

  - Planned safety foundation (Phase 1-2):
    - Intent gate (no guessing):
      - Classify each message as: Case details / Case search / Payment query / Write intent / Unknown.
      - Numbers are NOT case IDs unless explicitly marked or confirmed.
    - Ambiguity guard:
      - If the case is not uniquely identified, ask a clarification or show a candidate list.
      - Never auto-pick a case_id based on guesswork.
    - Candidate picker (disambiguation list):
      - Show up to 7 candidates with: Case ID, Status, short Title, Name, FULL phone, Payment.
      - Allow user to pick by case_id or list index (1..N) within 10 minutes.
      - Provide refinement hints (municipality, parcel, name, phone last digits).
    - Confirm-before-write skeleton (no writes without explicit YES):
      - Store pending action per chat_id with timestamp.
      - Reply YES/NO to confirm or cancel; EDIT: ... to adjust payload.
      - Only write if target field exists and user confirms; otherwise ask for case_id/field.

- Telegram bot (human assistant behavior):
  - Understands natural language queries (phone, status, parcel, request type, title).
  - If a message is only a number:
    - If it exists as a case_id, show case details.
    - Otherwise treat it as a search term (phone, parcel, etc.).
  - Results ranking: exact field match first, then title/keyword matches, then fuzzy matches.
  - If results <= 10: show full list with ID, status, short title, name, phone, payment.
  - If results > 10: show count and ask to narrow down (status, parcel, phone, name).
  - Supports time-based questions: "status changed in last 7 days" (uses change_events or last change timestamp).
  - Can use AI only to interpret the query text (no DB data is sent).
- Data policy rules (must remain true):
  - Phone is manual data:
    - Source of truth: case_user_data (field_key='Phone')
    - Do NOT store phone in JSON
    - Optional cache in cases.phone only if explicitly decided later


## 9) Dev workflow (Local-first)
- Default workflow: test changes locally first, then push to Git.
- Only push after local test passes.
- If an urgent fix is pushed first, pull locally and re-test.

## 8) Git sync (Planned)
Currently the code is synced via Google Drive. This works but is not ideal for servers or scaling.

Moving to Git will provide:
- Fast setup on new machines/servers (clone instead of Drive login)
- Proper version tracking and rollback
- Consistent code across machines
- Easier collaboration and change review

Planned future flow:
git clone → run start_app.bat → open Admin
