# Operations (Multi-PC Safe)

## Hard rule
- Never work on two PCs at the same time without a Pull/Push boundary.

## Daily cadence
1) Arrive: Pull suitcase DB/JSON → Local runtime
2) Work: Run scrapers/admin against Local runtime ONLY
3) Leave: Push Local runtime → Suitcase DB/JSON

## Safety checks before Push
- Confirm Google Drive finished syncing.
- Optional: PRAGMA integrity_check on local DB.
