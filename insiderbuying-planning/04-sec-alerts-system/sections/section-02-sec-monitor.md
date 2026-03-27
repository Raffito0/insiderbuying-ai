# Section 02 — `sec-monitor.js`: Filing Discovery & Enrichment

## Overview

This section implements the core data acquisition node for the SEC alerts system. It lives at:

```
n8n/code/insiderbuying/sec-monitor.js
```

This is the first Code node in the W4-market and W4-afterhours n8n workflows. It runs as a single Code node execution and must complete within n8n's 60-second Code node timeout. At 40 filings with 100ms delay between enrichment calls, total runtime is approximately 4–8 seconds.

The node performs six sequential sub-tasks:

1. Pre-load dedup keys + CIK ticker map (startup)
2. Fetch new Form 4 filings from SEC EDGAR JSON endpoint
3. Enrich each filing via Financial Datasets API
4. Dedup check (in-memory Set, O(1))
5. Filter buys only (`P - Purchase`)
6. Classify insider role
7. Detect cluster buys (writes to Supabase immediately)

**Dependencies**: Section 00 (Supabase schema migration) and Section 01 (Airtable base) must be complete before this section can be implemented or tested. The Supabase `insider_alerts` table must have the `dedup_key` unique index and the `service_role UPDATE` policy in place.

**Output**: An array of enriched, deduplicated, classified filing objects passed to `score-alert.js` (Section 03) via the n8n node chain.

---

## Tests First

Test file location: `ryan_cole/insiderbuying-site/tests/insiderbuying/sec-monitor.test.js`

Tests are written with Jest. The Code node logic is extracted into a pure function file that can be imported without running n8n.

### 2.0 Pre-load Tests

```
# Test: fetchDedupKeys() returns a Set of strings, not an array
# Test: fetchDedupKeys() with empty Airtable returns empty Set (no crash)
# Test: loadCikTickerMap() fetches SEC file and returns Map of CIK→ticker
# Test: loadCikTickerMap() correctly zero-pads CIK to 10 digits (CIK 320193 → '0000320193')
# Test: loadCikTickerMap() handles missing/malformed entries without crashing
```

### 2.1 SEC EDGAR Fetch Tests

```
# Test: buildEdgarUrl() includes narrow date range (startdt/enddt), count=40, sort=file_date:desc
# Test: buildEdgarUrl() does NOT include q=* (catches the overbroad query bug)
# Test: parseEdgarResponse() extracts entity_name, file_date, accession_number from hits.hits[]
# Test: parseEdgarResponse() returns empty array when hits.hits is empty (no new filings)
# Test: User-Agent header 'EarlyInsider.com (alerts@earlyinsider.com)' is present in all SEC requests
# Test: filings with file_date <= last_check_timestamp are filtered out
```

### 2.2 Financial Datasets Enrichment Tests

```
# Test: enrichFiling() calls correct endpoint with ticker + filing_date_gte params
# Test: enrichFiling() extracts all required fields: name, title, is_board_director,
#       transaction_date, transaction_shares, transaction_price_per_share,
#       transaction_value, transaction_type, filing_date
# Test: enrichFiling() retries up to 3 times on 429/500 with exponential backoff
# Test: enrichFiling() returns null (not throws) after 3 failed retries, increments failureCount
# Test: 100ms delay is applied between consecutive Financial Datasets calls
```

### 2.3 Dedup Tests

```
# Test: buildDedupKey() returns '{ticker}_{insider_name}_{transaction_date}_{shares}' format
# Test: filing with key present in existingDedupKeys Set is skipped (returns false)
# Test: filing with key absent from Set passes dedup check (returns true)
# Test: passing dedup check immediately adds key to Set (prevents same-run duplicates)
# Test: two filings with identical dedup key in same batch — only first is processed
```

### 2.4 Filter Tests

```
# Test: transaction_type 'P - Purchase' passes filter
# Test: transaction_type 'S - Sale' is filtered out
# Test: transaction_type 'A - Grant' is filtered out
# Test: transaction_type 'D - Disposition' is filtered out
# Test: null or undefined transaction_type is filtered out
```

### 2.5 Classification Tests

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

### 2.6 Cluster Detection Tests

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

## Implementation

### Environment Variables Required

The following env vars must be present at Code node startup. Fail fast if missing:

```
AIRTABLE_API_KEY
AIRTABLE_BASE_ID            — the InsiderBuying.ai base ID (from Section 01)
INSIDER_ALERTS_TABLE_ID     — the Insider_Alerts table ID
MONITOR_STATE_TABLE_ID      — the Monitor_State table ID
FINANCIAL_DATASETS_API_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY   — must be service_role, not anon (cluster UPDATE requires it)
```

