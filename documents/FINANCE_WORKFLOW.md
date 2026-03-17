# Finance Module – Workflow and Code Map

This document explains **how the finance workflow works** after the recent modifications: where data lives, how overdue and “needs action” are determined, and where to find the relevant logic in the codebase.

---

## 1. Design Principle: Invoices Drive Overdue, Not the Contract

- **Contract (finance case)** stores: client info, contract sum, currency, paid_amount, notes. It does **not** store a due date or a “finance status.”
- **Overdue** and **“needs action”** are derived **only from invoices**: an invoice is overdue if it has a `due_date` in the past and is not PAID or CANCELLED. The **overdue amount** for a case is the sum of those invoice amounts.
- So: one source of truth for “what is late” = invoices. The contract itself does not have its own due date or status.

---

## 2. Data Model (Where Things Live)

### 2.1 Database Tables

| Table | Purpose | Key columns (relevant to workflow) |
|-------|---------|------------------------------------|
| **finance_cases** | One row per case: contract-level totals and profile. | `case_id` (PK), `client_name`, `client_phone`, `service_type`, `contract_sum`, `currency`, `paid_amount`, `notes`, `created_at`, `updated_at`. No `finance_date`, `due_date`, or `finance_status`. |
| **finance_invoices** | One row per invoice. | `invoice_id`, `case_id`, `invoice_number`, `issue_date`, **`due_date`**, `amount`, `currency`, **`status`** (DRAFT, SENT, PAID, CANCELLED), client/details, reminder fields, etc. |
| **finance_payments** | One row per payment event. | `payment_id`, `case_id`, `payment_date`, `amount`, `currency`, `note`. |
| **finance_email_log** | Email sends (invoice/reminder). | `case_id`, `invoice_id`, `email_type`, `to_email`, `sent_at`, etc. |
| **finance_case_recipients** | Emails used per case (for quick send). | `case_id`, `email`, `last_used_at`, `label`. |

**Code:** Table creation and migration: `apps/api/core/finance_invoices.py` → `ensure_finance_schema()`, `_migrate_finance_cases_drop_contract_date_status()`.

### 2.2 How “paid” and “remaining” are computed

- **Paid total for a case** = payments (from `finance_payments`) + paid invoices (invoices with status PAID).
  - Payments: `get_payment_sum_for_case(conn, case_id)` in `finance_invoices.py`.
  - Paid invoices: `get_paid_invoice_sum_for_case(conn, case_id)` in `finance_invoices.py`.
- **Remaining** = `contract_sum - paid_total` (capped at 0).
- **Contract sum** comes from `finance_cases.contract_sum` (edited in Contract Profile).

**Code:**  
- `apps/api/core/finance_invoices.py`: `get_payment_sum_for_case`, `get_paid_invoice_sum_for_case`, `get_invoice_sum_for_case`.  
- `apps/api/core/finance_cases.py`: `get_finance_case_detail_dict()` uses the above to build `paid_total` and `remaining`; aggregates in `build_finance_case_aggregates()` do the same per case.

---

## 3. Overdue and “Needs Action” (Invoice-Only)

### 3.1 When is an invoice “overdue”?

An invoice row is treated as overdue when **all** of the following hold:

- It has a **`due_date`** (not null).
- **`due_date`** is **before today** (strictly in the past).
- **`status`** is **not** PAID or CANCELLED.

So: DRAFT or SENT invoices with a past due date count as overdue.

**Code:**  
`apps/api/core/finance_cases.py` → `build_finance_case_aggregates()`:

- Loads invoices via `load_invoices_df(conn)` (from `finance_invoices`).
- Builds `due_date_dt`, `today`, and:
  - `overdue_mask = due_date_dt.notna() & (due_date_dt < today) & ~status in ["PAID","CANCELLED"]`.
- For each case, sums:
  - `overdue_invoice_count`: count of rows where `overdue_mask` is True.
  - `overdue_invoice_amount`: sum of `amount` where `overdue_mask` is True.
- Case-level **`overdue_amount`** is set from **`overdue_invoice_amount`** (no contract due date involved).

