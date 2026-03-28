# TDD Plan — 04 SEC Alerts System (W4 + W5)

## Testing Approach

**n8n Code nodes** (JavaScript): tested as standalone Node.js modules with Jest. Each Code node's logic is extracted into a pure function file (e.g., `sec-monitor.js`) that can be imported and unit-tested without running n8n. Integration tests hit real APIs with limited scope (single known ticker).

**Next.js frontend**: Jest + React Testing Library for component logic. E2E via manual walkthrough (small surface area).

**Supabase migrations**: tested by running against a local Supabase instance (`supabase start`) and verifying schema diffs with `supabase db diff`.

**Test file location**: `ryan_cole/insiderbuying-site/tests/insiderbuying/`

---

## Section 0: Supabase Schema Migration

Tests to write BEFORE applying the migration:

```
# Test: migration runs cleanly on a fresh schema (no errors, no unintended drops)
# Test: after migration, insider_alerts has all new columns:
#       transaction_date, dedup_key, insider_category, score_reasoning,
#       cluster_id, is_cluster_buy, cluster_size, status, retry_count,
#       emails_sent, push_sent, delivered_at, error_log
# Test: transaction_type CHECK constraint accepts 'buy', 'sell', 'cluster'
# Test: transaction_type CHECK constraint rejects 'grant', 'other', null
# Test: dedup_key unique index — inserting two rows with same dedup_key raises constraint error
# Test: service_role UPDATE policy allows updating existing insider_alerts rows
# Test: anon role cannot UPDATE insider_alerts rows (RLS blocks it)
# Test: migration is idempotent — running it twice causes no errors (IF NOT EXISTS guards)
```

---

## Section 1: Airtable Base Setup

Tests to write BEFORE creating the base:

```
# Test: Insider_Alerts table accepts a record with all required fields populated
# Test: Insider_Alerts transaction_type single-select rejects values outside buy/sell/cluster
# Test: Monitor_State table has exactly two records (market / afterhours) after seeding
# Test: Monitor_State last_check_timestamp is readable and parseable as ISO datetime
# Test: dedup_key field is unique — Airtable formula filterByFormula({dedup_key}='X') returns at most 1 record
```

---

## Section 2: `sec-monitor.js` — Filing Discovery & Enrichment

### 2.0 Pre-load Dedup Keys + CIK Map

```
# Test: fetchDedupKeys() returns a Set of strings, not an array
# Test: fetchDedupKeys() with empty Airtable returns empty Set (no crash)
# Test: loadCikTickerMap() fetches SEC file and returns Map of CIK→ticker
# Test: loadCikTickerMap() correctly zero-pads CIK to 10 digits (CIK 320193 → '0000320193')
# Test: loadCikTickerMap() handles missing/malformed entries without crashing
```

### 2.1 SEC EDGAR JSON Fetch

```
# Test: buildEdgarUrl() includes narrow date range (startdt/enddt), count=40, sort=file_date:desc
# Test: buildEdgarUrl() does NOT include q=* (catches the overbroad query bug)
# Test: parseEdgarResponse() extracts entity_name, file_date, accession_number from hits.hits[]
# Test: parseEdgarResponse() returns empty array when hits.hits is empty (no new filings)
# Test: User-Agent header 'EarlyInsider.com (alerts@earlyinsider.com)' is present in all SEC requests
# Test: filings with file_date <= last_check_timestamp are filtered out
```

### 2.2 Financial Datasets Enrichment

```
# Test: enrichFiling() calls correct endpoint with ticker + filing_date_gte params
# Test: enrichFiling() extracts all required fields: name, title, is_board_director, transaction_date, transaction_shares, transaction_price_per_share, transaction_value, transaction_type, filing_date
# Test: enrichFiling() retries up to 3 times on 429/500 with exponential backoff
# Test: enrichFiling() returns null (not throws) after 3 failed retries, increments failureCount
# Test: 100ms delay is applied between consecutive Financial Datasets calls
```

### 2.3 Dedup Check

```
# Test: buildDedupKey() returns '{ticker}_{insider_name}_{transaction_date}_{shares}' format
# Test: filing with key present in existingDedupKeys Set is skipped (returns false)
# Test: filing with key absent from Set passes dedup check (returns true)
# Test: passing dedup check immediately adds key to Set (prevents same-run duplicates)
# Test: two filings with identical dedup key in same batch — only first is processed
```

### 2.4 Filter — Buys Only

```
# Test: transaction_type 'P - Purchase' passes filter
# Test: transaction_type 'S - Sale' is filtered out
# Test: transaction_type 'A - Grant' is filtered out
# Test: transaction_type 'D - Disposition' is filtered out
# Test: null or undefined transaction_type is filtered out
```

