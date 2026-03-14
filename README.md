# eUrbanizam App

Deployable GitHub mirror for the new eUrbanizam stack:

- FastAPI backend in `apps/api`
- Next.js frontend in `apps/web`
- shared JSON settings in `settings.json` and `finance_settings.json`

## Local Run

API:

```bash
python -m pip install -r requirements.txt
python -m pip install -e .
python -m uvicorn apps.api.main:app --host 127.0.0.1 --port 8000 --reload
```

Web:

```bash
cd apps/web
npm install
npm run dev
```

## Required Runtime Files

- `settings.json`
- `finance_settings.json`
- runtime data under `/home/nikola/.eurbanizam`
- secrets env at `/home/nikola/.eurbanizam/secrets/.eurbanizam_secrets.env`

## VPS Deploy

Recommended VPS path:

- repo: `/home/nikola/eurbanizam-app`
- runtime: `/home/nikola/.eurbanizam`

Service templates and nginx reference are in `deploy/vps/`.

Typical production flow:

```bash
git clone https://github.com/nikdimo/eurbanizam-app.git /home/nikola/eurbanizam-app
cd /home/nikola/eurbanizam-app
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
pip install -e .
cd apps/web
npm install
npm run build
```

Then install:

- `deploy/vps/eurbanizam-api.service`
- `deploy/vps/eurbanizam-web.service`
- `deploy/vps/nginx-eurbanizam-app.conf`

## Notes

- `finance_settings.json` in this repo is sanitized. Restore real SMTP values only on the VPS.
- `settings.json` is Linux-oriented in this mirror and should not be copied back over your local Windows setup.
