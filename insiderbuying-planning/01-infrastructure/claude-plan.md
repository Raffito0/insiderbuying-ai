# Implementation Plan — 01 Infrastructure

## Overview
Set up the complete backend infrastructure for InsiderBuying.ai: Supabase (auth + real-time), NocoDB on VPS (data layer), Stripe (payments), Resend (email), and convert the existing static Next.js site to SSR on Netlify. This is the Day 1 foundation — all other splits depend on it.

## Context
InsiderBuying.ai is an automated finance blog + SaaS alert system. It tracks SEC Form 4 insider trading filings, generates AI-powered analysis articles, and delivers real-time alerts. The site is built with Next.js 16, React 19, Tailwind v4. Currently a static export with a homepage only. 16 n8n workflows will connect to this infrastructure.

The database layer uses NocoDB (self-hosted, PostgreSQL-backed) instead of Airtable, to avoid API rate limits and cost. NocoDB runs on the same Hostinger VPS as n8n, communicating via Docker internal network.

---

## Section 1: NocoDB + PostgreSQL on VPS

### What
Deploy NocoDB with PostgreSQL via docker-compose on the Hostinger VPS (72.62.61.93), alongside the existing n8n and Traefik setup.

### Why
NocoDB serves as the central data store for all 16 n8n workflows. It replaces Airtable — zero API rate limits, localhost latency from n8n, ACID consistency, native JSON fields. $0 cost.

### How

**Docker-compose addition** at `/docker/nocodb/docker-compose.yml`:
- `nocodb` service: image `nocodb/nocodb:latest`, port 8080 internal
- `nocodb_db` service: image `postgres:16`, volume-persisted
- Both on the `root_default` Traefik network for HTTPS access
- Traefik labels for `db.insiderbuying.ai` (or `nocodb.insiderbuying.ai`)
- Environment: `NC_DB=pg://nocodb_db:5432?u=nocodb&p=<password>&d=nocodb`, `NC_AUTH_JWT_SECRET=<random>`

**n8n connectivity**: Since both run in Docker on the same VPS, n8n references NocoDB as `http://nocodb:8080` via Docker DNS. The NocoDB container must join the same network as n8n. Verify by testing the n8n NocoDB node with API token auth.

**Table creation** (12 tables via NocoDB UI or API after deployment):

| Table | Key Fields | Purpose |
|-------|-----------|---------|
| Articles | title, slug, body_html, verdict_type, ticker, status, published_at | Blog articles from W2 |
| Keywords | keyword, search_volume, difficulty, intent_type, status, priority_score | SEO keywords from W1 |
| Data_Studies | title, study_type, key_findings, charts_data (JSON), status | Bi-monthly studies from W3 |
| Insider_Alerts | ticker, insider_name, insider_title, transaction_type, shares, total_value, significance_score, ai_analysis, cluster_id | SEC filings from W4 |
| Outreach_Prospects | name, email, website, domain_authority, relevance_score, status | Link building targets from W10 |
| Outreach_Log | prospect_link, email_type, sent_at, opened_at, replied_at, result | Email tracking from W11 |
| X_Engagement_Log | tweet_id, tweet_text, type, likes, retweets, source_article_link | X/Twitter tracking from W7/W8 |
| Reddit_Log | post_url, subreddit, comment_text, type, upvotes, status | Reddit tracking from W9 |
| Financial_Cache | ticker, data_type, data_json (JSON), fetched_at, expires_at | API response cache for Dexter |
| Published_Images | article_link, image_type, image_url, prompt_used | Generated images from W12 |
| Lead_Magnet_Versions | month, title, pdf_url, backtest_period, key_stats (JSON) | Monthly PDFs from W16 |
| SEO_Rankings | keyword_link, date, position, clicks, impressions, ctr | GSC data from W14 |

**Link fields** (NocoDB relations):
- Published_Images.article_link → Articles (many-to-one)
- Outreach_Log.prospect_link → Outreach_Prospects (many-to-one)
- X_Engagement_Log.source_article_link → Articles (many-to-one)
- SEO_Rankings.keyword_link → Keywords (many-to-one)

### Verification
- NocoDB UI accessible via HTTPS (Traefik)
- n8n NocoDB node connects successfully with API token
- All 12 tables created with correct field types
- Link fields resolve correctly between tables

---

## Section 2: Supabase Project + Schema

### What
Create a new Supabase project and apply the database schema for auth, subscriptions, alerts, and content caching.

