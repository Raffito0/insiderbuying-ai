# InsiderBuying.ai — Project Manifest

## Project Overview
Automated finance blog + SaaS alert system. InsiderBuying.ai tracks SEC Form 4 insider trading filings, generates AI-powered analysis articles, delivers real-time alerts to subscribers, and runs a complete marketing/outreach engine via 16 n8n workflows.

## Timeline: 7 days (2026-03-26 to 2026-04-01)

## SPLIT_MANIFEST

```
01-infrastructure          | Foundation: Supabase + Airtable + SSR + Stripe + env
02-figma-site-pages        | All site pages pixel-perfect from Figma designs
03-dexter-content-engine   | Dexter agent + W1 keywords + W2 articles + W12 images + W13 cross-link
04-sec-alerts-system       | W4 SEC monitor + W5 alert delivery (email + push + real-time)
05-data-studies-reports    | W3 data studies + W15 report PDF + W16 lead magnet PDF
06-newsletter-social       | W6 newsletter + W7 X auto-post + W8 X engagement + W9 Reddit
07-outreach-seo            | W10 prospect finder + W11 email sender + W14 SEO monitoring
```

## Dependency Graph

```
01-infrastructure ─────┬──> 02-figma-site-pages
                       ├──> 03-dexter-content-engine
                       ├──> 04-sec-alerts-system
                       └──> 05-data-studies-reports

03-dexter-content-engine ──> 06-newsletter-social  (needs articles to exist)
03-dexter-content-engine ──> 07-outreach-seo       (needs published content for SEO)

04-sec-alerts-system ──────> 06-newsletter-social   (newsletter includes alerts digest)
```

## Execution Order

### Day 1: Foundation
- **01-infrastructure** — Create Supabase project + schema, Airtable base + all tables, convert Next.js to SSR, configure Netlify, set up Stripe products/prices, env vars for all services

### Days 1-3: Site + Content Engine (PARALLEL)
- **02-figma-site-pages** — Fetch Figma designs via API, build all missing pages: /alerts, /reports, /blog, /blog/[slug], /pricing, /about, /faq, /methodology, /free-report, /signup, /login. Auth flows, Stripe checkout, blog SSR with Airtable CMS
- **03-dexter-content-engine** — Build Dexter pre-research agent (web search + Financial Datasets aggregation), W1 keyword selection (DataForSEO), W2 article generation (Claude Sonnet 4.6 with the production prompt), W12 featured image generation (Nano Banana Pro + Puppeteer OG), W13 cross-linking updater

### Days 2-4: Alerts (starts after infra, parallel with site/content)
- **04-sec-alerts-system** — W4 SEC filing monitor (Financial Datasets API, Form 4 parsing, cluster detection, AI scoring), W5 alert delivery (Resend email, OneSignal push, Supabase real-time for /alerts page, free vs Pro tiering with blurred AI analysis)

### Days 3-5: Data Products (parallel with alerts)
- **05-data-studies-reports** — W3 data studies (bi-monthly, cache + Claude analysis), W15 report PDF generation (Stripe webhook trigger, Claude analysis, PDF render, Resend delivery), W16 lead magnet PDF (monthly backtest report, R2 storage, Beehiiv integration)

### Days 4-6: Marketing (needs content + alerts flowing)
- **06-newsletter-social** — W6 weekly newsletter (Beehiiv API, Monday 7AM EST, article digest + alert highlights), W7 X auto-post (X API Free tier, data-only posts, no links), W8 X engagement monitor (twitterapi.io polling, Claude analysis, Telegram alerts), W9 Reddit monitor (Reddit API, Claude for reply drafts, Telegram review)

### Days 5-7: Outreach + SEO (final layer)
- **07-outreach-seo** — W10 outreach prospect finder (Google Search + Hunter/Snov/Apollo free tiers), W11 outreach email sender (Gmail SMTP, 50/week, day-5 follow-up), W14 SEO monitoring (Google Search Console API, daily rank tracking, Telegram alerts)

## Split Details

