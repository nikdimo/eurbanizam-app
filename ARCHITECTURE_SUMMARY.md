## Target architecture overview

The new eUrbanizam admin is a **two-app monorepo** that keeps the existing Streamlit app as the trusted baseline while introducing a modern UI:

- **apps/web (Next.js, App Router, TypeScript, Tailwind, shadcn/ui)**  
  - Premium, desktop‑optimized admin shell (sidebar, header, toasts).  
  - Screens for **Cases Overview** and **Finance Workspace** using TanStack Table, React Hook Form, and Zod.  
  - Talks **only to the FastAPI boundary**, never directly to SQLite.

- **apps/api (FastAPI, Python)**  
  - The **single source of truth for new UI**; shares the **same SQLite DB** and settings as the Streamlit app.  
  - Wraps and reuses existing logic from `admin.py` and `admin_pages/finance.py`, gradually refactored into:
    - `core/` – shared business rules (cases preparation, finance calculations, invoice/PDF/email logic).
    - `repositories/` – low‑level SQLite access, transactions, schema helpers.
    - `services/` – orchestration units for cases and finance workflows.
    - `schemas/` – Pydantic models for all API contracts.
    - `api/routers/` – FastAPI routers for cases, finance, settings, and help.
  - **Both** the Streamlit app and FastAPI use the same `settings.json`, `finance_settings.json`, and `DATABASE_PATH` from `.env`.

- **Existing Streamlit app (`admin.py` + `admin_pages/`)**  
  - Remains **unchanged** and continues to operate on the exact same DB and settings during migration.
  - Where possible, logic is incrementally moved into `apps/api/core` modules so both UIs call the same Python functions.

### Why this is the safest/best choice

- **No big‑bang rewrite of business logic** – finance, PDF, email, and DB access stay in Python, using the proven code paths, and are exposed over HTTP via FastAPI.  
- **Strict backend boundary** – the React app can be redesigned boldly (layout, flows, interactions) without risking hidden divergence in calculations or persistence.  
- **Shared SQLite and settings** – a single `DATABASE_PATH` and shared JSON config mean **old and new UIs always see the same truth**, enabling safe side‑by‑side verification.  
- **Clean, scalable structure** – the monorepo separates responsibilities (web vs api vs legacy) while making it easy to extend Cases and Finance features without entangling UI and logic.  
- **Migration‑friendly** – any endpoint can be wired into the new UI while the equivalent view continues to exist in Streamlit, allowing incremental parity checks and quick rollback if needed.

