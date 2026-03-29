# TDD Plan: 12-scoring-analysis

## Testing Context

**Framework**: Jest, Node.js test environment
**Location**: `n8n/tests/` — test files match `*.test.js`
**Run command**: `npm test`
**Pattern**: Pure function unit tests with dependency injection. External calls (HTTP, NocoDB, Telegram) are mocked via `fetchFn` and `sleep` parameters. Tests follow existing patterns in `score-alert.test.js` and `analyze-alert.test.js`.
**Stubs mean stubs**: Each item below is a test description to write before implementing, not full code.

---

## Section 1: Deterministic Scoring Formula

**File**: `score-alert.test.js` — add `computeBaseScore()` test block

### Factor 1 — Transaction Value
- Test: value $10M+ → base score receives +3.0 bonus
- Test: value $5M → receives +2.4 bonus
- Test: value $100K → receives +0.6 bonus
- Test: value $50K (below threshold) → receives -1.0 penalty

### Factor 2 — Insider Role
- Test: `canonicalRole = 'CEO'` → receives +2.5
- Test: `canonicalRole = 'Director'` → receives +1.0
- Test: unmapped/unknown title → receives +0.5 (not zero, not throw)

### Factor 3 — Market Cap
- Test: `marketCapUsd = 500_000_000` (small-cap) → receives +1.5
- Test: `marketCapUsd = 100_000_000_000` (mega-cap) → receives +0.6
- Test: `marketCapUsd = null` → factor skipped (no adjustment), no throw, WARN logged

### Factor 4 — Cluster Signal
- Test: `clusterCount7Days = 3` → receives +0.5
- Test: `clusterCount7Days = 2` → receives +0.3
- Test: `clusterCount7Days = null, clusterCount14Days = null` → no adjustment, no throw

### Factor 5 — Track Record
- Test: `historicalAvgReturn = 25, historicalCount = 4` → receives +0.5
- Test: `historicalAvgReturn = 15, historicalCount = 2` → receives +0.3 (≥2 trades required)
- Test: `historicalAvgReturn = 15, historicalCount = 1` → 0 bonus (only 1 trade, below minimum)
- Test: `historicalAvgReturn = null` → factor skipped, no throw

### Penalties and Final Clamping
- Test: `transactionCode = 'G'` → returns 0 immediately (gift excluded)
- Test: `transactionCode = 'F'` → returns 0 immediately (tax withholding excluded)
- Test: `transactionCode = 'S'` → NOT excluded, scored normally (sale is valid signal)
- Test: score computation exceeds 10 → clamped to 10
- Test: score computation below 1 → clamped to 1
- Test: output has at most one decimal place (e.g., 7.3, not 7.333...)

### Fixture Filings (10 representative cases, pre-computed expected scores)
- Fixture 1: CEO, $5M purchase, mid-cap, no cluster → expect ~8.x
- Fixture 2: Director, $100K purchase, small-cap, no cluster → expect ~5.x
- Fixture 3: CFO, $1M purchase, large-cap, cluster of 3 in 7 days → expect ~7.x
- Fixture 4: CEO, $3M sale, small-cap → expect ~7.x (sells score same as buys)
- Fixture 5: President, $500K purchase, micro-cap, track record >20% over 3 trades → expect ~8.x
- Fixture 6: Unknown role, $100K purchase, mega-cap → expect ~4.x
- Fixture 7: CEO, $10M purchase, micro-cap, 3+ cluster → expect 10 (capped at max)
- Fixture 8: Director, $50K purchase, large-cap → expect 1 or 2 (small value penalty)
- Fixture 9: CEO, $5M purchase, all enriched fields null → expect lower but not throw
- Fixture 10: All minimum values → expect 1 (clamped)

---

## Section 2: AI Refinement Layer

**File**: `score-alert.test.js` — add `callDeepSeekForRefinement()` test block

### Response Parsing
- Test: valid JSON `{"adjustment": 1, "reason": "first buy in years"}` → applied correctly
- Test: JSON wrapped in markdown fences ` ```json{"adjustment": 0}``` ` → strips fences, parses correctly
- Test: adjustment = -1 → `final_score = base_score - 1` (clamped if needed)
- Test: invalid JSON response → triggers retry, not crash
- Test: out-of-range adjustment (e.g., 2) → clamped to 1
- Test: empty string response → triggers retry

### Retry and Fallback
- Test: first call fails, second succeeds → uses second result
- Test: both calls fail → `ai_adjustment = 0`, `final_score = base_score`, warning logged
- Test: DeepSeek throws network error → same fallback behavior

