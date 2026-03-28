# Implementation Plan — 04 SEC Alerts System (W4 + W5)

## Background & Context

EarlyInsider.com is a financial SaaS that sells real-time insider trading alerts. When a company executive (CEO, CFO, board member, etc.) buys stock in their own company, they must file a Form 4 with the SEC within 2 business days. This data is public and available seconds after filing. Our value proposition: catch these filings immediately, score their significance with AI, and deliver personalized alerts to subscribers.

The system has two n8n workflows:
- **W4 (SEC Filing Monitor)**: continuously polls for new Form 4 filings, enriches them, scores them with Claude, and writes to both Airtable and Supabase
- **W5 (Alert Delivery)**: triggered by W4, sends email via Resend and push notifications via OneSignal to eligible users based on their preferences

The web app at earlyinsider.com (Next.js + Supabase) already has a `/alerts` page that displays alerts in real-time via Supabase Realtime subscriptions, and an existing OneSignal integration via the `react-onesignal` package.

## Architecture

### Data Sources
- **Primary discovery**: SEC EDGAR JSON search API (`https://efts.sec.gov/LATEST/search-index?q=*&forms=4&dateRange=custom&...`) — free, no key, updates within 1 minute of filing. Returns structured JSON, no XML parsing needed.
- **CIK-to-ticker mapping**: EDGAR company tickers file (`https://www.sec.gov/files/company_tickers.json`) — downloadable JSON of ~10,000 public companies with CIK + ticker. Download and cache once at workflow startup.
- **Enrichment**: Financial Datasets API (`/insider-trades?ticker=X`) — structured data (names, shares, prices)
- **Historical prices for track record**: Yahoo Finance public API — no key required. If Yahoo fails or returns errors, skip track record (set `hit_rate = null`); scoring proceeds without it.

### Persistence
- **Airtable InsiderBuying.ai base**: workflow state, dedup source of truth, delivery tracking, audit trail
- **Supabase `insider_alerts` table**: live read for the web app, Realtime-enabled, RLS-protected

### n8n Code Files (4 files, matching the existing convention in `n8n/code/`)
```
n8n/code/insiderbuying/
  sec-monitor.js    — EDGAR fetch, enrichment, dedup, buy-filter, classify, cluster detection
  score-alert.js    — Significance scoring (Claude Haiku + insider track record)
  analyze-alert.js  — AI analysis prose generation (Claude Sonnet 4.6)
  deliver-alert.js  — W5: email (Resend) + push (OneSignal) + delivery tracking
```

### Two n8n Workflows
- **W4-market**: Schedule trigger every 15 min, active Mon-Fri 09:30-16:00 EST. Calls sec-monitor.js → score-alert.js → analyze-alert.js → (if score >= 6) deliver-alert.js
- **W4-afterhours**: Schedule trigger every 60 min, always active. Same node chain. Adds an early-exit check at the top: if current time is Mon-Fri 09:30-16:00 EST, stop immediately (defers to W4-market). This prevents overlap and eliminates the dedup race condition.

### Key Design Decisions

**Why EDGAR JSON search instead of Atom/RSS?** The EDGAR JSON search endpoint returns structured data directly — CIK, company name, filing date, filing URL — without requiring XML parsing. The `xml2js` package is a third-party library not guaranteed to be available in the n8n Code node sandbox. Using the JSON endpoint avoids this entirely and simplifies the parser.

**Why pre-load dedup keys?** Per-filing Airtable lookups (one `filterByFormula` call per filing) for 40 filings = 40 sequential API calls = 8-20 seconds of latency. Instead, fetch all `dedup_key` values from the past 7 days into a Set once at run start. All dedup checks are then in-memory O(1) lookups. This is the existing pattern in `auto-produce.js`.

**Why write to both Airtable and Supabase?** Airtable provides human-readable audit trail, dedup source of truth, and delivery status tracking (the ops interface). Supabase serves the web app's real-time feed and user preference queries. They have different roles.

**Why store full ai_analysis for all users?** The frontend handles the blur presentation logic, not W4. W4 always saves the complete analysis. This keeps the workflow simple and allows upgrading users to immediately see full content without reprocessing.

---

## Section 0: Supabase Schema Migration

The existing `insider_alerts` table (defined in `supabase/migrations/20260326000000_insiderbuying_schema.sql`) is missing required fields and has an incorrect CHECK constraint. This section must be completed before W4 or W5 can run.

### New Migration File

