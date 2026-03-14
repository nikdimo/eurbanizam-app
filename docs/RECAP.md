# Recap Log

## 2026-03-09 (Finance on shared Cases table engine - implementation start)
- Status: Started moving Finance UI to reuse the same Cases search/filter/column flow.
- Last request: Start implementation for Finance to be as close as possible to Cases view with shared logic and flexible mixed columns.
- Actions:
  - Added finance data merge helpers in `admin.py`:
    - `_ensure_finance_tables`
    - `_load_finance_snapshot`
    - `_merge_finance_into_cases`
    - `_rebuild_search_cache`
  - Finance now runs through the same main Cases pipeline after PIN unlock (no separate page renderer call).
  - Reused shared filters/search/data table path for Finance mode.
  - Added finance columns to the shared column system (`all_cols`) so users can mix case + finance fields.
  - Added finance-specific column settings keys:
    - `finance_visible_columns_v1`
    - `finance_column_order_map_v1`
  - Extended grid config with read-only finance columns for consistent table behavior.
  - Kept `Case -> Finance` jump visible only in Cases mode to avoid duplicate controls in Finance mode.
- Validation:
  - `python -m py_compile admin.py admin_pages/finance.py` passed.
  - Helper smoke test passed for finance merge and derived totals.
- Files changed:
  - admin.py
  - docs/RECAP.md

## 2026-03-09 (Fix: Streamlit view_mode session-state crash)
- Status: Fixed crash when opening Finance from Cases (`Manage Finance`).
- Error:
  - `StreamlitAPIException: st.session_state.view_mode cannot be modified after the widget with key view_mode is instantiated.`
- Root cause:
  - Code set `st.session_state["view_mode"] = "Finance"` after the `view_mode` radio widget was already created in the same run.
- Fix:
  - Added `pending_view_mode` handoff pattern.
  - `Manage Finance` now sets `st.session_state["pending_view_mode"] = "Finance"` and reruns.
  - Before creating the radio widget, app applies pending value to `view_mode`.
- Validation:
  - `python -m py_compile admin.py` passed.
- Files changed:
  - admin.py
  - docs/RECAP.md

## 2026-03-08 (Case-first finance UX + payment events)
- Status: Implemented case-first finance workflow bridge from Cases and added event-based payment tracking.
- Last request: Implement better finance UX that extends case data into financial management.
- Actions:
  - Added Cases -> Finance bridge in `admin.py` (`Case -> Finance` expander + `Manage Finance` button).
  - Added quick-open payload via session state so Finance opens preselected with case context.
  - Extended Finance schema with `finance_payments` table for multiple payment events per case.
  - Added payment helpers: insert/delete payment, sync total paid amount back to `finance_cases`.
  - Finance contract profile now uses selected case (locked case id in form).
  - Paid amount input is now read-only and auto-calculated from payment events.
  - Added Payment Events UI (add payment + list + delete payment).
  - Enriched Action Center with case title/status from existing case data.
  - Added dashboard counters for `No Contract` and `No Payment` queues.
- Validation:
  - `python -m py_compile admin.py admin_pages/finance.py` passed.
  - In-memory smoke test confirms payment events sum and sync into `finance_cases.paid_amount`.
- Files changed:
  - admin.py
  - admin_pages/finance.py
  - docs/RECAP.md


## 2026-03-07 (Finance case search flow)
- Status: Added DB-first case search with JSON fallback inside Finance; payment form can now be filled after selecting a found case.
- Last request: Add finance search by any known case info (DB first, then JSON), then allow payment input; confirm contract sum field.
- Actions:
  - Added `Find Case For Payment Entry` section in Finance UI.
  - Added DB search helper across `cases` (+ `case_user_data` values when available).
  - Added JSON fallback search across local `cases_full_json` files when DB returns no matches.
  - Added result selection flow: `Use Selected Case For Payment Entry` to prefill `Case #` in finance form.
  - Passed `local_json_dir` from admin router into `render_finance_page(...)`.
  - Kept and validated `Contract Sum` field in Finance form and detail metrics.
- Files changed:
  - admin_pages/finance.py
  - admin.py

