# Architecture Summary

The repository is a two-part application:

- `apps/api`
  FastAPI backend that reads project settings, serves case and finance APIs, and exposes operational endpoints.

- `apps/web`
  Next.js frontend that consumes the API and provides the full operator interface for cases, finance, and settings.

Supporting code lives in:
- `tools` for automation and health/reporting scripts
- `deploy/vps` for API/web systemd and nginx templates

## Runtime model

- The web app talks to the FastAPI backend over HTTP.
- The backend reads shared project settings from `settings.json` and `finance_settings.json`.
- Runtime data and secrets live outside the repo under the configured runtime root.

## Local development

- Start the backend and web UI with `start_app.bat`.
- The API runs on `127.0.0.1:8000`.
- The web app runs on `127.0.0.1:3000`.

## Deployment

- `deploy/vps/eurbanizam-api.service` runs the FastAPI app.
- `deploy/vps/eurbanizam-web.service` runs the Next.js production server.
- `deploy/vps/nginx-eurbanizam-app.conf` proxies public traffic to the web service.