### Why
Supabase handles user auth (email + Google OAuth), real-time alert delivery to the /alerts page, and subscription state management. Separate from NocoDB because Supabase provides auth middleware, RLS, and Realtime out-of-the-box.

### How

**Project creation** via Supabase Management API or dashboard. Store credentials:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

**Schema** (SQL migration):

```sql
-- Users extension table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro')),
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscriptions
CREATE TABLE public.subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('free', 'pro')),
  status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'past_due', 'trialing')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insider alerts (Realtime-enabled)
CREATE TABLE public.insider_alerts ( ... );

-- User alert preferences
CREATE TABLE public.user_alert_preferences ( ... );

-- Articles cache (denormalized from NocoDB for fast SSR)
CREATE TABLE public.articles_cache ( ... );

-- Reports (purchased PDFs)
CREATE TABLE public.reports ( ... );
```

**RLS Policies**: Each table gets SELECT/INSERT/UPDATE policies scoped to `auth.uid()`. `insider_alerts` is publicly readable (anyone can see basic data), but the `ai_analysis` column is filtered in the API route based on subscription tier (not in RLS — simpler).

**Realtime**: Enable on `insider_alerts` table:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE insider_alerts;
```

**Auth config**:
- Email/password enabled (with email confirmation)
- Google OAuth provider configured
- Redirect URLs: `https://insiderbuying.ai/api/auth/callback`
- Email templates customized with InsiderBuying.ai branding

