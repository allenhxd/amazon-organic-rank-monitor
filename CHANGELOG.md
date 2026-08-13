# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use Semantic Versioning.

## [Unreleased]

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

## [0.1.0] - Unreleased

Initial public release candidate.
