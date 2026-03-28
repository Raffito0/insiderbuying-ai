# Section 04: `analyze-alert.js` — AI Analysis Generation

## Overview

This section implements the AI prose generation step for insider trading alerts. It produces the human-readable 2-3 paragraph analysis that appears on the alerts feed and inside email notifications.

**File to create**: `n8n/code/insiderbuying/analyze-alert.js`

**Position in pipeline**: Runs after `score-alert.js` (section 03). Its output is consumed by `write-persistence.js` (section 05).

**Dependencies**: Section 03 must be complete. The filing object passed in must include `significance_score` (integer 1-10) from Haiku scoring.

---

## Tests

Write these tests in `ryan_cole/insiderbuying-site/tests/insiderbuying/analyze-alert.test.js` BEFORE implementing the node.

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

**Testing approach**: Extract the pure logic from the Code node into a standalone module with a mockable `callClaude(prompt)` function. Import and test with Jest. Verify prompt contents by inspecting the string passed to the mock.

---

## Background & Context

### Why this node exists

Subscribers see the significance score from Haiku, but a bare number ("Score: 7") is not useful on its own. They need to know *why* the score is high, *what* the insider's history looks like, and *what risks* exist with this trade. This prose is what separates EarlyInsider from raw SEC data dumps.

### Why Sonnet (not Haiku)

Haiku is used in section 03 for scoring because speed and cost matter there (one call per filing, many filings per run). Analysis prose is only generated for high-score filings (score >= 4), so volume is much lower. Sonnet 4.6 produces noticeably better prose quality, which matters because this text is the primary value delivered to paying subscribers.

### Cost

`claude-sonnet-4-6` costs approximately $0.02 per call. At 20 qualifying filings per day, this is ~$0.40/day (~$12/month) — acceptable at MVP scale.

---

## Implementation Details

### Score Gate

The very first thing in `analyze()` must be a score check:

```javascript
function analyze(filing) {
  // Skip analysis for low-significance filings
  if (filing.significance_score < 4) {
    return null;
  }
  // ... proceed to Claude call
}
```

Do not make an API call for filings with score < 4. Return `null` immediately. The persistence layer (section 05) handles `null` gracefully — it stores `ai_analysis = null` and the frontend renders "Analysis unavailable".

### Model

Always use `claude-sonnet-4-6`. Do not parameterize this — if the model changes it should be a deliberate code change, not a config value.

### Prompt Design

The prompt instructs Sonnet to write 2-3 paragraphs covering three distinct angles:

1. **Trade signal**: Why would this insider make this specific trade now? What context explains the timing or size? Avoid conjecture — stick to what the data supports.
2. **Historical context**: This insider's track record (if available). How does this trade compare in size and timing to their past behavior? If no track record: acknowledge it neutrally.
3. **Risk factors**: Why this trade might be less meaningful than it appears. Examples: scheduled 10b5-1 plan, routine compensation exercise, sector-wide headwinds, diversification selling.

**Tone**: Written for a retail investor who understands basic market concepts but is not a professional analyst. Informative, not alarmist.

**Critical prompt instruction** (must appear verbatim or equivalent in the prompt):

> Do NOT use generic phrases like "insiders have information about their company" or "this is significant because insiders know more than the market". Be specific. Reference the actual numbers: X shares at $Y.YY per share for a total of $Z. Name the insider's role. If track record data is available, cite it. If cluster data is present, reference how many insiders are buying.

**Input data to include in prompt**:
- `ticker`, `company_name`
- `insider_name`, `insider_title`, `insider_category`
- `transaction_shares`, `price_per_share`, `total_value`, `transaction_date`
- `significance_score`, `score_reasoning` (from Haiku — gives Sonnet the scoring rationale)
- `is_cluster_buy`, `cluster_size` (if applicable)
- Track record: `past_buy_count`, `hit_rate`, `avg_gain_30d` (may be null)

### Response Format

The response is plain prose — no JSON wrapping. Sonnet returns the analysis text directly. Do not ask for structured JSON output.

### Validation

After receiving the response:

1. Check `response.length > 50` characters
2. Check that the response contains at least 2 paragraph breaks (`\n\n` or two or more `\n` sequences)

If either check fails: make **one retry** with the same prompt. Do not modify the prompt between initial call and retry.

If the retry also fails validation: set `ai_analysis = null`. Do not throw. Log a warning with the filing's `dedup_key` and the response that failed validation (truncated to 200 chars for readability).

### Error Handling

- Network error / API timeout: catch, log `dedup_key` + error message, return `null`
- Anthropic 429 (rate limit): wait 5 seconds, one retry. If still 429: return `null`
- Anthropic 500/503: one retry immediately. If still failing: return `null`
- Any other error: return `null` (never throw — the pipeline must continue to write and persist the filing even without analysis)

### Function Signature (stub)

```javascript
/**
 * Generate AI prose analysis for a qualifying filing.
 *
 * @param {object} filing - Enriched filing object from score-alert.js
 * @param {number} filing.significance_score - Integer 1-10 from Haiku scoring
 * @param {string} filing.ticker
 * @param {string} filing.company_name
 * @param {string} filing.insider_name
 * @param {string} filing.insider_title
 * @param {string} filing.insider_category
 * @param {number} filing.transaction_shares
 * @param {number} filing.price_per_share
 * @param {number} filing.total_value
 * @param {string} filing.transaction_date
 * @param {string} filing.score_reasoning - Haiku's reasoning string
 * @param {boolean} filing.is_cluster_buy
 * @param {number} filing.cluster_size
 * @param {object|null} filing.track_record - { past_buy_count, hit_rate, avg_gain_30d } or null
 * @returns {Promise<string|null>} - Prose analysis string, or null on skip/failure
 */
async function analyze(filing) { /* ... */ }
```

---

## What This Section Does NOT Cover

- Writing `ai_analysis` to Airtable or Supabase — that is section 05
- The Haiku scoring call — that is section 03
- Delivery of analysis text to users — that is section 06
- Frontend blur logic for free vs. Pro users — that is section 08

---

## Output Contract

`analyze()` returns either:
- A non-empty string (>50 chars, 2+ paragraphs) — the full analysis prose
- `null` — score was < 4, or all retries failed

The calling code in `sec-monitor.js` (or the n8n node chain) passes this return value directly to the persistence layer. The persistence layer must handle `null` without error.
