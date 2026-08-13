#!/usr/bin/env bash
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/rank-monitor}
BACKUP_DIR=${BACKUP_DIR:-${APP_DIR}/backups}
cd "${APP_DIR}"
install -d -m 750 "${BACKUP_DIR}"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
TARGET="${BACKUP_DIR}/rank-monitor-${STAMP}.sql.gz"
docker compose exec -T postgres pg_dump -U rank_monitor -d rank_monitor --no-owner --no-privileges | gzip -9 > "${TARGET}"
find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'rank-monitor-*.sql.gz' -mtime +6 -delete
echo "${TARGET}"
