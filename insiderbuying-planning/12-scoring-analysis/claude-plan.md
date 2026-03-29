# Implementation Plan: 12-scoring-analysis

## What We're Building

Unit 12 upgrades two files in the InsiderBuying.ai n8n alert pipeline:

1. **`score-alert.js`** — replace the current AI-only scoring (Claude Haiku assigns 1-10 with no rules) with a deterministic weighted formula plus a constrained AI refinement step of ±1. Add same-day sell detection, weekly calibration, and comprehensive score logging.

2. **`analyze-alert.js`** — replace the current generic 2-3 paragraph output with a structured Hook/Context/What-to-Watch format. Inject real-time market data (current price, % change, days-to-earnings). Add word-count targets by score, banned phrase enforcement, and a fallback template for double-validation failures.

3. **`finnhub-client.js`** (new, shared) — a reusable Finnhub API helper module that provides quote lookup with in-memory caching and earnings date retrieval from a NocoDB cache. Used by `analyze-alert.js` and available to future units (newsletter, articles).

The goal is consistent, explainable scores and structured, data-rich analysis copy that holds up to basic editorial review. The system must handle both buy and sell alerts, since the live `/alerts` page on earlyinsider.com shows both transaction directions.

---

## Why This Architecture

### Deterministic Base + Constrained AI Refinement

The research phase confirmed this pattern is used by professional insider tracking services (Quiver Quantitative, InsiderScore). Delegating scoring entirely to an LLM produced inconsistent results because the LLM has no stable reference point — the same filing could score 4 or 8 depending on phrasing.

The chosen architecture separates concerns cleanly: the base formula handles everything that can be computed (transaction value, insider role, market cap, cluster signal, track record). The AI handles only what cannot be computed — qualitative context like "first purchase in three years" or "bought into an earnings dip." Constraining AI to ±1 means the formula is 85–90% responsible for the final score, making it auditable.

### Direction-Aware Design

The spec originally assumed buy-only scoring, but the actual site displays both buys and sells. The plan treats this as a first-class requirement: the same formula applies to both directions, the `direction` field flows through the entire pipeline to NocoDB, and the AI analysis prompt changes tone based on direction. The exclusion list is deliberately narrow: only gifts (G) and tax withholding (F) are excluded. Sales (S, including option exercises that are held rather than immediately sold) are valid signals.

### Shared finnhub-client.js

The interview confirmed other units will need Finnhub data (newsletter, articles). Building a shared module with in-memory caching is more efficient than recreating the fetch logic in each file. The free Finnhub tier (60 calls/minute) is sufficient for 50 alerts/day with caching — quotes are cached 60 seconds during market hours and 4 hours after close.

---

## File Structure

```
n8n/code/insiderbuying/
  score-alert.js          — modified: adds computeBaseScore(), refinement, filtering, calibration
  analyze-alert.js        — modified: structured prompt, data injection, validation
  finnhub-client.js       — NEW: shared Finnhub quote + earnings date helpers
```

No workflow JSON changes are needed — the existing `w4-market.json` and `w4-afterhours.json` call `runScoreAlert()` and `runAnalyzeAlert()` by name, and those function signatures remain unchanged.

---

## Section 1: Deterministic Scoring Formula

### Where It Lives

A new `computeBaseScore(filing)` function is added to `score-alert.js`. It replaces the current call to Claude Haiku inside `runScoreAlert()`.

### Input Shape

The `filing` object arrives from `sec-monitor.js` (which calls edgar-parser). The fields this function reads:

```javascript
{
  transactionValue,      // USD amount of the trade
  transactionCode,       // 'P' (purchase), 'S' (sale), 'M' (exercise), 'G' (gift), 'F' (tax), etc.
  direction,             // 'A' (acquisition) or 'D' (disposal) — from Form 4 field
  canonicalRole,         // normalized role string: 'CEO', 'CFO', 'Director', etc.
  marketCapUsd,          // company market cap at time of filing (may be null)
  clusterCount7Days,     // number of distinct insiders at same company buying/selling in past 7 days
  clusterCount14Days,    // same, 14-day window
  historicalAvgReturn,   // insider's average price return on past buys (may be null)
  historicalCount,       // number of past trades in track record
  is10b5Plan,            // boolean — true if Form 4 footnotes mention a 10b5-1 plan
  insiderCik,            // insider identifier for same-day sell lookup
  filingDate,            // ISO date string
  sharesOwnedAfter       // total shares after transaction (may be null)
}
```

### Scoring Logic

