# Finance Module Modifications – Deployment & VPS Guide

This document describes **all code and database changes** made to remove contract-level **Financial status**, **Finance date**, and **Finance due date** from the finance module, and to adjust the Contract Profile UX. Use it when pulling this branch on the VPS to avoid breakage and to verify the deployment.

---

## 1. Summary of Intent

- **Removed from contract/case level:** `finance_date`, `due_date`, `finance_status` (no longer stored or displayed for the contract).
- **Overdue and “needs action”** are now derived **only from invoices** (e.g. sum of overdue unpaid invoice amounts), not from a contract due date or status.
- **Contract Profile UI:** Saves on blur/Enter (no Save button), shows a top “Saved” indicator, default tab when there are no invoices is Contract Profile, and a “Create invoice / payment” button that opens the draft and focuses the Invoice Number field.

---

## 2. Database Changes

### 2.1 Table: `finance_cases`

**Current schema (after migration):**

The table is created **without** the columns `finance_date`, `due_date`, and `finance_status`. It has only:

| Column         | Type   | Notes                          |
|----------------|--------|---------------------------------|
| `case_id`      | TEXT   | PRIMARY KEY                    |
| `client_name`  | TEXT   |                                |
| `client_phone` | TEXT   |                                |
| `service_type` | TEXT   |                                |
| `contract_sum` | REAL   | NOT NULL DEFAULT 0             |
| `currency`     | TEXT   | NOT NULL DEFAULT 'MKD'         |
| `paid_amount`  | REAL   | NOT NULL DEFAULT 0             |
| `notes`        | TEXT   |                                |
| `created_at`   | TEXT   | NOT NULL                       |
| `updated_at`   | TEXT   | NOT NULL                       |

**Migration (existing databases):**

- **File:** `apps/api/core/finance_invoices.py`
- **Function:** `_migrate_finance_cases_drop_contract_date_status(conn)`
- **When it runs:** Automatically inside `ensure_finance_schema(conn)` after the `CREATE TABLE IF NOT EXISTS finance_cases` block.
- **What it does:**
  1. Runs `PRAGMA table_info(finance_cases)` to get existing columns.
  2. For each of `finance_date`, `due_date`, `finance_status`, if the column exists, runs:
     - `ALTER TABLE finance_cases DROP COLUMN "finance_date"` (and same for `due_date`, `finance_status`).
  3. Uses **double-quoted** identifiers (e.g. `"finance_date"`) for SQLite.
  4. Requires **SQLite 3.35+** for `DROP COLUMN`. Older SQLite will raise; ensure the VPS SQLite version is ≥ 3.35.
  5. Then runs an unrelated migration for `finance_case_recipients.label` if missing.

**VPS checklist:**

- [ ] Confirm SQLite version: `sqlite3 --version` (must be ≥ 3.35).
- [ ] After deploy, the first request that calls `ensure_finance_schema()` (e.g. any finance API) will run the migration and drop the three columns. No manual SQL needed.
- [ ] If you run a backup before deploy, restore is safe: the new code creates the table without those columns and the migration is idempotent (drops only if present).

### 2.2 Other finance tables (unchanged)

- **`finance_invoices`** – Still has `due_date` per **invoice** (used for overdue calculation). No change.
- **`finance_payments`** – No change.
- **`finance_email_log`** – No change.
- **`finance_case_recipients`** – Only possible change is adding `label` if missing (same migration function).

---

## 3. Backend (API) Changes

### 3.1 File: `apps/api/core/finance_invoices.py`

- **`ensure_finance_schema(conn)`**
  - `CREATE TABLE IF NOT EXISTS finance_cases` now defines **only** the columns listed in section 2.1 (no `finance_date`, `due_date`, `finance_status`).
  - No indexes on those columns.
  - Immediately after the create block, calls `_migrate_finance_cases_drop_contract_date_status(conn)` so existing DBs drop the three columns.

- **`_migrate_finance_cases_drop_contract_date_status(conn)`**
  - As described in section 2.1. Uses `PRAGMA table_info` and `ALTER TABLE ... DROP COLUMN "col"` for each of the three names.

### 3.2 File: `apps/api/core/finance_cases.py`

- **`FINANCE_SNAPSHOT_COLUMNS`**
  - Removed: `"finance_due_date"`, `"finance_status"`.

- **`load_finance_df(conn)`**
  - SELECT no longer includes `finance_date`, `due_date`, `finance_status`.