### 3.2 When does a case “need action”?

A case is counted as **needs action** when:

- **Remaining** > 0, **and**
- **Overdue amount** > 0 (i.e. it has at least one overdue unpaid invoice).

**Code:**  
- Dashboard: `apps/api/core/finance_cases.py` → `summarize_dashboard()`:  
  `needs_action_mask = (aggregates["remaining"] > 0) & (aggregates["overdue_amount"] > 0)`.
- List filter: `list_finance_case_summaries(..., needs_action_only=True)` uses the same idea:  
  `(finance_remaining > 0) & (finance_overdue_amount > 0)`.

So “needs action” is **purely invoice-based**: no contract due date or contract status.

---

## 4. API Flow (High Level)

### 4.1 Finance case list (overview)

- **Route:** e.g. `GET /api/finance/cases` (with query params: search, filters, sort, pagination).
- **Backend:** `list_finance_case_summaries()` in `finance_cases.py`:
  - Builds a workspace DataFrame that merges cases with finance aggregates (contract sum, paid total, remaining, **overdue_amount** from invoices, etc.).
  - Applies filters (request type, case status, date range, **overdue_only**, **needs_action_only**).
  - Returns list of dicts: no `due_date` or `finance_status`; includes `overdue_amount`, `remaining`, etc.
- **Frontend:** `apps/web/src/app/(shell)/finance/page.tsx` renders the table (no Due Date or Finance Status columns).

### 4.2 Finance case detail (single case / workspace)

- **Route:** `GET /api/finance/cases/:id`.
- **Backend:** `get_finance_case_detail_dict()` in `finance_cases.py`:
  - Reads case metadata (from cases core), **finance row** from `finance_cases` (no date/status columns), and **aggregates** (including `overdue_amount` from `build_finance_case_aggregates`).
  - Adds `payments` (list_payments), `invoices` (list_invoices), `email_log`, `recipients`.
  - Returned dict has no `finance_date`, `due_date`, or `finance_status`; it does have `overdue_amount`, `remaining`, `contract_sum`, etc.

### 4.3 Save contract profile

- **Route:** `PUT /api/finance/cases/:id/profile`.
- **Body:** `client_name`, `client_phone`, `service_type`, `contract_sum`, `currency`, `paid_amount`, `notes` (no date/status).
- **Backend:** `upsert_finance_profile()` in `finance_cases.py` → `upsert_finance_row()`; only columns that still exist in `finance_cases` are written.
- Often followed by **PATCH** `/api/finance/cases/:id/overview` for phone and custom_fields (case memory). Overview payload no longer includes `finance_status`.

### 4.4 Invoices and payments

- **Invoices:** CRUD and email/reminder sending live in `finance_invoices.py` and the finance router. Each invoice has its own `due_date` and `status`; these drive the overdue aggregates.
- **Payments:** Stored in `finance_payments`; summed per case and included in `paid_total` / remaining.

---

## 5. Frontend Workflow (What the User Sees)

### 5.1 Finance overview page

- **Path:** e.g. `/(shell)/finance` → `apps/web/src/app/(shell)/finance/page.tsx`.
- **Data:** List from `GET /api/finance/cases`; each item has e.g. `contract_sum`, `paid_total`, `remaining`, **`overdue_amount`** (from invoices), no contract due date or finance status.
- **Table:** Columns such as contract sum, paid, remaining, **Overdue** (amount), payments count, service type. No “Due Date” or “Finance Status” column; no inline edit for contract status.
- **Filters:** “Overdue only” and “Needs action only” use the invoice-based backend filters above.

### 5.2 Finance case workspace (single case)

- **Path:** e.g. `/(shell)/finance/cases/[id]` or similar; component `FinanceCaseWorkspace` in `apps/web/src/components/finance/finance-case-workspace.tsx`.

**Tabs:**

- **Invoices & Payments (workbench):** List of invoices and payments; “Draft New” invoice / new payment; sending invoices and reminders.
- **Communication:** Email log and composing invoice/reminder emails.
- **Contract Profile:** Contract-level data only (no finance date/due date/status).