Start at 5.0 (the midpoint). Apply five factor groups in sequence, accumulating additive adjustments. Clamp the final result to [1, 10] with one decimal place of precision.

**Factor 1 — Transaction Value (target weight: ~30%)**: Larger open-market purchases or sales are more informative. The scale uses USD brackets from <$100K (penalty of -1.0) up to $10M+ (+3.0). Values in between get interpolated via discrete steps.

**Factor 2 — Insider Role (target weight: ~25%)**: CEOs and CFOs have more material non-public information than directors; their trades carry more signal. The plan defines a role map that covers common Form 4 title variants. Titles not in the map receive a small default bonus (+0.5) rather than zero, so unknown titles aren't penalized.

**Factor 3 — Market Cap Context (target weight: ~20%)**: A $500K purchase at a $200M microcap is more meaningful than the same amount at Apple. The adjustment ranges from +1.5 for micro/small-cap to +0.6 for mega-cap. If `marketCapUsd` is null (data not yet available from unit 09), this factor is skipped silently with a warning log.

**Factor 4 — Cluster Signal (target weight: ~15%)**: When multiple insiders at the same company trade in the same direction within a short window, it elevates signal quality. Three or more insiders in 7 days earns +0.5; two in 7 days earns +0.3; three in 14 days earns +0.2.

**Factor 5 — Track Record (target weight: ~5%)**: If this insider's historical purchases have averaged >20% return over 3+ trades, add +0.5. If >10% return with at least 2 trades, add +0.3. If `historicalAvgReturn` is null or `historicalCount < 2`, skip this factor.

**Penalties and Overrides**:
- 10b5-1 plan detected (`filing.is10b5Plan = true`): this flag is recorded on the `filing` object. The cap (final score ≤ 5) is applied **after** AI refinement, not inside `computeBaseScore()`. This prevents the AI +1 from pushing a 10b5-1 trade above 5. When `is10b5Plan` is true, AI refinement is skipped entirely (saves API call, enforces cap without ambiguity).
- Gift (G) or tax withholding (F) transaction code: return 0 immediately without computing factors. These transactions have no informational content.
- Score = 0 records (G, F, exercise-and-sell): returned as `null` from `runScoreAlert()`. They are NOT stored in NocoDB and do NOT enter the analysis pipeline. The scoring decision is captured in the structured log only.

### Output

Return a single number, 1–10, rounded to one decimal (e.g., 7.3). The caller stores this as `base_score`.

### Expected Score Distribution

Based on research from professional services, the expected distribution from this formula should be approximately:
- Scores 8–10: 10–20% of all processed alerts
- Scores 6–7: 30–40%
- Scores 4–5: 30–40%
- Scores 1–3: 10–20%

If the system is consistently producing 30%+ of scores in the 8–10 bucket, the factor weights need re-tuning.

---

## Section 2: AI Refinement Layer

### Where It Lives

A `callDeepSeekForRefinement(filing, baseScore)` function in `score-alert.js`, called immediately after `computeBaseScore()`. The existing DeepSeek client from unit 10 is used.

### What It Does

Sends a short structured prompt to DeepSeek asking for a -1, 0, or +1 adjustment. The prompt includes the base score, transaction direction, and four specific qualifying factors that the deterministic formula cannot compute. Temperature is set to 0.0 for maximum consistency.

The prompt is direction-aware: the four qualifying factors are framed appropriately for buys vs. sells. For example, "first purchase in 2+ years" is a buy signal; for sells, the equivalent would be "first sale after years of only buying."

### Response Validation

DeepSeek must return valid JSON with exactly two fields: `adjustment` (integer -1, 0, or 1) and `reason` (string). Any response that fails JSON parsing, has an out-of-range adjustment, or is empty triggers the retry path.

On first failure: wait 2 seconds, retry once with the same prompt. On second failure: log a warning, set `ai_adjustment = 0`, and proceed with `final_score = base_score`. This ensures the pipeline never stalls waiting for AI.

### Final Score

`final_score = clamp(base_score + ai_adjustment, 1, 10)`

Both `base_score`, `ai_adjustment`, and `ai_reason` are stored in the NocoDB alert record for audit purposes.

---

## Section 3: Transaction Filtering and Same-Day Sell Detection

### Filtering Chain

Filtering happens at two levels:

1. **Upstream (unit 09)**: `edgar-parser.filterScorable()` strips G and F transactions before they reach score-alert.js. This is the primary filter.

2. **Local defense (score-alert.js)**: Before calling `computeBaseScore()`, `runScoreAlert()` checks the transaction code one more time. If G or F slips through, it logs a skip and returns null. This is a belt-and-suspenders check, not the primary filter.

