# Combined Spec — 04 SEC Alerts System (W4 + W5)

## Overview

Build the SEC Form 4 insider trading monitor (W4) and multi-channel alert delivery system (W5) for EarlyInsider.com. This is the core SaaS value proposition: real-time insider trading alerts with AI-powered analysis, delivered to users based on their tier (Free/Pro) and preferences.

## Core Architecture

### Data Flow
```
SEC EDGAR RSS feed (free, ~1 min latency)
  → W4: parse new Form 4 filing URLs
  → Enrich with Financial Datasets API (1 call per filing)
  → Dedup check (Airtable Insider_Alerts)
  → Classify insider role (CEO/CFO/Board/VP/etc.)
  → Check cluster buy (Supabase: same ticker last 7 days)
  → Score significance 1-10 (Claude Haiku, fast + cheap)
  → Generate AI analysis (Claude Sonnet, only if score >= 4)
  → Write to Airtable Insider_Alerts
  → Write to Supabase insider_alerts (triggers Realtime on /alerts page)
  → If score >= 6: trigger W5

W5: Alert Delivery
  → Query user_alert_preferences (Supabase)
  → Email (Resend batch API, up to 100/call)
  → Push notification (OneSignal REST API, segment by tags)
  → Update delivery stats
```

### Two n8n Workflows for W4
- **W4-market**: n8n schedule every 15 min, active Mon-Fri 09:30-16:00 EST
- **W4-afterhours**: n8n schedule every 60 min, active outside market hours + weekends
- Both call the same core logic (could be shared Code node or duplicated for clarity)

## W4 — SEC Filing Monitor: Detailed Requirements

### Step 1: Fetch New Filings (SEC EDGAR RSS + Financial Datasets)

**Primary source**: SEC EDGAR RSS feed
- URL: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&dateb=&owner=include&count=40&search_text=&output=atom`
- Returns last 40 Form 4 filings, updated every minute
- Response: XML/Atom with filing date, company name, CIK, filing URL
- Filter by filing_date > last_check_timestamp

**Enrichment**: For each new filing found in RSS:
- Extract ticker from filing HTML (or CIK-to-ticker lookup via Financial Datasets)
- Query Financial Datasets: `GET /insider-trades?ticker={ticker}&filing_date_gte={last_check}`
- Get: name, title, is_board_director, transaction_date, transaction_shares, transaction_price_per_share, transaction_value, transaction_type, filing_date

**State**: Store `last_check_timestamp` in Airtable (single record "Monitor State") or use current_time - 16min as window.

### Step 2: Dedup

**Dedup key**: Composite `{ticker}_{insider_name}_{transaction_date}_{transaction_shares}`

**Check against**: Airtable `Insider_Alerts` table, filterByFormula using dedup_key field.

**If exists**: Skip filing entirely.

**If not exists**: Continue to step 3.

### Step 3: Filter — Buys Only (for MVP)

- `transaction_type`: only process `"P - Purchase"` type
- Skip: `"S - Sale"`, `"A - Grant"`, `"D - Disposition"`
- Store sells too eventually, but don't alert on them for MVP

### Step 4: Insider Classification

Map `title` field (string) to category:

| Category | Keywords | Score Weight |
|---|---|---|
| C-Suite | CEO, CFO, COO, CTO, President, Chief | Highest (+3) |
| Board | Director, Board Member, Chairman | High (+2) |
| VP/SVP/EVP | Vice President, SVP, EVP, Senior VP | Medium (+1) |
| Officers | Treasurer, Secretary, Controller | Lower (+0) |
| 10% Owners | "10% owner", "beneficial owner >10%" | Separate (+1) |

Note: `is_board_director` boolean from API can assist.

### Step 5: Cluster Detection

**Query**: Supabase `insider_alerts` table
```sql
SELECT id, cluster_id FROM insider_alerts
WHERE ticker = $ticker
  AND transaction_type = 'buy'
  AND filing_date >= NOW() - INTERVAL '7 days'
  AND insider_name != $current_insider_name
