# SEC Alerts System — Usage Guide

## What Was Built

A complete SEC Form 4 insider trading alert system for EarlyInsider.com:

### Backend (n8n Code Nodes)
- **sec-monitor.js** — Discovers new Form 4 filings from SEC EDGAR, enriches via Financial Datasets, deduplicates, classifies insiders, detects cluster buys
- **score-alert.js** — Significance scoring (1-10) using Claude Haiku + insider track record + Yahoo Finance price data
- **analyze-alert.js** — AI analysis prose via Claude Sonnet for high-scoring alerts (score >= 4)
- **write-persistence.js** — Writes filings to Airtable + Supabase with dedup, dead-letter pattern, cluster summaries
- **deliver-alert.js** — Email (Resend) + push (OneSignal) delivery with CAN-SPAM compliance, plan-aware content
- **market-hours-guard.js** — NYSE market hours detection with automatic DST handling via Intl.DateTimeFormat

### n8n Workflows
- **W4-market** (`w4-market.json`) — Runs every 15 min during market hours (09:30-16:00 ET)
- **W4-afterhours** (`w4-afterhours.json`) — Runs every 60 min outside market hours, `maxConcurrency=1`
- Both follow: Schedule → Guard → sec-monitor → score-alert → analyze-alert → IF score>=6 → deliver-alert

### Frontend
- **Alerts page** — Subscription-aware blur: Pro sees full AI analysis, Free/unauth see blur+CTA
- **OneSignal integration** — User linking via `login()`, tag sync (`alert_score_min`, `plan`)

### Database
- **Supabase migration** — `insider_alerts` table with cluster detection columns, RLS policies
- **Airtable base** — `Insider_Alerts` + `Monitor_State` tables (setup documented)

## How to Deploy

### 1. Set Environment Variables
Add all variables from `n8n/workflows/insiderbuying/w4-env-vars.yml` to your n8n docker-compose.

### 2. Deploy Code to n8n
```bash
# Copy code files to n8n container
scp n8n/code/insiderbuying/*.js vps:/home/node/.n8n/code/insiderbuying/
```

### 3. Import Workflows
Import `w4-market.json` and `w4-afterhours.json` via n8n UI (Settings → Import).

### 4. Run Supabase Migration
Execute the SQL migration from section-00 against your Supabase project.

### 5. Deploy Frontend
```bash
npm run build  # Next.js build
# Deploy to Netlify (already configured)
```

### 6. Verify OneSignal
- Check `public/OneSignalSDKWorker.js` exists
- Set `NEXT_PUBLIC_ONESIGNAL_APP_ID` in environment
- Replace service worker stub with real file from OneSignal dashboard

## Running Tests
```bash
cd ryan_cole/insiderbuying-site
npm test                            # All tests (293 passing)
npx jest tests/insiderbuying/       # Only SEC alerts tests
```

## Test Coverage by Section
| Section | Test File | Tests |
|---------|-----------|-------|
| 00 — Schema Migration | section-00-schema-migration.test.js | SQL structure |
| 01 — Airtable Setup | section-01-airtable-setup.test.js | Table config |
| 02 — SEC Monitor | sec-monitor.test.js | EDGAR parsing, dedup, enrichment |
| 03 — Score Alert | score-alert.test.js | Scoring, Claude fallback |
| 04 — Analyze Alert | analyze-alert.test.js | Analysis generation, skip logic |
| 05 — Write Persistence | write-persistence.test.js | Airtable+Supabase write, dead-letter |
| 06 — Deliver Alert | deliver-alert.test.js | Email+push delivery, CAN-SPAM |
| 07 — Workflow Config | market-hours-guard.test.js + workflow-config.test.js | DST, cron, node chain |
| 08 — Frontend Blur | alerts-blur.test.js | Blur logic, CTA routing |
| 09 — OneSignal | onesignal-tagging.test.js | Login, tags, number handling |
