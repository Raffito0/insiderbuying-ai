# Interview — 01 Infrastructure

## Q1: Supabase project creation
**A:** Create via Supabase Management API. Programmatic setup, not manual.

## Q2: Stripe pricing
**A:** Final pricing:
- Monthly: $24/month
- Annual: $19/month ($228/year — "Save 21%")
- Newsletter subscriber code (welcome sequence): first month $12, then $24/month. Message: "As a subscriber, your first month of Pro is $12"
- No refunds. Cancel anytime.

## Q3: Database — Airtable vs NocoDB
**A:** NocoDB replaces Airtable for this project. Reason: Airtable 1000 API calls/month limit too restrictive with 2 concurrent projects.

**NocoDB decision:**
- Self-hosted on Hostinger VPS (same machine as n8n)
- Docker-compose with PostgreSQL backend
- n8n has native NocoDB node (built-in)
- Zero API rate limits, localhost latency, ACID consistency
- $0 additional cost
- Docker internal network: `http://nocodb:8080` from n8n

## Q4: Email provider
**A:** Need to create Resend account. Domain: insiderbuying.ai (alerts@insiderbuying.ai or similar).

## Key Architecture Changes from Original Spec
1. **NocoDB replaces Airtable** everywhere — all 12 tables go to NocoDB
2. **Supabase created via API** — programmatic, not manual
3. **Stripe pricing locked**: $24/mo, $19/mo annual, $12 first month for newsletter subscribers
