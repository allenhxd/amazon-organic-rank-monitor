#!/usr/bin/env bash
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/rank-monitor}
cd "${APP_DIR}"
if [[ -f .env ]]; then echo ".env 已存在；为避免覆盖密钥，本脚本已停止。" >&2; exit 1; fi

INITIAL_ADMIN_EMAIL=${INITIAL_ADMIN_EMAIL:-}
INITIAL_ADMIN_NAME=${INITIAL_ADMIN_NAME:-}
APP_DOMAIN=${APP_DOMAIN:-}
APP_ORIGIN=${APP_ORIGIN:-}
TLS_EMAIL=${TLS_EMAIL:-}
METERING_MODE=${METERING_MODE:-disabled}
SMTP_HOST=${SMTP_HOST:-}
SMTP_PORT=${SMTP_PORT:-465}
SMTP_SECURE=${SMTP_SECURE:-true}
SMTP_USER=${SMTP_USER:-}
SMTP_PASSWORD=${SMTP_PASSWORD:-}
SMTP_FROM=${SMTP_FROM:-}

if [[ -z ${APP_DOMAIN} ]]; then read -r -p '站点域名（例如 rank.example.com）: ' APP_DOMAIN; fi
APP_ORIGIN=${APP_ORIGIN:-https://${APP_DOMAIN}}
if [[ -z ${TLS_EMAIL} ]]; then read -r -p 'TLS 证书通知邮箱: ' TLS_EMAIL; fi
if [[ -z ${INITIAL_ADMIN_EMAIL} ]]; then read -r -p '初始管理员邮箱: ' INITIAL_ADMIN_EMAIL; fi
if [[ -z ${INITIAL_ADMIN_NAME} ]]; then read -r -p '管理员显示名称 [管理员]: ' INITIAL_ADMIN_NAME; fi
INITIAL_ADMIN_NAME=${INITIAL_ADMIN_NAME:-管理员}
if [[ -z ${SMTP_HOST} ]]; then read -r -p 'SMTP 主机: ' SMTP_HOST; fi
if [[ -z ${SMTP_USER} ]]; then read -r -p 'SMTP 用户名: ' SMTP_USER; fi
if [[ -z ${SMTP_FROM} ]]; then read -r -p 'SMTP 发件地址: ' SMTP_FROM; fi
if [[ -z ${SMTP_PASSWORD} ]]; then
  read -r -s -p 'SMTP 密码或授权码（输入不回显）: ' SMTP_PASSWORD
  echo
fi

POSTGRES_PASSWORD=$(openssl rand -hex 24)
AUTH_SECRET=$(openssl rand -hex 48)
umask 077
{
  printf 'POSTGRES_PASSWORD=%s\n' "${POSTGRES_PASSWORD}"
  printf 'AUTH_SECRET=%s\n' "${AUTH_SECRET}"
  printf 'APP_DOMAIN=%s\n' "${APP_DOMAIN}"
  printf 'APP_ORIGIN=%s\n' "${APP_ORIGIN}"
  printf 'TLS_EMAIL=%s\n' "${TLS_EMAIL}"
  printf 'INITIAL_ADMIN_EMAIL=%s\n' "${INITIAL_ADMIN_EMAIL}"
  printf 'INITIAL_ADMIN_NAME=%s\n' "${INITIAL_ADMIN_NAME}"
  printf 'INITIAL_ADMIN_POINTS=0\n'
  printf 'METERING_MODE=%s\n' "${METERING_MODE}"
  printf 'SMTP_HOST=%s\n' "${SMTP_HOST}"
  printf 'SMTP_PORT=%s\n' "${SMTP_PORT}"
  printf 'SMTP_SECURE=%s\n' "${SMTP_SECURE}"
  printf 'SMTP_USER=%s\n' "${SMTP_USER}"
  printf 'SMTP_PASSWORD=%s\n' "${SMTP_PASSWORD}"
  printf 'SMTP_FROM=%s\n' "${SMTP_FROM}"
} > .env
chmod 600 .env
unset SMTP_PASSWORD POSTGRES_PASSWORD AUTH_SECRET
echo "生产环境文件已在服务器生成，未输出任何密钥。"
