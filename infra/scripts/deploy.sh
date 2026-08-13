#!/usr/bin/env bash
set -euo pipefail

SERVER_HOST=${1:-}
DEPLOY_USER=${DEPLOY_USER:-rankdeploy}
APP_DIR=${APP_DIR:-/opt/rank-monitor}
if [[ -z ${SERVER_HOST} ]]; then echo "用法: ./infra/scripts/deploy.sh <服务器公网IP>" >&2; exit 1; fi

rsync -az --delete \
  --exclude '.git/' --exclude '.next/' --exclude 'node_modules/' --exclude '.env' \
  --exclude 'outputs/' --exclude 'work/' --exclude 'qa/' --exclude 'backups/' \
  ./ "${DEPLOY_USER}@${SERVER_HOST}:${APP_DIR}/"

ssh "${DEPLOY_USER}@${SERVER_HOST}" "cd '${APP_DIR}' && test -f .env && docker compose config --quiet && docker compose build --pull && docker compose up -d --remove-orphans && docker compose ps"
echo "代码已部署。HTTPS 只有在 APP_DOMAIN 已解析到该主机公网 IP 后才能签发。"
