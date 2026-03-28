# Section 05 — Write to Airtable + Supabase

## Overview

This section implements the persistence layer that runs after scoring (section 03) and AI analysis (section 04). Each filing is written individually — not batched — so that cluster detection in `sec-monitor.js` works correctly: when filing B of a cluster is processed, filing A must already be in Supabase for the cluster query to find it.

**File to implement**: `n8n/code/insiderbuying/sec-monitor.js` (the write steps are inline within the same Code node as the rest of the monitor, not a separate file).

**Dependencies**:
- Section 00 (schema migration) must be applied — all new columns (`dedup_key`, `cluster_id`, `status`, `retry_count`, etc.) and the service_role UPDATE policy must exist.
- Section 01 (Airtable setup) must be complete — `Insider_Alerts` and `Monitor_State` tables must exist.
- Section 04 (analyze-alert) must pass its output — `significance_score`, `score_reasoning`, and `ai_analysis` (may be null) must be available per filing before writing.

**Blocks**: Section 06 (deliver-alert) and Section 07 (n8n workflow config).

---

## Tests — Write These First

Test file location: `ryan_cole/insiderbuying-site/tests/insiderbuying/`

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

## Implementation Details

### 5.1 Create Airtable Record

For each filing that has passed scoring and analysis, create a record in the `Insider_Alerts` Airtable table. Set `status = 'processed'`. Store the returned Airtable record ID for use in step 5.2 (patching back the `supabase_id`).

All of these fields must be populated on create:

| Field | Value |
|---|---|
| `dedup_key` | `{ticker}_{insider_name}_{transaction_date}_{shares}` |
| `ticker` | from enrichment |
| `company_name` | from enrichment |
| `insider_name` | from enrichment |
| `insider_title` | from enrichment |
| `insider_category` | from classification step |
| `transaction_type` | `'buy'` (after passing the buys-only filter) |
| `shares` | from enrichment |
| `price_per_share` | from enrichment |
| `total_value` | from enrichment |
| `transaction_date` | from enrichment |
| `filing_date` | from EDGAR |
| `significance_score` | from Haiku scoring |
| `score_reasoning` | from Haiku scoring |
| `ai_analysis` | from Sonnet (may be null — store as empty string or omit field) |
| `cluster_id` | UUID if cluster detected, else omit |
| `is_cluster_buy` | boolean |
| `cluster_size` | integer (0 if not a cluster) |
| `raw_filing_data` | `JSON.stringify(rawFinancialDatasetsResponse)` |
| `status` | `'processed'` |

### 5.2 Insert into Supabase

Insert into `public.insider_alerts` using the Supabase REST API with the **service role key** (not the anon key — service role bypasses RLS and the INSERT policy already allows it).

The insert must be idempotent. Use `ON CONFLICT (dedup_key) DO NOTHING`:

```javascript
// Stub — do not expand to full implementation
async function insertToSupabase(filing) {
  // POST to /rest/v1/insider_alerts with Prefer: resolution=ignore-duplicates header
  // Use onConflict: 'dedup_key', ignoreDuplicates: true
  // Extract and return the inserted row's id (UUID) from the response
}
```

The Supabase insert automatically triggers Realtime subscriptions — no additional code required. The `/alerts` page on earlyinsider.com will receive the new alert within milliseconds.

After a successful insert, PATCH the Airtable record created in step 5.1 with the `supabase_id` (the returned UUID) so the two records are cross-referenced.

If the insert returns a conflict (same `dedup_key` already exists), treat it as a graceful no-op. Do not increment `failureCount`. Do not log as an error. This can happen if W4-market and W4-afterhours both process the same filing — the dedup key prevents duplication.

### 5.3 Update Monitor_State

After all filings in the run have been processed (not per-filing), update the `Monitor_State` record for the current workflow (market or afterhours).

Track two lists during the run:
- `successfulFilings`: filings that were written successfully to both Airtable and Supabase
- `failedFilings`: filings that encountered an error (enrichment failure, Airtable error, Supabase error)

Then at the end of the run:

**All succeeded** (failedFilings is empty):
- PATCH `last_check_timestamp = new Date().toISOString()`
- PATCH `last_run_status = 'success'`

**Some failed** (failedFilings is non-empty):
- Find `min(failedFiling.filing_date)` across all failed filings — this is the earliest filing that needs to be retried
- PATCH `last_check_timestamp = minFailedFilingDate`
- PATCH `last_run_status = 'error'`
- PATCH `last_run_error = firstErrorMessage`

This rollback logic ensures that on the next run, the timestamp lower bound covers the failed filing, so it will be rediscovered and retried.