Sales (transaction code S) are explicitly not filtered. They pass through both levels and are scored normally.

### 10b5-1 Detection

The `is10b5Plan` boolean comes from edgar-parser (set when Form 4 footnotes reference a 10b5-1 plan). The cap is enforced inside `computeBaseScore()` itself. If the field is null or absent (unit 09 not yet stable), the cap is not applied — this is the "graceful now, strict later" behavior for missing fields.

### detectSameDaySell()

This function addresses option exercise trades. When a corporate insider exercises stock options (code M or X), they sometimes simultaneously sell the acquired shares on the same day (an "exercise-and-sell"). This is purely financial housekeeping, not a conviction trade, and should score 0.

The function queries NocoDB for alerts with the same `insiderCik` and `transactionDate` (the actual trade date from the Form 4, NOT `filingDate` which can be days later) that have transaction code S. The match uses `transactionDate` to correctly handle cases where exercise and sell happen on the same calendar day but are filed together days later.

**Partial sell threshold**: Not every sell after an exercise is housekeeping. Insiders often sell a portion to cover taxes while keeping the majority. Only classify as exercise-and-sell (score = 0) if `sharesSold >= sharesExercised * 0.80`. If shares sold are less than 80% of shares exercised, the trade retains its computed score — the insider kept meaningful exposure.

If the NocoDB query fails (network error, NocoDB unavailable), the function logs a warning and returns `undefined`, telling the caller to proceed with the computed score. This conservative fallback prevents a NocoDB outage from dropping all option exercise alerts.

### Structured Score Logging

After every scoring decision (whether the alert is scored, skipped, capped, or overridden), `runScoreAlert()` emits a structured JSON log object containing: ticker, insider name, transaction code, direction, base score, AI adjustment, final score, skip reason (if applicable), and timestamp. This log is essential for debugging calibration issues and auditing individual score decisions.

---

## Section 4: Weekly Score Calibration

### Where It Lives

`runWeeklyCalibration()` is exported from `score-alert.js` but called by a separate n8n Schedule Trigger node (not the main alert pipeline). This avoids adding latency to per-alert processing.

### What It Does

Queries NocoDB for all scored alerts from the past 7 days. Buckets them into four ranges: 1–3, 4–5, 6–7, 8–10. Computes the percentage in each bucket. Checks against the expected distribution targets.

**Alert condition**: if the 8–10 bucket exceeds 25% of all alerts (formula is too generous), or falls below 5% (formula is too strict), or any bucket is entirely empty (something is wrong with the pipeline), a Telegram message is sent to the admin chat with the full distribution table.

**Always**: writes a record to the `score_calibration_runs` NocoDB table with the date, total alert count, per-bucket percentages, and whether the alert fired.

### NocoDB Schema Additions

Two changes are needed to the NocoDB alert table:
- Add columns: `base_score` (decimal), `ai_adjustment` (integer -1/0/1), `ai_reason` (text), `direction` (text 'A'/'D'), `is10b5_plan` (boolean)
- These columns may already exist from unit 08 if the migration was thorough; if not, add them here.

A new `score_calibration_runs` table is created with: `run_date` (date), `total_alerts` (integer), `pct_1_3`, `pct_4_5`, `pct_6_7`, `pct_8_10` (decimal), `flagged` (boolean).

---

## Section 5: Structured Alert Analysis

### Where It Lives

Refactoring of `runAnalyzeAlert()` and its prompt construction inside `analyze-alert.js`.

### Word Target System

A `getWordTarget(score)` function maps the final score to a `{target, max}` pair. Lower-scored alerts get shorter word budgets (there is less to say about a routine director purchase). Higher-scored alerts warrant more depth. The function is called before prompt construction so the target values can be injected into the prompt template.

### Direction-Aware Prompt

The core prompt template takes `direction_text` ("buy" vs. "sell") and adjusts framing accordingly. For buy alerts, the hook frames conviction and bullish context. For sell alerts, the hook frames the ambiguity between bearish conviction and routine tax/diversification selling. Both directions require the same structural sections: Hook, Context, What-to-Watch.

The prompt is explicit about what "What-to-Watch" means: it must name a specific catalyst with a date or price level, not a vague statement like "watch for continued buying." Concrete examples are given in the prompt: "Earnings on April 15", "FDA decision expected May", "Next resistance: $52.30."

### Data Injection

