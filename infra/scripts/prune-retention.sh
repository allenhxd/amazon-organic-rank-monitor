#!/usr/bin/env bash
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/rank-monitor}
cd "${APP_DIR}"
docker compose exec -T worker find /app/evidence -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf -- {} +
docker compose exec -T postgres psql -U rank_monitor -d rank_monitor -v ON_ERROR_STOP=1 <<'SQL'
WITH keep_effective AS (
  SELECT id FROM (
    SELECT id, row_number() OVER (PARTITION BY project_id ORDER BY effective_date DESC, completed_at DESC) AS rn
    FROM monitor_runs WHERE effective = true
  ) ranked WHERE rn <= 30
), old_runs AS (
  SELECT id FROM monitor_runs
  WHERE completed_at < now() - interval '30 days'
    AND id NOT IN (SELECT id FROM keep_effective)
)
DELETE FROM rank_results WHERE run_id IN (SELECT id FROM old_runs);
WITH keep_effective AS (
  SELECT id FROM (
    SELECT id, row_number() OVER (PARTITION BY project_id ORDER BY effective_date DESC, completed_at DESC) AS rn
    FROM monitor_runs WHERE effective = true
  ) ranked WHERE rn <= 30
)
DELETE FROM monitor_runs
WHERE completed_at < now() - interval '30 days' AND id NOT IN (SELECT id FROM keep_effective);
SQL