**Dead-letter pattern**: Before a failed filing is retried, its `retry_count` in Airtable is incremented. If `retry_count > 3`:
- Mark `status = 'dead_letter'` in Airtable
- Do NOT roll back `last_check_timestamp` for this filing — let the timestamp advance past it
- Send a Telegram notification to the monitoring chat with: workflow name, `dedup_key`, `ticker`, and the last error message

Dead-letter conditions that won't resolve on retry: malformed SEC data, a ticker that Financial Datasets doesn't recognize, Claude API refusals. These need manual review.

```javascript
// Stub
async function updateMonitorState(workflowName, successfulFilings, failedFilings, firstError) {
  // Determine timestamp based on failure state
  // PATCH Airtable Monitor_State record keyed by workflowName
}

async function handleDeadLetter(filing, airtableRecordId) {
  // PATCH Airtable status='dead_letter'
  // Send Telegram notification
}
```

### 5.4 Cluster Alert Creation

Run this step **at the end of the run**, after all individual filings are written. Do not create cluster summaries mid-run.

Logic:

1. Collect all filings processed in this run that have a `cluster_id` assigned.
2. Group by `cluster_id` — one summary per unique cluster.
3. For each unique `cluster_id`:
   a. Check Airtable `Insider_Alerts` for an existing record with `transaction_type = 'cluster'` AND `cluster_id = {id}`.
   b. **No existing summary**: Create a new record:
      - `transaction_type = 'cluster'`
      - `insider_name = "{N} Insiders"` where N = cluster_size
      - `ticker = shared ticker`
      - `significance_score = Math.min(10, maxIndividualScore + 3)`
      - `ai_analysis`: composite prose summarizing all cluster members (names, titles, amounts)
      - All cluster member filings linked or referenced
      - After create, trigger W5 (deliver-alert) for this cluster summary.
   c. **Existing summary found**: UPDATE (PATCH) the existing record with:
      - Updated `cluster_size`
      - Updated `ai_analysis`
      - Updated `significance_score = Math.min(10, maxIndividualScore + 3)`
      - Only re-trigger W5 if the new score is >= 2 points higher than the previous score. Otherwise skip — users already received an alert for this cluster.

```javascript
// Stub
async function createOrUpdateClusterSummary(clusterId, clusterFilings) {
  // Query Airtable for existing cluster summary
  // If not found: create new, trigger W5
  // If found: update fields, conditionally trigger W5
}
```

### 5.5 Error Counting and Telegram Alert

Maintain a `failureCount` integer initialized to 0 at the start of the run. Increment it each time any filing fails (enrichment failure, write failure, etc.). Also track `firstError` as the string message of the first failure encountered.

At the end of the run, after Monitor_State is updated:

```javascript
// Stub
if (failureCount > 5) {
  // Send Telegram message to monitoring chat
  // Include: workflow name, failureCount, firstError
  // Use existing Telegram bot infrastructure from the content pipeline
}
```

The threshold of 5 prevents noise from occasional transient failures (1-2 per run is normal). More than 5 in a single run indicates a systemic problem (SEC API down, Financial Datasets rate-limited, Anthropic outage).

---

## Write Order Per Filing

The per-filing write sequence (steps 5.1 + 5.2) must happen in this exact order inside the filing processing loop, after scoring and analysis are complete:

1. Create Airtable record → get `airtableRecordId`
2. Insert to Supabase → get `supabaseId`
3. PATCH Airtable record with `supabaseId`
4. Add filing to `successfulFilings` list

If step 1 fails: increment `failureCount`, add to `failedFilings`, continue to next filing.
If step 2 fails: the Airtable record exists without a `supabase_id`. Increment `failureCount`, add to `failedFilings`. Attempt to PATCH the Airtable record `status = 'failed'`.
If step 3 fails: non-critical. Log a warning. The records are not cross-referenced but both exist.

---

## Environment Variables Required

The following env vars must be available in the n8n Code node (set in docker-compose.yml):

- `AIRTABLE_API_KEY` — for all Airtable reads and writes
- `AIRTABLE_BASE_ID` — the InsiderBuying.ai base ID
- `SUPABASE_URL` — the project REST URL
- `SUPABASE_SERVICE_ROLE_KEY` — bypasses RLS for INSERT and UPDATE
- `TELEGRAM_BOT_TOKEN` — for dead-letter and failure alerts
- `TELEGRAM_MONITORING_CHAT_ID` — destination chat for alerts

---

## What This Section Does NOT Cover

- The email/push delivery step (W5) — that is section 06.
- The cluster detection logic that runs mid-processing in `sec-monitor.js` and sets `cluster_id` on existing Supabase rows — that is section 02 (cluster detection runs before writing; this section writes the result).
- The n8n workflow wiring that connects W4 to W5 — that is section 07.
