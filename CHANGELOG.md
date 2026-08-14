# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use Semantic Versioning.

## [Unreleased]

## [0.1.1] - 2026-08-14

### Added

- Marketplace-aware project, receipt, postal-code, locale, timezone, currency, Sponsored-label, and worker routing support for Amazon.com, Amazon.ca, and Amazon.com.mx.
- New-email registration with one bounded trial run, plus auditable quota lots and per-run quota reservations when wallet metering is enabled.
- Collapsible navigation, an account menu, multi-user administrator quota adjustments, and quota-lot history.

### Changed

- Amazon.com remains the only marketplace enabled by default. Canada and Mexico stay gated until their manual live regression is complete.
- Price evidence now stores an amount and ISO currency while preserving legacy USD values during migration.
- Hard-coded cloud-provider and commercial-price copy was removed; self-hosted instances choose their own infrastructure and policies.

### Fixed

- Existing wallet balances are migrated idempotently into quota lots for every user.
- Trial metering keeps its internal mode through settlement without charging wallet quota.
- Localized signed-out, location-confirmation, postal-code, Sponsored, and CAPTCHA markers are handled without adding bypass behavior.

### Security

- Disabled marketplaces are rejected by the server even if a client submits a forged project update.
- CAPTCHA remains a global stop signal, including localized detection markers; no proxy, solving, or evasion behavior was added.

## [0.1.0] - 2026-08-13

### Added

- Open-source governance, self-hosting documentation, CI, CodeQL, dependency audit, secret scanning, and license policy.
- `METERING_MODE=disabled|wallet`, with wallet metering disabled by default.
- Bounded OOXML ZIP validation before Excel parsing.

### Changed

- SheetJS Community Edition pinned to the official 0.20.3 release archive.
- Domain, SMTP, administrator, TLS email, and deployment settings are now provider-neutral.
- Demo data and workbook examples now use explicit synthetic identifiers.

### Security

- CAPTCHA stops the run and all remaining collection work immediately without retry; only ordinary network or initialization failures may use one new isolated-context retry.
- Corrupt, encrypted, macro-enabled, path-traversing, oversized, and decompression-bomb-like workbooks are rejected.
