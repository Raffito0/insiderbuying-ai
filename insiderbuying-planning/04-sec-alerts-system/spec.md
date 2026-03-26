# 04 — SEC Alerts System

## Summary
Build the SEC Form 4 filing monitor (W4) and multi-channel alert delivery system (W5). This is the core SaaS product — real-time insider trading alerts with AI-powered analysis, tiered between free and Pro users.

## Timeline: Days 2-4 (8-10 hours)

## Dependencies
- 01-infrastructure (Supabase insider_alerts table + Realtime, Airtable Insider_Alerts table, Resend account, OneSignal account)

## Workflows

### W4 — SEC Filing Monitor
**Schedule**: Every 15 minutes (during market hours 9:30AM-4:00PM EST), every 1 hour (after hours)

**Pipeline**:
1. **Fetch new Form 4 filings** — Financial Datasets API:
   - Endpoint: insider transactions / SEC filings
   - Filter: filing_date >= last_check_timestamp
   - Include: ticker, insider name, insider title, transaction type, shares, price, total value
2. **Dedup** — check against Airtable Insider_Alerts by filing reference number to avoid duplicates
3. **Classify insider** — categorize by role:
   - C-Suite (CEO, CFO, COO, CTO) — highest weight
   - Board members — high weight
   - VP/SVP/EVP — medium weight
   - Directors/Other officers — lower weight
   - 10% owners — separate category
4. **Cluster detection** — query last 7 days of alerts for same ticker:
   - If 2+ insiders bought same stock within 7 days → flag as cluster buy
   - Assign cluster_id (UUID) to group related transactions
   - Cluster buys get +3 significance boost
5. **AI significance scoring** — Claude API call (Haiku for cost, fast):
   - Input: transaction details, insider history, recent price action, sector context
   - Output: significance score 1-10 with reasoning
   - Scoring factors:
     - Transaction size relative to insider's historical trades
     - Insider's track record (past buys that preceded rallies)
     - Timing (pre-earnings, post-dip, unusual for this insider)
     - Cluster context (multiple insiders = stronger signal)
     - Sector momentum (contrarian buys score higher)
6. **AI analysis generation** — Claude API call (Sonnet 4.6 for quality):
   - Generate 2-3 paragraph analysis explaining why this trade matters
   - Include: historical context, what the insider might know, risk factors
   - This is the "blurred" content for free users
7. **Write to Airtable** — Insider_Alerts table
8. **Write to Supabase** — insider_alerts table (triggers Realtime for /alerts page)
9. **Trigger W5** — alert delivery for significant alerts (score >= 6)

**Cost per filing**: ~$0.001 (Haiku scoring) + ~$0.02 (Sonnet analysis) = ~$0.021
**At ~50 Form 4s/day**: ~$1.05/day

### W5 — Alert Delivery
**Trigger**: Called by W4 when significance_score >= 6

**Multi-channel delivery**:

1. **Email (Resend)**:
   - Query Supabase user_alert_preferences: email_enabled=true AND (min_significance_score <= alert.score OR alert.ticker IN watched_tickers)
   - Email template:
     - Subject: "[INSIDER BUY] {insider_name} ({insider_title}) buys ${total_value} of {ticker}"
     - Body: transaction summary + significance score badge + first paragraph of AI analysis
     - Pro users: full AI analysis in email
     - Free users: truncated analysis + "Unlock full analysis" CTA → /pricing
   - Resend batch API for efficiency (up to 100 recipients per call)

2. **Push notification (OneSignal)**:
   - Query OneSignal segments by user preferences
   - Title: "{ticker}: {insider_title} {transaction_type} ${total_value}"
   - Body: one-line summary
   - Deep link: /alerts#{alert_id}
   - Pro users: additional data in notification body

3. **Supabase Realtime** (already handled by W4 insert):
   - /alerts page auto-updates via Supabase subscription
   - No additional workflow step needed

4. **Delivery tracking**:
   - Update Airtable Insider_Alerts: status='delivered', delivered_at=now()
   - Log delivery stats: emails_sent, push_sent, errors

**Scaling logic** (from master doc):
- Phase 0 (launch): process all filings, deliver all significant alerts. Cost ~$30-60/month
- Phase 1 (100+ Pro users): same frequency, cost absorbed by subscriptions
- Phase 2 (1000+ users): consider batching non-critical alerts, real-time for score >= 8 only
- Never spend >5% of revenue on alert infrastructure

### Alert Tiering Logic

| Feature | Free | Pro |
|---------|------|-----|
| Alert feed (/alerts) | Real-time | Real-time |
| Basic data (ticker, insider, shares, value) | Yes | Yes |
| Significance score | Number only | Number + color + explanation |
| AI Analysis | Blurred (visible but unreadable) | Full text |
| Email alerts | Max 3/day, score >= 8 | Unlimited, customizable threshold |
| Push notifications | Score >= 8 only | Customizable threshold |
| Watched tickers | Up to 5 | Unlimited |
| Cluster alerts | Visible | Visible + historical pattern context |
| Historical data | Last 30 days | Full history |

**Key design decision**: Free users see AI analysis sections — they're NOT delayed or hidden. The content is RIGHT THERE but blurred with CSS. This creates maximum FOMO and conversion pressure. The blur overlay includes a clean "Upgrade to Pro" button.

## Technical Notes
- Financial Datasets API for insider transactions: verify exact endpoint and response format
- OneSignal web push requires HTTPS + service worker registration on the site
- Resend free tier: 100 emails/day, 3,000/month. May need paid plan ($20/mo) at scale
- Supabase Realtime: ensure `insider_alerts` table has Realtime publication enabled
- Cluster detection: use a sliding window (7 days) + same ticker + different insiders
- Significance scoring with Haiku is fast (<1s) and cheap ($0.001) — score every filing
- Full AI analysis with Sonnet only for score >= 4 (skip obvious noise like 10b5-1 routine sales)

## n8n Code Files
- `n8n/code/insiderbuying/sec-monitor.js` — W4 filing fetch, dedup, classify, cluster
- `n8n/code/insiderbuying/score-alert.js` — AI significance scoring (Haiku)
- `n8n/code/insiderbuying/analyze-alert.js` — AI analysis generation (Sonnet)
- `n8n/code/insiderbuying/deliver-alert.js` — W5 multi-channel delivery

## Acceptance Criteria
- [ ] W4 fetches new Form 4 filings without duplicates
- [ ] Insider classification correctly identifies C-Suite vs Board vs other
- [ ] Cluster detection groups related buys within 7-day window
- [ ] Significance scoring produces reasonable 1-10 scores (manual spot-check 20 filings)
- [ ] AI analysis is specific and data-driven (not generic filler)
- [ ] W5 delivers email to correct user segments based on preferences
- [ ] W5 sends push notifications via OneSignal
- [ ] /alerts page updates in real-time when new alert is inserted
- [ ] Free users see blurred AI analysis, Pro users see full text
- [ ] Delivery respects user preferences (min score, watched tickers)
- [ ] End-to-end: filing appears → scored → analyzed → delivered in < 5 minutes