## 2026-02-17 (VPS multi-project routing handoff)
- Status: Docs aligned with shared VPS nginx setup (WisePlan + eurbanizam on one server).
- Context:
  - VPS 207.180.222.248 now serves two projects by host routing.
  - wiseplan.dk/www -> WisePlan static export.
  - 207.180.222.248 -> eurbanizam Streamlit via 127.0.0.1:8501 + Basic Auth.
- Decisions:
  - eurbanizam requires no code/runtime service changes for this setup.
  - Nginx source of truth is in RouteCopilot2/vps-landing/nginx-multi-project.conf.
  - Do not deploy standalone eurbanizam nginx site config from this repo.
- Verification:
  - Searched scripts/tools/root BAT files for nginx deploy logic; no conflicting nginx overwrite automation found.
- Files changed:
  - docs/HELP.md
  - docs/RECAP.md
  - vps-landing/nginx-eurbanizam-block.conf

## 2026-02-06/07 (Admin UX, bot control, search, and filters)
- Status: Multiple improvements applied; local-first workflow established.
- Key decisions:
  - Local-first workflow: test locally, then push to Git.
  - Admin bot control is a hard start/stop (Windows process kill; VPS systemd).
  - Finance spec drafted and paused; will revisit later.
- Bot / Telegram fixes:
  - Added chunking for long Telegram messages to avoid 400 errors.
  - Fixed pagination: `more` no longer advances automatically (separate offset variable).
  - Added fuzzy search via RapidFuzz (optional if installed).
  - Loosened fuzzy thresholds for typos (e.g., ????????).
- Admin bot toggle:
  - Added sidebar toggle (hard on/off).
  - Linux uses `sudo -n systemctl start/stop eurbanizam-bot.service`; requires sudoers rule.
  - Windows uses process detection/kill for tools\telegram_bot_server.py.
  - Cached bot status to reduce UI lag; added Refresh button (later refined).
- Performance:
  - Added `st.cache_data` for DB reads (cases + custom fields) to speed UI on Windows.
- Case visibility + indicators:
  - All cases visible by forcing `(Empty)` status included in filter.
  - Removed NEW column.
  - Case ID markers added (ASCII):
    - `^ 77730` = created within last 7 days
    - `> 77730` = status updated within last 7 days
    - `v 77730` = late (no status change for >=20 days)
  - Legend updated accordingly.
  - First Seen column: shows date + detection source (scheduled/manual/full scrape).
- Late filter:
  - Added sidebar slider: Late (days since last change), filters by movement-only days since last update.
- DB / schema changes:
  - Added `first_seen_source` column via smart_sync/full scrape migrations.
  - Smart Sync accepts `--source` or env `EURB_SYNC_SOURCE`; Admin triggers set `manual_sync`.
- Ops / VPS notes:
  - Daily service runs at 04:00; case 77730 not in 04:16 snapshot because it appeared later (movement at 11:31?11:33).
  - Bot conflict 409 resolved by separate VPS bot token.
  - VPS bot service: eurbanizam-bot.service; Admin: eurbanizam-admin.service.
- Git history (branch: telegram-search-results-improvement):
  - Recent commits include: bot toggle fixes, fuzzy search thresholds, admin caching, late filter + markers.
- Open items / follow-ups:
  - Consider additional UI performance improvements if needed.
  - Finance module spec pending.
  - Optionally add a ?Last snapshot time? indicator in Admin.


## 2026-02-06 (Dev workflow decision)
- Decision: Default to local-first workflow: test changes locally, then push to Git.
- Notes: If a push happens first (urgent), pull locally and re-test.


## 2026-02-06 (Admin bot toggle + service names)
- Status: Implemented hard on/off toggle for the Telegram bot in Admin sidebar.
- Actions:
  - Added cross-platform bot control in admin.py:
    - Windows: start/stop python process for tools/telegram_bot_server.py.
    - VPS/Linux: systemctl start/stop eurbanizam-bot.service.
  - Added bot status display in sidebar.
  - Added psutil dependency for reliable Windows process detection.
  - Documented service names + toggle behavior in docs/HELP.md.
- Decisions:
  - Use systemd service name eurbanizam-bot.service on VPS (override via settings.json bot_service_name if needed).
- Files changed:
  - admin.py
  - requirements.txt
  - docs/HELP.md
  - docs/RECAP.md

Update this file after each user prompt to allow easy resumption later.
This file should be reviewed and updated after each change to the project.


