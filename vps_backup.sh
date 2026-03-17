#!/bin/bash
set -e
mkdir -p /home/niki/eurbanizam-app/backups
TIMESTAMP=$(date +%F-%H%M%S)
BACKUP_FILE="/home/niki/eurbanizam-app/backups/db-$TIMESTAMP.sqlite"
DB_PATH="/home/niki/.eurbanizam/db/eurbanizam_local.sqlite"

echo "Backing up $DB_PATH to $BACKUP_FILE"
cp "$DB_PATH" "$BACKUP_FILE"

echo "Checking integrity..."
/home/niki/eurbanizam-app/.venv/bin/python -c "import sqlite3; conn=sqlite3.connect('$BACKUP_FILE'); print('Integrity:', conn.execute('PRAGMA integrity_check;').fetchone()[0])"

echo "Backup size:"
ls -lh "$BACKUP_FILE"
