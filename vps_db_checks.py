import sqlite3
import sys

def run_pre_checks(db_path):
    print("--- Pre-migration Checks ---")
    try:
        conn = sqlite3.connect(db_path)
        
        # Row counts
        tables = [
            "finance_cases",
            "finance_invoices",
            "finance_payments",
            "finance_case_recipients"
        ]
        
        for table in tables:
            try:
                count = conn.execute(f"SELECT COUNT(*) FROM {table};").fetchone()[0]
                print(f"{table} rows: {count}")
            except Exception as e:
                print(f"Error querying {table}: {e}")
                
        print("\n--- Current Schema ---")
        for table in tables:
            try:
                cols = conn.execute(f"PRAGMA table_info({table});").fetchall()
                col_names = [c[1] for c in cols]
                print(f"{table} columns: {', '.join(col_names)}")
            except Exception as e:
                print(f"Error getting schema for {table}: {e}")
                
        conn.close()
    except Exception as e:
        print(f"Failed to connect to db: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run_pre_checks("/home/niki/.eurbanizam/db/eurbanizam_local.sqlite")
