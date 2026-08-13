# Security notes

- Production sessions are HMAC-signed with `AUTH_SECRET`; admin passwords use salted scrypt hashes.
- OTP values are hashed in Redis, expire after ten minutes, are single-use, and are rate-limited by email and IP.
- State-changing requests require an exact `Origin` equal to `APP_ORIGIN`.
- Every project, item, run, export, and wallet mutation is checked against the authenticated user or administrator role.
- Images run as non-root where supported; Caddy hides its server header and adds HSTS, `nosniff`, strict referrer policy, and frame denial.
- Secret scanning and CodeQL run in GitHub Actions. Production dependency audit and license allowlist checks gate changes.
- Excel packages are bounded before decompression and parsing. Only `.xlsx` uploads are accepted.
- CAPTCHA is a stop signal, never an invitation to bypass access controls.

For vulnerability reporting, follow `SECURITY.md` and use GitHub private vulnerability reporting.
