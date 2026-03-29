# Combined Spec: 12-scoring-analysis

## Origin Documents
- `spec.md` — initial requirements (6 sections)
- `claude-research.md` — codebase + web research findings
- `claude-interview.md` — 8 Q&A decisions

---

## Context & Problem Statement

The InsiderBuying.ai alert pipeline currently delegates all scoring to Claude Haiku with no deterministic rules. This produces inconsistent scores (the same trade can score 4 one day and 8 another), no respect for 10b5-1 plans, and no ability to explain scores to users or calibrate them over time.

The alert analysis (`analyze-alert.js`) generates a generic 2-3 paragraph output that is structurally inconsistent, lacks real-time market data (current price, earnings date), and has no banned phrase enforcement.

This unit fixes both files: scoring becomes deterministic with a thin AI refinement layer, and analysis becomes structured, data-enriched, and validated.

**Site context**: The `/alerts` page shows both BUY and SELL alerts. Sales (transaction code S) are valid signals and must be scored. Only gifts (G) and tax withholding (F) are excluded.

---

## Scope

**Files modified**: `score-alert.js`, `analyze-alert.js`
**Files created**: `finnhub-client.js` (shared Finnhub helper, reusable by other units)

**Dependencies (must exist from prior units)**:
- Unit 08: NocoDB migration complete — alerts table in NocoDB, not Airtable
- Unit 09: edgar-parser.js provides `filterScorable()` (excludes G and F); enriched filing fields available
- Unit 10: DeepSeek client available with retry logic; `callDeepSeek(prompt, options)` function exists

**Graceful degradation**: If enriched fields from unit 09 are absent (null/undefined), scoring continues with available data and logs a warning. Once unit 09 is stable, strict validation will be added.

---

## Key Decisions (from interview)

| Topic | Decision |
|-------|----------|
| Score range | 1-10 integer (one decimal allowed internally, round to nearest 0.1) |
| Missing upstream fields | Null checks + defaults now; strict validation after unit 09 stable |
| DeepSeek failure | 1 retry (2s backoff) → `final_score = base_score`, log failure |
| Calibration action | Informational Telegram alert only, human decides on weight changes |
| BUY + SELL | Both scored. `direction` field stored. Direction-aware analysis prompts. |
| Excluded transaction codes | G (gift) and F (tax withholding) only. Sales (S) are scored. |
| Finnhub helpers | Shared `finnhub-client.js` module |
| Same-day sell detection | Query NocoDB for same insider + same date transactions |
| Validation failure fallback | Minimal template: `"[INSIDER] [bought/sold] [SHARES] at $[PRICE]. Score: [X]/10."` |
| Volume baseline | 50 alerts/day via `MAX_ALERTS_PER_DAY` env var, configurable |

---

## Section 1: computeBaseScore() — Deterministic Weighted Formula

### Purpose
Replace the 100% AI-driven scoring with a deterministic weighted formula that is reproducible, explainable, and works for both buy and sell transactions.

### Formula Design

Starting from a midpoint of 5.0, adjust based on 5 factors:

**Factor 1 — Transaction Value (30% weight)**
- $10M+: +3.0
- $5M–$10M: +2.4
- $1M–$5M: +1.8
- $500K–$1M: +1.2
- $100K–$500K: +0.6
- <$100K: -1.0

**Factor 2 — Insider Role (25% weight)**
- CEO / Chief Executive Officer: +2.5
- CFO / Chief Financial Officer: +2.0
- President: +1.75
- COO: +1.5
- Director: +1.0
- Default/unknown: +0.5

**Factor 3 — Market Cap Context (20% weight)**
- <$1B (micro/small): +1.5 (same $100K is more meaningful)
- $1B–$10B (mid): +1.2
- $10B–$50B (large): +0.9
- $50B+ (mega): +0.6

**Factor 4 — Cluster Signal (15% weight)**
- 3+ insiders in past 7 days: +0.5
- 2+ insiders in past 7 days: +0.3
- 3+ insiders in past 14 days: +0.2

**Factor 5 — Insider Track Record (5% weight)**
- Avg return >20% over 3+ historical trades: +0.5
- Avg return >10%: +0.3

**Penalties**:
- 10b5-1 plan detected: hard cap at 5 (after all factor additions)
- Gift (G) or tax withholding (F): return 0 (excluded from pipeline)

**Final**: `clamp(round(score * 10) / 10, 1, 10)`

### Direction Handling
The same formula applies to both acquisitions (A) and disposals (D). For sells, a high score = high conviction of insider selling (large, significant, senior insider). The `direction` field is stored in NocoDB and drives the frontend BUY/SELL badge. AI analysis tone changes based on direction.

### Missing Field Handling
- `marketCapUsd` null → skip Factor 3 (no adjustment)
- `historicalAvgReturn` null → skip Factor 5
- `clusterCount7Days` null → skip Factor 4
- Log: `WARN: missing marketCapUsd for ${ticker}, skipping factor 3`

---