### 2.5 Insider Classification

```
# Test: title 'Chief Executive Officer' → 'C-Suite'
# Test: title 'CFO' → 'C-Suite'
# Test: title 'Board Director' → 'Board'
# Test: title 'Executive Vice President' → 'VP'
# Test: title 'Corporate Secretary' → 'Officer'
# Test: title '10% Owner' → '10% Owner'
# Test: is_board_director=true overrides ambiguous title to 'Board'
# Test: unrecognized title → 'Officer' (safe default, not crash)
# Test: classification is case-insensitive ('ceo' → 'C-Suite')
```

### 2.6 Cluster Detection

```
# Test: no prior buys in Supabase → cluster not detected, filing proceeds normally
# Test: 1 prior buy of same ticker by different insider → cluster detected, new cluster_id generated
# Test: 2 prior buys with existing cluster_id → current filing gets same cluster_id (not new UUID)
# Test: cluster detection excludes current insider_name (no self-cluster)
# Test: cluster detection only looks at last 7 days (not older buys)
# Test: existing records are updated with cluster_id + is_cluster_buy=true via UPDATE
# Test: UPDATE requires service_role (test that anon key fails this update)
```

---

## Section 3: `score-alert.js` — Significance Scoring

### 3.1 Insider Track Record

```
# Test: computeTrackRecord() with no historical Supabase data returns { past_buy_count: 0, hit_rate: null, avg_gain_30d: null }
# Test: computeTrackRecord() with 3 past buys, 2 gained >5% → hit_rate = 0.67
# Test: normalizeInsiderName() collapses 'John A. Smith' and 'John Smith' to same key
# Test: Yahoo Finance failure (network error) returns null track record without throwing
# Test: Yahoo Finance 429 returns null track record without throwing
```

### 3.2 Claude Haiku Scoring

```
# Test: Haiku prompt includes: ticker, insider_category, transaction_type, total_value, is_cluster_buy, track record
# Test: parseHaikuResponse() extracts score and reasoning from valid JSON
# Test: parseHaikuResponse() handles markdown-wrapped JSON (```json {...} ```)
# Test: parseHaikuResponse() handles smart quotes in JSON string
# Test: score is clamped to [1, 10] — score=11 becomes 10, score=0 becomes 1
# Test: score is integer — float 7.5 rounds to 8
# Test: if Haiku fails after 2 retries → defaults to { score: 5, reasoning: 'Scoring unavailable' }
```

---

## Section 4: `analyze-alert.js` — AI Analysis Generation

```
# Test: analyze() is NOT called when score < 4 (returns null without API call)
# Test: analyze() IS called when score >= 4
# Test: analyze() uses model 'claude-sonnet-4-6'
# Test: response with < 50 characters triggers one retry
# Test: response with only 1 paragraph triggers one retry
# Test: after failed retry → ai_analysis = null (no throw)
# Test: Sonnet prompt explicitly forbids generic phrases like 'insiders have information'
# Test: Sonnet prompt includes actual numbers (shares, price, total_value)
```

---

## Section 5: Write to Airtable + Supabase

### 5.1 Airtable Record

```
# Test: Airtable record includes all required fields including dedup_key, status='processed'
# Test: Airtable record includes score_reasoning from Haiku
# Test: Airtable record includes ai_analysis (may be null)
# Test: Airtable record stores raw_filing_data as JSON string
```

### 5.2 Supabase Insert

```
# Test: INSERT uses onConflict: 'dedup_key', ignoreDuplicates: true
# Test: duplicate insert (same dedup_key) returns gracefully, does not throw
# Test: returned supabase_id (UUID) is stored back in Airtable record
# Test: Realtime event fires on insert (integration test: subscribe, insert, assert event received)
```

### 5.3 Monitor_State Update

```
# Test: on all-success run → last_check_timestamp = approximately now()
# Test: on partial-failure run → last_check_timestamp = min(failed_filing.filing_date)
# Test: filing with retry_count > 3 → marked dead_letter, timestamp NOT held back for it
# Test: dead-letter filing triggers Telegram notification with filing details
# Test: last_run_status = 'error' when any filing fails
```

### 5.4 Cluster Alert Creation

```
# Test: 3 cluster members in one run → exactly 1 cluster summary record created
# Test: cluster summary has transaction_type = 'cluster'
# Test: cluster summary significance_score = min(10, max_individual_score + 3)
# Test: second run with 4th cluster member → existing summary is UPDATED (not new row created)
# Test: cluster summary update does NOT re-trigger W5 if score delta < 2
# Test: cluster summary update DOES re-trigger W5 if score increases >= 2
```

### 5.5 Error Counting