- **`ensure_finance_case_exists(conn, case_id, seed)`**
  - INSERT into `finance_cases` uses only: `case_id`, `client_name`, `client_phone`, `service_type`, `contract_sum`, `currency`, `paid_amount`, `notes`, `created_at`, `updated_at`.
  - No `finance_date`, `due_date`, `finance_status` in column list or values.

- **`upsert_finance_row(conn, data)`**
  - Same: INSERT/UPDATE and `data` dict do not use the three fields.

- **`build_finance_case_aggregates(conn, ...)`**
  - Empty DataFrame columns: removed `finance_date`, `due_date`, `finance_status`; added `overdue_invoice_amount`.
  - **Overdue logic:** No longer uses contract `due_date`. Overdue is **invoice-based**:
    - From `finance_invoices`: invoices with `due_date` in the past and status not PAID/CANCELLED contribute to `overdue_invoice_amount` per case.
    - Aggregation: `overdue_invoice_amount` is summed per case; `out["overdue_amount"]` is set from this (no contract due date).
  - Snapshot/merge: no assignment of `finance_due_date` or `finance_status`.

- **`merge_finance_into_cases`** (and any related snapshot loading)
  - No reading or writing of `finance_due_date`, `finance_status`, or contract `finance_date`.

- **`summarize_dashboard(conn)`**
  - `needs_action_count`: uses `(aggregates["remaining"] > 0) & (aggregates["overdue_amount"] > 0)` (invoice-based), not contract due date.

- **`list_finance_case_summaries(conn, ...)`**
  - Per-row dict no longer includes `due_date` or `finance_status`.
  - Sort default: `["finance_overdue_amount", "finance_remaining", "updated_at"]` (no `_due_date_sort`).
  - `needs_action_only` filter: uses `(finance_remaining > 0) & (finance_overdue_amount > 0)`.

- **`get_finance_filter_options(conn)`**
  - Returns only case filter options; no distinct `finance_status` loading.

- **`get_finance_case_detail_dict(conn, case_id, ...)`**
  - Returned dict does **not** include `finance_date`, `due_date`, or `finance_status`.

- **`upsert_finance_profile(conn, case_id, payload)`**
  - `data` dict and payload handling do not include the three fields.

- **`_load_finance_row(conn, case_id)`**
  - SELECT only: `case_id`, `client_name`, `client_phone`, `service_type`, `contract_sum`, `currency`, `paid_amount`, `notes`, `created_at`, `updated_at`.

- **`with_calculated_fields`**
  - No `finance_date_dt` / `due_date_dt`; `days_overdue` is set to 0 (or derived only from aggregates if needed elsewhere).

### 3.3 File: `apps/api/services/finance_service.py`

- **`update_overview(case_id, payload: FinanceOverviewUpdatePayload)`**
  - Removed the block that updated `finance_status` on `finance_cases` (the `if "finance_status" in updates` block and the corresponding UPDATE).

- **`add_payment(...)`** (and any other call to `ensure_finance_case_exists`)
  - Seed dict no longer includes `"finance_status": "GRAY"`; only fields that still exist (e.g. `currency`) are passed.

### 3.4 File: `apps/api/schemas/finance.py`

- **`FinanceCaseListItem`**
  - Removed fields: `due_date`, `finance_status`.

- **`FinanceCaseDetail`**
  - Removed fields: `finance_date`, `due_date`, `finance_status`.

- **`FinanceProfilePayload`**
  - Removed: `finance_date`, `due_date`, `finance_status`.

- **`FinanceOverviewUpdatePayload`**
  - Removed: `finance_status`.

- **`Invoice`** (and invoice-related payloads)
  - **Unchanged:** invoice-level `due_date` and status remain (used for overdue calculation).

---

## 4. Frontend Changes

### 4.1 File: `apps/web/src/lib/schemas.ts`

- **`FinanceCaseSchema`**
  - Removed: `due_date`, `finance_status`.

- **`FinanceCaseDetailSchema`**
  - Removed: `finance_date` from the extended fields (base no longer has `due_date`/`finance_status`).

- Invoice-related schemas still include invoice `due_date` and status.

### 4.2 File: `apps/web/src/app/(shell)/finance/page.tsx` (Finance overview list)

- Removed **Due Date** and **Finance Status** columns from the finance DataTable (column definitions and column groups).
- Removed **inline edit** for `finance_status` (and any `FINANCE_STATUS_OPTIONS` usage there).
- **`FinancePatchPayload`** (or equivalent): no `finance_status`.
- **`toFinanceSummary(detail)`** (or list mapping): no `due_date` or `finance_status`.
- **`FINANCE_SORT_COLUMN_MAP`**: removed `due_date` (and `finance_status` if present). Default sort no longer uses contract due date.