```

**Logic**:
- If 0 results: no cluster, continue
- If 1+ results: cluster detected
  - If all have same cluster_id: use existing cluster_id
  - If no cluster_id: generate new UUID cluster_id, update all existing records
  - Current filing: set cluster_id + is_cluster_buy = true
  - Significance boost: +3 to score (applied in step 6)
  - After saving: create a synthetic "CLUSTER DETECTED" alert record (see Cluster Alert section)

### Step 6: Significance Scoring (Claude Haiku)

**Model**: `claude-haiku-4-5-20251001` (fast, cheap: ~$0.001/call)

**Input to Claude**:
```json
{
  "ticker": "AAPL",
  "company": "Apple Inc.",
  "insider_name": "Tim Cook",
  "insider_title": "CEO",
  "insider_category": "C-Suite",
  "transaction_type": "Purchase",
  "shares": 50000,
  "price_per_share": 175.50,
  "total_value": 8775000,
  "filing_date": "2025-03-03",
  "is_cluster_buy": false,
  "cluster_members": 0,
  "insider_history": {
    "past_buys": 3,
    "hit_rate": 0.67,
    "avg_gain_30d": 0.12
  },
  "sector_context": "Technology"
}
```

**Prompt**: Return JSON `{ "score": 1-10, "reasoning": "2-3 sentence explanation" }`

**Scoring factors** (explicit in prompt):
1. Transaction size relative to historical trades for this insider
2. Insider role (C-Suite = heavier weight)
3. Timing signals (pre-earnings window, post-dip, unusual for this insider)
4. Cluster context (+3 if is_cluster_buy)
5. Transaction type (open market purchase > grant exercise)

**Track record calculation** (before calling Claude):
- Query Supabase: last 24 months of buys by same `insider_name`
- For each past buy: fetch price at filing_date and price at +30 days via Yahoo Finance public API
- Calculate: hit_rate (% buys that gained > 5%), avg_gain_30d
- Pass in JSON to Haiku

### Step 7: AI Analysis (Claude Sonnet 4.6)

**Condition**: Only call Sonnet if `score >= 4` (skip obvious noise)

**Model**: `claude-sonnet-4-6` (~$0.02/call)

**Output**: 2-3 paragraph analysis explaining:
- What this trade signals (why does an insider buy here?)
- Historical context (this insider's track record)
- Risk factors (what could make this less meaningful)

**Free tier handling**: The full `ai_analysis` text is saved in Supabase. The frontend handles blur vs. full display based on subscription_tier — W4 does NOT redact or modify the text. W4 always saves the FULL analysis.

### Step 8: Write to Airtable (Insider_Alerts table)

Save complete record including dedup_key, all filing data, score, analysis, cluster info, status='new'.

### Step 9: Write to Supabase (insider_alerts table)

Insert row — triggers Realtime subscription on `/alerts` page automatically.

**Supabase service role key** required (n8n env var: `SUPABASE_SERVICE_KEY`). RLS `service_role` INSERT policy already defined.

### Step 10: Trigger W5 (if score >= 6)

Pass alert data as JSON to W5 n8n workflow via HTTP call or n8n webhook trigger.

## Cluster Alert Logic

When a cluster is detected (2+ insiders, same ticker, 7-day window):

1. Update all existing `insider_alerts` records with shared `cluster_id`
2. Create a NEW synthetic record in both Airtable and Supabase:
   ```
   transaction_type: 'cluster'
   ticker: <same ticker>
   company_name: <same company>
   insider_name: "Multiple Insiders (N total)"
   insider_title: "Cluster Buy Signal"
   significance_score: max(individual_scores) + 3 (capped at 10)
   ai_analysis: "CLUSTER BUY: [N] insiders bought [ticker] within 7 days. [summary of all trades]. [cluster significance analysis]"
   cluster_id: <shared UUID>
   is_cluster_buy: true
   ```
3. Trigger W5 for this cluster record (score is always high enough)

## W5 — Alert Delivery: Detailed Requirements

**Trigger**: Called by W4 when significance_score >= 6 (single alert) OR when cluster detected.

### Step 1: Get Eligible Email Recipients (Resend)

**Supabase query** (service role):
```sql
SELECT
  u.email,
  p.subscription_tier,
  pref.min_significance_score,
  pref.watched_tickers,
  pref.email_enabled
