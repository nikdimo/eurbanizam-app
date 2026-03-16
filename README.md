# eUrbanizam App

Clean working repo for the current eUrbanizam stack: FastAPI backend, Next.js web UI, VPS deploy helpers, and runtime automation tools.

## Current Status

- Local working repo: `C:\Users\Nikola Dimovski\eurbanizam-app`
- GitHub repo: `https://github.com/nikdimo/eurbanizam-app.git`
- Public domain: `https://eurbanizam.easy.mk`
- VPS host: `5.189.136.118`
- VPS SSH user: `niki`
- VPS app path: `/home/niki/eurbanizam-app`
- VPS services:
  - `eurbanizam-api.service`
  - `eurbanizam-web.service`
  - `eurbanizam-bot.service`

This repo is intended to be the only active repo for the live app. The old Streamlit UI is not part of this repo.

## Stack

- Web UI: Next.js App Router in `apps/web`
- API: FastAPI in `apps/api`
- Shared runtime/automation scripts: `tools`
- VPS templates: `deploy/vps`
- Local runtime data: `.eurbanizam`

## Repo Structure

- `apps/api/main.py`: FastAPI entrypoint
- `apps/api/api/routers`: API route modules
- `apps/api/core`: DB and settings access layer
- `apps/api/services`: higher-level service logic
- `apps/web/src/app`: Next.js routes
- `apps/web/src/components`: shared UI and feature components
- `apps/web/src/lib`: API client, schemas, hooks, utilities
- `tools`: automation, bot, reporting, healthcheck, deploy helper
- `deploy/vps`: service templates and VPS notes
- `settings.json`: app/runtime settings
- `finance_settings.json`: finance-specific settings
- `.eurbanizam/db/eurbanizam_local.sqlite`: local SQLite DB for testing
- `.eurbanizam/json/cases_full_json`: local sample case JSON files

## Important Local Files

- `start_app.bat`: starts local API and web app
- `git_pull.bat`: local `git pull`
- `git_push.bat`: local add/commit/push helper
- `connect_VPS.bat`: SSH into the Contabo VPS
- `pull_to_VPS.bat`: deploy current GitHub branch to the VPS
- `tools/pull_to_VPS.ps1`: actual deploy script used by `pull_to_VPS.bat`

## Local Runtime Setup

The repo uses a repo-local runtime folder for testing:

- Runtime root: `C:\Users\Nikola Dimovski\eurbanizam-app\.eurbanizam`
- DB path: `C:\Users\Nikola Dimovski\eurbanizam-app\.eurbanizam\db\eurbanizam_local.sqlite`
- JSON sample path: `C:\Users\Nikola Dimovski\eurbanizam-app\.eurbanizam\json\cases_full_json`
- Logs path: `C:\Users\Nikola Dimovski\eurbanizam-app\.eurbanizam\logs`

`settings.json` in this repo is already pointed at those local paths.

## Start Locally

Main launcher:

```powershell
cd C:\Users\Nikola Dimovski\eurbanizam-app
.\start_app.bat
```

That starts:

- FastAPI on `http://127.0.0.1:8000`
- Next.js on `http://127.0.0.1:3000`

Notes:

- `.venv` is created automatically if missing.
- Python packages are checked/installed on each run.
- Web dependencies are installed if `apps/web/node_modules` is missing.

## Manual Start

API:

```powershell
cd C:\Users\Nikola Dimovski\eurbanizam-app
.\.venv\Scripts\python -m uvicorn apps.api.main:app --reload
```

Web:

```powershell
cd C:\Users\Nikola Dimovski\eurbanizam-app\apps\web
npm run dev
```

## Deploy Workflow

Push current work to GitHub:

```powershell
cd C:\Users\Nikola Dimovski\eurbanizam-app
.\git_push.bat
```

Connect to VPS:

```powershell
cd C:\Users\Nikola Dimovski\eurbanizam-app
.\connect_VPS.bat
```

Deploy to VPS:

```powershell
cd C:\Users\Nikola Dimovski\eurbanizam-app
.\pull_to_VPS.bat
```

Useful deploy flags:

```powershell
.\pull_to_VPS.bat --dry-run
.\pull_to_VPS.bat --restart-bot
.\pull_to_VPS.bat --with-playwright
.\pull_to_VPS.bat --skip-web-build
.\pull_to_VPS.bat --branch main
```

The deploy target is hardcoded to:

- host: `niki@5.189.136.118`
- key: `%USERPROFILE%\.ssh\contabo_nikola`
- repo: `/home/niki/eurbanizam-app`

## VPS Runtime

Current VPS service configuration is expected to be:

- API service: `eurbanizam-api.service`
- Web service: `eurbanizam-web.service`
- Bot service: `eurbanizam-bot.service`
- Web app working directory: `/home/niki/eurbanizam-app/apps/web`
- API app working directory: `/home/niki/eurbanizam-app`
- Public domain served by nginx: `eurbanizam.easy.mk`

## Finance PIN Gate

Finance and Settings are PIN-protected in this repo.

Relevant files:

- `apps/api/api/routers/settings.py`
- `apps/web/src/components/ui/pin-gate.tsx`
- `apps/web/src/lib/hooks/use-finance-pin-gate.ts`
- `apps/web/src/app/(shell)/finance/page.tsx`
- `apps/web/src/app/(shell)/settings/page.tsx`

Current local test PIN is stored in `settings.json` as `finance_pin`.

If the PIN gate does not appear locally:

1. restart `start_app.bat`
2. open a fresh incognito window
3. clear browser session storage if needed

The unlock flag is stored in browser `sessionStorage` under:

- `eurbanizam.finance_pin.unlocked`

## Verification

Python checks:

```powershell
cd C:\Users\Nikola Dimovski\eurbanizam-app
python tools\project_checks.py --skip-web
```

Web lint:

```powershell
cd C:\Users\Nikola Dimovski\eurbanizam-app\apps\web
npm run lint
```

TypeScript:

```powershell
cd C:\Users\Nikola Dimovski\eurbanizam-app\apps\web
npx tsc --noEmit
```

## Important Notes For Future Sessions

- This repo replaced the older `eurbanizam-tracker` / `eurbanizam-admin` workflow for the live app.
- The old repo did contain the first working PIN-gate implementation, but this repo now has that feature ported in.
- The new repo has a local SQLite DB plus 30 sample case JSON files copied in only for easier local testing.
- `.eurbanizam`, `.venv`, `node_modules`, `.next`, and `*.egg-info` are ignored and should stay local-only.
- Do not reintroduce the old Streamlit UI into this repo.
- If local pages show `Internal Server Error`, check `settings.json` first and confirm the DB path exists.
