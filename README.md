# Amazon Organic Rank Monitor

[简体中文](README.zh-CN.md) · [Self-hosting](docs/self-hosting.md) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md)

A self-hosted monitoring tool for Amazon organic search position, price, coupons, availability, seller, rating, and review-count evidence. Amazon.com is enabled by default; Amazon.ca and Amazon.com.mx adapters remain gated until their manual live regression is complete. The interface is intentionally Chinese; this English README is the primary project overview.

![Synthetic local demo showing the project workspace](docs/images/project-dashboard.png)

## Why this project exists

Amazon search result pages are dynamic. Ads, delivery location, experiments, layout changes, and live ranking can all change what a browser sees. This project records a reproducible observation under a fixed browser protocol instead of claiming an absolute or universal rank.

Core principles:

- Sponsored cards are exclusion-only. The data model does not create, store, or export advertising-rank fields.
- `暂无` means every requested page and required evidence step completed successfully but no eligible organic match was observed.
- `未完成` means the result is unknown because a required page, ZIP check, classification, detail page, rating subject, or family-match proof failed.
- Same-parent matching is allowed only after the detail page provides verifiable parent/variation evidence.
- CAPTCHA stops the run and all remaining collection work immediately. There is no retry after CAPTCHA, proxy rotation, CAPTCHA bypass, ad clicking, or risk-control evasion. One new isolated browser context may retry only an ordinary network or initialization failure.

## Features

- Next.js web UI with PostgreSQL persistence.
- Redis OTP/rate limiting and BullMQ task delivery.
- Playwright worker with logged-out, isolated marketplace sessions.
- Marketplace-aware domains, postal codes, locales, timezones, currencies, Sponsored labels, fixed 1920×1080/DPR 1, and one-to-three-page scan depth.
- New-email registration with one bounded trial run; trial failures with zero successful requests remain retryable.
- Optional auditable quota lots and per-run reservations when wallet metering is enabled.
- Excel import/export with a 5 MB and 10,000-row limit.
- Bounded OOXML ZIP validation before SheetJS parsing: paths, entry count, compression, expanded size, encryption, macros, and corruption are checked.
- Run receipts and page/family evidence for auditability.
- Optional wallet metering via `METERING_MODE=wallet`; disabled by default while successful request counts are still recorded.
- Docker Compose deployment with provider-neutral domain, SMTP, administrator, and TLS settings.

## Quick start: synthetic local demo

Requirements: Node.js 22 and pnpm.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000/projects`. Local demo mode uses synthetic identifiers and does not contact Amazon. There is deliberately no public live-monitoring demo.

Run validation:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm audit --prod
pnpm licenses:check
docker compose --env-file .env.production.example config --quiet
```

## Self-hosting

Copy `.env.production.example` to `.env`, replace every example secret and host, and review [docs/self-hosting.md](docs/self-hosting.md). The production stack contains PostgreSQL, Redis, a one-shot idempotent migration service, the web app, one Playwright worker, and Caddy.

Important settings:

| Variable | Purpose |
| --- | --- |
| `APP_DOMAIN` | Public host name used by Caddy |
| `APP_ORIGIN` | Exact HTTPS origin used for state-changing request checks |
| `INITIAL_ADMIN_EMAIL` | First administrator login email |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Provider-neutral SMTP transport |
| `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | SMTP credentials and sender |
| `TLS_EMAIL` | Certificate expiry/issuance notifications |
| `METERING_MODE` | `disabled` by default or `wallet` |
| `ENABLED_MARKETPLACES` | `amazon.com` by default; changing it requires rebuilding the web image |

Canada and Mexico are intentionally not part of the v0.1.1 acceptance claim. Keep `ENABLED_MARKETPLACES=amazon.com` unless you are conducting your own manual, low-frequency validation and are prepared to treat any unverified result as incomplete.

Deployment, upgrade, backup/restore, and security details live in `docs/`.

## SheetJS source and integrity

`xlsx@0.20.3` is vendored as `vendor/xlsx-0.20.3.tgz` from the official SheetJS CDN installation URL documented by SheetJS. Its SHA-256 is:

```text
8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8
```

Production dependency licenses are generated from the frozen install in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md). Platform-specific prebuilt binaries are excluded from the table so CI is deterministic across host architectures; their upstream license metadata remains in the frozen lockfile. CI blocks unknown or unreviewed production licenses.

## Responsible use and disclaimer

This project is independent and is not affiliated with, endorsed by, or sponsored by Amazon. Amazon and Amazon.com are trademarks of Amazon.com, Inc. or its affiliates.

Observations produced by this tool are session-specific browser observations, not absolute ranking claims. Operators are responsible for confirming that their deployment and use comply with applicable contracts, site terms, policies, laws, privacy rules, and rate limits. The maintainers do not provide legal advice.

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