### 10b5-1 Cap
- Test: `is10b5Plan = true` → AI refinement is skipped entirely (fetchFn never called)
- Test: `is10b5Plan = true`, base_score = 4 → `final_score = 4` (under cap, untouched)
- Test: `is10b5Plan = true`, would-be score 6 → `final_score = 5` (cap enforced)
- Test: `is10b5Plan = false`, base_score + adjustment = 11 → clamped to 10

### Score Storage Fields
- Test: returned object includes `base_score`, `ai_adjustment`, `ai_reason`, `final_score`
- Test: on fallback (AI failed), `ai_adjustment = 0` and `ai_reason` contains explanation string

---

## Section 3: Transaction Filtering and Same-Day Sell Detection

**File**: `score-alert.test.js` — add filtering + `detectSameDaySell()` test blocks

### Filtering Chain
- Test: `transactionCode = 'G'` → `runScoreAlert()` returns null, logs "skipped: gift/tax"
- Test: `transactionCode = 'F'` → returns null, logs "skipped: gift/tax"
- Test: `transactionCode = 'S'` → proceeds to scoring (sale is valid)
- Test: `transactionCode = 'P'` → proceeds to scoring (purchase)
- Test: `transactionCode = 'M'` → proceeds to `detectSameDaySell()` check

### detectSameDaySell()
- Test: code M, same `insiderCik` + `transactionDate`, shares sold ≥80% of exercised → returns 0 (exercise-and-sell)
- Test: code M, same `insiderCik` + `transactionDate`, shares sold 30% of exercised → NOT exercise-and-sell, normal score proceeds
- Test: code M, same `insiderCik` but DIFFERENT `transactionDate` → no match, normal score
- Test: code M, different `insiderCik` same date → no match, normal score
- Test: NocoDB query throws error → logs WARN, returns `undefined` (caller uses computed score)
- Test: code P (purchase) → `detectSameDaySell` not called for non-exercise codes

### Score Logging
- Test: scored alert emits structured log with all required fields (ticker, insider, code, direction, baseScore, aiAdjustment, finalScore, timestamp)
- Test: skipped alert (G/F) emits log with `skipReason` field
- Test: exercise-and-sell emits log with `overrideReason: "exercise-and-sell"` and `finalScore: 0`

### score=0 Records Not Stored
- Test: when `runScoreAlert()` returns null, no NocoDB write occurs (fetchFn not called for NocoDB)
- Test: null return does not propagate to `runAnalyzeAlert()`

---

## Section 4: Weekly Score Calibration

**File**: `score-alert.test.js` — add `runWeeklyCalibration()` test block

### Distribution Bucketing
- Test: alerts with scores [8,9,10,8,7,5,4,3,6,6] → correct percentage per bucket
- Test: all alerts in one bucket → other buckets are 0%, and alert fires for empty buckets
- Test: zero alerts in week → returns early with "no alerts" message, no division by zero, no Telegram fire

### Alert Triggering
- Test: 8-10 bucket = 30% → Telegram alert fires
- Test: 8-10 bucket = 3% → Telegram alert fires
- Test: 8-10 bucket = 15% and all other buckets within range → Telegram does NOT fire
- Test: Telegram message contains distribution table with all 4 buckets and percentages

### NocoDB Write
- Test: always writes a record to `score_calibration_runs` after each run (both flagged and unflagged)
- Test: written record contains `run_date`, `total_alerts`, per-bucket percentages, `flagged` boolean

### NocoDB Query Failure
- Test: NocoDB query throws → logs error, does not crash, does not write calibration record

---

## Section 5: Structured Alert Analysis

**File**: `analyze-alert.test.js` — add prompt construction test block

### Word Target Routing
- Test: `getWordTarget(9)` → `{target: 225, max: 300}`
- Test: `getWordTarget(7)` → `{target: 200, max: 275}`
- Test: `getWordTarget(5)` → `{target: 125, max: 175}`
- Test: `getWordTarget(2)` → `{target: 100, max: 150}`
- Test: score not matching any bucket → returns default (lowest) target

### Direction-Aware Prompt
- Test: `direction = 'A'` → prompt contains "buy" framing, not "sell" language
- Test: `direction = 'D'` → prompt contains "sold" framing, not bullish language
- Test: sell prompt includes "tax plan or bearish signal?" context question in hook guidance

