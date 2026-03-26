# Combined Spec — 01 Infrastructure

## What We're Building
The foundational infrastructure for InsiderBuying.ai — an automated finance blog + SaaS alert system that tracks SEC Form 4 insider trading filings and delivers AI-powered analysis.

This split sets up all external services and converts the existing static Next.js site to SSR, enabling the 6 subsequent splits (site pages, content engine, alerts, reports, social, outreach) to build on top.

## Architecture Decisions

### Database: NocoDB (not Airtable)
NocoDB replaces Airtable for this project. Self-hosted on the same Hostinger VPS as n8n.
- **Why**: Airtable 1000 API calls/month limit too restrictive with concurrent projects
- **How**: Docker-compose with PostgreSQL backend, n8n native NocoDB node, `http://nocodb:8080` internal network
- **Cost**: $0 (vs $20/mo Airtable Pro)
- **Advantages**: Zero rate limits, localhost latency, ACID consistency, native JSON fields

### Auth: Supabase (new project)
Separate Supabase project (not shared with Toxic or Nah).
- Created via Supabase Management API (programmatic)
- Auth: email/password + Google OAuth
- Realtime enabled on `insider_alerts` table

### Payments: Stripe
- Pro Monthly: $24/month
- Pro Annual: $19/month ($228/year — "Save 21%")
- Newsletter subscriber discount: first month $12 (coupon code in Beehiiv welcome sequence)
- No refunds. Cancel anytime.

### Hosting: Netlify SSR
- Remove `output: "export"` from next.config.ts
- `@netlify/plugin-nextjs` handles SSR automatically (App Router, Server Components, API Routes, Middleware)
- No special config needed — just deploy

### Email: Resend
- New account needed
- Domain: insiderbuying.ai
- Used for: alert delivery (W5), report delivery (W15), newsletter fallback

## Deliverables

### 1. Supabase Project + Schema
Tables: users, subscriptions, insider_alerts, user_alert_preferences, user_alerts_read, articles_cache, reports, newsletter_subscribers
RLS policies, Realtime on insider_alerts, auth config

### 2. NocoDB + PostgreSQL on VPS
Docker-compose alongside n8n and Traefik. 12 tables: Articles, Keywords, Data_Studies, Insider_Alerts, Outreach_Prospects, Outreach_Log, X_Engagement_Log, Reddit_Log, Financial_Cache, Published_Images, Lead_Magnet_Versions, SEO_Rankings

### 3. Next.js SSR Conversion
Remove static export, add middleware for Supabase auth, create API route structure, add Netlify config

### 4. Stripe Products + Webhooks
Pro Monthly + Annual products, coupon for newsletter subscribers, webhook handler at `/api/webhooks/stripe`

### 5. Environment Variables
All service keys documented and configured for local dev + Netlify

### 6. Resend Account + Domain Verification
Account creation, domain DNS verification, API key

## Existing Code
- Next.js 16.2.1, React 19.2.4, Tailwind v4.2.2
- Homepage with 12 sections (complete, working)
- Navbar + Footer components
- No backend code exists — this is a greenfield backend setup

## Constraints
- VPS: Hostinger (72.62.61.93), already runs n8n + Traefik
- DataForSEO API key not yet acquired (doesn't block this split)
- 7-day total project timeline — this split is Day 1
