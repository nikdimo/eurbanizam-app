# Project Specs

## Goal

- Provide a web-based operator workspace for cases, finance, and settings.
- Keep the frontend in Next.js and the backend in FastAPI.
- Store runtime data outside the repo under the configured runtime root.
- Support automation scripts for sync, reports, healthchecks, and Telegram bot tasks.

## Non-negotiables

- Do not keep runtime SQLite data inside cloud-synced repo folders.
- Keep secrets outside the repo.
- Treat the API and web app as the only supported UI stack.
- Keep deployment templates aligned with the live VPS layout.