## 2026-02-04 (VPS deployment decisions)
- Status: VPS plan confirmed; public access via HTTP on IP with Nginx + basic auth; Admin + Telegram bot services; scheduled Smart Sync + Report.
- Decisions:
  - Deployment: Nginx reverse proxy on public IP (HTTP only, no domain yet).
  - Security: HTTP Basic Auth required for Admin UI.
  - Services: Streamlit Admin + Telegram bot as systemd services.
  - Scheduling: daily Smart Sync + Report (systemd timer or cron).
  - Paths on VPS: repo at /home/nikola/eurbanizam-tracker; runtime at /home/nikola/.eurbanizam; secrets at /home/nikola/.eurbanizam/secrets/.eurbanizam_secrets.env (chmod 600).
- Next steps:
  - Provide one-shot setup script for Nginx, systemd services, and scheduling.




## 2026-02-04 (Movement date fallback + empty status filter)

- Status: Implemented fallback for movement timestamp when top-row date is missing; Admin can now show cases with blank status.
- Findings:
  - Movement history JSONs often contain `latest_dt_iso` (max movement date) while `newest_top_row_dt_iso` is `None`.
  - Admin Posledna uses `cases.latest_movement_last_change_dt` only, so cases like 77599/77730 showed no recent update.
  - Some new cases have empty status from list view, which hid them in Admin filtering.
- Actions:
  - Scraper now falls back to `latest_dt_iso` when `newest_top_row_dt_iso` is missing (in `scrape_single_case_to_json`).
  - Admin Status filter now includes `(Empty)` to show blank-status cases.
  - Backups created in `bak\20260204_191654` before edits.
- Next steps:
  - Run Smart Sync and verify `latest_movement_last_change_dt` updates for recent cases (e.g., 77599).
  - Confirm Admin shows blank-status cases when `(Empty)` is selected.


## 2026-02-04 (Created date + prev/last change tracking)
- Status: Added official creation date + previous movement change date tracking; Smart Sync now updates these fields.
- Findings:
  - Created date exists in JSON INFO tab (`Датум на креирање`) but was not persisted in DB.
  - Previous change date is the 2nd newest movement timestamp; needed for change delta visibility.
- Actions:
  - Scraper: parse `Датум на креирање` -> store `cases.official_created_at` and JSON meta.
  - Scraper: compute `latest_movement_prev_change_dt` (2nd newest) and store in DB.
  - Smart Sync: updates `official_created_at` + `latest_movement_prev_change_dt`.
  - Admin: added `Prethodna` column (prev change date).
  - Telegram: case details now show `Kreirano`, `Prethodna promena`, and latest change time.
  - DB: added column `latest_movement_prev_change_dt`.
- Validation:
  - Case 77599 shows: created 2026-01-28, prev change 2026-01-30 12:06:40, last change 2026-01-30 12:09:07.
- Next steps:
  - Run Smart Sync to populate created/prev dates for newly scraped cases.
  - Optional: JSON backfill for older cases (no re-scrape).

## 2026-02-04 (Smart Sync fixes + Posledna movement date)
- Status: Smart Sync fixes applied; Admin Posledna now strictly uses movement-history date. Smart Sync is running from Admin for verification.
- Last request: QA status mismatch; fix Smart Sync + ensure Posledna reflects "Историја на движење" last change; update Recap/Help.
- Actions:
  - Fixed smart_sync change detection flow and snapshot application order.
  - Smart Sync now persists latest movement date/state from targeted scrape into cases.latest_movement_last_change_dt/latest_movement_to_state.
  - Admin Posledna column now uses only cases.latest_movement_last_change_dt (no fallback to last_seen_at).
  - Backups created in bak\ before edits.
  - Updated docs/HELP.md with Smart Sync movement timestamp and Posledna rule.
- Decisions:
  - Posledna must reflect movement-history last change date, not list snapshot time or last_seen_at.
- Open questions:
  - Pending QA after Smart Sync run completes (verify movement dates update and admin shows recent changes).
- Next steps:
  - Finish Smart Sync run and validate DB values + Admin Posledna.
  - User is setting up VPS on Contabo; will provide updates separately.