FROM auth.users u
JOIN profiles p ON p.id = u.id
JOIN user_alert_preferences pref ON pref.user_id = u.id
WHERE pref.email_enabled = true
  AND (
    pref.min_significance_score <= $alert_score
    OR $ticker = ANY(pref.watched_tickers)
  )
```

**Build email batch**:
- Free user email: truncated analysis (first 100 chars of ai_analysis) + "Unlock full analysis → /pricing" CTA
- Pro user email: full ai_analysis text
- Subject: `[INSIDER BUY] {name} ({title}) buys ${formatMoney(total_value)} of {ticker}`
- Cluster subject: `🔥 CLUSTER BUY: {N} insiders buying {ticker} — Significance {score}/10`

**Send**: `POST /emails/batch` to Resend API, chunks of 100, 200ms between chunks.

**Resend config**:
- Free tier: 100/day, 3,000/month. Enough for MVP.
- When > 100 Pro users: upgrade to Pro plan ($20/mo)

### Step 2: Push Notifications (OneSignal)

**Send to users with tag `min_score` <= alert score**:
```json
POST https://onesignal.com/api/v1/notifications
{
  "app_id": "$ONESIGNAL_APP_ID",
  "filters": [
    { "field": "tag", "key": "alert_score_min", "relation": "<=", "value": "$alert_score" }
  ],
  "contents": { "en": "{ticker}: {title} {transaction_type} ${formatMoney(total_value)}" },
  "headings": { "en": "Insider Alert — {ticker}" },
  "url": "https://earlyinsider.com/alerts#{alert_id}",
  "data": { "alert_id": "$alert_id", "ticker": "$ticker" }
}
```

**Tag syncing** (needed for filtering to work):
- On user signup/preference update: tag user in OneSignal with `alert_score_min`, `plan` tags
- This must be done from the Next.js frontend or a Supabase webhook
- Tag update: `OneSignal.User.addTag("alert_score_min", userPrefs.min_significance_score)`

### Step 3: Delivery Tracking

Update Airtable Insider_Alerts record:
```
status: 'delivered'
delivered_at: ISO timestamp
emails_sent: N
push_sent: N (from OneSignal API response)
```

### Error Handling in W5

- If Resend fails: log error, don't block push notification delivery
- If OneSignal fails: log error, don't block email delivery
- Both failures: log in Airtable with status='delivery_failed', don't retry automatically

## Airtable Structure (to create)

### Base: "InsiderBuying.ai"

**Insider_Alerts table fields**:
| Field | Type | Notes |
|---|---|---|
| ticker | Single line text | Stock ticker symbol |
| company_name | Single line text | |
| insider_name | Single line text | |
| insider_title | Single line text | |
| insider_category | Single select | C-Suite, Board, VP, Officer, 10% Owner |
| transaction_type | Single select | buy, sell, cluster |
| shares | Number | Integer |
| price_per_share | Currency | |
| total_value | Currency | |
| transaction_date | Date | Actual trade date |
| filing_date | Date | SEC submission date |
| dedup_key | Single line text | ticker_name_txdate_shares (unique) |
| significance_score | Number | 1-10 |
| score_reasoning | Long text | Haiku reasoning |
| ai_analysis | Long text | Sonnet full analysis |
| cluster_id | Single line text | UUID if part of cluster |
| is_cluster_buy | Checkbox | |
| cluster_size | Number | How many insiders in cluster |
| raw_filing_data | Long text | JSON from Financial Datasets API |
| supabase_id | Single line text | UUID from Supabase insert |
| status | Single select | new, processing, processed, delivered, delivery_failed, failed |
| emails_sent | Number | |
| push_sent | Number | |
| delivered_at | Date/time | |
| error_log | Long text | Any errors during processing |
| created_at | Date/time | Auto |

**Monitor_State table** (single record):
| Field | Type | Notes |
|---|---|---|
| name | Single line text | "market" or "afterhours" |
| last_check_timestamp | Date/time | Last successful check |
| last_run_status | Single select | ok, error |
| last_run_filings_found | Number | |
| last_run_error | Long text | |

## Frontend Changes Required

### /alerts page: Subscription-Aware Blur

Current: blur applied to ALL users (CSS `blur-[4px]`).
Required: check `profiles.subscription_tier` in Supabase on page load, only blur for Free users.

```typescript
// In alerts page useEffect
const { data: profile } = await supabase
  .from('profiles')
  .select('subscription_tier')
  .single();