### Data Injection
- Test: Finnhub returns valid quote → `current_price` and `pct_change_today` injected into prompt string
- Test: Finnhub returns null → price fields omitted from prompt, no throw
- Test: `sharesOwnedAfter` present → `portfolio_pct` computed and injected
- Test: `sharesOwnedAfter = null` → portfolio_pct omitted from prompt
- Test: earnings date within 60 days → "Earnings in X days" included in prompt
- Test: earnings date null → earnings sentence omitted

---

## Section 6: Analysis Validation

**File**: `analyze-alert.test.js` — add `validateAnalysis()` test block

### Rule 1 — Word Count
- Test: text with words ≥ `target * 0.70` → Rule 1 passes
- Test: text with words < `target * 0.70` → Rule 1 fails with "too short" error
- Test: text exceeding `max` → Rule 1 fails with "too long" error

### Rule 2 — Banned Phrases
- Test: text containing "guaranteed" → fails with banned phrase error
- Test: text containing "will moon" → fails
- Test: text containing "to the moon" → fails
- Test: text containing "GUARANTEED" (uppercase) → fails (case-insensitive)
- Test: text with no banned phrases → Rule 2 passes

### Rule 3 — Dollar Amount
- Test: text with "$45.20" → Rule 3 passes
- Test: text with no "$" at all → fails
- Test: text with "$" but no following digits (e.g., "the $") → fails

### Rule 4 — Percentage (Conditional)
- Test: `percentageDataAvailable = true`, text has "15%" → passes
- Test: `percentageDataAvailable = true`, text has no "%" → fails
- Test: `percentageDataAvailable = false` → Rule 4 skipped entirely regardless of text

### Rule 5 — Cautionary Language
- Test: text containing "however" → passes
- Test: text containing "could" → passes
- Test: text containing "routine" → passes
- Test: text with none of the cautionary words → fails

### All Rules Together
- Test: text failing multiple rules → all failures collected and returned together
- Test: text passing all rules → `{valid: true, errors: []}`

### Retry Flow
- Test: first attempt fails validation → second attempt sent with error list appended to prompt
- Test: second attempt passes → analysis returned, attempt logged
- Test: both attempts fail → minimal fallback template returned (not `validateAnalysis()` called again)
- Test: fallback template contains insiderName, bought/sold, shares, price, and score

---

## Section 7: finnhub-client.js

**File**: `finnhub-client.test.js` (new)

### getQuote()
- Test: valid Finnhub response → returns `{c, dp, h, l, o, pc}` with correct field mapping
- Test: second call for same ticker within TTL → `fetchFn` NOT called again (cache hit)
- Test: call after cache TTL expires → `fetchFn` called again (cache miss, stale entry deleted)
- Test: Finnhub returns HTTP 429 → returns null, logs warning
- Test: Finnhub returns HTTP 500 → returns null, logs warning
- Test: network error (fetchFn throws) → returns null, logs warning

### Market Hours + Timezone
- Test: mock current time to 14:00 ET (market open, Mon–Fri) → TTL = 60 seconds
- Test: mock current time to 17:00 ET (market closed) → TTL = 4 hours
- Test: mock current time to Saturday → TTL = 4 hours (weekend = closed)
- Test: mock time to DST spring-forward boundary (2026-03-08 02:00 ET) → market hours computed correctly without crash

### getNextEarningsDate()
- Test: NocoDB returns earnings date within 90 days → returns ISO date string
- Test: NocoDB returns earnings date >90 days away → returns null
- Test: NocoDB returns empty result → returns null
- Test: NocoDB query fails → returns null, logs warning

### Cache Cleanup (Lazy TTL)
- Test: add expired entry to cache, then call getQuote() → expired entry deleted, fresh call made
- Test: add fresh entry to cache, then call getQuote() → entry retained, no new fetch

---

## Integration Notes

These tests run alongside the existing 515 tests via `npm test`. No new test infrastructure is needed. Each new test block follows the dependency injection pattern:
- Pass `fetchFn` as a mock (`jest.fn()`) to intercept HTTP calls
- Pass `sleep` as `() => Promise.resolve()` to skip delays in tests
- Pass `env` as an object with required keys (`NOCODB_API_URL`, `TELEGRAM_BOT_TOKEN`, etc.)

The existing `score-alert.test.js` and `analyze-alert.test.js` tests must continue to pass after each implementation step. Run `npm test -- --testPathPattern="score-alert|analyze-alert|finnhub"` to target only affected files during development.
