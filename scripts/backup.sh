#!/bin/bash
# Backup diario del Notebook (pensado para un timer de systemd):
#  - base SQLite: copia consistente con .backup (30 días)
#  - imágenes y audios: instantánea por día con hardlinks (solo ocupa lo nuevo, 30 días)
set -euo pipefail

APP=$(cd "$(dirname "$0")/.." && pwd)
DATA=${DATA_DIR:-$APP/data}
DEST=${BACKUP_DIR:-$HOME/backups}
DAY=$(date +%F)
mkdir -p "$DEST/notebook-media"

if [ -f "$DATA/notebook.db" ]; then
  sqlite3 "$DATA/notebook.db" ".backup '$DEST/notebook-$DAY.db'"
fi

PREV=$(find "$DEST/notebook-media" -mindepth 1 -maxdepth 1 -type d -name '20*' ! -name "$DAY" | sort | tail -1)
SRC=()
for d in images audio; do [ -d "$DATA/$d" ] && SRC+=("$DATA/$d"); done
if [ ${#SRC[@]} -gt 0 ]; then
  rsync -a --delete ${PREV:+--link-dest="$PREV"} "${SRC[@]}" "$DEST/notebook-media/$DAY/"
fi

find "$DEST" -maxdepth 1 -name 'notebook-*.db' -mtime +30 -delete
find "$DEST/notebook-media" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime +30 -exec rm -rf {} +
