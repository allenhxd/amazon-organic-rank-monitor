# Self-hosting

## Requirements

- A Linux host with Docker Engine and Docker Compose v2.
- A DNS name pointing to the host.
- Ports 80 and 443 reachable for Caddy certificate issuance.
- SMTP credentials able to send login codes.
- At least 4 GB RAM plus swap is recommended for the Playwright image.

Do not deploy by copying a personal `.env`. Generate new secrets on the target host.

## Configure

```bash
git clone https://github.com/allenhxd/amazon-organic-rank-monitor.git
cd amazon-organic-rank-monitor
cp .env.production.example .env
chmod 600 .env
```

Edit `.env`. `APP_ORIGIN` must be the exact `https://` origin whose host equals `APP_DOMAIN`. Use a random `POSTGRES_PASSWORD` and at least 32 random characters for `AUTH_SECRET`.

SMTP examples:

- implicit TLS: `SMTP_PORT=465`, `SMTP_SECURE=true`;
- STARTTLS: `SMTP_PORT=587`, `SMTP_SECURE=false`.

The app requires authenticated SMTP in production. `SMTP_FROM` may be an address supported by the provider; simple email-only values are the most portable in Compose environment files.

## Validate and start

```bash
docker compose config --quiet
docker compose build --pull web worker
docker compose up -d
docker compose ps
curl -fsS "https://${APP_DOMAIN}/api/health"
```

The `migrate` service runs `infra/schema.sql` with `ON_ERROR_STOP=1`. The schema uses `IF NOT EXISTS` and compatibility updates so repeated starts are safe.

## Initialize the administrator

1. Open the login page and request a code for `INITIAL_ADMIN_EMAIL`.
2. Verify the code received through SMTP.
3. Open `/admin/setup` and create the administrator username/password.
4. Log in to `/admin/login` and review configuration status.

## Metering

Keep `METERING_MODE=disabled` unless this instance needs an internal quota ledger. To enable it, set `METERING_MODE=wallet`, choose `INITIAL_ADMIN_POINTS`, restart web and worker, then adjust user allocation from the administration page.

## Manual live acceptance

CI and the local demo must not contact Amazon. If the operator determines live access is permitted, keep acceptance manual and low-frequency: one ASIN, one keyword, one page, one worker. Stop immediately on CAPTCHA or any access-control signal. Do not use proxies or bypass tooling.

There is no public online demo because it would expose a live collection surface.
