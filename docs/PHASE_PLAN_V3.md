# Phase plan: eurbanizam-app (Next.js + React + TypeScript + shadcn/ui)

This document is a phased plan to rebuild the e-Urbanizam admin and finance system in a new stack while preserving logic and functionality. It is based on analysis of the current codebase (`eurbanizam-tracker-Codex_v2`).

---

## 1. Current system overview

### 1.1 Entry point and views

- **Entry:** `admin.py` → `main()` sets Streamlit page config, loads `settings.json`, validates DB schema, then renders based on **view mode**.
- **View modes (sidebar radio):**
  - **Cases** – Main data grid of cases with filters, column visibility, editable custom fields, custom fields manager.
  - **Help** – Renders `docs/HELP.md` with TOC and optional edit mode.
  - **Finance** – PIN-protected; calls `render_finance_page()` in `admin_pages/finance.py`.

### 1.2 Data and storage

- **Settings:** `settings.json` (project root). Contains:
  - `local_db_path`, `local_json_dir`, `local_logs_dir`, `runtime_root`, suitcase paths
  - `schema_validation` (expected_tables, expected_columns)
  - `custom_field_defs` (name, type, options, enabled, scope)
  - `visible_columns_v9`, `column_order_map`
  - `raw`: last_date_range, last_request_type_selection, last_status_selection, last_search_text, finance_pin, etc.
- **Database (SQLite):**
  - **Core (scraper/sync):** `cases` (case_id, status, title, request_type, created_at, updated_at, phone, …), `case_user_data` (case_id, field_key, field_value, updated_at).
  - **Finance (admin_pages/finance.py + admin.py):**
    - `finance_cases` – case_id, client_name, client_phone, service_type, finance_date, contract_sum, currency, paid_amount, due_date, finance_status, notes, created_at, updated_at
    - `finance_payments` – payment_id, case_id, payment_date, amount, currency, note, created_at, updated_at
    - `finance_invoices` – invoice_id, case_id, invoice_number, issue_date, due_date, amount, currency, status, client_name, client_email, client_address, service_description, items_json, file_path, reminder_* fields, created_at, updated_at
    - `finance_email_log` – log_id, case_id, invoice_id, email_type, to_email, subject, body_preview, attachment_*, reminder_sequence, sent_at, created_at
    - `finance_case_recipients` – case_id, email, last_used_at (PK case_id, email)
- **Finance-specific settings:** `finance_settings.json` (company info, SMTP, company_email). Path: `PROJECT_ROOT/finance_settings.json`.

### 1.3 Cases view (admin.py)

- **Data flow:** `load_settings` → `validate_db_schema` → `get_connection` → `load_cases` + custom fields from `case_user_data` → `_prepare_cases_cached` (adds computed columns, search blobs, “First Seen”, “Denovi (Od Posledna)”, etc.) → `_merge_finance_into_cases` (adds finance_* columns) → filter by date, request_type, status, search → `st.data_editor` with column_config.
- **Features:** Date filter (preset + custom), request type filter, status filter, free-text search (exact + fuzzy via rapidfuzz), column visibility and order (sidebar), editable table (writes to `case_user_data` and optionally `cases.phone`), “Custom Fields Manager” expander (edit field defs, persisted to settings + DB renames), Action Center / queue (overdue, remaining balance), handle_pending_edits (writes edits from data_editor to DB).

### 1.4 Finance view (admin_pages/finance.py)

- **Data flow:** Same `df_cases` (cases + custom + finance merged), `conn`, `db_path`, `json_dir`, `settings`, `custom_defs`, column/display helpers. Finance schema ensured on conn (`_ensure_finance_schema`).
- **Sidebar:** Filters (date, request type, status), Company info (invoices), Email/Invoice settings (SMTP, test email), column visibility/order.
- **Main:**
  - **List mode:** Filtered/sorted case table with finance columns; click case → detail_case_id; Action Center (overdue queue, invoice reminders send).
  - **Detail mode:** One case – Contract profile (form → finance_cases upsert + case_user_data sync), Payment events (add/delete → finance_payments, sync paid_amount), Invoices (create, edit, set status, send by email with PDF, delete, email history, recipient dropdown), metrics (Contract Sum, Invoiced, Paid, Remaining).
- **Logic worth reusing (as API or port):** All DB reads/writes, invoice HTML build, HTML→PDF (pdfkit/wkhtmltopdf), send email (SMTP), email log, case recipients, proposed amount (contract_sum − invoice_sum − payment_sum), paid = payments + sum(PAID invoices).