Before constructing the prompt, `runAnalyzeAlert()` calls `finnhub-client.getQuote(ticker)` to get current price and today's percentage change. It also looks up days-to-earnings from the NocoDB `earnings_calendar` table (populated daily by a separate job from unit 09). If the earnings lookup returns null, that sentence is simply omitted from the prompt rather than filled with "unknown."

If `sharesOwnedAfter` is present in the filing, the portfolio percentage is computed and injected. This adds concreteness: "represents 12% of their current holdings" is far more compelling than just "bought 10,000 shares."

---

## Section 6: Analysis Validation

### Where It Lives

A `validateAnalysis(text, score, direction)` function in `analyze-alert.js`, called after each DeepSeek response.

### Rules Checked

Five independent rules are evaluated and all failures collected before deciding whether to retry. Rules 4 is conditional — it only fires if the relevant data was actually available when the prompt was built:

1. **Word count**: the text must be at least `target * 0.70` words (minimum floor) and not exceed the hard maximum. The upper tight bound is removed — LLMs cannot reliably hit exact word counts, so only a minimum floor and hard max are enforced.
2. **No banned phrases**: five specific phrases that imply certainty or hype are prohibited. The check is case-insensitive.
3. **Dollar amount present**: the text must contain at least one `$` followed by digits. This catches generic analyses that cite no specific numbers.
4. **Percentage present** *(conditional)*: enforced only if percentage data was injected into the prompt (either `pct_change_today` from Finnhub or `portfolio_pct` from `sharesOwnedAfter`). If neither data point was available, this rule is skipped — the LLM cannot be penalized for data that was never given to it. A boolean `percentageDataAvailable` flag is passed to `validateAnalysis()`.
5. **Cautionary language**: at least one of several hedging words must appear (however, risk, caution, could, routine, consider). This prevents analysis from reading as a guaranteed-return pitch and applies to both buy and sell alerts.

### Retry Flow

On first validation failure, a second prompt is sent to DeepSeek with the original request plus an appended error list: "Previous attempt failed validation: [errors]. Fix these issues."

If the second attempt also fails validation, `runAnalyzeAlert()` returns the minimal template directly **without calling `validateAnalysis()` again**: `"{insiderName} {bought/sold} {shares} shares at ${price}. Score: {finalScore}/10."` The fallback bypasses validation by design — it is always structurally safe. Both the original failure reason and which attempt succeeded are logged.

### JSON Parsing Robustness

The DeepSeek response for the refinement layer is parsed by stripping markdown code fences (` ```json ... ``` `) before calling `JSON.parse()`. This handles the common case where the model wraps its JSON response in markdown blocks despite being instructed not to.

---

## Section 7: finnhub-client.js (Shared Module)

### Purpose

A self-contained JavaScript module that wraps Finnhub API calls with in-memory caching. It is `require()`-able from any n8n Code Node.

### Functions

```javascript
function getQuote(ticker, fetchFn, env)
// Returns: { c, dp, h, l, o, pc } — current price, % change, high, low, open, prev close
// Caches 60s during market hours, 4h after market close (based on current time ET)
// Returns null on API error or rate limit, logs warning

function getNextEarningsDate(ticker, fetchFn, env)
// Returns: ISO date string (e.g., "2026-04-25") or null
// Reads from NocoDB earnings_calendar table — populated daily by unit 09 job
// Does NOT call Alpha Vantage directly (avoids 25/day rate limit)
// Returns null if no upcoming earnings found within 90 days
```

### Caching

An in-memory `Map` keyed by ticker with TTL-based expiry. Market hours are defined as Mon–Fri 9:30–16:00 ET. **Market status is computed using `Intl.DateTimeFormat('en-US', {timeZone: 'America/New_York'})` to convert the current UTC time to ET** — n8n runs in UTC and native `Date.getHours()` would return the wrong value. The caching logic applies TTL based on market status: 60 seconds during market hours, 4 hours after close.

**Lazy TTL cleanup**: on every cache read, if the entry is expired, it is deleted from the Map and a fresh API call is made. This prevents unbounded Map growth in long-running n8n instances without requiring a separate cleanup timer. The Map will naturally stay small because only active tickers for recent alerts are kept.

Because n8n Code Nodes are executed inside a Node.js process that persists between runs (within the same n8n process lifetime), the in-memory cache is shared across executions of the same Code Node within a session. This makes caching effective for high-frequency pipeline runs (every 15 minutes in w4-market.json). If n8n restarts, the cache starts cold — acceptable behavior.

### n8n Compatibility

The module uses `require('https')` for HTTP calls (no global fetch in n8n Code Nodes). It follows the project's dependency injection pattern: `fetchFn` and `env` are passed as parameters for testability. The module exports `{ getQuote, getNextEarningsDate }`.

