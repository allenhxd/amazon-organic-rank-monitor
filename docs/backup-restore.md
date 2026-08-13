# Backup and restore

## Backup

`infra/scripts/backup-db.sh` creates a compressed PostgreSQL dump without ownership/privilege statements. The default path is `/opt/rank-monitor/backups` and default local retention is seven days.

```bash
APP_DIR=/opt/rank-monitor ./infra/scripts/backup-db.sh
```

Back up separately:

- `.env` or the external secret-manager records;
- the named `worker_evidence` volume if page screenshots/evidence must survive host loss;
- Caddy data if avoiding certificate reissuance is important.

Do not commit backups or `.env` files.

## Restore rehearsal

Test restore on a disposable host or fresh Docker project name before relying on a backup.

```bash
gunzip -c backups/rank-monitor-YYYYMMDDTHHMMSSZ.sql.gz \
  | docker compose exec -T postgres psql -U rank_monitor -d rank_monitor -v ON_ERROR_STOP=1
```

For a non-empty test database, recreate the target database or use a clean volume first. Never overwrite the only production database without a verified second copy.

After restore, verify administrator login, projects, run receipts, results, export, and idempotent schema migration.