### 1.5 External / tools (optional for V3 scope)

- **Bot and scrapers (sidebar):** Telegram bot start/stop, Full Scrape (subprocess to `scrape_full_two_phase_to_db.py`), Smart Sync, Daily Report. These can remain in the old app or be triggered via API later.
- **Tools (separate scripts):** `smart_sync.py`, `scrape_full_two_phase_to_db.py`, `daily_report.py`, `telegram_bot_server.py`, `probe_list_status_snapshot.py`, `system_healthcheck.py`. Not part of the admin UI; can stay Python.

---

## 2. Phased migration plan

Each phase delivers a usable slice. The new **Next.js app (eurbanizam-app)** talks to the same SQLite DB through a **FastAPI backend that lives inside this repo under `apps/api`**. FastAPI wraps the existing Python logic (cases + finance, PDF/email) and becomes the single boundary for all new UI while the Streamlit UI in this repo remains the baseline during migration.

---

### Phase 0: Foundation (this repo + eurbanizam-app)

**Goal:** Establish the FastAPI boundary in **this repo** and a basic Next.js shell in **eurbanizam-app**. No business logic changes yet.

- **0.1** In this repo, create `apps/api` FastAPI app:
  - `apps/api/main.py` (FastAPI app, CORS, `/health`).
  - `apps/api/api/routers/{cases,finance,settings,help}.py`.
  - `apps/api/core/*` for shared business logic.
  - `apps/api/services/*` and `apps/api/repositories/*` for orchestration + DB access.
- **0.2** Confirm FastAPI reads the same `settings.json` / `finance_settings.json` and SQLite DB path as `admin.py` (single source of truth).
- **0.3** In `eurbanizam-app`, ensure Next.js app with TypeScript, Tailwind, shadcn/ui is set up (already done) and configure `NEXT_PUBLIC_API_URL` to point to FastAPI.
- **0.4** App layout in `eurbanizam-app`: sidebar navigation (Cases | Finance | Help), main content area, optional header.
- **0.5** Health/readiness: FastAPI `GET /health` and a simple “Welcome”/status card in the Next.js app that calls it.

**Deliverable:** This repo provides a running FastAPI boundary under `apps/api` that shares the DB/settings with Streamlit; `eurbanizam-app` has layout + nav and successfully calls the health endpoint. No breaking changes to the old app.

---

### Phase 1: Cases list and filters

**Goal:** Read-only Cases view with filters and column visibility (no editing yet).

- **1.1** Backend (Python API or Next API using DB):
  - Load settings (or replicate minimal config for DB path and schema).
  - Endpoints: `GET /api/cases` (query params: date_from, date_to, request_type[], status[], search), `GET /api/settings` (visible_columns, column_order, custom_field_defs, last_* filters).
  - Return cases + merged custom fields + finance columns (reuse or reimplement `_prepare_cases_cached` + `_merge_finance_into_cases` logic).
- **1.2** Frontend:
  - Cases page: data table (shadcn Table or TanStack Table) with columns from settings.
  - Sidebar filters: date preset + custom range, request type multiselect, status multiselect, search input. Persist last used filters (localStorage or API).
  - Column visibility/order (sidebar or toolbar). Persist to settings API if available.
- **1.3** Case key resolution and schema validation (same as current: cases + case_user_data, expected_tables/expected_columns). API returns 400/500 if schema invalid.

**Deliverable:** User can open Cases, see filtered case list with correct columns, change filters and column visibility. No edit, no Finance yet.

---

### Phase 2: Cases editing and custom fields

**Goal:** Inline or form-based editing of case custom fields and phone; Custom Fields Manager.

- **2.1** Backend:
  - `PATCH /api/cases/:caseId/fields` (or bulk) – write to `case_user_data` and optionally `cases.phone` (mirror `handle_pending_edits`).
  - `GET /api/settings/custom-fields`, `PUT /api/settings/custom-fields` – read/update custom_field_defs and column visibility/order; apply renames in case_user_data if field name changed.
- **2.2** Frontend:
  - Editable table or row expand: edit custom fields and phone; save triggers PATCH. Toasts for success/error.
  - “Custom Fields Manager” (dialog or side panel): list of fields (name, type, options, enabled); add/edit/delete (with guard for permanent fields e.g. “Name / Last name”, “email”). Save to settings API.
- **2.3** Validation: required field_key/field_value, no duplicate names, no “Phone” as custom name. Permanent fields cannot be removed.

**Deliverable:** User can edit case data and manage custom field definitions; behavior matches current app.

