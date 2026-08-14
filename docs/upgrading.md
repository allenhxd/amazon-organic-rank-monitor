# Upgrading

1. Read `CHANGELOG.md` and the release notes.
2. Back up PostgreSQL and the current `.env` outside the deployment directory.
3. Pull the new tag and validate the Compose configuration.
4. Build new images before replacing running services.
5. Run the one-shot migration and confirm it exits successfully.
6. Start the new stack and check `/api/health`, login, project listing, one synthetic import, and export.

For `v0.1.1`, the idempotent migration adds marketplace/currency fields and quota-lot tables, backfills legacy USD prices, and converts each existing positive wallet balance into one administrator quota lot. Confirm that wallet totals and quota-lot available totals match before enabling `METERING_MODE=wallet`.

```bash
./infra/scripts/backup-db.sh
git fetch --tags
git checkout vX.Y.Z
docker compose config --quiet
docker compose build --pull web worker
docker compose up -d
docker compose ps
```

Do not downgrade across schema changes without restoring the matching database backup. Keep the prior images and database dump until restart, login, export, and worker health have been checked.