---

## Testing Strategy

All tests use Jest with Node.js test environment, following the existing 515-test suite's patterns.

### score-alert.test.js additions

**computeBaseScore() fixture tests** — 10 representative filings with pre-computed expected scores. Key cases:
- CEO open market purchase of $5M at mid-cap → expect ~8.x
- Director purchase of $100K → expect ~5.x
- CEO purchase under 10b5-1 plan → expect exactly 5 (cap)
- Gift transaction (code G) → expect 0 (excluded)
- CEO sale of $3M at small-cap → expect ~7.x (sell scored same as buy)
- Exercise-and-hold (code M, no same-day S) → expect normal score

**Null field handling** — filings with `marketCapUsd: null`, `historicalAvgReturn: null`, `clusterCount7Days: null` must not throw and must produce a score.

**AI refinement** — mock DeepSeek returning +1, 0, -1, invalid JSON, empty string. Verify clamping, fallback, and that `final_score` stays within [1, 10].

**Calibration** — mock NocoDB returning skewed distributions. Verify Telegram alert fires when 8+ bucket > 25%, does not fire when distribution is healthy. Verify that zero alerts in a week (empty result) returns a "no alerts" message without dividing by zero.

**detectSameDaySell()** — dedicated tests: (a) full exercise-and-sell (sold ≥80%, score = 0), (b) partial sell below threshold (sold 30%, normal score passes through), (c) NocoDB query failure (graceful: score proceeds with computed value), (d) same insider different date (no match, normal score).

### analyze-alert.test.js additions

**validateAnalysis()** — individual test for each of the 5 validation rules (pass and fail). Edge cases: text at exactly minimum word count, text at exactly maximum word count, banned phrase in a different case.

**Word target routing** — `getWordTarget(score)` returns correct `{target, max}` for scores 1, 4, 6, 8, 10.

**Fallback template** — mock DeepSeek always failing; verify minimal template is returned and contains the expected fields.

**Direction-aware prompt** — verify that when `direction = 'D'` (disposal), the prompt string contains "sell" framing and not bullish framing.

### finnhub-client.test.js (new)

**getQuote()** — mock `fetchFn` returning a valid Finnhub quote response. Verify fields are mapped correctly. Verify cache: second call with same ticker does not call fetchFn again within TTL.

**getNextEarningsDate()** — mock NocoDB query. Verify ISO date string returned. Verify null returned when no upcoming earnings within 90 days.

**Rate limit handling** — mock fetchFn returning HTTP 429; verify `getQuote` returns null and logs a warning.

**Market hours + timezone** — force current time to known ET values (market open, market closed, weekend) and verify TTL values are correct. Include a test with a DST boundary date to confirm `Intl.DateTimeFormat` handles it correctly.

---

## Integration with Existing Pipeline

The `runScoreAlert(filing, deps)` and `runAnalyzeAlert(alert, deps)` signatures remain unchanged. The w4-market.json and w4-afterhours.json workflow nodes call these functions by name and pass `deps` (which includes `fetchFn`, `sleep`, and `env`). No workflow JSON changes are required.

The `direction` field that flows out of `runScoreAlert()` is a new field in the alert object. `deliver-alert.js` (unit 08, already migrated to NocoDB) will need to include `direction` in its NocoDB write. If unit 08 doesn't include it yet, adding it is a one-line change in `deliver-alert.js` — it's not scope for this unit but should be noted in the integration handoff.

The weekly calibration node is a new n8n Schedule Trigger → Code Node that calls `runWeeklyCalibration()` directly. This is a new workflow addition, but it is minimal (two nodes) and can be documented in the unit's usage notes.

---

## Dependencies on Prior Units

| Dependency | What This Unit Needs | If Not Available |
|-----------|---------------------|-----------------|
| Unit 08 (NocoDB migration) | NocoDB client in scope (`NOCODB_API_URL`, `NOCODB_API_TOKEN` env vars) | Same-day sell detection and calibration will silently skip |
| Unit 09 (data-pipeline) | `is10b5Plan`, `marketCapUsd`, `clusterCount7Days`, `historicalAvgReturn` fields on filing | Skip those factors, log WARN |
| Unit 09 (data-pipeline) | NocoDB `earnings_calendar` table populated | `getNextEarningsDate()` returns null, earnings sentence omitted |
| Unit 10 (AI provider swap) | DeepSeek client `callDeepSeek(prompt, options)` | Entire refinement layer falls back to base score |

This unit is designed so that every missing dependency degrades gracefully without crashing the pipeline.
