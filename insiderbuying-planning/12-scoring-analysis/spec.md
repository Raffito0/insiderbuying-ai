# Spec: 12-scoring-analysis

## Purpose
Replace the AI-only scoring approach with a deterministic weighted formula (fixes score inflation and inconsistency). Upgrade alert analysis from a generic 2-3 paragraph output to a structured Hook/Context/What-to-Watch format with score-variable length, current price, earnings date, and banned phrase enforcement.

## Scope
**Files modified**: score-alert.js, analyze-alert.js
**Files created**: None (all changes in-file)

## Reference Files
- WORKFLOW-CHANGES.md: CAT 9 (gaps 9.1-9.8), CAT 10 (gaps 10.1-10.10)
- PROMPT-WORKFLOW-FRAMEWORK.md: CAT 9 scoring formula, CAT 10 prompt structure

## Sections

### Section 1: computeBaseScore() — Deterministic Formula
Add to score-alert.js:

```javascript
function computeBaseScore(filing) {
  let score = 5.0; // midpoint baseline

  // Factor 1: Transaction Value (weight 30%)
  const value = filing.transactionValue; // USD
  if (value >= 10_000_000) score += 3.0;
  else if (value >= 5_000_000) score += 2.4;
  else if (value >= 1_000_000) score += 1.8;
  else if (value >= 500_000)  score += 1.2;
  else if (value >= 100_000)  score += 0.6;
  else score -= 1.0; // < $100K = below threshold

  // Factor 2: Insider Role (weight 25%)
  const roleScores = {
    CEO: 2.5, 'Chief Executive Officer': 2.5,
    CFO: 2.0, 'Chief Financial Officer': 2.0,
    President: 1.75, COO: 1.5,
    Director: 1.0
  };
  score += roleScores[filing.canonicalRole] ?? 0.5;

  // Factor 3: Market Cap Context (weight 20%)
  const mktCap = filing.marketCapUsd;
  if (mktCap < 1_000_000_000) score += 1.5;      // Micro/small cap — $100K meaningful
  else if (mktCap < 10_000_000_000) score += 1.2; // Mid cap
  else if (mktCap < 50_000_000_000) score += 0.9; // Large cap
  else score += 0.6;                               // Mega cap — $100K = noise

  // Factor 4: Cluster Signal (weight 15%)
  const cluster7d = filing.clusterCount7Days ?? 0;
  const cluster14d = filing.clusterCount14Days ?? 0;
  if (cluster7d >= 3) score += 0.5;
  else if (cluster7d >= 2) score += 0.3;
  else if (cluster14d >= 3) score += 0.2;

  // Factor 5: Track Record (weight 5%)
  const trackRecord = filing.historicalAvgReturn ?? 0;
  const trackCount = filing.historicalCount ?? 0;
  if (trackRecord > 20 && trackCount >= 3) score += 0.5;
  else if (trackRecord > 10) score += 0.3;

  // Penalties
  if (filing.is10b5Plan) score = Math.min(score, 5); // Hard cap at 5
  if (['G', 'F'].includes(filing.transactionCode)) return 0; // Exclude gifts/tax

  return Math.max(1, Math.min(10, Math.round(score * 10) / 10));
}
```

Tests: score for 10 fixture filings with known expected scores. Verify: CEO $5M = ~8, Director $100K = ~5, 10b5-1 CEO $10M = 5 (capped), Gift = 0.

### Section 2: AI Refinement Layer (±1 only)
Update `callDeepSeekForRefinement()` in score-alert.js:

Prompt template:
```
Base score: {base_score}/10 (deterministic formula).
Adjust by -1, 0, or +1 ONLY. Consider ONLY these factors:
1. Is this the first insider buy in 2+ years? (rare = +1)
2. Did insider buy during a post-earnings dip? (contrarian = +1)
3. Is timing unusual (e.g., pre-announcement quiet period)? (-1)
4. Is this a coordinated cluster of 3+ officers in same week? (+1)

Respond with JSON only: {"adjustment": -1|0|1, "reason": "one sentence"}
```

Validate response: parse JSON, clamp adjustment to [-1, 0, 1], apply to base score.
Final score = clamp(base + adjustment, 1, 10).

Tests: mock DeepSeek returns various adjustments, verify clamping, verify final = base + adj within bounds.

### Section 3: Transaction Filtering + 10b5-1 Hard Cap
Update sec-monitor.js → score-alert.js pipeline:

- Pre-filter in sec-monitor.js: `filterScorable(transactions)` from edgar-parser.js excludes G and F codes
- In score-alert.js `runScoreAlert()`: additional check before scoring — if `transactionCode === 'G' || transactionCode === 'F'`, log "skipped: gift/tax" and return null
- 10b5-1 detection: check `filing.is10b5Plan` flag from edgar-parser. Hard cap: `computeBaseScore` already handles this
- `detectSameDaySell(filing)`: if transaction is option exercise (M/X) AND same-day sell exists for same shares → score = 0 (executive cashing out, not conviction buy)
- Log all score decisions: `{ticker, insider, code, baseScore, adjustment, finalScore, reason}`