## Section 2: AI Refinement Layer (±1 only)

### Purpose
After the deterministic base score, allow a constrained AI pass for qualitative context that cannot be computed (first buy in years, post-earnings dip purchase, coordinated officer cluster, quiet period anomaly).

### Prompt Template

```
Base score: {base_score}/10 (deterministic formula).
Direction: {direction} (A=acquisition, D=disposal)
Adjust by -1, 0, or +1 ONLY.

Consider ONLY these factors:
1. Is this the first insider buy/sell in 2+ years? (rare = +1 for buy, -1 for sell)
2. Did insider buy during a post-earnings dip? (contrarian = +1)
3. Is timing unusual (e.g., pre-announcement quiet period)? (-1)
4. Is this a coordinated cluster of 3+ officers in same week? (+1)

If none apply, respond with {"adjustment": 0, "reason": "no qualifying factors"}.
Respond with JSON only: {"adjustment": -1|0|1, "reason": "one sentence max"}
```

### Implementation
- Call DeepSeek with strict JSON mode, temperature 0.0
- Parse response: `adjustment` must be -1, 0, or 1 (clamp if out of range)
- `final_score = clamp(base_score + adjustment, 1, 10)`
- On DeepSeek failure: retry once (2s backoff). If still fails, `final_score = base_score`, log `WARN: DeepSeek refinement failed, using base score`
- Store both `base_score`, `ai_adjustment`, `ai_reason`, and `final_score` in NocoDB

---

## Section 3: Transaction Filtering + Same-Day Sell Detection

### Filtering Chain

1. **edgar-parser `filterScorable()`** (upstream, unit 09): removes G and F before they reach score-alert.js
2. **score-alert.js double-check**: before calling `computeBaseScore()`, check `transactionCode in ['G', 'F']` → log skip, return null
3. **Sales are NOT filtered**: transaction code S passes through normally

### 10b5-1 Hard Cap
- `filing.is10b5Plan` flag from edgar-parser (set if Form 4 footnotes mention "10b5-1")
- `computeBaseScore()` applies cap internally: `if (filing.is10b5Plan) score = Math.min(score, 5)`
- Logged in score decision record

### detectSameDaySell()
For option exercises (transaction code M or X), check if the same insider sold the same shares on the same date:

1. Query NocoDB alerts table: `(insiderCik = filing.insiderCik AND filingDate = filing.filingDate AND transactionCode = 'S')`
2. If matching sell found with overlapping share count: this is an exercise-and-sell (exec cashing out), not a conviction buy
3. Return `score = 0` and log `"exercise-and-sell detected, score overridden to 0"`
4. If NocoDB query fails: log warning, continue with computed score (conservative graceful fallback)

### Score Decision Logging
Every scored alert emits a structured log:
```json
{
  "ticker": "AAPL", "insiderName": "Tim Cook", "transactionCode": "P",
  "direction": "A", "baseScore": 7.2, "aiAdjustment": 1,
  "aiReason": "First purchase in 3 years",
  "finalScore": 8, "is10b5Plan": false, "sameDay Sell": false,
  "timestamp": "2026-03-28T14:22:00Z"
}
```

---

## Section 4: Weekly Score Calibration

### Purpose
Detect if the scoring formula is producing a skewed distribution over time (e.g., too many 8+ scores due to a bull market, or too few after a quiet insider period). Sends a Telegram alert when drift is detected.

### Target Distribution
- Score 8-10: 10–20% of all scored alerts
- Score 6-7: 30–40%
- Score 4-5: 30–40%
- Score 1-3: 10–20%

### Calibration Function `runWeeklyCalibration()`

1. Query NocoDB: all `scored_alerts` from `past 7 days` (date filter, `limit=1000`)
2. Compute bucket counts: [1-3, 4-5, 6-7, 8-10]
3. Compute percentages
4. Flag if: 8+ bucket > 25% OR 8+ bucket < 5% OR any bucket is 0%
5. If flagged: send Telegram message with distribution table and raw numbers
6. Always: write record to `score_calibration_runs` NocoDB table: `{runDate, totalAlerts, pct1to3, pct4to5, pct6to7, pct8to10, flagged}`

### NocoDB Tables Required
- `scored_alerts`: existing alerts table (already used by deliver-alert.js). Needs `final_score`, `direction`, `is10b5Plan`, `ai_adjustment`, `ai_reason` columns.
- `score_calibration_runs`: new table for calibration history. Columns: `run_date`, `total_alerts`, `pct_1_3`, `pct_4_5`, `pct_6_7`, `pct_8_10`, `flagged`.

### n8n Trigger
- Separate n8n node: weekly Schedule Trigger (Monday 8AM ET)
- Calls `runWeeklyCalibration()` exported from score-alert.js

---

## Section 5: analyze-alert.js — Structured Analysis

### Prompt Structure: Hook / Context / What-to-Watch

Replace the existing "TRADE SIGNAL / HISTORICAL CONTEXT / RISK FACTORS" structure.

