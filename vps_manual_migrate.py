import sqlite3
import sys

db_path = "/home/niki/.eurbanizam/db/eurbanizam_local.sqlite"

try:
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    print("Beginning migration...")
    cur.execute("PRAGMA foreign_keys=off;")
    cur.execute("BEGIN;")

    cols_to_drop = ["finance_date", "due_date", "finance_status"]
    
    for col in cols_to_drop:
        try:
            cur.execute(f"ALTER TABLE finance_cases DROP COLUMN '{col}';")
            print(f"Dropped {col} from finance_cases")
        except sqlite3.OperationalError as e:
            print(f"Skipping {col} (might not exist): {e}")

    # Check recipient label
    res = cur.execute("PRAGMA table_info(finance_case_recipients);").fetchall()
    has_label = any(r[1] == 'label' for r in res)
    if not has_label:
        cur.execute("ALTER TABLE finance_case_recipients ADD COLUMN label TEXT;")
        print("Added label column to finance_case_recipients")
    else:
        print("label column already exists on finance_case_recipients")

    cur.execute("COMMIT;")
    cur.execute("PRAGMA foreign_keys=on;")
    conn.commit()
    print("Migration finished!")
    
except Exception as e:
    print(f"Error during migration: {e}")
    sys.exit(1)
finally:
    if 'conn' in locals():
        conn.close()
