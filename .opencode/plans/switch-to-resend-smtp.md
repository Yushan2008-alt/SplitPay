# Plan: Switch SMTP from Mailtrap to Resend

## Goal
Fix email delivery (OTP, notifications) so emails reach real Gmail/Outlook inboxes.

## Changes Needed

### 1. Update `.env.production` on droplet (SSH)

Replace 4 SMTP variables:

```
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=re_PsSqyEdt_KUvV1KunEod3XwuHUQoJN3Aa
MAIL_FROM=onboarding@resend.dev
```

### 2. PM2 Restart

```
pm2 restart splitpay-api splitpay-worker --update-env
```

### 3. Verify

Hit `POST /register` → check if email sends (Mailtrap 5s timeout won't hang anymore).

## Why This Works
- Resend SMTP is standard SMTP — same `nodemailer.createTransport()` config as Mailtrap
- `onboarding@resend.dev` is Resend's default sender — no domain verification needed
- API key `re_PsSqyEdt_KUvV1KunEod3XwuHUQoJN3Aa` already has full access

## No Code Changes Needed
The existing `MailService` and `NodemailerProvider` already read `SMTP_*` env vars. Only the `.env.production` values need to change.
