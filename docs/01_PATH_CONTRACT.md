# Path Contract

## Definitions

- Project root: the folder that contains this repo.
- Local runtime root: `%USERPROFILE%\.eurbanizam`
- VPS runtime root: `/home/niki/.eurbanizam`

## Local development paths

- Repo: `C:\Users\Nikola Dimovski\eurbanizam-app`
- API entry: `apps/api/main.py`
- Web app: `apps/web`
- Tools: `tools`

## Runtime paths

- Local DB: `%USERPROFILE%\.eurbanizam\db\eurbanizam_local.sqlite`
- Local JSON snapshots: `%USERPROFILE%\.eurbanizam\json\cases_full_json`
- Local logs: `%USERPROFILE%\.eurbanizam\logs`
- Secrets env: `<runtime_root>\secrets\.eurbanizam_secrets.env`

## VPS paths

- Repo: `/home/niki/eurbanizam-app`
- API bind: `127.0.0.1:8000`
- Web bind: `127.0.0.1:3000`
