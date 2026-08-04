#!/usr/bin/env bash
# Copia de seguridad MySQL — solo si hubo cambios desde la última copia.
#
# Uso:
#   ./scripts/backup-db.sh
#   BACKUP_DIR=/var/backups/gestor ./scripts/backup-db.sh
#
# Cron cada 2h (ejemplo):
#   0 */2 * * * cd /path/to/Gestor-Encripting && ./scripts/backup-db.sh >> /var/log/gestor-backup.log 2>&1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
STATE_FILE="$BACKUP_DIR/.last_change_hash"
mkdir -p "$BACKUP_DIR"

# Cargar .env si existe
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_DIR/.env"
  set +a
elif [ -f "$PROJECT_DIR/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_DIR/.env.local"
  set +a
fi

DB_HOST="${DATABASE_HOST:-${MYSQL_HOST:-localhost}}"
DB_PORT="${DATABASE_PORT:-${MYSQL_PORT:-3306}}"
DB_USER="${DATABASE_USER:-${MYSQL_USER:-root}}"
DB_PASS="${DATABASE_PASSWORD:-${MYSQL_PASSWORD:-}}"
DB_NAME="${DATABASE_NAME:-${MYSQL_DATABASE:-gestor}}"

if [ -z "$DB_NAME" ]; then
  echo "❌ DATABASE_NAME / MYSQL_DATABASE no definido"
  exit 1
fi

MYSQL_OPTS=(-h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER")
if [ -n "$DB_PASS" ]; then
  MYSQL_OPTS+=(-p"$DB_PASS")
fi

# Hash de última modificación (documentos + trimestres + incidencias)
CURRENT_HASH=$(mysql "${MYSQL_OPTS[@]}" -N -e "
  SELECT MD5(CONCAT_WS('|',
    COALESCE((SELECT MAX(fecha_creacion) FROM documentos), '0'),
    COALESCE((SELECT MAX(fecha_actualizacion) FROM trimestres), '0'),
    COALESCE((SELECT MAX(fecha_actualizacion) FROM incidencias_documento), '0'),
    COALESCE((SELECT COUNT(*) FROM documentos), 0)
  ));
" "$DB_NAME" 2>/dev/null || echo "unknown")

if [ -f "$STATE_FILE" ] && [ "$(cat "$STATE_FILE")" = "$CURRENT_HASH" ]; then
  echo "$(date -Iseconds) ⏭️  Sin cambios ($CURRENT_HASH) — no se crea copia"
  exit 0
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql.gz"

echo "$(date -Iseconds) 📦 Creando backup → $OUTPUT"
mysqldump "${MYSQL_OPTS[@]}" \
  --single-transaction \
  --routines \
  --triggers \
  "$DB_NAME" | gzip > "$OUTPUT"

echo "$CURRENT_HASH" > "$STATE_FILE"

# Retener últimas 48 copias (~4 días si cron cada 2h)
ls -1t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | tail -n +49 | xargs -r rm -f

echo "$(date -Iseconds) ✅ Backup completado ($(du -h "$OUTPUT" | cut -f1))"
