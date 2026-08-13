# Maintainer release checklist

## Before v0.1.0

- [ ] Frozen install, typecheck, lint, complete tests, production build.
- [ ] Production dependency audit and generated license inventory pass.
- [ ] Gitleaks full-history scan passes; staged diff contains no secrets or personal data.
- [ ] Web and worker images build.
- [ ] Compose configuration and fresh-volume health checks pass.
- [ ] Fresh-volume rehearsal covers administrator initialization, login, synthetic import, restart recovery, export, backup, and restore.
- [ ] Optional manual live acceptance is one ASIN, one keyword, one page, low frequency, and stops on CAPTCHA.
- [ ] Public repository settings, private vulnerability reporting, Issues, Discussions, topics, and profile pin are verified.
- [ ] All required GitHub Actions checks are green before creating the tag and release.

## Codex for Open Source application gate

Do not apply immediately after publishing. Maintain the project for four to six weeks and apply only when public evidence exists for:

- at least one formal release with consistently stable CI;
- genuine Issue/PR triage, fixes, and version maintenance;
- at least one verifiable external self-hosting report, external use, or contribution;
- complete README, security policy, and public maintainer profile.

Do not manufacture commits, stars, issues, users, downloads, or API use cases. The form role should be `Primary maintainer`. The final English statement must be at most 500 characters and cite only evidence that exists at submission time. The maintainer supplies the real name, ChatGPT-account email, and any Organization ID actually requested by the current form.
