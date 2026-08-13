# Contributing

Thank you for helping improve Amazon Organic Rank Monitor. Contributions are welcome for reliability, observability, accessibility, documentation, deployment portability, and evidence-preserving monitoring behavior.

## Before opening a change

- Search existing Issues and Discussions.
- Use an Issue for behavior changes or architectural proposals.
- Do not submit code intended to bypass CAPTCHA, rotate proxies to evade controls, click ads, simulate users, or defeat Amazon risk systems.
- Never include real customer ASIN lists, credentials, email addresses, production URLs, screenshots with personal data, or private Amazon observations.

## Local development

Use Node.js 22 and pnpm.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm licenses:check
```

Local development defaults to synthetic demo data and does not contact Amazon. Live monitoring must be an explicit, manual, low-frequency check using one ASIN, one keyword, and one page.

## Pull requests

- Keep changes focused and add tests for observable behavior.
- Preserve the definitions of `暂无` and `未完成`.
- Sponsored cards remain exclusion-only; do not add advertising rank fields.
- Same-parent matching requires page evidence.
- CAPTCHA must stop the current collection. No bypass mechanisms are accepted.
- Update English and Chinese documentation together when user-facing behavior changes.
- Run the full validation commands above and disclose anything you could not run.

By submitting a contribution, you agree that it is licensed under Apache-2.0 as described in the repository license.
