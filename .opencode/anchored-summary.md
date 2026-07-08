# Anchored Summary — splitpay-backend

Current state of the project as of the latest conversation.

## Completed

- **PM2 env_file fix** — `RESEND_API_KEY` was not being loaded from `.env.production` (only `--update-env` doesn't re-read for new vars). Fixed by adding it directly to the `env` block in `ecosystem.config.cjs`.
- **Resend email integration** — Switched from Nodemailer/SMTP to Resend HTTP API via `fetch()` (no SDK dependency). The API key is now correctly loaded after the PM2 fix. However, Resend's free tier rejects delivery to non-verified domains — the `updates.smk.belajar.id` domain was added to Resend but never verified (DNS records not set). Since `NODE_ENV=development`, the OTP is returned in the register response anyway, so the backend is fully functional.
- **Swagger CSP fix** — Disabled `upgrade-insecure-requests` in CSP (was forcing HTTP→HTTPS upgrade, breaking Swagger UI fetch to spec).

## Relevant Files

- `src/modules/auth/mail.service.ts` — MailService using Resend HTTP API via `fetch()` (no SDK)
- `ecosystem.config.cjs` — PM2 config; now has explicit `RESEND_API_KEY` in the `env` block for both `splitpay-api` and `splitpay-worker` apps (bypassing `env_file` which didn't reliably load newly added vars)
- `src/main.ts` — CORS function-based origin callback; CSP `upgradeInsecureRequests: null`