**Default tab:**

- If the case has **no invoices** → open on **Contract Profile**.
- If it has invoices → open on **Invoices & Payments** (workbench).

**Contract Profile behavior:**

- **Save:** On **blur** and **Enter** (no Save button). A **“Saved”** indicator (with loader while saving) appears at the **top** of the profile tab; layout is centered (`max-w-2xl mx-auto`) so the form doesn’t jump.
- **Bottom:** **“Create invoice / payment”** button: switches to workbench, opens “Draft New” invoice, scrolls to the draft and focuses the **Invoice number** field.
- Fields: client name, company, phone, email, address, contract sum, currency, service type, notes, and any case custom fields. No “Finance date”, “Due date”, or “Finance status”.

**Overdue in the UI:**

- Case-level overdue amount and “needs action” come from the API (`overdue_amount` and list filters). In the workspace, overdue state is reflected from the same aggregates (and from individual invoice due dates in the invoice list).

---

## 6. Where to Find What in the Code

| What you need | Where to look |
|---------------|----------------|
| DB schema and migration for `finance_cases` | `apps/api/core/finance_invoices.py`: `ensure_finance_schema()`, `_migrate_finance_cases_drop_contract_date_status()` |
| Contract profile columns (no date/status) | `apps/api/core/finance_cases.py`: `load_finance_df`, `ensure_finance_case_exists`, `upsert_finance_row`, `_load_finance_row` |
| Overdue = invoice-based | `apps/api/core/finance_cases.py`: `build_finance_case_aggregates()` (invoices branch: `overdue_mask`, `overdue_invoice_amount`, then `out["overdue_amount"]`) |
| Needs action = remaining > 0 and overdue_amount > 0 | `apps/api/core/finance_cases.py`: `summarize_dashboard()`, `list_finance_case_summaries()` (needs_action_only filter) |
| Case detail API (no date/status in response) | `apps/api/core/finance_cases.py`: `get_finance_case_detail_dict()` |
| Profile save API (no date/status in payload) | `apps/api/schemas/finance.py`: `FinanceProfilePayload`; `apps/api/core/finance_cases.py`: `upsert_finance_profile()`; service in `apps/api/services/finance_service.py` |
| Finance list API (no due_date/finance_status) | `apps/api/core/finance_cases.py`: `list_finance_case_summaries()` (returned dict keys); `apps/api/schemas/finance.py`: `FinanceCaseListItem` |
| Overview page table (no Due Date / Finance Status columns) | `apps/web/src/app/(shell)/finance/page.tsx`: column definitions and column groups |
| Contract Profile UI (save on blur/Enter, Saved indicator, Create invoice button) | `apps/web/src/components/finance/finance-case-workspace.tsx`: profile tab, `saveProfile`, `profileSaveStatus`, default tab when `invoices.length === 0`, “Create invoice / payment” and focus on invoice number |
| Frontend types/schemas (no contract date/status) | `apps/web/src/lib/schemas.ts`: `FinanceCaseSchema`, `FinanceCaseDetailSchema` |

---

## 7. End-to-End Flow (Short)

1. **Case exists** → one row in `finance_cases` (contract sum, client, etc.). No contract due date or status.
2. **User edits Contract Profile** → blur/Enter → `saveProfile()` → PUT profile + PATCH overview → backend writes only existing columns.
3. **User adds invoices** → each has `due_date` and `status`. Overdue = past due and not PAID/CANCELLED.
4. **Aggregates** → `build_finance_case_aggregates()` computes per-case `overdue_amount` from invoices and merges with contract sum and payments to get `remaining`, `paid_total`, etc.
5. **Dashboard and list** → “needs action” = remaining > 0 and overdue_amount > 0; filters and columns use only these and no contract date/status.
6. **Contract Profile “Create invoice / payment”** → switches to workbench, opens new invoice draft, focuses Invoice number so the user can continue in one place.

This keeps a single, clear rule: **invoices decide what is overdue**; the contract is just the total and profile data.
