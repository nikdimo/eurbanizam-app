# Path Contract (v2)

## Definitions
- Project Root: the folder that contains this repo (where admin.py will live).
- Local Runtime Root (per PC): %USERPROFILE%\\.eurbanizam\\

## Local runtime locations (authoritative during work)
- Local DB: %USERPROFILE%\\.eurbanizam\\db\\eurbanizam_local.sqlite
- Local JSON snapshots: %USERPROFILE%\\.eurbanizam\\json\\cases_full_json\\
- Local Playwright state: %USERPROFILE%\\.eurbanizam\\state\\storage_state.json (optional)
- Local logs: %USERPROFILE%\\.eurbanizam\\logs\\

## Repo suitcase locations (transport only)
- Suitcase DB: <repo>\\data\\suitcase\\eurbanizam_suitcase.sqlite
- Suitcase JSON: <repo>\\data\\suitcase\\cases_full_json\\

## Rule
- Admin and scrapers must use ONLY the local runtime DB/JSON while working.
- Pull/push scripts move data between repo suitcase and local runtime.