Create `supabase/migrations/20260327000001_insider_alerts_v2.sql`:

```sql
-- Add missing columns to insider_alerts
ALTER TABLE public.insider_alerts
  ADD COLUMN IF NOT EXISTS transaction_date DATE,
  ADD COLUMN IF NOT EXISTS dedup_key TEXT,
  ADD COLUMN IF NOT EXISTS insider_category TEXT,
  ADD COLUMN IF NOT EXISTS score_reasoning TEXT,
  ADD COLUMN IF NOT EXISTS cluster_id UUID,
  ADD COLUMN IF NOT EXISTS is_cluster_buy BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS cluster_size INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS emails_sent INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS push_sent INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_log TEXT;

-- Unique index on dedup_key for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_insider_alerts_dedup
  ON public.insider_alerts(dedup_key)
  WHERE dedup_key IS NOT NULL;

-- Fix transaction_type CHECK constraint to include 'cluster'
ALTER TABLE public.insider_alerts
  DROP CONSTRAINT IF EXISTS insider_alerts_transaction_type_check;
ALTER TABLE public.insider_alerts
  ADD CONSTRAINT insider_alerts_transaction_type_check
  CHECK (transaction_type IN ('buy', 'sell', 'cluster'));

-- Add service_role UPDATE policy (needed for cluster detection)
CREATE POLICY "service_role can update insider_alerts"
  ON public.insider_alerts
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);
```

### Schema Dependency

W4 sec-monitor.js writes `dedup_key`, `insider_category`, `transaction_date`, and `cluster_size`. W5 deliver-alert.js writes `status`, `emails_sent`, `push_sent`, `delivered_at`, `error_log`. Cluster detection requires the UPDATE policy to set `cluster_id` on existing records. None of these work without this migration.

---

## Section 1: Airtable Base Setup

Create a new Airtable base named "InsiderBuying.ai" with two tables.

### Insider_Alerts Table

The primary table with one record per Form 4 filing processed. Key fields:

- `dedup_key` (text, unique index) — composite key `{ticker}_{insider_name}_{transaction_date}_{shares}`, used for idempotent processing
- `ticker`, `company_name`, `insider_name`, `insider_title`, `insider_category` — filing metadata
- `transaction_type` (single select: buy/sell/cluster) — processed type, not raw API string
- `shares`, `price_per_share`, `total_value`, `transaction_date`, `filing_date` — trade details
- `significance_score` (number 1-10), `score_reasoning` (text) — Haiku output
- `ai_analysis` (long text) — Sonnet output (full, unredacted)
- `cluster_id` (text), `is_cluster_buy` (boolean), `cluster_size` (number) — cluster metadata
- `raw_filing_data` (long text, JSON) — full Financial Datasets API response for debugging
- `supabase_id` (text) — UUID from Supabase insert (for cross-referencing)
- `status` (single select: new/processing/processed/delivered/delivery_failed/failed)
- `emails_sent`, `push_sent` (numbers) — delivery counts
- `delivered_at` (datetime), `error_log` (long text) — tracking

### Monitor_State Table

A single record per workflow (market/afterhours) that stores the last successful check timestamp. When W4 runs, it reads `last_check_timestamp`, uses it as the lower bound for filing discovery, and updates it after a successful run. This prevents re-processing filings between runs.

Fields: `name` (text, the key), `last_check_timestamp` (datetime), `last_run_status`, `last_run_filings_found`, `last_run_error`.

---

## Section 2: `sec-monitor.js` — Filing Discovery & Enrichment

This is the core data acquisition node. It orchestrates six sequential sub-tasks: pre-load dedup keys, fetch new filings from SEC EDGAR, enrich with Financial Datasets, filter buys-only, classify the insider, and detect cluster buys.

### 2.0 Startup: Pre-load Dedup Keys + CIK Ticker Map

At the very start of the Code node, before any filing processing, perform two pre-load operations:

**Pre-load dedup keys**: Query Airtable Insider_Alerts for all `dedup_key` values from the past 7 days. Load them into a JavaScript `Set`. All dedup checks in step 2.3 are then O(1) in-memory lookups — no per-filing API calls.

```javascript
// Fetch all dedup keys from last 7 days
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
const dedupRecords = await airtableSearch(INSIDER_ALERTS_TABLE, {
  filterByFormula: `IS_AFTER({created_at}, '${sevenDaysAgo}')`,
  fields: ['dedup_key']
});
const existingDedupKeys = new Set(dedupRecords.map(r => r.fields.dedup_key).filter(Boolean));
```

