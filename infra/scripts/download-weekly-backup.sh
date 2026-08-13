#!/usr/bin/env bash
set -euo pipefail

SERVER_HOST=${1:-}
DEPLOY_USER=${DEPLOY_USER:-rankdeploy}
LOCAL_DIR=${LOCAL_DIR:-./server-backups}
if [[ -z ${SERVER_HOST} ]]; then echo "用法: ./infra/scripts/download-weekly-backup.sh <服务器公网IP>" >&2; exit 1; fi
mkdir -p "${LOCAL_DIR}"
LATEST=$(ssh "${DEPLOY_USER}@${SERVER_HOST}" "ls -1t /opt/rank-monitor/backups/rank-monitor-*.sql.gz | head -n 1")
scp "${DEPLOY_USER}@${SERVER_HOST}:${LATEST}" "${LOCAL_DIR}/"
echo "已下载到 ${LOCAL_DIR}/$(basename "${LATEST}")"