Check for missing vars at the top of the Code node and throw immediately with a clear error message listing which var is absent.

---

### 2.0 Startup: Pre-load Dedup Keys + CIK Ticker Map

Both pre-loads run in parallel (`Promise.all`) before any filing processing begins.

**Dedup keys**: Query Airtable `Insider_Alerts` for all records from the past 7 days, requesting only the `dedup_key` field. Build a JavaScript `Set` from the returned values. Filter out nulls/undefined.

```javascript
async function fetchDedupKeys() {
  // Query Airtable with filterByFormula for last 7 days
  // Return: Set<string>
}
```

The 7-day window matches the cluster detection window. Keys older than 7 days are not relevant to dedup since cluster detection also only looks back 7 days.

**CIK ticker map**: Fetch `https://www.sec.gov/files/company_tickers.json`. The file format is:

```json
{
  "0": { "cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc." },
  "1": { "cik_str": 789019, "ticker": "MSFT", "title": "Microsoft Corp" }
}
```

Build a `Map<string, string>` where the key is the CIK zero-padded to 10 digits and the value is the ticker symbol. Re-fetch on every run — do not cache across runs, as ticker changes are not reflected in a stale cache.

```javascript
async function loadCikTickerMap() {
  // Fetch SEC company_tickers.json
  // Return: Map<paddedCik, ticker>
  // Zero-pad: String(cik_str).padStart(10, '0')
}
```

Include `User-Agent: EarlyInsider.com (alerts@earlyinsider.com)` on this SEC request as well.

---

### 2.1 SEC EDGAR JSON Fetch

**Endpoint**: `https://efts.sec.gov/LATEST/search-index`

**Query parameters**:
- `q=%22form+4%22` — literal string "form 4" (narrow, not `q=*`)
- `forms=4`
- `dateRange=custom`
- `startdt={last_check_date}` — date portion of `last_check_timestamp` from Monitor_State
- `enddt={today}` — today's date in YYYY-MM-DD
- `start=0`
- `count=40`
- `sort=file_date:desc`

Do NOT use `q=*`. That query matches all Form 4s ever filed, triggers pagination across thousands of results, and reliably hits the SEC's 60 req/min IP throttle within one run.

**Mandatory header on every SEC request**:
```
User-Agent: EarlyInsider.com (alerts@earlyinsider.com)
```

The SEC progressively 429s and 403s IPs that don't identify themselves. This header is required.

**Response structure**:
```json
{
  "hits": {
    "hits": [
      {
        "_id": "0000320193-26-000042",
        "_source": {
          "entity_name": "Apple Inc.",
          "file_date": "2026-03-27T14:23:11.000Z",
          "period_of_report": "2026-03-25"
        }
      }
    ]
  }
}
```

Parse `hits.hits[]`. For each hit:
- `entity_name` — company name
- `file_date` — filing timestamp (filter: skip if `file_date <= last_check_timestamp`)
- `_id` — accession number, encodes CIK as first 10 digits (format: `{cik}-{year}-{sequence}`, zero-padded)

Extract CIK from the accession number `_id` field by splitting on `-` and taking the first segment. Look up the ticker in the pre-loaded CIK map. If the ticker is not found in the map, skip the filing — small companies not in the EDGAR company list cannot be enriched.

```javascript
function buildEdgarUrl(lastCheckDate, today) {
  // Return the EDGAR search URL with all required params
}

function parseEdgarResponse(responseJson) {
  // Extract hits and return array of { entity_name, file_date, accession_number, cik }
  // Return [] when hits.hits is empty
}
```

---

### 2.2 Financial Datasets Enrichment

For each EDGAR filing hit that passes the date filter, call:

```
GET https://api.financialdatasets.ai/insider-trades?ticker={ticker}&filing_date_gte={filing_date}&limit=10
Header: X-API-KEY: {FINANCIAL_DATASETS_API_KEY}
```

Match the response to the specific filing by comparing `name` + `filing_date`. Extract:
- `name` — insider full name
- `title` — insider title string
- `is_board_director` — boolean
- `transaction_date` — date of the actual trade
- `transaction_shares` — share count
- `transaction_price_per_share` — price at transaction
- `transaction_value` — total dollar value
- `transaction_type` — raw string (e.g. `'P - Purchase'`, `'S - Sale'`)
- `filing_date` — date of SEC filing

**Rate limit mitigation**: Apply a 100ms delay (`await new Promise(r => setTimeout(r, 100))`) between each Financial Datasets call. With 40 filings maximum per run, total delay is 4 seconds — well within the 60-second Code node timeout.

