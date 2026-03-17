import sys
import os

# Set working directory properly
sys.path.insert(0, "/home/niki/eurbanizam-app")
os.chdir("/home/niki/eurbanizam-app")

from apps.api.core.db import ensure_finance_schema
print("Starting finance schema migration check...")
ensure_finance_schema()
print("Migration completed successfully.")