**Direction-aware prompt template**:

```
Write a concise insider {direction_text} alert analysis for ${ticker}.
Length target: {targetWords} words. Hard max: {maxWords} words.

STRUCTURE (3 parts, use these exact labels):
1. HOOK (1-2 sentences): Start with the most impressive fact.
   For buys: "[InsiderName] ([Title]) bought X shares at $P for $T — [hook_context]"
   For sells: "[InsiderName] ([Title]) sold X shares at $P for $T — [hook_context: tax plan or bearish signal?]"

2. CONTEXT (2-3 sentences): Why now? Track record if available. 52-week position.
   Current price: ${current_price} ({pct_change_today}% today).
   {if track_record: "Last time [name] {bought/sold} in [year], stock moved [return]% in [period]."}
   {if earnings_days <= 60: "Earnings in {days} days."}

3. WHAT TO WATCH (1-2 sentences): Specific catalyst with date or level.
   "Earnings on {date}", "FDA decision expected {month}", "Next resistance: ${price}", "Support: ${price}"

TONE: Informative, slightly edgy. Use "suggests", "could indicate", "worth watching".
REQUIRED: Include at least 1 cautionary sentence using one of: "however", "risk", "caution", "could", "routine", "consider".
BANNED PHRASES (instant fail): "guaranteed", "will moon", "insiders know more than us", "to the moon", "rocket"
Include specific $ and % numbers. No vague sentences.
```

### Word Targets by Score

| Score | Target | Max |
|-------|--------|-----|
| 9-10  | 225    | 300 |
| 7-8   | 200    | 275 |
| 6-7   | 175    | 225 |
| 4-5   | 125    | 175 |
| 1-3   | 100    | 150 |

### Data Injected Per Alert

| Field | Source | Fallback |
|-------|--------|---------|
| `current_price` | `finnhub-client.getQuote(ticker).c` | "N/A" |
| `pct_change_today` | `finnhub-client.getQuote(ticker).dp` | omit |
| `earnings_days` | Alpha Vantage cache (NocoDB lookup) | omit |
| `portfolio_pct` | `(shares / sharesOwnedAfter * 100)` | omit if sharesOwnedAfter absent |

### finnhub-client.js (new shared module)

Functions to implement:
- `getQuote(ticker)` → `{c, dp, h, l, o, pc}` (current price, % change, high, low, open, prev close)
- `getNextEarningsDate(ticker)` → ISO date string or null (from Alpha Vantage earnings calendar cache in NocoDB)

Caching strategy:
- Quotes: in-memory cache with 60s TTL during market hours, 4h TTL after close
- Earnings: read from NocoDB `earnings_calendar` table (populated daily by separate job)

---

## Section 6: validate-analysis.js — Hardened Validation

### Validation Rules

1. **Word count**: `words >= target * 0.8` AND `words <= max`
2. **Banned phrases**: none of the 5 banned strings (case-insensitive)
3. **Dollar amount**: at least one `$` followed by digits present
4. **Percentage**: at least one `%` present
5. **Cautionary language**: at least one of: "however", "risk", "caution", "could", "routine", "consider"

### Retry Logic
- First attempt: DeepSeek generates analysis
- On validation failure: retry once with same prompt + `"Previous attempt failed validation: {errors}. Fix these issues."`
- If second attempt also fails: use minimal template fallback: `"{insiderName} {bought/sold} {shares} shares at ${price}. Score: {finalScore}/10."`
- Log: which attempt passed, which rules failed

### Validation Function Signature
```javascript
function validateAnalysis(text, score, direction) {
  // returns { valid: bool, errors: string[] }
}
```

---

## Definition of Done

1. `computeBaseScore()` produces scores within ±0.5 of expected for 10 fixture filings
2. Gift (G) and tax withholding (F) transactions return null — never reach analysis
3. Sales (S) transactions are scored and reach analysis with direction-aware prompt
4. 10b5-1 plan always produces `final_score <= 5`
5. `detectSameDaySell()` returns 0 for exercise-and-sell patterns
6. DeepSeek failure falls back to base score (with one retry)
7. Analysis uses Hook/Context/What-to-Watch structure
8. Banned phrases, word count, cautionary language all enforced
9. Minimal template fallback deployed for double-validation failures
10. Weekly calibration function exists, fires Telegram when 8+ bucket > 25%
11. `finnhub-client.js` shared module created with quote and earnings caching
12. `direction` field stored in NocoDB for each alert
13. All existing score-alert.test.js and analyze-alert.test.js tests pass

---

## Technical Constraints

- **n8n Code Node sandbox**: no global fetch — use `require('https')` in finnhub-client.js
- **No class syntax** — functional imperative style throughout
- **String templates** with `{{variable}}` interpolation for n8n compatibility
- **Dependency injection** — fetchFn, sleep, env as parameters for testability
- **No breaking changes** to `runScoreAlert()` and `runAnalyzeAlert()` function signatures (called by w4-market.json and w4-afterhours.json)