const isPro = profile?.subscription_tier === 'pro';

// In render:
<p className={`text-[13px] ${isPro ? '' : 'blur-[4px] select-none'}`}>
  {alert.ai_analysis}
</p>
{!isPro && <button>Upgrade to Pro</button>}
```

### OneSignal User Tagging (on signup/preference change)

Tag user when they set alert preferences:
```typescript
// In /api/alerts/subscribe route or preference update handler
await OneSignal.User.addTag("plan", profile.subscription_tier);
await OneSignal.User.addTag("alert_score_min", String(prefs.min_significance_score));
await OneSignal.User.addTag("ticker_watchlist", prefs.watched_tickers.join(","));
```

## n8n Environment Variables Required

Add to VPS docker-compose.yml:
```
ANTHROPIC_API_KEY=<Claude API key>
FINANCIAL_DATASETS_API_KEY=<key>
SUPABASE_URL=<project URL>
SUPABASE_SERVICE_KEY=<service role key>
AIRTABLE_API_KEY=<existing from content pipeline>
AIRTABLE_INSIDERBUYING_BASE_ID=<new base ID>
RESEND_API_KEY=<existing or new>
ONESIGNAL_APP_ID=<from dashboard>
ONESIGNAL_REST_API_KEY=<from dashboard>
TELEGRAM_BOT_TOKEN=<existing>
TELEGRAM_ALERT_CHAT_ID=<chat for error alerts>
```

## Cost Model (Monthly)

| Item | Volume | Cost |
|---|---|---|
| Claude Haiku scoring | ~1,500 calls | ~$1.50 |
| Claude Sonnet analysis | ~600 calls (score >= 4) | ~$12 |
| Total Claude | | ~$13.50/mo |
| Financial Datasets API | ~1,500 enrichment calls | Depends on plan |
| Yahoo Finance price check | ~600 calls | $0 (public API) |
| SEC EDGAR RSS | Unlimited | $0 |
| Resend emails | ~500/mo at launch | $0 (free tier) |
| OneSignal push | < 10k subscribers | $0 (free tier) |
| **Total (excl. Financial Datasets)** | | **~$13.50/mo** |

## Acceptance Criteria

- [ ] W4 fetches new Form 4 filings via SEC EDGAR RSS (no duplicates)
- [ ] Dedup correctly skips already-processed filings
- [ ] Insider classification correctly identifies C-Suite vs Board vs others
- [ ] Cluster detection groups related buys within 7-day window
- [ ] Cluster alert creates separate "CLUSTER DETECTED" record + triggers W5
- [ ] Significance scoring produces reasonable 1-10 scores (manual spot-check 20 filings)
- [ ] AI analysis is specific and data-driven (not generic filler)
- [ ] W5 sends email to correct user segments based on preferences
- [ ] Free user email: truncated analysis + upgrade CTA
- [ ] Pro user email: full AI analysis
- [ ] W5 sends push via OneSignal to users with matching score threshold
- [ ] /alerts page updates in real-time when new alert inserted (Supabase Realtime)
- [ ] /alerts page: Free users see blurred AI analysis, Pro users see full text
- [ ] Delivery tracks emails_sent + push_sent counts in Airtable
- [ ] Error handling: retry 3x + Telegram alert if > 5 failures per run
- [ ] End-to-end latency: filing appears → scored → analyzed → delivered < 5 min
- [ ] W4-market runs every 15 min during NYSE hours (Mon-Fri 9:30-16:00 EST)
- [ ] W4-afterhours runs every 60 min outside market hours