---

### Phase 3: Finance – list and case detail shell

**Goal:** Finance view with case list and navigation to case detail; no payments/invoices yet.

- **3.1** Backend:
  - Reuse or expose same cases + finance merge as Phase 1; optional `GET /api/finance/cases` if different filters needed.
  - `GET /api/finance/cases/:caseId` – contract profile, payments summary, invoices summary (for metrics only).
- **3.2** Frontend:
  - Finance layout: PIN gate (store token in session/localStorage; backend validates PIN from settings).
  - Finance case list (same or filtered cases); click → case detail route (e.g. `/finance/cases/[caseId]`).
  - Case detail shell: Contract Sum / Invoiced / Paid / Remaining metrics (read-only), placeholder sections for Contract profile, Payments, Invoices.
- **3.3** Finance settings: load company info and SMTP from `finance_settings.json` via API (read-only in this phase).

**Deliverable:** User can open Finance (after PIN), see case list, open a case and see metrics and placeholders.

---

### Phase 4: Finance – contract profile and payments

**Goal:** Edit contract profile; list and add/delete payment events; sync paid_amount.

- **4.1** Backend:
  - `GET /api/finance/cases/:caseId/profile`, `PUT /api/finance/cases/:caseId/profile` – finance_cases upsert; sync “Name / Last name”, “email” (and any other permanent fields) to case_user_data.
  - `GET /api/finance/cases/:caseId/payments`, `POST /api/finance/cases/:caseId/payments`, `DELETE /api/finance/payments/:paymentId`. On add/delete, recalc and update finance_cases.paid_amount.
- **4.2** Frontend:
  - Contract profile form (client name, phone, service type, finance date, contract sum, currency, due date, status, notes). Save → PUT profile.
  - Payments table; “Add payment” form (date, amount, currency, note). Delete with confirmation. Paid metric updates after each change.
- **4.3** Paid = payments total + sum of PAID invoices (formula already in current app). Display accordingly.

**Deliverable:** User can edit contract and manage payments; Paid and Remaining update correctly.

---

### Phase 5: Finance – invoices (CRUD, status, proposed amount)

**Goal:** Create, edit, delete invoices; set status (DRAFT/SENT/PAID/CANCELLED); proposed amount = contract_sum − invoice_sum − payment_sum.

- **5.1** Backend:
  - `GET /api/finance/cases/:caseId/invoices`, `POST /api/finance/cases/:caseId/invoices`, `PATCH /api/finance/invoices/:invoiceId`, `DELETE /api/finance/invoices/:invoiceId`.
  - Proposed amount computed server-side; return in response or separate endpoint.
- **5.2** Frontend:
  - Invoices table; “Create invoice” form (number, dates, amount, currency, status, description, client name/email/address, reminder settings). Prefill amount with proposed value.
  - “Edit invoice” (same fields); “Set status” quick dropdown (DRAFT/SENT/PAID/CANCELLED). Delete with confirmation.
- **5.3** Invoiced = sum of all invoice amounts; Paid = payments + sum(PAID invoices); Remaining = contract − Paid. Metrics reflect after every change.

**Deliverable:** Full invoice CRUD and status; metrics stay in sync.

---

### Phase 6: Finance – send invoice by email and PDF

**Goal:** Send invoice email with optional PDF attachment; log email; save recipient for case.

- **6.1** Backend (Python required for PDF and SMTP):
  - `POST /api/finance/invoices/:invoiceId/send-email` – body: to_email, subject, body. Server: build invoice HTML (reuse current logic), generate PDF (pdfkit/wkhtmltopdf), send via SMTP, log to finance_email_log, upsert finance_case_recipients. Return success/error.
  - `GET /api/finance/cases/:caseId/recipients` – return saved + client email for dropdown.
- **6.2** Frontend:
  - “Send invoice by email”: single To field (prefill last used or client), Subject, Body, approval checkbox, Send. On success, show toast; optionally set invoice status to SENT.
  - Optional: “Or click to use” suggestions (saved recipients). New addresses saved after send.
- **6.3** PDF and company data: use finance_settings.json (company) and invoice row; wkhtmltopdf path/config as in current app (e.g. Windows default path).

**Deliverable:** User can send invoice emails with PDF; emails and recipients are stored; behavior matches current app.

---

### Phase 7: Finance – email history and reminders

**Goal:** View email history per case and per invoice; send reminder emails (manual).

