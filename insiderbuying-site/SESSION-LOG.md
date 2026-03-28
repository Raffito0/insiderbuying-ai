# EarlyInsider — Session Log

## Session 1 — 2026-03-27

### Domain
- Evaluated 200+ domain names for the project
- Bought **earlyinsider.com** ($10 .com)
- Previous name was insiderbuying.ai ($160 for 2yr .ai)
- DNS configured: Hostinger A record → 75.2.60.5, CNAME www → apex-loadbalancer.netlify.com

### How It Works Page (from Figma)
- Fetched "How it works" frame from Figma API (file `15Wdojs2q9CdVdBugPy5M8`, frame `66:7`, 1280x3920)
- Created `src/app/how-it-works/page.tsx` — 7 sections pixel-perfect from Figma:
  1. Header (PROCESS & TECHNOLOGY)
  2. The Data Pipeline (3 cards: Data Acquisition, AI-Powered Filtering, Institutional Analysis)
  3. Instant Delivery (text + mock TSLA alert card)
  4. The Technology Stack (4 tech blocks with Space Mono data rows)
  5. Strategic Backtesting (text + chart mockup $NVDA)
  6. The 60-Second Journey (5-step horizontal timeline)
  7. Final CTA (blue bg + "Start Free Now")
- Updated Navbar link: /methodology → /how-it-works

### Infrastructure: Netlify SSR Mode
- Removed `output: "export"` from next.config.ts (was static HTML, broke API routes)
- Installed `@netlify/plugin-nextjs` — Netlify now runs Next.js in SSR mode
- Updated netlify.toml: publish `.next`, added plugin
- This enables: API routes, middleware, server-side rendering

### API Routes Activated
- Moved 4 routes from `_api_backup/` to `src/app/api/`:
  - `/api/auth/callback` — OAuth code exchange (fixed: force-dynamic)
  - `/api/checkout` — Stripe checkout session creation
  - `/api/webhooks/stripe` — handles checkout.completed, subscription.updated/deleted, invoice.failed
  - `/api/alerts/subscribe` — alert preferences CRUD
- Created root `middleware.ts` — protects /checkout, /alerts/preferences, /reports/download

### Supabase Setup
- Project: `EarlyInsider` (ID: pqvjccqzizjnpeoiooqu, region: US East)
- Ran full migration (7 tables):
  - `profiles` — extends auth.users, has subscription_tier + stripe IDs
  - `subscriptions` — Stripe subscription tracking
  - `insider_alerts` — realtime-enabled, core alert data
  - `user_alert_preferences` — email/push prefs, watched tickers
  - `articles_cache` — denormalized blog articles from CMS
  - `reports` — purchased PDFs tracking
  - `newsletter_subscribers` — email capture (anon insert allowed)
- RLS policies on all tables
- Triggers: auto-create profile + alert preferences on signup
- Indexes on ticker, created_at, significance_score, slug, published_at

### Stripe Setup
- Product created: **EarlyInsider Pro** (prod_UDxZhXKtsGWr8c)
- Prices (LIVE):
  - Monthly: $24/mo (price_1TFVfHBJM1hcMsSanZzyirRM)
  - Annual: $228/yr (price_1TFVfHBJM1hcMsSa9wD5IcfH)
- Webhook endpoint: `https://earlyinsider.com/api/webhooks/stripe` (we_1TFVfXBJM1hcMsSaiuWTkZ2J)
- Events: checkout.session.completed, customer.subscription.updated/deleted, invoice.payment_failed

### Auth Fixes
- **Forgot password**: wired button to `supabase.auth.resetPasswordForEmail()` with success message
- **Post-login redirect**: reads `?redirect=` param, defaults to /alerts
- **OAuth callback**: fixed `force-static` → `force-dynamic`
- **Suspense boundary**: wrapped LoginForm for useSearchParams

### Pricing Page → Stripe Checkout
- Pro button now calls `/api/checkout` with correct priceId (monthly or annual based on toggle)
- Non-authenticated users redirected to /signup first
- Checkout returns Stripe hosted checkout URL

### Newsletter/Email Capture → Supabase
- Free report form: saves to `newsletter_subscribers` (source=free_report), replaced fake setTimeout
- Blog page newsletter bar: saves to `newsletter_subscribers` (source=blog)
- Blog article sidebar: new `NewsletterForm.tsx` reusable component (source=blog_article)
- Duplicate emails handled gracefully (show success)

### Alerts Page → Supabase Realtime
- Fetches latest 20 alerts from `insider_alerts` ordered by created_at DESC
- Subscribes to postgres_changes INSERT events — new alerts prepended in real time
- Falls back to sample data with "Sample data — live alerts coming soon" banner when table empty
- Cleanup subscription on unmount

### SEO
- Created `public/robots.txt`
- Created `src/app/sitemap.ts` (13 URLs with priorities)
- Added Open Graph + Twitter cards to layout.tsx
- Per-page metadata: about, how-it-works, methodology, reports, contact

### Rebrand: InsiderBuying → EarlyInsider
- 50+ occurrences changed across all files
- Navbar logo: "Early" (normal) + "Insider" (bold)
- Footer: © 2026 EarlyInsider
- All email addresses: @earlyinsider.com
- Site URL: https://earlyinsider.com
- Layout metadata, OG tags, all page content

### Environment Variables (.env.local)
- NEXT_PUBLIC_SUPABASE_URL + ANON_KEY + SERVICE_ROLE_KEY
- NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY + SECRET_KEY + WEBHOOK_SECRET
- STRIPE_PRICE_ID_PRO_MONTHLY + PRO_ANNUAL
- NEXT_PUBLIC_SITE_URL=https://earlyinsider.com
- Same vars imported to Netlify environment

### Deploy
- Commit: `4defca9` — 34 files changed, 1331 insertions
- Pushed to `Raffito0/insiderbuying-ai` (main branch)
- Netlify auto-build triggered
- DNS: Hostinger → Netlify (A record + CNAME www)

### What's Still Missing (for next session)
- [ ] Google OAuth app setup (need Google Cloud Console credentials)
- [ ] Resend API key for transactional emails (welcome, password reset, alert digest)
- [ ] OneSignal app ID for push notifications
- [ ] SEC EDGAR data pipeline (the actual product — n8n/Make workflow to parse Form 4 filings)
- [ ] Blog CMS integration (NocoDB or Supabase-based)
- [ ] Report PDFs (generation + storage + Stripe gating)
- [ ] Stripe Customer Portal link (cancel/modify subscription)
- [ ] Verify Netlify build succeeds with SSR mode
- [ ] SSL certificate provisioning (after DNS propagation)