**Retry logic**: 3 attempts with exponential backoff (1s, 3s, 9s) on 429 or 500 responses. After 3 failed retries, return `null` (do not throw) and increment the run-level `failureCount` variable.

**Fallback for unknown tickers**: If Financial Datasets returns no results for a ticker (small/obscure company not in their database), fall back to parsing the EDGAR filing XML directly. The filing URL is constructible from the accession number. The EDGAR XBRL XML files have standardized fields. This fallback is best-effort — if XML parsing also fails, return `null` and count as a failure.

```javascript
async function enrichFiling(ticker, filingDate) {
  // Call Financial Datasets, retry 3x, return structured data or null
}
```

---

### 2.3 Dedup Check

Build the dedup key from the enriched filing data:

```
{ticker}_{insider_name}_{transaction_date}_{transaction_shares}
```

Example: `AAPL_Tim_Cook_2026-03-25_10000`

Check against `existingDedupKeys` (the Set loaded in step 2.0). If the key is present, skip this filing with no API calls. If absent, add the key to the Set immediately before any further processing — this prevents a duplicate filing appearing later in the same 40-entry EDGAR batch from passing the dedup check.

```javascript
function buildDedupKey(ticker, insiderName, transactionDate, shares) {
  // Return composite key string
}

function passesDedup(dedupKey, existingDedupKeys) {
  // If key in Set: return false (skip)
  // If key not in Set: add to Set, return true (proceed)
}
```

The in-memory Set is the only dedup mechanism needed within a single run. Cross-run dedup relies on the Set being pre-loaded from Airtable at startup.

---

### 2.4 Filter — Buys Only

After dedup, apply the buy-only filter. Only continue if `transaction_type === 'P - Purchase'` (exact string from Financial Datasets). All other values are dropped silently (not logged as errors — sells and grants are expected and common).

Types to drop:
- `'S - Sale'`
- `'A - Grant'`
- `'D - Disposition'`
- Any other string, including null/undefined

This is an MVP decision. Future versions may handle other transaction types as separate alert categories.

---

### 2.5 Insider Classification

Map the raw `title` string to one of five category values using case-insensitive keyword matching. The `is_board_director` boolean from Financial Datasets can override an ambiguous title classification.

| Category | Keywords to match (case-insensitive) |
|----------|--------------------------------------|
| `C-Suite` | CEO, CFO, COO, CTO, Chief, President |
| `Board` | Director, Board Member, Chairman, Chairwoman |
| `VP` | Vice President, SVP, EVP, Senior Vice President |
| `Officer` | Treasurer, Secretary, Controller, General Counsel |
| `10% Owner` | "10 percent", "10%", beneficial owner with ownership % indicator |

Override rule: if `is_board_director === true` and the title doesn't already classify as `C-Suite`, override to `Board`.

Default for unrecognized titles: `'Officer'` — never crash on unknown title strings.

```javascript
function classifyInsider(title, isBoardDirector) {
  // Case-insensitive keyword matching
  // Return one of: 'C-Suite', 'Board', 'VP', 'Officer', '10% Owner'
}
```

---

### 2.6 Cluster Detection

After classifying the insider, query Supabase for other insider buys of the same ticker in the past 7 days, excluding the current insider by name.

**Query**: `SELECT id, insider_name, cluster_id, is_cluster_buy FROM insider_alerts WHERE ticker = $1 AND transaction_type = 'buy' AND transaction_date >= $2 AND insider_name != $3`

Use `SUPABASE_SERVICE_ROLE_KEY` for this query — it requires the service role to bypass RLS and to run the UPDATE that follows.

**Cluster logic**:

- If **0 matching rows**: no cluster. Set `is_cluster_buy = false`, `cluster_id = null`. Proceed.
- If **1+ matching rows, none have a `cluster_id`**: new cluster detected. Generate a UUID v4 as `cluster_id`. UPDATE all matching rows to set `cluster_id` and `is_cluster_buy = true`. Set `is_cluster_buy = true` and the new `cluster_id` on the current filing.
- If **1+ matching rows, some already have a `cluster_id`**: existing cluster. Use the existing UUID (take the first non-null `cluster_id` found). UPDATE any rows that don't yet have it. Set `is_cluster_buy = true` and the existing `cluster_id` on the current filing.

`cluster_size` = total count of distinct insiders in the cluster after this filing is added (existing matches + 1 for current).

**Write order matters**: Each filing must be written to Supabase (Section 05) immediately after processing, not in a batch at the end. Cluster detection depends on being able to see previously-processed filings from the same run already in Supabase. If you batch writes to the end, the second cluster member will never see the first and cluster detection silently fails for same-run clusters.

