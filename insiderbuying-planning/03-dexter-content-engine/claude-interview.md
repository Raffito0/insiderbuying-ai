# Dexter Content Engine — Interview Transcript

## Q1: Database for content engine?
**A**: Mix — NocoDB for content tables (Articles, Keywords, Financial_Cache, Published_Images) on VPS localhost, Supabase only for auth/subscriptions/alerts (already live). NocoDB Docker compose ready but not yet started.

## Q2: Financial Datasets API key?
**A**: Already acquired. Can use immediately for income statements, insider trades, stock prices, balance sheets, ratios, competitor data.

## Q3: DataForSEO API key?
**A**: Already acquired. W1 keyword research can be fully automated from day 1.

## Q4: Blog rendering current state?
**A**: /blog and /blog/[slug] routes exist in Next.js but are empty placeholders. No data fetching wired yet. articles_cache exists in Supabase but is empty.

## Q5: NocoDB setup?
**A**: Docker compose file exists on VPS but not started yet. Need `docker-compose up` as first step.

## Q6: Image generation (W12)?
**A**: Reuse existing kie.ai (Nano Banana Pro) API key from Toxic or Nah project. Same key for EarlyInsider.

## Q7: Multi-blog support?
**A**: YES — build multi-blog routing from day 1. The system prompt already supports 3 blogs (deepstockanalysis, insiderbuying, dividenddeep). The BLOG variable routes voice/style. Content engine should handle all 3 even though EarlyInsider is first.

## Q8: Puppeteer/OG card rendering?
**A**: Reuse existing screenshot server on VPS (`host.docker.internal:3456`) already running for the Toxic or Nah project. No external service needed.

## Q9: Cross-linking strategy (W13)?
**A**: Both — 2-3 inline anchor text links (Claude finds natural phrases) + "Related Articles" section at bottom of each article. Maximizes SEO value.

## Key Context from Existing Codebase

### Existing Site Stack
- Next.js 16 + React 19 + Tailwind 4 + TypeScript
- Supabase (@supabase/ssr + supabase-js) for auth
- Stripe for payments
- Netlify for hosting (SSR mode via @netlify/plugin-nextjs)
- Domain: earlyinsider.com

### Existing API Routes
- /api/auth/callback — OAuth
- /api/checkout — Stripe
- /api/webhooks/stripe — subscription lifecycle
- /api/alerts/subscribe — alert preferences

### n8n on VPS
- Self-hosted v1.122.5 on Hostinger VPS (72.62.61.93)
- Docker with Traefik reverse proxy
- NODE_FUNCTION_ALLOW_BUILTIN=* (require() works)
- No global fetch — must polyfill with require('https')
- Screenshot server at host.docker.internal:3456

### FINANCIAL-ARTICLE-SYSTEM-PROMPT.md
- 225-line production prompt with 18 variables
- 4 article types (A/B/C/D) with distinct structures
- 3 length tiers (short 800-1000, medium 1200-1800, long 2000-3000)
- 14-point quality gate checklist
- Banned phrases list (25+ AI patterns)
- JSON output format with all required fields
- Variable interpolation code already written (JS for n8n)
- Response parsing code already written (JS for n8n)
- Multi-blog routing via {{BLOG}} variable

### Architecture Decision: NocoDB replaces Airtable
- Airtable 1000 API calls/month too restrictive
- NocoDB: self-hosted PostgreSQL-backed, same VPS as n8n
- Zero cost, zero rate limits, localhost latency
- Docker compose ready, needs `docker-compose up`
