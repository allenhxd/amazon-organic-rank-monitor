# Security Policy

## Supported versions

Security fixes are provided for the latest published release on the default branch.

## Reporting a vulnerability

Use GitHub private vulnerability reporting for this repository. Please do not open a public Issue for credentials, authentication bypasses, data exposure, SSRF, unsafe workbook parsing, dependency compromise, or remote code execution.

Include:

- affected version or commit;
- impact and realistic attack prerequisites;
- minimal reproduction without real customer data;
- suggested mitigation if known.

You should receive an acknowledgement within 7 days. Validation and remediation timing depend on severity and reproducibility. Please allow a reasonable remediation window before public disclosure.

## Security boundaries

- Secrets belong in environment variables or a deployment secret manager, never Git.
- Production mode requires PostgreSQL, Redis, SMTP, a strong `AUTH_SECRET`, and an exact `APP_ORIGIN`.
- Excel upload is limited to 5 MB and 10,000 rows, then validated as a bounded OOXML ZIP before SheetJS parsing.
- CAPTCHA ends the collection; this project does not implement proxy rotation, CAPTCHA bypass, or risk-control evasion.
- The public demo is local-only and uses synthetic data. There is no public live-monitoring demo.