```
# Test: failureCount increments on each filing failure
# Test: failureCount <= 5 → no Telegram alert sent
# Test: failureCount > 5 → Telegram alert sent with workflow name + failure count + first error
```

---

## Section 6: `deliver-alert.js` — W5 Alert Delivery

### 6.1 Fetch Eligible Users

```
# Test: users with email_enabled=false are excluded
# Test: user with min_significance_score=7 receives alert with score=8 (7 <= 8)
# Test: user with min_significance_score=9 does NOT receive alert with score=8 (9 > 8)
# Test: user with watched_tickers=['AAPL'] receives alert for AAPL even if score=3 (below min)
# Test: Pro user gets full ai_analysis text
# Test: Free user gets first 150 chars of ai_analysis + upgrade CTA
# Test: error in getUserById does NOT log user.email (only logs user_id UUID)
```

### 6.2 Resend Email

```
# Test: each email object has exactly one recipient in 'to' field (not array of 100)
# Test: 250 recipients → Resend called 3 times with [100, 100, 50] items
# Test: 200ms delay between batch calls
# Test: email HTML includes unsubscribe link (/preferences?unsubscribe=1)
# Test: email HTML includes postal address in footer
# Test: regular alert subject matches '[INSIDER BUY] {name} ({title}) buys ${amount} of {ticker}'
# Test: cluster subject matches '🔥 CLUSTER BUY: {N} insiders buying {ticker}'
# Test: Resend failure does not block push notification delivery
```

### 6.3 OneSignal Push

```
# Test: filter uses tag alert_score_min <= alert_score
# Test: notification URL deep-links to /alerts#{supabase_alert_id}
# Test: push_sent count is extracted from OneSignal response.recipients field
# Test: OneSignal failure does not block email delivery
```

### 6.4 Delivery Tracking

```
# Test: on full success → Airtable status='delivered', emails_sent and push_sent populated
# Test: on email failure → status='delivery_failed', error_log contains error detail
# Test: on push failure → status='delivery_failed', error_log contains error detail
```

---

## Section 7: n8n Workflow Configuration

```
# Test (manual): W4-market cron fires every 15 min during NYSE hours — verify in n8n execution log
# Test (manual): W4-afterhours cron fires every 60 min
# Test: afterhours market-hours guard exits at 10:00 EST on Monday (market hours)
# Test: afterhours market-hours guard proceeds at 20:00 EST on Monday (afterhours)
# Test: afterhours market-hours guard proceeds at 10:00 EST on Saturday (weekend)
# Test: afterhours guard uses Intl.DateTimeFormat('America/New_York') — no manual DST math
# Test (manual): n8n "Wait for previous execution" is enabled — two simultaneous executions don't occur
# Test: all required env vars are present (ANTHROPIC_API_KEY, FINANCIAL_DATASETS_API_KEY, etc.) — fail fast at startup if missing
```

---

## Section 8: Frontend — Subscription-Aware Blur

```
# Test: isPro=true → ai_analysis rendered WITHOUT blur class
# Test: isPro=false → ai_analysis rendered WITH blur-[4px] select-none class
# Test: unauthenticated user → treated as Free (blur applied)
# Test: isPro=false → "Upgrade to Pro" CTA button is visible
# Test: isPro=true → "Upgrade to Pro" CTA button is NOT rendered
# Test: profiles query failure → gracefully falls back to isPro=false (blur everything)
# Test (integration): Supabase Realtime — new alert inserted in Supabase appears on /alerts page within 3 seconds
```

---

## Section 9: Frontend — OneSignal User Tagging

```
# Test: OneSignal.login() is called with session.user.id after auth session loads
# Test: OneSignal.login() is called again on auth state change (re-login with new user)
# Test: alert_score_min tag value is a number (not a string) in OneSignal.User.addTag call
# Test: plan tag is 'free' or 'pro' matching profiles.subscription_tier
# Test: tags are set on preference save (not only on login)
# Test: OneSignal.login() is NOT called when user is logged out (no session)
```

---

## Integration Test: End-to-End

```
# Test (integration): trigger W4 manually with AAPL (known recent Form 4 activity)
#   → EDGAR JSON returns >= 1 Form 4 hit
#   → Financial Datasets enriches it correctly
#   → Airtable record created with all fields populated
#   → Supabase row inserted and visible in DB
#   → /alerts page receives Realtime event within 5 seconds
#   → If score >= 6: W5 triggers, test email received at designated test address

# Test (integration): send test push notification via OneSignal REST API
#   → browser receives push on test device
#   → notification URL contains correct supabase_alert_id

# Test (manual spot-check): run W4 for one market session
#   → verify score distribution (not all 5s)
#   → verify C-Suite trades score higher than Officer trades
#   → verify AI analysis paragraphs reference actual filing numbers
```