**Trigger**: Auto-create profile row on signup:
```sql
CREATE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$ ... $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### Verification
- Supabase project accessible, keys working
- Auth: signup → email confirm → login → session active
- Google OAuth: redirect → auth → session
- RLS: unauthenticated users cannot read profiles
- Realtime: insert into insider_alerts → client receives event

---

## Section 3: Stripe Products + Webhooks

### What
Create Stripe products, prices, and a coupon. Set up the webhook handler in the Next.js API route.

### Why
Stripe handles all payment processing for Pro subscriptions and one-time report purchases.

### How

**Products** (create via Stripe API or dashboard):

| Product | Price | Billing |
|---------|-------|---------|
| InsiderBuying Pro Monthly | $24/month | Recurring |
| InsiderBuying Pro Annual | $19/month ($228/year) | Recurring |
| Newsletter Subscriber Discount | $12 first month | Coupon (applies to Monthly, first invoice only) |

**Coupon**: `SUBSCRIBER12` — $12 off first month of Pro Monthly. Applied via URL parameter or Beehiiv welcome email link.

**Webhook handler** at `src/app/api/webhooks/stripe/route.ts`:
- Verify signature with `stripe.webhooks.constructEvent(body, sig, secret)`
- Use `request.text()` for raw body (App Router pattern — no bodyParser config needed)
- Handle events:
  - `checkout.session.completed` → create subscription record in Supabase, update profile tier to 'pro'
  - `customer.subscription.updated` → sync plan/status changes
  - `customer.subscription.deleted` → set tier back to 'free'
  - `invoice.payment_failed` → update status to 'past_due'

**Checkout flow**: `/api/checkout/route.ts` creates a Stripe Checkout Session with the selected price ID, customer email, and success/cancel URLs.

### Verification
- Stripe products visible in dashboard
- Webhook endpoint receives test events (use Stripe CLI: `stripe trigger checkout.session.completed`)
- Checkout flow: click "Start Pro" → Stripe Checkout → success redirect → profile.subscription_tier = 'pro'
- Subscription cancel: tier reverts to 'free'

---

## Section 4: Next.js SSR Conversion

### What
Convert the existing static-export Next.js site to server-side rendering on Netlify. Add Supabase auth middleware, API route structure, and Netlify deployment config.

### Why
SSR enables: server-side auth checks, API routes for Stripe webhooks, dynamic blog rendering from NocoDB, and real-time alerts page. Static export cannot do any of these.

### How

**next.config.ts changes**:
- Remove `output: "export"`
- No other config needed — `@netlify/plugin-nextjs` handles everything automatically

**New dependencies**:
```
@supabase/supabase-js @supabase/ssr stripe @netlify/plugin-nextjs react-onesignal
```

**Supabase client files** (`src/lib/supabase/`):
- `client.ts` — `createBrowserClient()` for client components
- `server.ts` — `createServerClient()` with cookie handling for server components
- `middleware.ts` — session refresh helper that reads/writes cookies

**Root middleware** (`src/middleware.ts`):
- Calls Supabase `updateSession()` on every request
- Route protection: redirect unauthenticated users from `/alerts/preferences`, `/checkout`, `/reports/download/*` to `/login`
- Matcher excludes `_next`, `favicon.ico`, `public` assets

**API routes structure**:
```
src/app/api/
  auth/
    callback/route.ts     — Supabase OAuth callback
  webhooks/
    stripe/route.ts       — Stripe webhook handler
  checkout/route.ts       — Create Stripe Checkout Session
  alerts/
    subscribe/route.ts    — Manage alert preferences
```

**netlify.toml**:
```toml
[build]
  command = "npm run build"
  publish = ".next"
```
No `[[plugins]]` needed — Netlify auto-detects Next.js.

**OneSignal setup**:
- `public/OneSignalSDKWorker.js` — service worker file from OneSignal dashboard
- `src/components/OneSignalInit.tsx` — client component that initializes OneSignal

### Verification
- `npm run dev` works locally with SSR (no static export errors)
- Middleware refreshes auth session on each request
- Protected routes redirect to /login when unauthenticated
- API routes respond correctly (test with curl)
- Netlify deployment succeeds with SSR
- OneSignal prompt appears on HTTPS domain

---

## Section 5: Environment Variables + Deployment

### What
Document all environment variables, configure them for local development (.env.local) and Netlify, and verify end-to-end deployment.

### Why
Multiple services (Supabase, Stripe, NocoDB, Resend, OneSignal) each need credentials. Missing or mismatched env vars are the #1 source of deployment failures.

### How

**Local `.env.local`** (gitignored):
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_PRICE_ID_PRO_MONTHLY=price_...
STRIPE_PRICE_ID_PRO_ANNUAL=price_...
STRIPE_COUPON_ID_SUBSCRIBER=SUBSCRIBER12

# NocoDB (for any server-side direct queries)
NOCODB_API_URL=http://nocodb:8080
NOCODB_API_TOKEN=...

# OneSignal
NEXT_PUBLIC_ONESIGNAL_APP_ID=...

# Resend
RESEND_API_KEY=re_...
```

**Netlify environment variables**: Same keys configured in Netlify UI (Site Settings → Environment Variables). Stripe keys use live mode values.

**`.env.example`** committed to repo: same structure with placeholder values and comments explaining each key.

**Resend setup**:
1. Create Resend account
2. Add domain `insiderbuying.ai`
3. Configure DNS records (SPF, DKIM, DMARC) for email deliverability
4. Verify domain
5. Create API key → `RESEND_API_KEY`

**Deployment verification checklist**:
- Netlify build succeeds
- Homepage loads (existing content intact)
- Auth: signup flow works
- Stripe: checkout creates session
- Supabase: data queries return results
- OneSignal: push permission prompt appears

### Verification
- `.env.example` in repo with all keys documented
- `.env.local` working for local dev
- Netlify deployment works with all env vars set
- No broken imports or missing dependencies
- All API routes respond (health check)

---

## File Structure After This Split

```
ryan_cole/insiderbuying-site/
  .env.example                    # NEW — env var template
  .env.local                      # NEW — local dev secrets (gitignored)
  netlify.toml                    # NEW — Netlify config
  next.config.ts                  # MODIFIED — remove output: "export"
  package.json                    # MODIFIED — new dependencies
  src/
    middleware.ts                  # NEW — Supabase auth + route protection
    lib/
      supabase/
        client.ts                 # NEW — browser Supabase client
        server.ts                 # NEW — server Supabase client
        middleware.ts             # NEW — session refresh helper
      stripe.ts                   # NEW — Stripe client instance
    app/
      api/
        auth/
          callback/route.ts       # NEW — OAuth callback
        webhooks/
          stripe/route.ts         # NEW — Stripe webhook handler
        checkout/route.ts         # NEW — Checkout session creator
        alerts/
          subscribe/route.ts      # NEW — Alert preferences
    components/
      OneSignalInit.tsx           # NEW — Push notification init
  public/
    OneSignalSDKWorker.js         # NEW — OneSignal service worker
```

**VPS additions**:
```
/docker/nocodb/
  docker-compose.yml              # NEW — NocoDB + PostgreSQL
```

**Supabase**:
```
supabase/migrations/
  20260326000000_insiderbuying_schema.sql  # NEW — full schema
```