```javascript
async function detectCluster(ticker, transactionDate, currentInsiderName, supabaseClient) {
  // Query Supabase for other buys of same ticker in last 7 days
  // Return { isClusterBuy, clusterId, clusterSize }
  // Also UPDATE existing rows with cluster_id + is_cluster_buy = true
}
```

---

### Output Shape

Each successfully processed filing should be an object with all the following fields populated before being passed to `score-alert.js`:

```javascript
{
  ticker,
  company_name,
  insider_name,
  insider_title,
  insider_category,       // from classifyInsider()
  transaction_type,       // normalized to 'buy' (not the raw 'P - Purchase' string)
  transaction_date,
  filing_date,
  transaction_shares,
  transaction_price_per_share,
  transaction_value,
  dedup_key,
  is_cluster_buy,
  cluster_id,             // null if no cluster
  cluster_size,
  raw_filing_data,        // full Financial Datasets response JSON, stringified
}
```

The `transaction_type` field should be normalized from `'P - Purchase'` to `'buy'` before output — this is what Supabase's CHECK constraint expects.

---

### Error Handling Summary

- **Missing env var**: throw immediately at startup with var name in message
- **CIK not in ticker map**: skip filing silently (not a failure)
- **Financial Datasets failure after 3 retries**: return null, increment `failureCount`, continue to next filing
- **EDGAR response empty**: return empty array, update Monitor_State normally (no new filings is not an error)
- **Supabase cluster query failure**: log warning, set `is_cluster_buy = false`, continue — do not abort the filing
- **`failureCount > 5` at end of run**: send Telegram alert (using existing Telegram bot infrastructure) with workflow name, failure count, first error message

---

### Key Design Rationale

**Why EDGAR JSON, not RSS/Atom?** The JSON endpoint returns structured data (CIK, company name, filing date, accession number) without XML parsing. The `xml2js` package is a third-party library not guaranteed to be available in the n8n Code node sandbox. The JSON endpoint avoids this dependency entirely.

**Why pre-load dedup keys?** Per-filing Airtable lookups for 40 filings = 40 sequential API calls = 8–20 seconds of latency. Pre-loading into a Set at startup reduces all dedup checks to O(1) in-memory operations. This is the same pattern used in `auto-produce.js` in the existing n8n codebase.

**Why 100ms delay between Financial Datasets calls?** Financial Datasets has an undocumented rate limit that triggers on rapid sequential requests. The 100ms delay keeps the total enrichment phase within the 60-second Code node timeout even at the maximum 40-filing batch size.

**Why write immediately instead of batch?** Cluster detection reads from Supabase to find previous filings. If filing A and filing B from the same company both appear in the same 40-entry EDGAR batch, filing B's cluster detection must be able to see filing A already written. Batch-at-end makes same-run cluster detection impossible.

---

## Implementation Notes (Actual Build)

**Files created:**
- `n8n/code/insiderbuying/sec-monitor.js` (591 lines)
- `tests/insiderbuying/sec-monitor.test.js` (64 tests, all passing)

**Deviations from plan:**

1. **`classifyInsider` — board override scope narrowed**: The spec says `is_board_director=true` overrides all non-C-Suite titles to `'Board'`. Review flagged that VP is an unambiguous, explicit title and should not be overridden. Implementation: board override only applies when no keyword match is found (ambiguous/unknown titles). VP, Board, 10% Owner keywords all take precedence over the flag.

2. **`enrichFiling` — `onFailure` callback pattern**: Instead of returning a bare `null` for both "no data" and "API failure" cases, the function accepts an optional `onFailure` callback invoked only on real API failure after 3 retries. Empty `insider_trades` returns `null` without calling `onFailure`. This prevents the Telegram failure alert from firing on runs with many small-cap tickers not covered by Financial Datasets.

3. **Same-run cluster detection (Option A — in-memory)**: The spec's write-order requirement (write each filing immediately so next filing's cluster detection can see it) was implemented via in-memory tracking instead of premature Supabase writes. `runSecMonitor` maintains a `sameRunFilings` array of result object references. `detectCluster` receives this array, checks it alongside Supabase, and retroactively mutates matched entries' `cluster_id`/`is_cluster_buy` fields when a cluster is found (same object reference = results array updated automatically).

4. **100ms delay placement**: Moved to before the retry loop (not inside it), so retries don't add extra 100ms on top of their own exponential backoff.

**Test count:** 64 tests (59 original + 5 added during code review for new behaviors).
