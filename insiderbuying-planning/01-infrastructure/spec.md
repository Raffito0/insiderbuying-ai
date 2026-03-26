# 01 — Infrastructure & Foundation

## Summary
Set up all external services, convert Next.js to SSR, and establish the data layer for InsiderBuying.ai. This split is the prerequisite for everything else — nothing can start until infrastructure is ready.

## Timeline: Day 1 (4-6 hours)

## Deliverables

### 1. Supabase Project Setup
- Create new Supabase project (separate from Toxic or Nah)
- Tables:
  - `users` — extends Supabase auth.users with: display_name, subscription_tier (free/pro), stripe_customer_id, stripe_subscription_id, onboarding_complete, created_at
  - `subscriptions` — stripe_subscription_id, user_id, plan (free/pro), status (active/canceled/past_due), current_period_start, current_period_end, cancel_at_period_end
  - `insider_alerts` — id, ticker, company_name, insider_name, insider_title, transaction_type (buy/sell), shares, price_per_share, total_value, filing_date, significance_score (1-10), ai_analysis (text, blurred for free), cluster_id, is_cluster_buy, raw_filing_data (jsonb), created_at
  - `user_alert_preferences` — user_id, email_enabled, push_enabled, min_significance_score, watched_tickers (text[]), sectors (text[])
  - `user_alerts_read` — user_id, alert_id, read_at (for tracking which alerts user has seen)
  - `articles_cache` — airtable_record_id, slug, title, meta_description, body_html, verdict_type, published_at, primary_keyword, word_count (denormalized from Airtable for fast SSR queries)
  - `reports` — id, user_id, report_type (data_study/premium/lead_magnet), title, stripe_payment_id, pdf_url, created_at
  - `newsletter_subscribers` — email, source (site/beehiiv), subscribed_at, unsubscribed_at
- Row-Level Security (RLS):
  - users: own row read/update only
  - subscriptions: own row read only
  - insider_alerts: read for all authenticated, ai_analysis filtered by subscription_tier in API route
  - user_alert_preferences: own row CRUD
  - articles_cache: public read
  - reports: own rows only
- Auth config: email/password + Google OAuth
- Realtime enabled on `insider_alerts` table (for /alerts live feed)

### 2. Airtable Base Setup
- Create new base: "InsiderBuying.ai"
- Tables:
  - **Articles** — title, slug, meta_description, body_html (long text), key_takeaways (long text), verdict_type (single select: BUY/SELL/CAUTION/WAIT/NO_TRADE), verdict_text, word_count, primary_keyword, secondary_keywords, article_type (A/B/C/D), target_length (short/medium/long), ticker, company_name, sector, author_name, hero_image_url, og_image_url, status (draft/review/published), published_at, dexter_analysis (long text), financial_data (long text), filing_citations_count, data_tables_count, confidence_notes
  - **Keywords** — keyword, secondary_keywords, search_volume, keyword_difficulty, intent_type (A/B/C/D), ticker, company_name, status (new/assigned/used/exhausted), priority_score, last_checked, source (dataforseo/manual)
  - **Data_Studies** — title, study_type, data_period, key_findings (long text), methodology (long text), charts_data (long text JSON), status (draft/published), published_at
  - **Insider_Alerts** — ticker, company_name, insider_name, insider_title, transaction_type, shares, price_per_share, total_value, filing_date, significance_score, ai_analysis, cluster_id, is_cluster, raw_data (long text), status (new/processed/delivered), delivered_at
  - **Outreach_Prospects** — name, email, website, domain_authority, type (blogger/newsletter/podcast), relevance_score, status (found/contacted/replied/linked), notes
  - **Outreach_Log** — prospect (link to Outreach_Prospects), email_type (initial/followup), sent_at, opened_at, replied_at, result (no_reply/positive/negative/linked)
  - **X_Engagement_Log** — tweet_id, tweet_text, type (post/reply), likes, retweets, replies, impressions, posted_at, source_article (link to Articles), source_alert (link to Insider_Alerts)
  - **Reddit_Log** — post_url, subreddit, comment_text, type (value/mention), upvotes, posted_at, status (drafted/approved/posted)
  - **Financial_Cache** — ticker, data_type (income/balance/cashflow/ratios/prices/insider/competitor), data_json (long text), fetched_at, expires_at
  - **Published_Images** — article (link to Articles), image_type (hero/og), image_url, prompt_used, created_at
  - **Lead_Magnet_Versions** — month, title, pdf_url (R2), backtest_period, key_stats (long text), beehiiv_updated, created_at
  - **SEO_Rankings** — keyword (link to Keywords), date, position, url, clicks, impressions, ctr

### 3. Next.js SSR Conversion
- Remove `output: 'export'` from next.config.ts
- Install `@netlify/plugin-nextjs` for Netlify SSR support
- Add `netlify.toml` config:
  ```toml
  [build]
    command = "npm run build"
    publish = ".next"

  [[plugins]]
    package = "@netlify/plugin-nextjs"
  ```
- Create API routes structure:
  - `/api/auth/callback` — Supabase auth callback
  - `/api/webhooks/stripe` — Stripe webhook handler
  - `/api/webhooks/netlify-rebuild` — triggered by Airtable after article publish
  - `/api/alerts/subscribe` — alert preference management
  - `/api/alerts/stream` — SSE endpoint for real-time alerts
- Install dependencies: `@supabase/supabase-js`, `@supabase/ssr`, `stripe`, `@netlify/plugin-nextjs`

### 4. Stripe Setup
- Create Stripe products:
  - **InsiderBuying Pro** — monthly subscription
  - Pricing: TBD (doc suggests $29/mo or $19/mo annual)
- Create Stripe webhook endpoint pointing to `/api/webhooks/stripe`
- Handle events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- Store Stripe keys in env vars

### 5. Environment Variables
Document and configure all required env vars:
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_PRICE_ID_PRO_MONTHLY=
STRIPE_PRICE_ID_PRO_ANNUAL=

# Airtable
AIRTABLE_API_KEY=
AIRTABLE_BASE_ID=

# APIs (for n8n, documented here for reference)
FINANCIAL_DATASETS_API_KEY=
DATAFORSEO_API_KEY=          # not yet acquired
CLAUDE_API_KEY=
RESEND_API_KEY=
ONESIGNAL_APP_ID=
ONESIGNAL_API_KEY=
BEEHIIV_API_KEY=
X_API_KEY=
X_API_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_SECRET=
TWITTERAPI_IO_KEY=
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
GOOGLE_SEARCH_CONSOLE_KEY=
NANO_BANANA_API_KEY=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_PUBLIC_URL=
```

### 6. Netlify Deployment
- Connect GitHub repo to Netlify
- Configure build settings
- Set environment variables
- Verify SSR deployment works with existing homepage

## Technical Notes
- Supabase Realtime requires `ALTER PUBLICATION supabase_realtime ADD TABLE insider_alerts;`
- Stripe webhook verification uses `stripe.webhooks.constructEvent()` — needs raw body, not parsed JSON
- Netlify Functions have 10s timeout on free tier, 26s on Pro — SSR pages must be fast
- Airtable free tier: 1,200 records/base, 5 bases. May need Pro ($20/mo) if data grows fast

## Acceptance Criteria
- [ ] Supabase project created with all tables + RLS policies
- [ ] Airtable base created with all 12 tables
- [ ] Next.js builds and deploys on Netlify with SSR (no static export)
- [ ] Stripe webhook receives test events correctly
- [ ] Auth flow works: signup → email confirm → login → session persists
- [ ] Environment variables documented and set on Netlify
