#!/usr/bin/env bash
set -euo pipefail
# ClinicFlow PostgreSQL backup. Docker volumes are not a backup.
OUT_DIR="${1:-./backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/clinicflow-$STAMP.dump"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U clinicflow -d clinicflow --format=custom > "$FILE"

echo "Wrote $FILE"
echo "Restore: docker compose -f $COMPOSE_FILE exec -T postgres pg_restore -U clinicflow -d clinicflow --clean --if-exists < $FILE"
