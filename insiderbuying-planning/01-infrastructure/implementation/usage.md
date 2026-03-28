# 01-Infrastructure — Implementation Complete

## What was built

### Section 01: NocoDB + VPS (previously completed)
Docker-compose deployment of NocoDB + PostgreSQL on VPS with 12 tables.

### Section 02: Supabase Schema (previously completed)
Supabase project with schema migration (profiles, subscriptions, insider_alerts), RLS, auth providers.

### Section 03: Stripe Webhook Hardening
- **Added**: `customer.subscription.created` and `invoice.paid` event handlers
- **Fixed**: Webhook route `force-static` → `force-dynamic`
- **Added**: Supabase error checking on ALL DB operations (returns 500 for Stripe retry)
- **Added**: `resolveId()` helper, `PLAN_PRO` constant
- **Added**: Warning log when subscription.created has no userId
- **Tests**: 35 validation tests

### Section 04: Next.js SSR (already existed)
All infrastructure was already implemented:
- Supabase client/server/middleware helpers
- Root middleware with session refresh + route protection
- API routes: auth callback, webhook, checkout, alerts/subscribe
- OneSignal init with Supabase user linking
- Netlify config with plugin
- **Tests**: 46 validation tests

### Section 05: Environment + Deployment Readiness
- **Fixed**: .env.example branding (EarlyInsider → InsiderBuying.ai)
- **Tests**: 43 validation tests (env completeness, secret protection, no hardcoded keys)

## Running tests

```bash
cd ryan_cole/insiderbuying-site

# All infrastructure tests (124 total)
npx jest tests/insiderbuying/stripe-setup.test.js tests/insiderbuying/nextjs-ssr.test.js tests/insiderbuying/env-deploy.test.js

# Individual sections
npx jest tests/insiderbuying/stripe-setup.test.js    # 35 tests
npx jest tests/insiderbuying/nextjs-ssr.test.js       # 46 tests
npx jest tests/insiderbuying/env-deploy.test.js       # 43 tests
```

## Commits

| Section | Commit | Description |
|---------|--------|-------------|
| 01 | `a01b272` | NocoDB + VPS setup |
| 02 | `30fc326` | Supabase schema |
| 03 | `cbe2461` | Stripe webhook hardening + tests |
| 04 | `8181a41` | Next.js SSR validation tests |
| 05 | `d6bd37a` | Env vars + deployment readiness |

## Manual steps remaining

These require dashboard access and cannot be automated:

1. **Resend**: Create account, add domain `insiderbuying.ai`, add DNS records (SPF, DKIM, DMARC), get API key
2. **Netlify**: Connect GitHub repo, set all env vars from `.env.example` with production values, deploy
3. **Stripe**: Update webhook URL to `https://insiderbuying.ai/api/webhooks/stripe`, get live webhook secret
4. **Supabase**: Add `https://insiderbuying.ai/api/auth/callback` to auth redirect URLs
5. **OneSignal**: Create web push app, download `OneSignalSDKWorker.js` to `public/`, get app ID
6. **Smoke tests**: Run the curl commands from section-05 spec against live URL

## Key files

```
src/lib/stripe.ts                          — Stripe singleton
src/lib/supabase/client.ts                 — Browser Supabase client
src/lib/supabase/server.ts                 — Server Supabase client
src/lib/supabase/middleware.ts             — Session refresh + route protection
middleware.ts                              — Root middleware
src/app/api/auth/callback/route.ts         — OAuth callback
src/app/api/checkout/route.ts              — Stripe checkout session creation
src/app/api/webhooks/stripe/route.ts       — Stripe webhook (6 events)
src/app/api/alerts/subscribe/route.ts      — Alert preferences CRUD
src/components/OneSignalInit.tsx            — Push notification init
netlify.toml                               — Netlify deployment config
.env.example                               — All env vars documented
```
