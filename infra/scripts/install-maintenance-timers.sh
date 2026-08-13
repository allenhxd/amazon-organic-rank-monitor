#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then echo "请使用 root 执行。" >&2; exit 1; fi
cat > /etc/systemd/system/rank-monitor-backup.service <<'UNIT'
[Unit]
Description=Rank Monitor PostgreSQL backup
After=docker.service
[Service]
Type=oneshot
User=rankdeploy
WorkingDirectory=/opt/rank-monitor
ExecStart=/opt/rank-monitor/infra/scripts/backup-db.sh
UNIT
cat > /etc/systemd/system/rank-monitor-backup.timer <<'UNIT'
[Unit]
Description=Daily Rank Monitor backup
[Timer]
OnCalendar=*-*-* 03:20:00
Persistent=true
[Install]
WantedBy=timers.target
UNIT
cat > /etc/systemd/system/rank-monitor-retention.service <<'UNIT'
[Unit]
Description=Rank Monitor retention cleanup
After=docker.service
[Service]
Type=oneshot
User=rankdeploy
WorkingDirectory=/opt/rank-monitor
ExecStart=/opt/rank-monitor/infra/scripts/prune-retention.sh
UNIT
cat > /etc/systemd/system/rank-monitor-retention.timer <<'UNIT'
[Unit]
Description=Daily Rank Monitor retention cleanup
[Timer]
OnCalendar=*-*-* 04:10:00
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now rank-monitor-backup.timer rank-monitor-retention.timer
systemctl list-timers 'rank-monitor-*'