Tests: gift transaction → null. Tax withholding → null. Option exercise held → normal score. Option exercise same-day sell → 0.

### Section 4: Weekly Score Calibration
Add `runWeeklyCalibration()` function to score-alert.js (called by separate n8n node, weekly):

```javascript
async function runWeeklyCalibration() {
  // 1. Query NocoDB last 7 days of scored alerts
  // 2. Compute distribution: count per bucket (1-3, 4-5, 6-7, 8-10)
  // 3. Target distribution: 8+ = 10-20%, 6-7 = 30-40%, 4-5 = 30-40%, 1-3 = 10-20%
  // 4. If 8+ > 25% OR 8+ < 5%: send Telegram alert with distribution stats
  // 5. Log distribution to NocoDB Score_Calibration table
}
```

Tests: mock NocoDB data with skewed distribution, verify Telegram alert triggered.

### Section 5: analyze-alert.js — Hook/Context/What-to-Watch Structure
Replace the existing "TRADE SIGNAL / HISTORICAL CONTEXT / RISK FACTORS" structure with the correct 3-part structure from PROMPT-WORKFLOW-FRAMEWORK.md:

**Prompt rewrite** (DeepSeek):
```
Write alert analysis for {ticker} insider buy. Length: {targetWords} words.

STRUCTURE (3 parts, in this order):
1. HOOK (first sentence): Start with the most impressive fact.
   Format: "$TICKER {insiderName} ({title}) bought {shares} shares at ${price} for ${total} — {hook_context}"

2. CONTEXT (middle): Why now? Track record if available. 52-week position.
   "Last time {name} bought in {year}, stock ran {return}% in {period}."
   Earnings: mention if within 60 days. Market context.

3. WHAT TO WATCH: Specific catalyst with date.
   "Earnings on {date}" or "FDA decision expected {date}" or "Next resistance: ${price}"

TONE: Informative, slightly edgy. Use "suggests", "could indicate", "worth watching".
Include at least 1 cautionary sentence with "however", "risk", "caution", or "routine 10b5".
MAX {maxWords} words. Use specific $ and % numbers.

BANNED PHRASES (instant fail): "guaranteed", "will moon", "insiders know more than us", "rocket", "to the moon", "100%"
```

**Word targets by score** (add `getWordTarget(score)` function):
- Score 9-10: target=225, max=300
- Score 7-8: target=200, max=275
- Score 6-7: target=175, max=225
- Score 4-5: target=125, max=175

**Data to inject** (add data fetching):
- Current price: Finnhub `getQuote(ticker).c`
- % change today: Finnhub `getQuote(ticker).dp`
- Days to earnings: `getNextEarningsDate(ticker)` from Alpha Vantage cache
- Portfolio %: if `sharesOwnedAfter` in filing, calculate `(transaction.shares / sharesOwnedAfter * 100).toFixed(1)%`

### Section 6: validate-analysis.js — Hardened Validation
Update `validateAnalysis()` in analyze-alert.js:

```javascript
function validateAnalysis(text, score) {
  const errors = [];
  const { target, max } = getWordTarget(score);
  const words = text.split(/\s+/).length;

  // Word count
  if (words < target * 0.8) errors.push(`too short: ${words} words, target ${target}`);
  if (words > max) errors.push(`too long: ${words} words, max ${max}`);

  // Banned phrases
  const banned = ['guaranteed', 'will moon', 'insiders know more than us', 'to the moon', 'rocket 🚀'];
  banned.forEach(p => { if (text.toLowerCase().includes(p)) errors.push(`banned phrase: "${p}"`); });

  // Required elements
  if (!/\$[\d,]+/.test(text)) errors.push('no dollar amount found');
  if (!/%/.test(text)) errors.push('no percentage found');
  const cautionary = ['however', 'risk', 'caution', 'could', '10b5', 'routine', 'consider'];
  if (!cautionary.some(w => text.toLowerCase().includes(w))) errors.push('no cautionary language');

  return { valid: errors.length === 0, errors };
}
```

Retry once on validation failure (max 2 attempts total).

Tests: pass/fail cases for each validation rule. Word count edge cases. All banned phrases trigger failure.

## Definition of Done
- `computeBaseScore()` produces scores within ±0.5 of expected for 10 fixture filings
- Gift/tax transactions return null (never reach analysis)
- 10b5-1 plan always caps at ≤5
- Analysis validation: banned phrases, word count, cautionary language all enforced
- Weekly calibration function exists and triggers Telegram when distribution is off
- All existing score-alert.test.js and analyze-alert.test.js tests pass
