# E-Urbanizam Tracker (Codex v2) — Project Specs

## Goal
- Daily detection of NEW/CHANGED cases via LIST PROBE
- Detail scrape ONLY for changed/new cases
- Canonical data in SQLite (local on C:)
- Per-case JSON snapshots (local on C:)
- Admin UI (Streamlit) reads/writes ONLY local DB
- Later: Telegram alerts + Email digest

## Non-negotiables
- Never run SQLite directly in a cloud-synced folder (Google Drive).
- Multi-PC safety: Pull → Work (local only) → Push boundary.
- Phone numbers are manual/PII and must never be stored in JSON.