- Files referenced:
  - admin.py
  - tools/smart_sync.py
  - docs/HELP.md
  - docs/RECAP.md
  - bak/*
- Files changed:
  - admin.py
  - tools/smart_sync.py
  - docs/HELP.md
  - docs/RECAP.md



## 2026-01-30/31 (UI Help, Full Scrape test mode, Telegram bot, smart sync status fix)
- Status: Major UI/help/launcher upgrades + bot integration; Smart Sync now applies snapshot to DB and reads snapshots folder.
- Last request: Add Help UX, fix Full Scrape flow (confirm + test mode), stabilize start_app.bat, integrate Telegram bot, fix snapshot/status mismatch, improve column ordering UI.
- Actions:
  - Help UX: sidebar View switch (Cases/Help), Help rendered in main area with sidebar ToC; edit mode saves HELP.md with backups.
  - Start_app.bat: fixed hash check, installs missing Playwright + browsers; creates runtime folders incl. snapshots/secrets/test_db/test_jsons/test_logs; starts Admin UI and Telegram bot in separate windows.
  - Full Scrape: added mode selector (Test 2 pages vs Full) + confirmation gate; test mode writes to test_db/test_jsons/test_logs.
  - Full scraper: test mode now overrides args.out_dir to test_jsons; paths resolved to runtime root.
  - Telegram bot: ported from Admin_Telegram_Scraper_Email; now uses settings.json runtime paths + secrets; added requests dependency; formatted search output to match desired multi-line list + separator; auto-started from start_app.bat.
  - Smart Sync: added apply_snapshot_to_db to upsert latest_list_state/title/request_type/detail_url for all snapshot rows before change detection.
  - Snapshots: probe now writes to %USERPROFILE%\.eurbanizam\snapshots; smart_sync now reads from same folder.
  - Columns UI: replaced dual editors with a single list that includes visibility checkbox + up/down reorder (persisted immediately).
  - Help doc updated with Full Scrape modes, test folders, start_app Playwright install, and sidebar view switch.
- Decisions:
  - Status source of truth in Admin is DB latest_list_state; snapshot should always refresh DB.
  - Test Full Scrape should never touch main DB/JSONs.
- Open questions:
  - If Admin still shows TAMPERED status after Smart Sync, confirm sync ran post-fix; may require one-time DB refresh from snapshot.
- Next steps:
  - Rerun Smart Sync to apply snapshot->DB in new folder; verify case 76352 status matches snapshot.
  - (Optional) replace Streamlit use_container_width deprecation warnings.
- Files referenced:
  - admin.py
  - start_app.bat
  - tools/scrape_full_two_phase_to_db.py
  - tools/smart_sync.py
  - tools/probe_list_status_snapshot.py
  - tools/telegram_bot_server.py
  - requirements.txt
  - docs/HELP.md
  - docs/RECAP.md
  - bak/*
- Files changed:
  - admin.py
  - start_app.bat
  - tools/scrape_full_two_phase_to_db.py
  - tools/smart_sync.py
  - tools/probe_list_status_snapshot.py
  - tools/telegram_bot_server.py
  - requirements.txt
  - docs/HELP.md
  - docs/RECAP.md

## New PC Quick-Start
- Repo location: `G:\My Drive\eurbanizam-tracker-Codex_v2`
- Runtime data: `C:\Users\NIKD\.eurbanizam` (db/json/logs/secrets)
- Secrets file: `C:\Users\NIKD\.eurbanizam\secrets\.eurbanizam_secrets.env`
- Start: run `run_Codex.bat` (shows this recap first), then `start_app.bat`

## 2026-01-28 (later)
- Status: PIM exclusion + filter persistence still unresolved; debug added.
- Last request: Fix PIM filter default/persistence; user moving to a different PC.
- Actions:
  - Added sidebar debug panel to show raw/normalized request types and exported CSV from UI.
  - Normalized `default_request_type_exclude` and added forced exclusion logic; still seeing PIM selected.
  - Attempted multiple Streamlit widget state fixes (session_state reset, on_change persistence).
  - Fixed a Streamlit warning about default + session_state conflict.
  - Captured debug export CSV at `C:\Users\NIKD\Documents\2026-01-28T14-50_export.csv` (PIM normalized to `пим`).
  - Hardened exclusion to always remove `pim/пим` and removed excluded types from filter options.
- Decisions:
  - Keep a debug panel until PIM exclusion is fully resolved.
- Open questions:
  - Why PIM still appears after exclusions and settings reset (likely Streamlit state or a second widget key).
- Next steps:
  - On next PC, verify if `filter_types` key is reused elsewhere or if another widget is overriding selection.
  - Consider hard-removing excluded types from the data before filter creation as a last resort.
- Files referenced:
  - `admin.py`
  - `settings.json`
  - `docs/RECAP.md`
  - `run_Codex.bat`
  - `bak/*`
- Files changed:
  - `admin.py`
  - `settings.json`
  - `docs/RECAP.md`
- Notes:
  - User leaving and continuing on a different PC.

## 2026-01-28
- Status: Admin UI consolidation + tool refactor completed.
- Last request: Consolidate admin UI to one file, refactor tools for new path contract, and align settings.
- Actions:
  - Consolidated features from old admin into a single `admin.py` (Streamlit UI + filters + custom fields + sync/report).
  - Removed `admin_ui.py` after creating backups in `bak/`.
  - Copied tools from old project and refactored them to use the new path contract and secrets path:
    - `tools/smart_sync.py`
    - `tools/daily_report.py`
    - `tools/probe_list_status_snapshot.py`
    - `tools/scrape_full_two_phase_to_db.py`
  - Updated `settings.json` to include visible columns, column order, and custom field definitions.
  - Ensured secrets are read from `%USERPROFILE%\.eurbanizam\secrets\.eurbanizam_secrets.env`.
- Decisions:
  - One admin entrypoint: `admin.py` at repo root.
  - Path-free runtime: code in repo, data/logs/secrets under `%USERPROFILE%\.eurbanizam`.
- Open questions:
  - None.
- Next steps:
  - Run `start_app.bat` and verify UI, Sync, and Report workflows.
- Files referenced:
  - `admin.py`
  - `admin_ui.py`
  - `settings.json`
  - `tools/smart_sync.py`
  - `tools/daily_report.py`
  - `tools/probe_list_status_snapshot.py`
  - `tools/scrape_full_two_phase_to_db.py`
  - `bak/*`
  - `docs/01_PATH_CONTRACT.md`
  - `docs/03_PHONE_POLICY.md`
- Files changed:
  - `admin.py`
  - `settings.json`
  - `tools/smart_sync.py`
  - `tools/daily_report.py`
  - `tools/probe_list_status_snapshot.py`
  - `tools/scrape_full_two_phase_to_db.py`
  - `docs/RECAP.md`
- Files deleted:
  - `admin_ui.py`


## 2026-01-28 (filters rebuild + fix)
- Status: Filters working with Cyrillic request types; persistence restored.
- Last request: Rebuild filters to use exact dataset strings (Cyrillic), fix persistence, and exclude "???" by default while keeping it selectable.
- Actions:
  - Switched filter reads to settings["raw"] as the single source of truth.
  - Added self-healing for corrupted/missing filter settings (types, status, date, search).
  - Rebuilt request_type/status/date/search filters to use exact dataset strings (no normalization).
  - Ensured filtering happens before custom-field merge.
  - Enforced default exclusion of "???" and cleaned legacy values ("PIM", "???").
  - Initialized Streamlit widget state so defaults are pre-selected reliably.
  - Updated settings.json defaults: default_request_type_exclude=["???"], last_date_range, last_search_text.
- Decisions:
  - Canonical filter comparisons use exact Cyrillic strings from the dataset.
- Open questions:
  - None.
- Next steps:
  - Run start_app.bat to verify UI as needed.
- Files referenced:
  - admin.py
  - settings.json
  - docs/RECAP.md
- Files changed:
  - admin.py
  - settings.json
  - docs/RECAP.md


## 2026-01-28 (UI compact + filters fix)
- Status: Filters fixed and UI compact layout applied.
- Last request: Fix Cyrillic request_type filtering/persistence and compress UI layout (top bar + sidebar filters).
- Actions:
  - Rebuilt filter persistence to read from settings["raw"] and self-heal corrupted filter settings.
  - Enforced default exclusion of "???" while keeping it selectable.
  - Moved filters to sidebar expanders; search moved to main area.
  - Moved Columns editor into sidebar; removed Cases header.
  - Removed debug panel and duplicate header/button blocks.
  - Moved Sync/Report to sidebar top; simplified header to title + search.
  - Added compact CSS spacing to avoid header overlap and reduce vertical gaps.
- Decisions:
  - Filters operate on exact dataset strings (Cyrillic) with persisted selections.
- Open questions:
  - None.
- Next steps:
  - Run start_app.bat to visually confirm compact layout.
- Files referenced:
  - admin.py
  - settings.json
  - docs/RECAP.md
- Files changed:
  - admin.py
  - settings.json
  - docs/RECAP.md


## 2026-01-28 (Claude_v4 tools review)
- Status: Preliminary understanding captured; needs confirmation.
- Last request: Review Claude_v4 tools to understand intended project workflow and summarize in recap.
- Actions:
  - Read Claude_v4 tools: smart_sync.py, probe_list_status_snapshot.py, scrape_full_two_phase_to_db.py, daily_report.py, notifications.py, sync_phones.py, daily_scraper.py.
  - Summarized inferred workflow: two-phase list+case scrape, smart sync uses probe diff, change_events for reports/notifications.
- Provisional understanding (needs verification):
  - Full scrape: list crawl -> case detail JSONs -> DB updates (runs/cases/list_snapshots/case_json_index).
  - Probe: list snapshot JSONL used for diff.
  - Smart sync: probe -> diff vs DB -> targeted case scrape -> change_events.
  - Daily report: emails change_events from last 24h.
  - Notifications: Telegram bot uses case JSON + DB search.
  - sync_phones: backfills phone into DB from JSON.
- Open questions (to confirm tomorrow):
  - Which scraper should be authoritative in v2 (full vs daily_scraper)?
  - Exact DB schema expectations and how they map to v2 path contract.
  - How/when list snapshots and change_events should be triggered in production.
  - Whether reports/notifications are still in scope for v2.
- Files referenced:
  - G:\My Drive\eurbanizam-tracker-Claude_v4	ools\smart_sync.py
  - G:\My Drive\eurbanizam-tracker-Claude_v4	ools\probe_list_status_snapshot.py
  - G:\My Drive\eurbanizam-tracker-Claude_v4	ools\scrape_full_two_phase_to_db.py
  - G:\My Drive\eurbanizam-tracker-Claude_v4	ools\daily_report.py
  - G:\My Drive\eurbanizam-tracker-Claude_v4	ools
otifications.py
  - G:\My Drive\eurbanizam-tracker-Claude_v4	ools\sync_phones.py
  - G:\My Drive\eurbanizam-tracker-Claude_v4	ools\daily_scraper.py
- Files changed:
  - docs/RECAP.md


## 2026-01-30 (start_app.bat install gating)
- Status: start_app.bat now skips reinstall unless requirements change or --install is used.
- Last request: Stop reinstalling deps every run; add hash check and runtime folder creation.
- Actions:
  - Added SHA256 hash check using venv python and stored at %VENV_ROOT%
equirements.sha256.
  - Added --install flag handling with explicit status message.
  - Created runtime folders under %USERPROFILE%\.eurbanizam (db/json/logs/snapshots/secrets).
  - Locked app entrypoint to admin.py.
- Decisions:
  - Requirements install is skipped when hash unchanged unless --install specified.
- Open questions:
  - None.
- Files referenced:
  - start_app.bat
- Files changed:
  - start_app.bat
  - docs/RECAP.md

---

## 2026-01-27
- Status: Recap initialized.
- Last request: Create a recap doc in v2 docs.
- Actions: Added `docs/RECAP.md` with a standing template.
- Pending: None.

---

## Template (copy for each new prompt)
- Date:
- Status:
- Last request:
- Actions:
- Decisions:
- Open questions:
- Next steps:
- Files referenced:
- Files changed:

## 2026-02-01
- Telegram bot: added HTML->plain text fallback so details never show raw <b>/<br> tags; case-details formatting is now safe.
- Telegram bot: numeric-only input now checks if it exists as a case_id; if not, it is treated as a search term (phone/parcel/etc.).
- Telegram bot: added time-based status change query support (e.g., "status changed in last 7 days") using change_events.timestamp, with fallback to cases.latest_movement_last_change_dt.
- Telegram bot: preserved local search + Gemini fallback, and kept list formatting for search results.
- Help: added planned Telegram safety foundation notes + a "Telegram bot (human assistant behavior)" section in Roadmap.
- Backups created before changes in bak\.

## 2026-02-01 (Telegram bot QA + fixes)
- Telegram bot: fixed HTML parse error (Telegram rejected <br>), changed case-details output to use newlines instead of <br>.
- Telegram bot: added HTML-to-plain fallback so raw tags never appear in case details.
- Telegram bot: numeric-only input now checks DB for real case_id; if not found, treated as search term (phone/parcel/etc.).
- Telegram bot: time-based status-change queries added ("status changed in last X days"), uses change_events with fallback to cases.latest_movement_last_change_dt.
- Telegram bot: QA discovered change_events uses field_name='status' (not 'latest_list_state'); updated filter to IN ('status','latest_list_state').
- Help: added Telegram safety foundation + human-assistant behavior section.
- Backups created before each change in bak\.
- Pending: restart bot and re-test numeric phone query and status-change query.

## 2026-02-04 (VPS setup troubleshooting + fixes)
- Status: Admin + bot running; daily timer active; Playwright installed; Nginx config corrected; settings.json fixed for Linux; DB/JSON copy from Windows in progress.
- Last request: Set up VPS and document issues/solutions; show Admin UI first; copy existing DB/JSONs to avoid long full scrape.
- Actions:
  - Fixed systemd daily service to Type=oneshot to allow multiple ExecStart.
  - Installed Playwright on VPS; ran `python -m playwright install --with-deps` for Linux libraries.
  - Identified settings.json runtime_root default `%USERPROFILE%` causes secrets lookup failure on Linux; updated to `/home/nikola/.eurbanizam` and Linux paths for db/json/logs.
  - Fixed secrets file formatting and key names; verified PORTAL_USERNAME/PORTAL_PASSWORD presence.
  - Admin UI initially showed “Local DB not found”; plan is to copy DB + JSONs from Windows runtime.
  - Nginx config file was polluted with shell script lines; replaced with clean server block only.
  - Default Nginx site removed; eurbanizam site symlinked.
  - Port 8501 conflict traced to active SSH tunnel.
- Decisions:
  - For first VPS run, copy Windows runtime DB/JSONs instead of Full Scrape to save hours.
  - Keep secrets only on VPS; do not transfer secrets from Windows.
- Open questions:
  - Confirm Admin data loads after DB/JSON transfer.
- Next steps:
  - Complete SCP transfer of db + json + snapshots.
  - Restart Admin service and verify UI loads data.
- Files referenced:
  - /etc/nginx/sites-available/eurbanizam
  - /etc/systemd/system/eurbanizam-*.service
  - /etc/systemd/system/eurbanizam-daily.timer
  - /home/nikola/eurbanizam-tracker/settings.json
  - /home/nikola/.eurbanizam/secrets/.eurbanizam_secrets.env
- Files changed (repo):
  - docs/HELP.md (VPS troubleshooting notes)
  - docs/RECAP.md (this entry)

## 2026-02-05 (PM) recap
  - Telegram bot search results now render full case details (same format as
  single-case), including days since last update, status, last/prev/created
  dates (date-only), type, full title, and custom fields with icons only.
  - Search paging: shows up to 10 results; if total >10, shows: `Found N
  matches. Reply 'more' for next 10 or refine your search.` Replying `more`
  shows the next 10. After final page, state is cleared so repeated `more`
  replies won’t loop.
  - For `КП 2062` local DB has exactly 10 matches, so no `more` prompt
  appears (expected). Use broader terms to trigger paging.
  - Fixed Cyrillic labels/icons in search list output (previously
  showed ?????).
  - Local bot runs via venv: `& "$env:USERPROFILE\.venvs\eurbanizam-
  v2\Scripts\python.exe" "G:\My Drive\eurbanizam-tracker-
  Codex_v2\tools\telegram_bot_server.py"`
  - VPS bot remains pinned to tag `v2.0.0` (detached HEAD) and is stopped
  for local testing; do not deploy changes to VPS yet.
  - Full scrape on VPS running headless (`HEADLESS_MODE=true` in `/home/
  nikola/.eurbanizam/secrets/.eurbanizam_secrets.env`).
  - Local admin crash fixed by converting `docs/HELP.md` to UTF-8 (was
  Windows-1252).
  - Open: create a local BAT to stop all bot instances and restart the repo
  bot; tooling couldn’t write/read files due to sandbox error.