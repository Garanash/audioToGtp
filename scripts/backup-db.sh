#!/usr/bin/env bash
# Резервное копирование БД проектов. Запуск: cron 2 раза в сутки (например 6:00 и 18:00)
# Добавить в crontab: 0 6,18 * * * /opt/gtpconverter/scripts/backup-db.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DB="${ROOT}/server/data/projects.db"
BACKUP_DIR="${ROOT}/server/data/backups"
KEEP_DAYS=14

mkdir -p "$BACKUP_DIR"
if [[ ! -f "$DB" ]]; then
  echo "DB not found: $DB"
  exit 0
fi

STAMP=$(date +%Y%m%d_%H%M)
DEST="$BACKUP_DIR/projects_${STAMP}.db"

if command -v sqlite3 &>/dev/null; then
  sqlite3 "$DB" ".backup '$DEST'"
else
  cp "$DB" "$DEST"
fi

echo "Backup: $DEST"

# Удалить старые бэкапы
find "$BACKUP_DIR" -name "projects_*.db" -mtime +$KEEP_DAYS -delete 2>/dev/null || true