**Pre-load CIK-to-ticker map**: Fetch `https://www.sec.gov/files/company_tickers.json`. This file contains ~10,000 companies in format `{ "0": { "cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc." }, ... }`. Build a lookup Map: `CIK (zero-padded to 10 digits) → ticker`. Re-fetch on every run — the file is ~200KB and fast to download. Do NOT cache it across runs: companies change tickers roughly once a month, and a stale cache will send alerts with wrong ticker symbols.

### 2.1 SEC EDGAR JSON Fetch

Use the EDGAR full-text search JSON endpoint with a narrow date-range query:
```
GET https://efts.sec.gov/LATEST/search-index?q=%22form+4%22&forms=4&dateRange=custom&startdt={last_check_date}&enddt={today}&start=0&count=40&sort=file_date:desc
```

Do NOT use `q=*` (returns all Form 4s ever filed, triggers heavy pagination, and hits SEC's 60 req/min IP throttle). The narrow date range + `count=40` ensures only recent filings are fetched.

**Mandatory `User-Agent` header**: SEC EDGAR requires a contact identifier or they progressively 429/403 the IP:
```
User-Agent: EarlyInsider.com (alerts@earlyinsider.com)
```

The response has a `hits.hits[]` array. Each hit contains:
- `_source.entity_name` — company name
- `_source.file_date` — actual submission date
- `_id` — EDGAR accession number (encodes CIK)

Extract the CIK from the accession number or from the `_source` fields. Use the pre-loaded CIK-to-ticker map to resolve ticker. Filter hits where `file_date > last_check_timestamp`.

No XML parsing required. No `xml2js` dependency.

### 2.2 Financial Datasets Enrichment

For each new filing discovered, call Financial Datasets:
```
GET /insider-trades?ticker={ticker}&filing_date_gte={filing_date}&limit=10
Header: X-API-KEY: {FINANCIAL_DATASETS_API_KEY}
```

Match the response entry to the specific filing by comparing `name` + `filing_date`. Extract structured fields: `name`, `title`, `is_board_director`, `transaction_date`, `transaction_shares`, `transaction_price_per_share`, `transaction_value`, `transaction_type`, `filing_date`.

Add a deliberate 100ms delay between Financial Datasets calls (to avoid hitting rate limits with 40 filings). This keeps the total enrichment time within the n8n Code node's 60-second timeout even at maximum batch size.

If Financial Datasets doesn't have the ticker (smaller companies may be missing), fall back to parsing the EDGAR filing XML directly for the basic trade data. The EDGAR filing URL leads to an XBRL/XML file with standardized fields.

Apply retry logic (3 attempts, exponential backoff: 1s, 3s, 9s) for transient API errors. If all retries fail, log to Airtable with `status='failed'` and increment the per-run failure counter.

### 2.3 Dedup Check

For each enriched filing, build the dedup key: `{ticker}_{insider_name}_{transaction_date}_{transaction_shares}`. Check against the pre-loaded `existingDedupKeys` Set (from step 2.0). If the key exists in the Set, skip this filing entirely. No Airtable API call required.

**Critical**: immediately after passing the dedup check, add the new key to the Set before continuing:
```javascript
existingDedupKeys.add(dedupKey);
```
This prevents a second filing for the same insider (filed within the same minute, both appearing in the same 40-entry batch) from slipping through as a duplicate.

### 2.4 Filter — Buys Only

After dedup check, filter on `transaction_type`. Only continue processing if `transaction_type === 'P - Purchase'`. Skip all other types:
- `'S - Sale'` — insider sales
- `'A - Grant'` — option/stock grants (compensation, not market conviction)
- `'D - Disposition'` — stock dispositions
- Any other type not explicitly `'P - Purchase'`

This is an MVP decision. Future versions can process and alert on other types separately.

### 2.5 Insider Classification

Map the `title` string to one of five categories using keyword matching (case-insensitive):
- **C-Suite**: title contains any of: CEO, CFO, COO, CTO, Chief, President
- **Board**: Director, Board Member, Chairman, Chairwoman
- **VP**: Vice President, SVP, EVP, Senior Vice President
- **Officer**: Treasurer, Secretary, Controller, General Counsel
- **10% Owner**: "10 percent", "10%", "beneficial owner" combined with ownership percentage indicators

`is_board_director` from the API response can supplement this. The category is stored in Airtable and passed to the scoring step.

### 2.6 Cluster Detection

Before scoring, query Supabase for other insider buys of the same ticker in the past 7 days (excluding the current insider). The query targets the `insider_alerts` table using the service role key (bypasses RLS).

If 1 or more other records exist:
- Collect all matching `cluster_id` values
- If any have a `cluster_id`: use the existing UUID for all
- If none have a `cluster_id`: generate a new UUID v4 as the `cluster_id`
- Update all existing records in Supabase to set `cluster_id` and `is_cluster_buy = true` (requires the UPDATE policy from Section 0)
- Set `is_cluster_buy = true` on the current filing being processed
- Record `cluster_size` = total number of insiders in the cluster

After the current filing is saved (step 5), create a synthetic "cluster summary" record as a new alert (see Cluster Alert section in the spec).

The cluster detection output is passed as metadata to `score-alert.js`.

**Note on race condition**: Write each filing to Supabase immediately after processing (per Section 5 — not in a batch at the end). This ensures that when the second filing of a cluster is processed, it can see the first filing already in Supabase.

---

## Section 3: `score-alert.js` — Significance Scoring

This node calculates a 1-10 significance score for each filing using Claude Haiku for speed and cost efficiency (~$0.001 per call).

### 3.1 Insider Track Record (pre-scoring step)

Before calling Claude, compute the insider's historical track record using data we already have:

**From Supabase** (historical insider_alerts): Query all past buys by the same `insider_name` from the past 24 months. For each past buy, record the `ticker`, `filing_date`, and `total_value`.

**From Yahoo Finance** (price history): For each past buy, fetch the stock price at `filing_date` and at `filing_date + 30 days`. Yahoo Finance provides a public endpoint at `https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=1mo` (no API key required, just add `User-Agent: Mozilla/5.0` header to avoid 429). Calculate the 30-day return for each past trade.

**Computed metrics**:
- `past_buy_count`: total insider buys in Supabase data
- `hit_rate`: percentage of past buys where 30-day return > 5%
- `avg_gain_30d`: average 30-day return across all past buys

If Yahoo Finance fails (429, connection error, changed endpoint) or no historical data exists: set `past_buy_count = 0`, `hit_rate = null`, `avg_gain_30d = null`. Scoring proceeds with `hit_rate = null` treated as neutral — Haiku's prompt instructs it to ignore track record when null. The Yahoo Finance fallback is acceptable at MVP volumes (~600 calls/month). Monitor for breakage and document the alternative (Alpha Vantage free tier) as V2 if Yahoo becomes unreliable.

### 3.2 Claude Haiku Scoring Call

Call the Anthropic API with `claude-haiku-4-5-20251001`. The prompt instructs Haiku to return a JSON object:
```json
{ "score": 7, "reasoning": "Short explanation of score." }
```

The input context includes all filing metadata plus the track record, cluster info, and insider category. The prompt explicitly defines the scoring criteria:

1. **Role weight**: C-Suite (+3), Board (+2), VP (+1)
2. **Transaction size**: relative to this insider's typical trade size
3. **Track record**: high hit_rate and avg_gain boost score; null = neutral
4. **Cluster bonus**: `+3` if `is_cluster_buy = true` (already factored in by Haiku or applied post-call)
5. **Timing signals**: large purchase close to earnings, unusual purchase (first in 2+ years), purchase after significant price drop
6. **Transaction type**: open-market purchase scores higher than option exercise or automatic 10b5-1 plan

Parse the response JSON with the existing `repairJson()` pattern from the codebase (strip markdown fences, fix smart quotes, extract object bounds). Validate: `score` is integer 1-10, `reasoning` is non-empty string.

### 3.3 Error Handling

If Haiku call fails after 2 retries: default `score = 5` with `reasoning = "Scoring unavailable"`. This ensures the filing is still processed and saved; the analysis step (section 4) will skip it if score < 4 using the default.

---

## Section 4: `analyze-alert.js` — AI Analysis Generation

This node generates the human-readable analysis that appears on the alerts feed. It only runs for filings where `significance_score >= 4`, skipping obvious noise (routine executive option grants, small routine sales, etc.).

**Model**: `claude-sonnet-4-6` (~$0.02/call).

The prompt instructs Sonnet to write 2-3 paragraphs covering:
1. What this trade signals — why would an insider make this specific trade now? What context explains it?
2. Historical context — this insider's track record, how this trade compares to their typical behavior
3. Risk factors — why this trade might be less meaningful than it appears (scheduled 10b5-1 plan, routine compensation, sector headwinds)

The analysis is written for a retail investor who understands basic market concepts but isn't a professional analyst. The tone is informative, not alarmist.

**Critical instruction in prompt**: Do not use generic phrases like "this is significant because insiders have information". Be specific. Reference the actual numbers (share count, price, total value). Name the insider's role. Reference their past trades if any. Mention the specific company's situation if relevant from context.

Parse the text response (no JSON wrapping needed — pure prose). Validate that the response is > 50 characters and contains 2+ paragraphs. If validation fails: one retry. If still fails: store `ai_analysis = null` (the frontend handles null gracefully — shows "Analysis unavailable").

---

## Section 5: Write to Airtable + Supabase

**Critical design**: Write each filing individually as it completes processing — NOT in a batch at the end of the run. This is required for cluster detection to work: when filing B of a cluster is processed, it must be able to see filing A already in Supabase. Batch-at-end would prevent this.

### 5.1 Create Airtable Record

Create the Insider_Alerts record with all fields populated: filing metadata, score, reasoning, analysis, cluster data, dedup_key, status='processed'. Store the returned Airtable record ID.

### 5.2 Insert into Supabase

Insert into `public.insider_alerts` using the Supabase REST API with the service role key (bypasses RLS, INSERT policy already allows service_role). Use `ON CONFLICT (dedup_key) DO NOTHING` to make the insert idempotent — a duplicate insert returns gracefully instead of aborting the Code node:
```javascript
supabase.from('insider_alerts').insert(record, { onConflict: 'dedup_key', ignoreDuplicates: true })
```
Store the returned UUID as `supabase_id`.

The Supabase insert triggers Realtime subscriptions automatically — no additional code needed. The `/alerts` page will receive the new alert within milliseconds of insert.

Update the Airtable record with the `supabase_id` for cross-referencing.

### 5.3 Update Monitor_State

After processing each filing (not at the end of the run), track which filings succeeded and which failed. After all filings in the run are processed:

- If **all succeeded**: PATCH Monitor_State with `last_check_timestamp = now()`.
- If **some failed**: PATCH Monitor_State with `last_check_timestamp = min(failed_filing.filing_date)`. This ensures failed filings are retried on the next run.
- Set `last_run_status = 'error'` and `last_run_error` with failure details whenever any filing failed.

**Dead-letter pattern** (prevents infinite retry loops): Before retrying a failed filing, increment `retry_count` in Airtable. If `retry_count > 3`, mark `status = 'dead_letter'` and do NOT roll back `last_check_timestamp` for this filing — let the timestamp advance past it. Send a Telegram alert with the dead-lettered filing's details for manual review. A filing goes dead-letter when it has malformed SEC data, a ticker that Financial Datasets doesn't recognize, or a Claude refusal — conditions that won't resolve themselves on retry.

### 5.4 Cluster Alert Creation (if cluster detected)

If any filings in the current run are part of a cluster, create cluster summary records at the **end of the run** — after all individual filings are processed. Do NOT create a summary after each individual filing.

Logic at end of run:
1. Group all processed filings by `cluster_id` (include only those with a `cluster_id` assigned in this run)
2. For each unique `cluster_id`, check if a cluster summary record already exists in Airtable (with `transaction_type = 'cluster'` and the same `cluster_id`)
3. If no summary exists yet: create one with `transaction_type = 'cluster'`, `insider_name = "X Insiders"`, a composite `ai_analysis` summarizing all cluster members, and `significance_score = min(10, max_individual_score + 3)`. Trigger W5 for this summary.
4. If a summary already exists (cluster grew from a previous run): UPDATE the existing summary record with the new cluster size and updated analysis. Do NOT create a duplicate. Do NOT re-trigger W5 unless the score increased significantly (>= 2 points).

This ensures exactly one cluster alert per cluster per run, regardless of how many cluster members are processed.

### 5.5 Error Counting & Telegram Alert

The Code node tracks a `failureCount` variable across all filings in a single run. If `failureCount > 5`, send a Telegram message to the designated monitoring chat (using the existing bot infrastructure from the content pipeline) with: workflow name, number of failures, first error message.

---

## Section 6: `deliver-alert.js` — W5 Alert Delivery

This node is triggered by W4 (via HTTP call or n8n sub-workflow) when `significance_score >= 6`. It handles email delivery via Resend and push notification via OneSignal.

### 6.1 Fetch Eligible Users (Supabase)

Query using the Supabase service role key. The correct approach for accessing user emails is to use the Supabase Admin API (which can access `auth.users`) rather than a direct SQL JOIN (since `auth.users` is in a different schema from `public`):

1. Query `public.user_alert_preferences` filtered by `email_enabled = true` AND (`min_significance_score <= alert_score` OR `ticker = ANY(watched_tickers)`) — this returns eligible `user_id` values.
2. Query `public.profiles` by those `user_id` values — this returns `subscription_tier`.
3. For each eligible `user_id`, fetch email using `supabase.auth.admin.getUserById(userId)` — this returns `user.email`.

**Log safety**: Admin SDK calls that fail must NOT log the full user object or `user.email` in the catch block — n8n execution logs are plain-text and accessible from the n8n UI. Log only the `user_id` (UUID) in error messages, never the email address.

Alternatively, create a Supabase database view that joins `auth.users` with `profiles` and `user_alert_preferences` — the service role can query the view without needing the admin SDK. The view approach is simpler in n8n Code nodes (single REST call vs. multiple admin API calls).

For Pro email content: full `ai_analysis` text.
For Free email content: first 150 characters of `ai_analysis` + `"... [upgrade to Pro to read full analysis]"`.

### 6.2 Build Email Batch (Resend)

Construct an array of email objects. Each object has: `from`, `to`, `subject`, `html`. The subject line format:
- Regular alert: `[INSIDER BUY] {insider_name} ({insider_title}) buys ${formatMoney(total_value)} of {ticker}`
- Cluster alert: `🔥 CLUSTER BUY: {cluster_size} insiders buying {ticker}`

The HTML email template includes: filing metadata table, significance score badge, AI analysis section (full for Pro, truncated + CTA for Free). No external template engine — build HTML string in the Code node.

Chunk the recipients array into batches of 100. Send each batch to `POST /emails/batch` on Resend. Wait 200ms between batches to respect the 5 req/sec rate limit. Track total `emails_sent` count from the response.

**Budget note**: Resend free tier is 100 emails/day and 3,000/month. This is sufficient for < 10 users getting < 10 alerts/day. At 50 users × 10 alerts/day = 500 emails/day — the free tier is immediately exhausted. Budget for Resend Pro ($20/month) from launch if expecting any meaningful user base.

**CAN-SPAM compliance**: Every email must include (or Resend will suspend the account):
- An unsubscribe link pointing to `/preferences?unsubscribe=1`
- A physical postal address (use the company address) in the footer

Add both to the HTML template footer. Without these, Resend's compliance checks will block delivery.

### 6.3 Push Notification (OneSignal)

Send one push notification covering all eligible subscribers. Use OneSignal's filter-based targeting: users with tag `alert_score_min` <= the current alert's score. The OneSignal REST API handles the fan-out to individual subscribers.

The notification body: `{ticker}: {insider_title} {transaction_type_label} ${formatMoney(total_value)}`. The notification URL deep-links to `/alerts#{supabase_alert_id}`.

For cluster alerts, heading includes "CLUSTER" in bold. Track `push_sent` count from OneSignal API response (`recipients` field in the response).

### 6.4 Delivery Tracking

After both email and push complete (or fail), PATCH the Airtable Insider_Alerts record with `status = 'delivered'`, `delivered_at`, `emails_sent`, `push_sent`. If either channel failed: `status = 'delivery_failed'`, include error detail in `error_log`.

---

## Section 7: n8n Workflow Configuration

### W4-market Workflow

Schedule trigger: every 15 minutes. Cron expression: `*/15 * * * *`.

This workflow runs exclusively during NYSE market hours. To enforce this, use the cron schedule itself or add an IF node immediately after the trigger that checks the current time in EST (UTC-5 in winter, UTC-4 in summer). If outside Mon-Fri 09:30-16:00 EST: stop execution.

### W4-afterhours Workflow

Schedule trigger: every 60 minutes. Cron expression: `0 * * * *`. In n8n workflow settings, enable **"Wait for previous execution to finish"** — this prevents two simultaneous afterhours runs if one takes longer than 60 minutes.

This workflow adds an explicit market-hours guard at the very start of `sec-monitor.js` (or as the first IF node after the trigger): check current time in EST. If the current time is Mon-Fri between 09:30 and 16:00 EST, **return early immediately** (exit the workflow). This prevents W4-afterhours and W4-market from running simultaneously and eliminates the dedup race condition between the two workflows entirely.

The guard logic — use `Intl.DateTimeFormat` (native, handles DST automatically, no manual offset math):
```javascript
const now = new Date();
const estParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric', minute: 'numeric', weekday: 'short', hour12: false
}).formatToParts(now);

const parts = Object.fromEntries(estParts.map(p => [p.type, p.value]));
const estHour = parseInt(parts.hour);
const estMinute = parseInt(parts.minute);
const isWeekday = !['Sat', 'Sun'].includes(parts.weekday);

const isMarketHours = isWeekday &&
  (estHour > 9 || (estHour === 9 && estMinute >= 30)) && estHour < 16;

if (isMarketHours) return []; // exit — W4-market handles this
```
Do NOT use `isDST()` — it does not exist in JavaScript. `America/New_York` handles EST/EDT transitions automatically.

### Node Chain (both workflows)

```
Schedule Trigger
  → sec-monitor.js (Code node)
  → score-alert.js (Code node)
  → analyze-alert.js (Code node)
  → IF: significance_score >= 6
      → deliver-alert.js (Code node)
```

Each Code node receives the previous node's output via `$input.first().json` and passes enriched data forward. If `sec-monitor.js` returns an empty array (no new filings), all downstream nodes naturally stop.

### Environment Variables (add to n8n VPS docker-compose.yml)

The following env vars need to be added or verified in the n8n Docker environment:
- `ANTHROPIC_API_KEY` — Claude API key
- `FINANCIAL_DATASETS_API_KEY` — Financial Datasets API key
- `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` — Supabase project credentials
- `AIRTABLE_INSIDERBUYING_BASE_ID` — new Airtable base ID (different from ToxicOrNah base)
- `RESEND_API_KEY` — already may exist; verify
- `ONESIGNAL_APP_ID` and `ONESIGNAL_REST_API_KEY` — from OneSignal dashboard
- `TELEGRAM_ALERT_CHAT_ID` — chat ID for error notifications

All access in Code nodes follows the existing pattern: `(typeof $env !== 'undefined' && $env.VAR_NAME) || ''`.

---

## Section 8: Frontend — Subscription-Aware Blur Logic

The `/alerts` page currently applies CSS blur to all users. This section adds subscription tier awareness so Pro users see the full AI analysis.

### Required Change

In the alerts page's `useEffect` hook (alongside the Supabase data fetch), add a second query to `profiles` table to check `subscription_tier`. Store this as `isPro` boolean in component state.

In the render logic for each alert card's AI analysis section: conditionally apply the `blur-[4px] select-none` CSS class only when `!isPro`. The "Upgrade to Pro" CTA button also only renders when `!isPro`.

For unauthenticated users: treat as Free (blur everything, show signup CTA instead of upgrade CTA).

The blur should NOT prevent seeing the text in developer tools (this is intentional per the spec — the FOMO effect requires the content to be technically present but visually obscured).

The `/alerts` page also needs an explicit auth check: if the user is not authenticated, the Supabase data query should still work (Realtime is read-only and public per existing RLS), but the upgrade CTA flow requires auth.

---

## Section 9: Frontend — OneSignal User Tagging

For push notification targeting to work, each user must be tagged in OneSignal with their preferences when they set or update them.

### Where to Implement

The existing `OneSignalInit` component (`src/components/OneSignalInit.tsx`) loads the SDK globally but does NOT call `OneSignal.login()` to link the push subscriber to the Supabase user.

**Step 1 — Link subscriber to user**: Call `OneSignal.login(supabase_user_id)` to associate the browser's push subscription with our Supabase user ID. This must happen after authentication. The cleanest approach: add a `useEffect` to `OneSignalInit.tsx` that depends on the Supabase auth session — when the session changes and a user is present, call `OneSignal.login(session.user.id)`. This runs automatically on page load for already-authenticated users and on sign-in.

```typescript
// In OneSignalInit.tsx, after OneSignal.init():
useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.user?.id) {
      OneSignal.login(session.user.id);
    }
  });

  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (session?.user?.id) {
      OneSignal.login(session.user.id);
    }
  });
  return () => subscription.unsubscribe();
}, []);
```

**Step 2 — Set preference tags**: When the user sets or updates their alert preferences (in the preference save handler or `/api/alerts/subscribe` route), call:

```typescript
OneSignal.User.addTag("plan", profile.subscription_tier); // "free" or "pro"
OneSignal.User.addTag("alert_score_min", prefs.min_significance_score); // number, not String()
```

These tags are what W5's OneSignal filter query uses. **Critical**: send `alert_score_min` as a **number** (not `String()`). If stored as a string, `"10" <= "6"` evaluates true in lexicographic comparison, sending alerts to users who opted for higher thresholds. Verify in the OneSignal dashboard that the tag displays as a number type after first sync.

### Service Worker Verification

Verify that `OneSignalSDKWorker.js` is present in the `/public` directory of the Next.js project. If not present, download from OneSignal dashboard. The middleware already excludes this file from auth redirect (confirmed in code), so no middleware changes needed.

---

## Testing Strategy

### Unit Testing (offline)

- **Dedup logic**: given a list of 10 filings with 3 matching keys already in the pre-loaded Set, verify only 7 are processed (no Airtable calls in hot path)
- **Buy filter**: given 10 filings with mix of `P - Purchase`, `S - Sale`, `A - Grant` types, verify only Purchase types proceed
- **Insider classification**: given 20 title strings, verify correct category assignment for each
- **Cluster detection**: given a Supabase mock with 2 prior buys of AAPL by different insiders, verify cluster_id is assigned to all 3 records
- **Score parsing**: given Haiku responses with various formats (valid JSON, markdown-wrapped, smart quotes), verify `repairJson()` correctly extracts score
- **Email batch chunking**: given 250 recipients, verify Resend is called 3 times with batches of [100, 100, 50]
- **Market hours guard**: given various UTC timestamps, verify the afterhours guard correctly exits during 09:30-16:00 EST Mon-Fri and continues outside those hours

### Integration Testing (with real API keys)

- Run W4 manually with a known ticker (e.g., AAPL) that had recent Form 4 activity. Verify:
  - EDGAR JSON endpoint returns filings
  - Financial Datasets enriches correctly
  - Airtable record is created with correct fields (including new fields from Section 0 migration)
  - Supabase row appears and triggers Realtime (check browser console on /alerts page)
- Send a test alert to a single email address to verify Resend template renders correctly
- Send a test push to verify OneSignal delivery works end-to-end
- Verify `OneSignal.login()` links correctly: check OneSignal dashboard for external_id mapping after login

### Manual Spot-Check

Run W4 for one market session day (6.5 hours). Review the 20-50 filings processed:
- Verify significance scores are distributed reasonably (not all 5s)
- Verify C-Suite trades score higher than routine officer trades
- Verify AI analysis paragraphs are specific to the actual filing (not generic)
- Verify cluster alerts are generated when multiple insiders buy same stock

### Acceptance Criteria Verification

All 17 acceptance criteria from the spec are testable. Test each criterion after implementation with a real or simulated filing.

---

## Implementation Order

This plan has one clear dependency: the Supabase migration (Section 0) and the Airtable base (Section 1) and environment variables must exist before any Code node can run. The n8n Code nodes can be developed and tested in parallel after that.

Recommended order:
1. Supabase schema migration (Section 0) — blocker for everything else
2. Airtable base creation + env var setup (Section 1 + Section 7 env vars)
3. `sec-monitor.js` — data ingestion (Section 2)
4. `score-alert.js` — scoring (Section 3)
5. `analyze-alert.js` — analysis (Section 4)
6. Write to Airtable + Supabase per-filing (Section 5)
7. `deliver-alert.js` — delivery (Section 6)
8. n8n Workflow wiring + scheduling (Section 7)
9. Frontend blur logic (Section 8)
10. Frontend OneSignal tagging + login (Section 9)
11. End-to-end integration test

---

## Cost Model (Monthly)

| Item | Volume | Cost |
|---|---|---|
| Claude Haiku scoring | ~1,500 calls | ~$1.50 |
| Claude Sonnet analysis | ~600 calls (score >= 4) | ~$12 |
| **Total Claude** | | **~$13.50/mo** |
| Financial Datasets API | ~1,500 enrichment calls | Depends on plan |
| Yahoo Finance price check | ~600 calls | $0 (public API) |
| SEC EDGAR JSON | Unlimited | $0 |
| Resend emails | ~500/mo at launch | $0 (free tier, < 10 users) |
| Resend Pro | Required at any meaningful scale | $20/mo |
| OneSignal push | < 10k subscribers | $0 (free tier) |
| **Total (excl. Financial Datasets, < 10 users)** | | **~$13.50/mo** |
| **Total (excl. Financial Datasets, 50+ users)** | | **~$33.50/mo** |
