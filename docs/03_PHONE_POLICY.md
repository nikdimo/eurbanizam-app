# Phone / PII Policy

## Source of truth
- Phone is manual data stored in SQLite:
  - case_user_data(field_key='Phone') is the source of truth
  - cases.phone may be used as an optional cache for search

## Forbidden
- Phone numbers must never be written into JSON snapshots.
- No tools should extract phones from JSON.