### 4.3 File: `apps/web/src/components/finance/finance-case-workspace.tsx` (Contract profile & workspace)

**Contract profile – fields and saving:**

- **ProfileDraft type:** Removed `finance_date`, `due_date`, `finance_status`.
- **`buildProfileDraft(detail)`:** Does not set the three fields.
- **Save behavior:** No “Save profile” / “Save Changes” button. Saving is triggered by:
  - **Blur** on profile inputs/textareas (and contact/case memory fields in the same form).
  - **Enter** key in those fields (with `preventDefault` so form doesn’t submit).
  - **Select** (e.g. Currency): save triggered after value change (e.g. `setTimeout(..., 0)` then `saveProfile()`).
- **`saveProfile()`:** Extracted from former `handleProfileSave`; calls PUT `/api/finance/cases/:id/profile` and PATCH overview, then sets `profileSaveStatus` to `"saving"` / `"saved"` and clears after 2s.

**Top “Saved” indicator:**

- State: `profileSaveStatus`: `"idle" | "saving" | "saved"`.
- When `profileSaveStatus !== "idle"`: a small line at the **top** of the profile tab shows:
  - “Saving…” with loader (e.g. `Loader2` icon) when `"saving"`,
  - “Saved” with checkmark when `"saved"`.
- Indicator is in a **full-width row** (not in a 2-column grid) so the form doesn’t jump when it appears.

**Layout:**

- Profile tab content: **single-column flex** layout; **Saved** indicator centered above the form.
- Contract Details form is inside a **centered** container: `mx-auto w-full max-w-2xl` so the form is centered on the screen.

**Bottom of Contract profile:**

- **Removed:** “Save profile” / “Save Changes” button.
- **Added:** “Create invoice / payment” button (with FileText icon). On click:
  - Switches to **Invoices & Payments** tab (`setActiveTab("workbench")`).
  - Opens **Draft New** invoice (`prepareNewInvoice(...)`).
  - Scrolls draft into view and focuses the **Invoice Number** input (ref `invoiceNumberInputRef` attached to that input).

**Default tab:**

- When workspace data is loaded: if `loadedDetail.invoices.length === 0` then `setActiveTab("profile")`, else `setActiveTab("workbench")`. So cases with no invoices open on Contract Profile; cases with invoices open on the same default as before (workbench).

**Removed from UI:**

- Contract Profile: no “Finance date”, “Due date”, or “Finance status” fields.
- No contract-level status badge or “Due … / Finance date …” in the workspace header or stats.
- **`FINANCE_STATUS_OPTIONS`** removed from the workspace (no longer used).

**Refs:**

- `invoiceNumberInputRef`: attached to the Invoice Number input in the workbench draft form so “Create invoice / payment” can focus it after switching tabs.

---

## 5. API Routes (no contract date/status)

- **GET/PUT** `/api/finance/cases/:id` and **PUT** `/api/finance/cases/:id/profile`: request/response bodies no longer include `finance_date`, `due_date`, or `finance_status`.
- **PATCH** `/api/finance/cases/:id/overview`: payload no longer includes `finance_status`; backend does not update `finance_cases.finance_status`.
- **GET** `/api/finance/cases` (list): each item no longer has `due_date` or `finance_status`.
- **GET** `/api/finance/filter-options` (if any): status options are case statuses only, not finance_status.

---

## 6. VPS Deployment Checklist

1. **Backup** the SQLite DB (or full app data) before pulling.
2. **SQLite version:** Run `sqlite3 --version`; must be **3.35 or newer** for `DROP COLUMN`.
3. **Pull** the branch that contains these changes.
4. **Restart** the API (and any workers) so the new Python code and migration run.
5. **First finance request** (e.g. open Finance list or a finance case) will run `ensure_finance_schema()` and thus `_migrate_finance_cases_drop_contract_date_status()`. The three columns will be dropped from `finance_cases` if present.
6. **No manual SQL** is required if the app runs the migration; avoid running old migrations or scripts that still reference `finance_date`, `due_date`, or `finance_status` on `finance_cases`.
7. **Frontend:** Rebuild and serve the updated web app (e.g. `npm run build` in `apps/web` and restart/refresh).

---

## 7. Rollback (if needed)

- **DB:** Restoring a backup from before this deploy will bring back the old `finance_cases` columns. The **old** app code would then need to be deployed again, because the new code never writes those columns and the new frontend doesn’t send them.
- **Code rollback:** Revert to the commit before these changes and redeploy both API and web; use a DB backup that still has the three columns if you want to avoid “missing column” errors with the old code.
