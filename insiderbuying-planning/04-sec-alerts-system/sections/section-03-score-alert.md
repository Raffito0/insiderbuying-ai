# Section 03: `score-alert.js` — Significance Scoring

## Overview

This section implements `n8n/code/insiderbuying/score-alert.js`, the significance scoring node in the W4 pipeline. It runs after `sec-monitor.js` and before `analyze-alert.js`. Its job: given a filtered, enriched, classified filing, compute a 1–10 significance score using Claude Haiku plus an insider track record derived from historical Supabase data and Yahoo Finance price history.

**Estimated cost**: ~$0.001 per call (Haiku). At ~1,500 calls/month = ~$1.50/month.

## Dependencies

- **section-02-sec-monitor** must be complete. This node receives the output of `sec-monitor.js`: enriched filing objects with `ticker`, `insider_name`, `insider_category`, `transaction_type`, `transaction_shares`, `transaction_price_per_share`, `total_value`, `filing_date`, `transaction_date`, `is_cluster_buy`, `cluster_id`, and `cluster_size`.
- **section-00-schema-migration** must be applied. The Supabase `insider_alerts` table must have the `insider_category`, `cluster_id`, `is_cluster_buy` columns for historical queries to work.
- Environment variable: `ANTHROPIC_API_KEY` must be set in n8n docker-compose.

## File Location

```
n8n/code/insiderbuying/score-alert.js
```

This follows the existing convention in `n8n/code/` (alongside `sec-monitor.js`, etc.).

---

## Tests First

**Test file**: `ryan_cole/insiderbuying-site/tests/insiderbuying/score-alert.test.js`

Write these tests before implementing. Use Jest. The logic should be extractable as pure functions.

### 3.1 Insider Track Record

```
# Test: computeTrackRecord() with no historical Supabase data returns
#       { past_buy_count: 0, hit_rate: null, avg_gain_30d: null }
# Test: computeTrackRecord() with 3 past buys, 2 gained >5% → hit_rate = 0.67
# Test: normalizeInsiderName() collapses 'John A. Smith' and 'John Smith' to same key
# Test: Yahoo Finance failure (network error) returns null track record without throwing
# Test: Yahoo Finance 429 returns null track record without throwing
```

### 3.2 Claude Haiku Scoring

```
# Test: Haiku prompt includes: ticker, insider_category, transaction_type, total_value,
#       is_cluster_buy, track record
# Test: parseHaikuResponse() extracts score and reasoning from valid JSON
# Test: parseHaikuResponse() handles markdown-wrapped JSON (```json {...} ```)
# Test: parseHaikuResponse() handles smart quotes in JSON string
# Test: score is clamped to [1, 10] — score=11 becomes 10, score=0 becomes 1
# Test: score is integer — float 7.5 rounds to 8
# Test: if Haiku fails after 2 retries → defaults to { score: 5, reasoning: 'Scoring unavailable' }
```

---

## Implementation Details

### 3.1 Insider Track Record (pre-scoring step)

Before calling Claude, compute the insider's historical track record.

**Step 1 — Query Supabase for past buys**

Query `public.insider_alerts` for all past buys by the same insider in the past 24 months. Match on normalized insider name (see below). For each past buy, you need `ticker`, `filing_date`, `total_value`.

Supabase query (service role key, REST API):
```
GET /rest/v1/insider_alerts
  ?select=ticker,filing_date,total_value
  &transaction_type=eq.buy
  &filing_date=gte.{24_months_ago}
  &insider_name=ilike.{normalized_name_pattern}
```

**Insider name normalization** (`normalizeInsiderName()`): Strip middle initials and suffixes. Map `'John A. Smith'` and `'John Smith'` to the same lookup key. Simple approach: remove single-letter words surrounded by word boundaries (`/\b[A-Z]\.\s*/g`), lowercase, trim. This prevents the same insider filing under slightly different name formats from appearing as different people.

**Step 2 — Fetch 30-day price returns from Yahoo Finance**

Yahoo Finance public endpoint (no API key):
```
GET https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&period1={unix_start}&period2={unix_end}
```
Where `period1` = filing_date epoch and `period2` = filing_date + 31 days epoch.

Required header: `User-Agent: Mozilla/5.0` (omitting this causes 429).

For each past buy, fetch price at `filing_date` and price at `filing_date + 30 days` from the returned `timestamp[]` and `indicators.quote[0].close[]` arrays. Match dates by finding the nearest available trading day.

**Computed metrics**:
- `past_buy_count`: total count of historical insider buys found in Supabase
- `hit_rate`: fraction of past buys where 30-day return exceeded 5%
- `avg_gain_30d`: mean 30-day return across all past buys (as a decimal, e.g. 0.12 = 12%)

**Fallback**: If Yahoo Finance returns a 429, throws a network error, or the endpoint structure changes: catch the error, set `past_buy_count = 0`, `hit_rate = null`, `avg_gain_30d = null`, and proceed. Do not throw. The Haiku prompt explicitly instructs the model to treat `null` track record as neutral — scoring still works, just without historical context.

If no historical Supabase data exists for this insider, skip the Yahoo Finance step entirely and return the same `null` defaults.

**Stub signature**:
```javascript
async function computeTrackRecord(insiderName, supabaseUrl, supabaseKey) {
  /**
   * Returns { past_buy_count, hit_rate, avg_gain_30d }
   * hit_rate and avg_gain_30d are null if data unavailable.
   */
}

function normalizeInsiderName(name) {
  /**
   * Strips middle initials, lowercases, trims.
   * 'John A. Smith' → 'john smith'
   */
}
```