### 01-infrastructure
**Purpose**: Set up all external services and convert the site architecture.
**Deliverables**:
- Supabase project with tables: users, subscriptions, alerts, alert_preferences, articles (cache), user_alerts_read
- Supabase auth configured (email + Google OAuth)
- Supabase Row-Level Security policies
- Airtable base with tables: Articles, Keywords, Data_Studies, Insider_Alerts, Outreach_Prospects, Outreach_Log, X_Engagement_Log, Reddit_Log, Financial_Cache, Published_Images, Lead_Magnet_Versions, SEO_Rankings
- Next.js SSR conversion (remove `output: 'export'`, add API routes structure, Netlify adapter)
- Stripe products: Free + Pro plans, webhook endpoint
- Environment variables documented for: Supabase, Stripe, Airtable, Financial Datasets, DataForSEO, Claude API, Resend, OneSignal, Beehiiv, X API, twitterapi.io, Reddit API, Google Search Console, Nano Banana Pro, R2
- Netlify deployment config (netlify.toml, build commands)
**Risk**: DataForSEO key not yet acquired — W1 will need a mock/manual fallback until key arrives
**Estimate**: ~4-6 hours

### 02-figma-site-pages
**Purpose**: Build all missing site pages pixel-perfect from Figma.
**Deliverables**:
- Figma design extraction (Figma API → component specs, colors, spacing, typography)
- /alerts page — real-time alert feed with free/Pro tiering, blurred AI analysis for free users
- /reports page — report cards grid, purchase CTAs
- /blog page — article listing with filters/search, pagination
- /blog/[slug] page — full article render from Airtable, SEO meta tags, related articles sidebar
- /pricing page — Free vs Pro comparison, Stripe checkout integration
- /about page — Ryan Cole bio, methodology overview, trust signals
- /faq page — expandable FAQ sections
- /methodology page — how the AI analysis works, data sources
- /free-report page — lead magnet landing, email gate, PDF download
- /signup + /login pages — Supabase auth UI
- Responsive design (mobile-first) for all pages
**Dependencies**: 01-infrastructure (Supabase auth, Stripe, Airtable CMS)
**Estimate**: ~16-20 hours (largest split — 11 pages)

### 03-dexter-content-engine
**Purpose**: Build the entire content generation pipeline from keyword research to published article.
**Deliverables**:
- **Dexter Research Agent** (new n8n workflow): Takes ticker/keyword → web search (Google/Bing) → Financial Datasets API (income stmt, balance sheet, cash flow, ratios, insider trades, price history, competitor data) → earnings call transcripts → aggregates into structured JSON for the article prompt
- **W1 Keyword Selection**: DataForSEO API → keyword opportunities → scoring (volume, difficulty, intent) → Airtable Keywords table. Weekly Sunday schedule
- **W2 Article Generation**: Keyword from W1 → Dexter pre-research → Claude Sonnet 4.6 (FINANCIAL-ARTICLE-SYSTEM-PROMPT.md) → JSON parse → Airtable Articles → Netlify rebuild webhook. 3x/day schedule
- **W12 Featured Image Gen**: Nano Banana Pro (hero image) + Puppeteer OG card generation → Airtable Published_Images → CDN URL for article
- **W13 Cross-linking**: After article publish → find related articles in Airtable → update body_html with internal links → Airtable PATCH
- Production article system prompt integration (the 14-point quality gate)
**Dependencies**: 01-infrastructure (Airtable base, API keys)
**Risk**: DataForSEO key needed for W1. Fallback: manual keyword input to W2 until key arrives
**Estimate**: ~12-16 hours

### 04-sec-alerts-system
**Purpose**: Monitor SEC Form 4 filings and deliver alerts to users.
**Deliverables**:
- **W4 SEC Filing Monitor**: Financial Datasets API → Form 4 parsing → insider identification (CEO, CFO, board) → cluster detection (multiple insiders buying same stock within 7 days) → AI scoring (significance 1-10, historical track record) → Airtable Insider_Alerts
- **W5 Alert Delivery**: New alert in Airtable → Resend email (formatted alert with key data) → OneSignal push notification → Supabase insert (for /alerts real-time feed). Free tier: alert + basic data. Pro tier: alert + full AI analysis (significance score, historical pattern, cluster context). Free users see AI analysis section but blurred (CSS blur + upgrade CTA)
- Scaling logic: Phase 0 = all filings processed, costs ~$0. Scale monitoring frequency with subscriber count
**Dependencies**: 01-infrastructure (Supabase, Airtable, Resend account, OneSignal account)
**Estimate**: ~8-10 hours