- **7.1** Backend:
  - `GET /api/finance/cases/:caseId/email-log?invoiceId= optional` – return finance_email_log rows (with body_preview, attachment info).
  - `POST /api/finance/reminders/send` – body: list of invoice ids or “all eligible”. For each: check overdue + reminder settings, build reminder email, send, log, update reminder_sent_count and last_reminder_sent_at.
- **7.2** Frontend:
  - “Email history” section: filter by “All” or “Invoice #N”; table + expandable body preview.
  - “Invoice reminders” in Action Center: list overdue invoices needing reminder; approval checkbox; “Send reminders now”. Show result (sent count / errors).

**Deliverable:** Full email audit trail and manual reminder flow as in current app.

---

### Phase 8: Help and settings

**Goal:** Help page (markdown); global and finance settings persistence.

- **8.1** Backend:
  - `GET /api/help`, `PUT /api/help` – read/write `docs/HELP.md` (or equivalent). Optional backup on edit.
  - `GET /api/settings`, `PATCH /api/settings` – visible_columns, column_order, date/type/status/search defaults, finance_pin (change with care). Finance-specific: `GET/PUT /api/finance/settings` for company + SMTP (finance_settings.json).
- **8.2** Frontend:
  - Help page: render markdown with TOC; optional edit mode (textarea + Save). Same content as current HELP.md.
  - Settings: column visibility/order already in Phase 1/2; add persistence for last filters and PIN management if needed. Finance sidebar: Company info and Email/Invoice settings forms → API.

**Deliverable:** Help editable in app; settings (including finance) persisted and used by API.

---

### Phase 9: Polish and parity

**Goal:** Action Center (overdue queue), “Denovi (Od Posledna)”, legend (^ / > / v), any missing filters or edge cases.

- **9.1** Backend: Ensure cases API returns computed columns (e.g. _updated_recent, _created_recent, _late_case, “Denovi (Od Posledna)”) and finance remaining/overdue for queue.
- **9.2** Frontend:
  - Action Center: overdue cases with balance; link to case detail. Invoice reminders already in Phase 7.
  - Case list: optional case_id prefixes (^ created, > updated, v late) and “First Seen”/legend.
- **9.3** Testing: Compare with current app (same DB, same actions). Document any intentional differences.

**Deliverable:** Feature parity with current Cases and Finance flows; ready to switch over.

---

### Phase 10 (optional): Bot and scrapers from new app

**Goal:** Trigger bot and scrapers from new UI (or keep in old app).

- **10.1** Backend: Endpoints to start/stop bot, run full scrape (test/full), run smart sync, run daily report. Either subprocess to existing Python scripts or small Python service that the new app calls.
- **10.2** Frontend: Sidebar or “Tools” section: Bot on/off, Full Scrape (mode + confirm), Sync, Report. Match current sidebar behavior.

**Deliverable:** Optional; can remain in Streamlit app if preferred.

---

## 3. Technical notes

- **DB:** Keep one SQLite file; both old and new app can share it during migration. Avoid schema changes that break the old app until you retire it.
- **Auth:** Finance PIN only (no global login in current app). Optional: add simple session or JWT for Finance in the new app.
- **Python backend:** If used, structure it as a small FastAPI app: routers for `/api/cases`, `/api/finance`, `/api/settings`, `/api/help`; reuse functions from current `admin.py` and `admin_pages/finance.py` (copy or symlink the modules that don’t depend on Streamlit).
- **Porting to TypeScript:** DB read/write and business rules can be ported to TypeScript (e.g. better-sqlite3 or Drizzle) in later phases; PDF and SMTP are the main reasons to keep Python. Plan one phase to “port finance logic to Node” if you want to drop Python entirely for the web app.

---

## 4. File reference (current codebase)

| Area              | Main files / locations |
|-------------------|-------------------------|
| Entry, Cases, nav | `admin.py` (main, view_mode, filters, data_editor, custom fields manager) |
| Finance UI + logic| `admin_pages/finance.py` (render_finance_page, schema, invoices, payments, email, PDF) |
| Finance tables    | Same DB: finance_cases, finance_payments, finance_invoices, finance_email_log, finance_case_recipients |
| Settings          | `settings.json`, `finance_settings.json` |
| Help              | `docs/HELP.md` |
| Tools (optional)  | `tools/smart_sync.py`, `tools/scrape_full_two_phase_to_db.py`, etc. |

---

*Document generated from analysis of eurbanizam-tracker-Codex_v2. Copy this plan into eurbanizam-app repo (e.g. `docs/PHASE_PLAN_V3.md`) and tick phases as you complete them.*
