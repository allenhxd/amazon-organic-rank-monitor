# Architecture

## Components

- **Web** — Next.js App Router application. It validates sessions, imports, project ownership, run creation, snapshot responses, exports, and administration.
- **PostgreSQL** — source of truth for users, projects, monitor items, runs, results, evidence receipts, optional wallets, and immutable ledger rows.
- **Redis** — OTP/rate-limit state and BullMQ transport.
- **Outbox dispatcher** — writes the run and queue payload in one PostgreSQL transaction, then delivers the database UUID as an idempotent BullMQ job ID.
- **Worker** — Playwright browser collector. It writes progress, evidence, results, and settlement through PostgreSQL.
- **Caddy** — HTTPS termination and security headers using `APP_DOMAIN`.

## Run lifecycle

1. Web validates the project, enabled items, ownership, scan depth, and selected dimensions.
2. A transaction creates a run and outbox record. In `wallet` mode only, it locks the wallet and freezes the estimate.
3. The dispatcher publishes the run UUID to BullMQ.
4. A worker opens a logged-out isolated browser context, verifies the ZIP, and observes search pages.
5. Sponsored cards are classified and excluded. The worker never navigates through ad cards.
6. Detail and rating pages run only for requested dimensions. Same-parent expansion requires verified detail-page evidence.
7. CAPTCHA stops remaining work. A new isolated context may retry the whole run once; a second CAPTCHA yields `未完成`.
8. Settlement is idempotent. Disabled metering records successful request counts with zero wallet movement; wallet mode consumes actual requests and refunds the remainder.

## Evidence model

Search evidence stores requested/final URL, page number, ZIP verification, completion, card counts, CAPTCHA status, screenshot path when needed, and error context. Family evidence stores the supplied parent, page-reported parent, verified sibling set, URL, completion state, and error.

The result model contains only natural page/row/column/ordinal fields. There is deliberately no advertising rank.
