import json
import sys

settings_path = "/home/niki/eurbanizam-app/settings.json"
try:
    with open(settings_path, "r") as f:
        data = json.load(f)

    data["local_db_path"] = "/home/niki/.eurbanizam/db/eurbanizam_local.sqlite"

    with open(settings_path, "w") as f:
        json.dump(data, f, indent=2)
    print("Successfully patched settings.json in /home/niki/eurbanizam-app")
    
except Exception as e:
    print(f"Error patching settings: {e}")
    sys.exit(1)
