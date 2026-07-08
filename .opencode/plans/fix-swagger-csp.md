# Fix: Swagger UI "Failed to fetch /api/docs-json"

## Root Cause
CSP header includes `upgrade-insecure-requests` (Helmet v7 default), which forces browser to upgrade `http://` → `https://` for ALL subresource requests, including `fetch()`. Since no HTTPS server runs on port 3001, the fetch fails.

## Changes

### File: `src/main.ts`
- Add `upgradeInsecureRequests: null` to CSP `directives` object (line 24, after `fontSrc`)

```diff
           fontSrc: ["'self'", 'cdn.jsdelivr.net'],
+          upgradeInsecureRequests: null,
         },
```

## Deploy
1. `git add src/main.ts && git commit -m "fix: disable upgrade-insecure-requests CSP so Swagger fetch works on HTTP"`
2. `git push`
3. On droplet: `cd /root/splitpay && git pull && pnpm build && pm2 restart ecosystem.config.cjs`
4. Verify: browse `http://159.223.34.178:3001/api/docs` - Swagger should load spec.
