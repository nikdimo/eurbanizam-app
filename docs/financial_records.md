# Financial Records

## Purpose
This document defines how Finance records should be linked to scraped Urbanizam cases, what is already implemented, and the rollout plan.

## What Is Already Implemented
- Added a new Streamlit sidebar view: `Finance`.
- Added PIN gate for Finance access.
  - Priority: `EURBANIZAM_FINANCE_PIN` env var, then `settings.json.finance_pin`.
  - Session auth state is stored in `st.session_state`.
  - `Lock Finance` button clears Finance auth state.
- Added Finance module file: `admin_pages/finance.py`.
- Added Finance persistence in local SQLite:
  - Table: `finance_cases` (auto-created).
  - Current fields: `case_id`, `client_name`, `client_phone`, `service_type`, `finance_date`, `contract_sum`, `currency`, `paid_amount`, `due_date`, `finance_status`, `notes`, timestamps.
- Added Finance UI sections:
  - `Dashboard`
  - `Action Center`
  - `Case Finance Detail`
  - Record add/update/delete form

## Current Gap
Finance records are stored, but linking is still permissive.
- `case_id` is currently entered manually.
- There is no strict FK-style enforcement to guarantee that every finance record maps to an existing scraped case.
- This can create orphan finance rows or typo-based mismatches.

## Linking Strategy (Target)
Use `case_id` as the single canonical join key between:
- `cases` (scraped data)
- `finance_cases` (finance tracking)

No linking by client name should be used.

## Implementation Plan
1. Canonical key and validation
- Use the same canonical case key logic as existing app joins.
- Normalize case ID input consistently (trim, string, preserve exact key semantics).

2. Enforce case existence at save time
- Finance save must require selecting an existing case from `cases`.
- Do not allow manual free-text case IDs that do not exist.

3. Relational hardening
- Add strict reference enforcement (FK where feasible, otherwise explicit validation guardrails).
- Keep `finance_cases.case_id` unique per case (current behavior) unless multi-contract per case is explicitly needed.

4. Joined read model
- Dashboard, Action Center, and Detail should read from a join of `cases` + `finance_cases`.
- Show scraped metadata (title, status, request type, updated time) with finance values.

5. Backfill and reconciliation
- Reconcile existing finance rows against `cases`.
- Surface unmatched rows in an "orphan" list and provide manual reassignment.

6. Cases -> Finance deep link
- Add an action from Cases view to open Finance detail preselected for that case.

7. QA and rollout
- Test create/update/delete finance records for existing cases.
- Test after Smart Sync / Full Scrape that links remain intact.
- Test orphan handling for deleted/missing cases.

## Required Finance Fields
The two fields requested in the mockup are included in storage/UI:
- `client_phone` (client phone number)
- `service_type` (type of service, free text)

## Startup Reading Requirement
When starting Codex via `run_Codex.bat`, review these docs before implementation work:
- `docs/00_PROJECT_SPECS.md`
- `docs/01_PATH_CONTRACT.md`
- `docs/02_OPERATIONS.md`
- `docs/03_PHONE_POLICY.md`
- `docs/financial_records.md`
- `docs/RECAP.md`