---

### 3.2 Claude Haiku Scoring Call

**Model**: `claude-haiku-4-5-20251001`

**Response format**:
```json
{ "score": 7, "reasoning": "Short explanation of score." }
```

**Scoring criteria in the prompt** (include all of these explicitly):

1. **Role weight**: C-Suite adds significant weight (+3 conceptually), Board (+2), VP (+1), Officer = baseline
2. **Transaction size**: Large purchase relative to this insider's typical trade size is more significant. If no history, use absolute dollar value as proxy ($500K+ = notable, $1M+ = significant, $5M+ = highly significant)
3. **Track record**: If `hit_rate` is high (>60%) and `avg_gain_30d` is positive, boost score. If `hit_rate` is null, treat as neutral — do not penalize
4. **Cluster bonus**: If `is_cluster_buy = true`, this means multiple insiders are buying the same stock in a short window — add significant weight (+3)
5. **Timing signals**: Large purchase near earnings window, first purchase in 2+ years, purchase after price dropped >15%, all boost score
6. **Purchase type**: Open-market purchase (P - Purchase) scores higher than option exercise or automatic 10b5-1 plan

**Prompt construction**: Pass all filing fields (ticker, insider_name, insider_category, transaction_type, total_value, transaction_shares, transaction_price_per_share, filing_date, transaction_date) plus track record fields (past_buy_count, hit_rate, avg_gain_30d) and cluster fields (is_cluster_buy, cluster_size).

**Parsing** (`parseHaikuResponse()`): Use the same `repairJson()` pattern used elsewhere in the codebase — strip markdown fences (` ```json ... ``` `), fix smart quotes (`"` → `"`, `"` → `"`), extract the first `{...}` object bounds. Validate that `score` is present and `reasoning` is a non-empty string.

**Score clamping**: After parsing, clamp score to integer in [1, 10]:
```javascript
score = Math.min(10, Math.max(1, Math.round(score)));
```

**Stub signatures**:
```javascript
function buildHaikuPrompt(filing, trackRecord) {
  /** Returns the prompt string for Claude Haiku. */
}

function parseHaikuResponse(rawText) {
  /** Returns { score: number, reasoning: string } or throws on parse failure. */
}

async function callHaiku(prompt, anthropicApiKey) {
  /** Calls Anthropic API with claude-haiku-4-5-20251001. Retries up to 2 times. */
}
```

---

### 3.3 Error Handling

If the Haiku call fails after 2 retries (any error: network, 429, malformed JSON): default to `{ score: 5, reasoning: "Scoring unavailable" }`. Do not throw. The filing proceeds to `analyze-alert.js` and then to persistence. The default score of 5 is above the `score >= 4` threshold for analysis generation, so the filing still gets an analysis attempt.

**Retry logic**: 2 retries with a short delay (1–2 seconds) between attempts. Exponential backoff is acceptable but not required at this retry count.

---

### 3.4 Output Shape

The node passes downstream an object per filing:

```javascript
{
  // All fields from sec-monitor.js output (ticker, insider_name, etc.)
  ...filing,
  // Added by this node:
  significance_score: 7,          // integer, clamped [1, 10]
  score_reasoning: "...",         // string from Haiku, or "Scoring unavailable"
  track_record: {
    past_buy_count: 3,
    hit_rate: 0.67,               // or null
    avg_gain_30d: 0.12            // or null
  }
}
```

---

## n8n Integration Note

In n8n, this is a Code node that receives the array output from `sec-monitor.js`. It must iterate over all filings in the input (not assume a single filing). Process each filing sequentially — do not parallelize Haiku calls to avoid hitting rate limits.

The output of this node feeds directly into `analyze-alert.js` (section 04). No intermediate storage — the scored filing object is passed in-memory through the n8n node chain.

---

## Implementation Notes (Actual Build)

**Files created:**
- `ryan_cole/insiderbuying-site/n8n/code/insiderbuying/score-alert.js` — main implementation
- `ryan_cole/insiderbuying-site/tests/insiderbuying/score-alert.test.js` — 41 tests

**Deviations from plan:**

1. **n8n entrypoint style**: Plan implied a `return` at top level. Implemented as deployment instructions in comments (// lines) instead of a comment block, since `return` at module level is a SyntaxError in Jest/Babel. The n8n Code node entry code is clearly documented and must be copy-pasted when deploying.

2. **Supabase ilike wildcard**: During code review, found that `*` was used as wildcard instead of SQL `%`. Fixed to `%john%smith%` pattern. Added test asserting the decoded URL contains `%john%smith%`.

3. **Per-filing Yahoo Finance isolation**: `fetch30DayReturn` wraps its own `fetchFn` call in a try/catch and returns `null` on exception. This ensures one flaky Yahoo call does not abort remaining filings' price lookups. The outer loop has no try/catch.

4. **hit_rate denominator**: Uses `validReturns.length` (trades with available Yahoo data) not `rows.length` (total trades). Documented in a comment. The prompt includes `past_buy_count` separately so Haiku has both numbers.

5. **HAIKU_DEFAULT**: Returns `{ ...HAIKU_DEFAULT }` spread on all failure paths to prevent shared-object mutation.

**Test count**: 41 tests covering all spec subsections (3.1 normalizeInsiderName, 3.1 computeTrackRecord, 3.2 buildHaikuPrompt, 3.2 parseHaikuResponse, 3.2 score clamping, 3.2 callHaiku, 3.3 runScoreAlert).
