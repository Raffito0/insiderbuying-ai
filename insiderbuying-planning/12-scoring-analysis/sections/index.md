<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-compute-base-score
section-02-ai-refinement
section-03-transaction-filtering
section-04-weekly-calibration
section-05-structured-analysis
section-06-analysis-validation
section-07-finnhub-client
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-compute-base-score | — | 02, 03 | Yes |
| section-02-ai-refinement | 01 | 03 | No |
| section-03-transaction-filtering | 01, 02 | 04 | No |
| section-04-weekly-calibration | 03 | — | Yes |
| section-05-structured-analysis | — | 06 | Yes |
| section-06-analysis-validation | 05 | — | No |
| section-07-finnhub-client | — | 05 | Yes |

## Execution Order

1. **section-01-compute-base-score**, **section-05-structured-analysis**, **section-07-finnhub-client** — no dependencies, all three can start in parallel
2. **section-02-ai-refinement** — after section-01
3. **section-03-transaction-filtering** — after section-01 and section-02
4. **section-04-weekly-calibration** — after section-03
5. **section-06-analysis-validation** — after section-05

Practical batches:
- **Batch 1** (parallel): section-01, section-05, section-07
- **Batch 2** (parallel): section-02, section-06
- **Batch 3**: section-03
- **Batch 4**: section-04

## Section Summaries

### section-01-compute-base-score
Add `computeBaseScore(filing)` to `score-alert.js`. Implements the deterministic 5-factor weighted formula (transaction value, insider role, market cap, cluster signal, track record). Handles null fields gracefully with warning logs. Clamps output to [1, 10] with one decimal. Write tests first: 10 fixture filings, all factor combinations, null field handling, clamping.

### section-02-ai-refinement
Add `callDeepSeekForRefinement(filing, baseScore)` to `score-alert.js`. Sends a direction-aware prompt to DeepSeek requesting ±1 adjustment. Validates JSON response (strips markdown fences, clamps out-of-range values). One retry on failure, then falls back to base score. Enforces 10b5-1 final cap after AI adjustment. Stores `base_score`, `ai_adjustment`, `ai_reason`, `final_score`. Write tests first: response parsing, retry logic, fallback behavior, 10b5-1 cap after adjustment.

### section-03-transaction-filtering
Update `runScoreAlert()` in `score-alert.js`. Add local G/F double-check before scoring. Add `detectSameDaySell()` for option exercises (code M/X): queries NocoDB by `insiderCik` + `transactionDate`, applies 80% threshold for partial sells. Add structured score logging. Clarify that score=0 records are not stored or forwarded. Write tests first: filtering chain, same-day sell with full/partial/different-date cases, NocoDB failure fallback, score logging output shape.

### section-04-weekly-calibration
Add `runWeeklyCalibration()` to `score-alert.js` (exported for separate n8n Schedule node). Queries NocoDB for past-7-days scored alerts. Buckets into [1-3, 4-5, 6-7, 8-10]. Guards division-by-zero for empty weeks. Fires Telegram if 8-10 bucket >25% or <5% or any bucket empty. Always writes to `score_calibration_runs` NocoDB table. Write tests first: bucketing logic, Telegram trigger conditions, empty-week guard, NocoDB write shape.

### section-05-structured-analysis
Rewrite `runAnalyzeAlert()` in `analyze-alert.js`. Add `getWordTarget(score)` function. Rewrite prompt with direction-aware Hook/Context/What-to-Watch structure. Inject Finnhub quote data and earnings date from NocoDB cache. Compute portfolio percentage if `sharesOwnedAfter` present. Track `percentageDataAvailable` flag for validation. Write tests first: word target routing, direction-aware prompt content, data injection, missing data graceful omission.

### section-06-analysis-validation
Add `validateAnalysis(text, score, direction, percentageDataAvailable)` to `analyze-alert.js`. Five rules: word count floor (target×0.70) + hard max, no banned phrases, dollar amount present, percentage present (conditional), cautionary language. Retry with error list on failure. Return minimal template fallback on double failure (bypass validation). Write tests first: each rule pass/fail, conditional Rule 4, retry flow, fallback template behavior.

### section-07-finnhub-client
Create `n8n/code/insiderbuying/finnhub-client.js`. Implements `getQuote(ticker, fetchFn, env)` and `getNextEarningsDate(ticker, fetchFn, env)`. In-memory Map cache with TTL-based lazy cleanup. Market hours computed via `Intl.DateTimeFormat('en-US', {timeZone: 'America/New_York'})`. Handles HTTP 429/500 by returning null with warning log. Uses `require('https')` (no global fetch in n8n). Write tests first: quote field mapping, cache hit/miss, lazy TTL cleanup, rate limit handling, market hours with DST boundary.