### 05-data-studies-reports
**Purpose**: Generate premium data products (studies, reports, lead magnets).
**Deliverables**:
- **W3 Data Studies**: Schedule 1st + 15th of month → cache financial data → Claude analysis → structured data study (charts data, key findings, methodology) → Airtable Data_Studies → site page render
- **W15 Report PDF Generation**: Stripe webhook (purchase event) → load report config → Claude deep analysis → PDF render (HTML → Puppeteer PDF) → Resend delivery to buyer email
- **W16 Lead Magnet PDF**: Last day of month → backtest insider buying signals → Claude narrative → PDF render → R2 upload (permanent URL /free-report) → Beehiiv update (new lead magnet version)
- PDF template design matching site branding (navy, Montaga headings, charts)
**Dependencies**: 01-infrastructure (Stripe webhooks, R2, Beehiiv account), 03 partially (Financial Datasets integration patterns)
**Estimate**: ~10-12 hours

### 06-newsletter-social
**Purpose**: Automated distribution and social presence.
**Deliverables**:
- **W6 Weekly Newsletter**: Monday 7AM EST schedule → query week's articles + top alerts from Airtable → Claude summary/teaser → Beehiiv API send → track opens/clicks
- **W7 X Auto-Post**: Triggered after each new article/alert → Claude generates data-focused tweet (NO links, NO brand mentions in tweets — profile bio does the work) → X API Free post → Airtable X_Engagement_Log
- **W8 X Engagement Monitor**: Every 15 min via twitterapi.io → check replies/mentions/relevant conversations → Claude drafts reply (data-only, no brand) → Telegram for human review before posting
- **W9 Reddit Monitor**: Every 2h → scan r/stocks, r/ValueInvesting, r/wallstreetbets, r/investing → Claude identifies relevant threads → drafts value-first comment (80% pure value, 20% soft organic mention) → Telegram for review
**Dependencies**: 03-dexter-content-engine (needs articles to reference), 04-sec-alerts-system (newsletter includes alert digest), Beehiiv account, X API key, twitterapi.io key, Reddit API credentials
**Estimate**: ~10-12 hours

### 07-outreach-seo
**Purpose**: Link building outreach and search performance monitoring.
**Deliverables**:
- **W10 Outreach Prospect Finder**: Weekly → Google Search for finance bloggers/newsletters/podcasts → Hunter.io/Snov.io/Apollo free tier for email discovery → scoring (domain authority, relevance, contact quality) → Airtable Outreach_Prospects
- **W11 Outreach Email Sender**: 50 emails/week via Gmail SMTP → personalized templates (Claude generates per-prospect) → day-5 follow-up if no reply → Airtable Outreach_Log tracking (sent, opened, replied, linked)
- **W14 SEO Monitoring**: Daily → Google Search Console API → rank tracking per keyword → Airtable SEO_Rankings → Telegram alert if any keyword drops >5 positions or enters top 10
- Gmail SMTP warmup considerations (start slow, increase gradually)
**Dependencies**: 03-dexter-content-engine (needs published content for outreach pitches), Google Search Console verified property, Gmail account
**Estimate**: ~8-10 hours

## Architecture Change: NocoDB replaces Airtable
**Decision made during 01-infrastructure planning**: Airtable's 1000 API calls/month limit is too restrictive with concurrent projects. NocoDB (self-hosted, PostgreSQL-backed) runs on the same VPS as n8n — zero cost, zero rate limits, localhost latency, ACID consistency. All references to "Airtable" in subsequent splits should be read as "NocoDB".

## Total Estimated Hours: ~68-86 hours across 7 days

## Parallelization Strategy
- Day 1: 01 (foundation) — MUST complete first
- Days 1-3: 02 + 03 in parallel (site pages + content engine)
- Days 2-4: 04 starts as soon as infra is ready
- Days 3-5: 05 starts when content engine patterns are established
- Days 4-6: 06 starts when articles + alerts exist
- Days 5-7: 07 as final layer
- Multiple splits can run via parallel /deep-implement sessions using git worktrees
