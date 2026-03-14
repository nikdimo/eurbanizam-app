# eUrbanizam Admin

Monorepo for the eUrbanizam admin tooling, FastAPI backend, and Next.js web UI.

## API quick start

Run these commands from the repository root:

```powershell
cd C:\Users\Nikola Dimovski\eurbanizam-admin
python -m pip install -r requirements.txt
python -m pip install -e .
python -m uvicorn apps.api.main:app --reload
```

After the editable install completes, you can also start the API from any directory with:

```powershell
eurbanizam-api
```

## Web quick start

```powershell
cd apps\web
npm install
npm run dev
```

## Codex Handoff

This repo is the local `C:\Users\Nikola Dimovski\eurbanizam-admin` working copy.
The old Google Drive repo was copied here for local work, but the current source of work should be this C drive repo.

### Old vs new UI

- Old baseline UI:
  - `admin.py`
  - `admin_pages/finance.py`
- New UI:
  - `apps/web`
- New API boundary:
  - `apps/api`

The old Streamlit UI is still the functional reference for behavior and workflow logic.

### Current product logic

#### Cases overview

- Cases shows:
  - core case columns
  - `Phone`
  - enabled `case`-scoped custom fields
- Cases does not show:
  - `finance_*` columns
  - `finance`-scoped custom fields
- Inline editable in Cases:
  - `Phone`
  - enabled `case`-scoped custom fields
- Read-only in Cases overview:
  - core case metadata such as `title`, `status`, `request_type`, timestamps, IDs

#### Finance overview

- Finance shows:
  - case context columns
  - finance columns
  - enabled `case`-scoped custom fields
  - enabled `finance`-scoped custom fields
- Inline editable in Finance overview:
  - `finance_status`
  - `Phone`
  - enabled custom fields

### Custom field rules

- Custom fields are dynamic definitions, not hardcoded SQL columns.
- Definitions live in `settings.json` under `custom_field_defs`.
- Values live in `case_user_data`.
- `Phone` is reserved and cannot be created as a custom field.
- Supported field types:
  - `Text`
  - `Dropdown`
- Scope rules:
  - create from Cases -> `scope: "case"`
  - create from Finance -> `scope: "finance"`

### Important new UI files

- Cases page:
  - `apps/web/src/app/(shell)/cases/page.tsx`
- Finance page:
  - `apps/web/src/app/(shell)/finance/page.tsx`
- Finance detail:
  - `apps/web/src/app/(shell)/finance/cases/[caseId]/page.tsx`
- Shared custom field manager:
  - `apps/web/src/components/custom-fields/custom-field-manager.tsx`
- Shared table:
  - `apps/web/src/components/ui/datagrid.tsx`
- Frontend schemas:
  - `apps/web/src/lib/schemas.ts`

### Important API files

- Cases service/core:
  - `apps/api/services/cases_service.py`
  - `apps/api/core/cases.py`
- Finance service/core:
  - `apps/api/services/finance_service.py`
  - `apps/api/core/finance_cases.py`
- Custom field service:
  - `apps/api/services/custom_fields_service.py`
- Routers:
  - `apps/api/api/routers/cases.py`
  - `apps/api/api/routers/finance.py`
  - `apps/api/api/routers/settings.py`

### Important API endpoints

- Cases:
  - `GET /api/cases`
  - `GET /api/cases/{case_id}`
  - `PATCH /api/cases/{case_id}`
- Finance:
  - `GET /api/finance/summary`
  - `GET /api/finance/cases`
  - `GET /api/finance/cases/{case_id}`
  - `PATCH /api/finance/cases/{case_id}/overview`
- Custom fields:
  - `GET /api/custom-fields`
  - `POST /api/custom-fields`
  - `PUT /api/custom-fields/{field_name}`

### Current verification status

- `npx tsc --noEmit` passes in `apps/web`
- `npm run lint` passes in `apps/web`
- `python -m py_compile` passes for changed API files

### Known limitation from Codex sandbox

- Runtime access to the live SQLite DB under `%USERPROFILE%\.eurbanizam\...` may fail inside the sandbox with `unable to open database file`, so some end-to-end data checks must be verified on the local machine.
