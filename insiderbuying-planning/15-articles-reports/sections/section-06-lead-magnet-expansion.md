# Section 06: generate-lead-magnet.js Expansion

## Overview

Expand `generate-lead-magnet.js` from a 1500-2000 word simple HTML newsletter to a 4000-4500 word, 12-15 page premium lead magnet with verified arithmetic, a data-driven dynamic title, an expanded losers section, a worst performers table, dual CTA blocks, and three real chart images.

This section is **fully independent** — it does not depend on any other section in this plan.

**File modified**: `n8n/generate-lead-magnet.js`
**Test file**: `n8n/tests/generate-lead-magnet.test.js`

---

## Dependencies

- `generate-chart.js` — assumed available (built by earlier sections); used for Portfolio vs S&P 500 line chart
- `visual-templates.js` — assumed available; Template 4 used for the winners table image
- Cloudflare R2 upload utility — same pattern as `generate-image.js` / `render-pdf.js`
- Anthropic API via `fetch` — same `x-api-key` / `anthropic-version: 2023-06-01` pattern as the rest of the pipeline
- NocoDB — query pattern unchanged
- Screenshot server at `host.docker.internal:3456` — lead magnet HTML renders via the existing `/pdf` endpoint (NOT `/weasyprint`)

---

## Tests First

**Test file**: `n8n/tests/generate-lead-magnet.test.js`

All pure functions must be exported as named exports so tests can import them directly. No real network calls in tests — functions that call Anthropic or NocoDB accept an injectable `fetchFn` parameter.

### Dynamic Title

```js
// Test: buildDynamicTitle([{ticker:'AAPL', return:340.7}, ...17 total])
//   → string includes "17 Insider Buys"
// Test: buildDynamicTitle — percentage uses Math.floor of top performer's return
//   → 340.7 becomes "340%+" (not 341%)
// Test: buildDynamicTitle — includes current month and year
//   → e.g. "The March 2026 Backtest"
// Test: buildDynamicTitle([{ticker:'AAPL', return:50}]) (single performer)
//   → "1 Insider Buy" (not "1 Insider Buys" — singular)
```

### Deterministic Math

```js
// Test: computeWhatIfSimulation([{ticker:'AAPL', return:100}])
//   → perPick[0].value === 20000 (10000 * (1 + 1.00))
// Test: computeWhatIfSimulation([{ticker:'AAPL', return:50}, {ticker:'MSFT', return:200}])
//   → totalInvested === 20000
//   → totalValue === 45000 (15000 + 30000)
// Test: computeWhatIfSimulation — values are integers (Math.round applied to each value)
// Test: computeWhatIfSimulation([])
//   → { perPick: [], totalInvested: 0, totalValue: 0, totalReturn: 0 }
// Test: computeWhatIfSimulation([{ticker:'X', return:-30}])
//   → perPick[0].value === 7000 (losing pick NOT clamped to 0)
```

### Math Accuracy Verification

```js
// Test: verifyMathAccuracy(text, { winRate: 75, avgReturn: 120, portfolioValue: 45000 })
//   where text states "75% win rate" → [] (empty errors)
// Test: verifyMathAccuracy — text states win rate 1% off from computed (76% vs 75%)
//   → [] (within ±1 percentage point tolerance)
// Test: verifyMathAccuracy — text states win rate 2% off (73% vs 75%)
//   → errors array contains one entry mentioning win rate
// Test: verifyMathAccuracy — text states portfolio value off by >1%
//   → errors array contains one entry
// Test: verifyMathAccuracy — returns string[] (not boolean)
//   → allows returning multiple errors simultaneously
```

### Losers Section Validation

```js
// Test: losers section extraction from HTML/text with <div id="losers-section"> containing 500+ words
//   → word count >= 500 → accepted, no retry
// Test: losers section with 400 words
//   → retry triggered once
// Test: retry prompt includes instruction "expand each loss with what went wrong"
// Test: retry prompt instructs to wrap result in <div id="losers-section">...</div> again
// Test: generated text with no <div id="losers-section"> at all
//   → triggers retry (treated same as < 500 words — not a silent pass)
```

### Lead Magnet Generation Config

```js
// Test: buildNarrativePrompt call uses max_tokens: 8192
// Test: buildNarrativePrompt API call includes anthropic-beta header
//   with value containing "max-tokens-3-5-sonnet-2024-07-15"
// Test: buildNarrativePrompt prompt passes computedWhatIf numbers as pre-computed data
//   (Claude receives the numbers, not a request to compute them)
// Test: word count check — generated text with < 3800 words → single retry triggered
// Test: word count check — generated text with >= 3800 words → accepted, no retry
```

### CTA Placement

```js
// Test: buildLeadMagnetHTML output contains exactly two CTA blocks
// Test: first CTA appears in the first half of the HTML (position < total_length / 2)
// Test: both CTA blocks include href="https://earlyinsider.com/alerts"
```

### Worst Performers Table

```js
// Test: buildLeadMagnetHTML output contains a <table> with column headers
//   Ticker, Insider, Amount, Return, What Went Wrong
// Test: worst performers table appears after the top performers table in HTML order
//   (indexOf(worst_table) > indexOf(top_table))
```

---

## Implementation Details

### 6.1 Extended Narrative Generation — `buildNarrativePrompt(data)`

The existing `buildNarrativePrompt` function is modified in two ways:

**API call config changes:**
- `max_tokens` raised to `8192`
- Add header `anthropic-beta: max-tokens-3-5-sonnet-2024-07-15` to unlock extended output beyond the standard 4096 token ceiling

The word target is 4000-4500 words (not 5000) to stay comfortably within the extended limit. After generation, check the word count of the returned text. If < 3800 words, make a single retry and include the explicit instruction "Write at least 4000 words. Current draft was too short." Only one retry is allowed.

**Prompt section order** (instruct Claude to produce these in order):
1. Opening Hook
2. Quick Wins (5 actionable insights)
3. The Numbers
4. What If $10K per Alert
5. Cluster vs Individual
6. The Losers — MUST be wrapped in `<div id="losers-section">...</div>`
7. Key Takeaways
8. CTA

The `computeWhatIf` numbers are passed into the prompt as pre-computed data. The prompt must make clear that Claude is to use these numbers in the narrative, not compute them itself. Example prompt phrasing: "Use these pre-computed simulation results: totalInvested=$X, totalValue=$Y, totalReturn=Z%. Do not calculate or modify these figures."

All JSON parsing of Claude output must strip markdown code fences before `JSON.parse`:
```js
text.replace(/```json/g, '').replace(/```/g, '').trim()
```

### 6.2 Dynamic Title — `buildDynamicTitle(topPerformers)`

```js
/**
 * Derives the lead magnet title from real backtest data.
 * @param {Array<{ticker: string, return: number}>} topPerformers - sorted descending by return
 * @returns {string} e.g. "17 Insider Buys That Jumped 340%+ — The March 2026 Backtest"
 */
function buildDynamicTitle(topPerformers) { ... }
```

Logic:
- Count: `topPerformers.length`
- Top return: `Math.floor(topPerformers[0].return)` (floors, does not round)
- Month/year: derived from `new Date()` — format as "March 2026"
- Singular guard: if count === 1, use "Insider Buy" (no trailing s)

The month/year must come from the runtime date, not be hardcoded.

### 6.3 Deterministic Math — `computeWhatIfSimulation(topPerformers)`

```js
/**
 * Pure JS arithmetic — Claude never computes these numbers.
 * @param {Array<{ticker: string, return: number}>} topPerformers
 * @returns {{ perPick: Array<{ticker, invested, value}>, totalInvested, totalValue, totalReturn }}
 */
function computeWhatIfSimulation(topPerformers) { ... }
```

Logic per pick: `invested = 10000`, `value = Math.round(10000 * (1 + pick.return / 100))`. Losing picks are NOT clamped to zero — a -30% return yields `value = 7000`.

Totals:
- `totalInvested = topPerformers.length * 10000`
- `totalValue = sum of perPick[].value`
- `totalReturn = Math.round(((totalValue - totalInvested) / totalInvested) * 100)`

Empty array guard: return `{ perPick: [], totalInvested: 0, totalValue: 0, totalReturn: 0 }`.

This function must be a pure named export with no side effects.

### 6.4 Math Accuracy Verification — `verifyMathAccuracy(text, computedData)`

```js
/**
 * Scans Claude's narrative for numeric claims and checks them against
 * pre-computed values. Returns one error string per discrepancy.
 * @param {string} text - the generated narrative
 * @param {{ winRate: number, avgReturn: number, portfolioValue: number }} computedData
 * @returns {string[]} - empty if all values match within tolerance
 */
function verifyMathAccuracy(text, computedData) { ... }
```

Tolerance: ±1 percentage point. A deviation of exactly 1% (e.g. text says 76% when computed is 75%) is accepted. A deviation of 2% or more produces an error string.

This runs after generation and before HTML assembly. On any errors, a single retry is triggered with a correction prompt that lists each discrepancy. Example: "Your draft states a 73% win rate. The correct value is 75%. Please revise to use the correct numbers."

This function must be a pure named export with no side effects.

### 6.5 Losers Section Extraction and Retry

After the narrative is generated, extract the losers section by finding the content inside `<div id="losers-section">...</div>`. Strip the outer div tags and count the words in the inner text.

- If the div is absent entirely: treat as 0 words → trigger retry
- If word count < 500: trigger retry
- If word count >= 500: proceed

Retry prompt for the losers section:
```
The losers section is too short (or missing). Expand each loss with:
what went wrong, what the data missed, what we learned.
Write at least 500 words for this section.
Wrap the entire section in <div id="losers-section">...</div>.
```

Only one retry is made for the losers section specifically. After retry, accept the result regardless of length (do not loop infinitely).

### 6.6 Worst Performers Table — `buildLeadMagnetHTML()`

The existing `buildLeadMagnetHTML()` gains a Worst Performers table inserted after the Top Performers table. Table structure:

```html
<table class="worst-performers-table">
  <thead>
    <tr>
      <th>Ticker</th>
      <th>Insider</th>
      <th>Amount</th>
      <th>Return</th>
      <th>What Went Wrong</th>
    </tr>
  </thead>
  <tbody>
    <!-- one row per worst performer -->
  </tbody>
</table>
```

The "What Went Wrong" content is taken from the structured losers section Claude generated (not parsed heuristically from the narrative). Each loser entry from the `<div id="losers-section">` should correspond to a table row.

Return values in the table should be styled red (e.g. `class="negative-return"`).

### 6.7 CTA Placement — `buildLeadMagnetHTML()`

Two CTA blocks are injected into the HTML:

1. **First CTA**: after the Quick Wins section
2. **Second CTA**: after The Numbers / methodology section

Both CTAs use this structure (adapt copy as needed):

```html
<div class="cta-block">
  <p>Get real-time alerts when insiders make moves like these.</p>
  <a href="https://earlyinsider.com/alerts" class="cta-button">Get Early Access →</a>
</div>
```

The URL must be exactly `https://earlyinsider.com/alerts` for both blocks.

### 6.8 Three Charts (Sequential, R2 URLs)

Charts are generated sequentially (not in parallel) since the lead magnet runs once monthly and latency is not critical.

**Chart 1 — Portfolio vs S&P 500 line chart (12 months)**
- Use `generate-chart.js` (assumed available)
- Shows insider portfolio cumulative return vs S&P 500 over 12 months
- Upload buffer to R2 before HTML assembly
- R2 key: `lead-magnets/{month}-{year}-chart-portfolio.png`

**Chart 2 — Winners table image**
- Use `templates.renderTemplate(4, winnersData)` from `visual-templates.js`
- Same Template 4 used in generate-article.js (Insider Transaction Table)
- Upload to R2: `lead-magnets/{month}-{year}-chart-winners.png`

**Chart 3 — Monthly stats bar chart**
- Use `generate-chart.js`
- Scores = win rate × avg return, plotted per month over the lookback period
- Upload to R2: `lead-magnets/{month}-{year}-chart-monthly-stats.png`

After all three charts are uploaded, inject `<img src="{r2_url}">` tags into `buildLeadMagnetHTML()` at the appropriate positions. Lead magnet HTML uses R2 HTTPS URLs (not base64 data URIs) because it renders via the existing screenshot server `/pdf` endpoint which can make outbound requests (unlike WeasyPrint).

---

## Data Shapes

**Input to `computeWhatIfSimulation`**:
```js
topPerformers: Array<{ ticker: string, return: number }>
// return is a percentage, e.g. 340.7 means +340.7%
```

**Output of `computeWhatIfSimulation`**:
```js
{
  perPick: Array<{ ticker: string, invested: number, value: number }>,
  totalInvested: number,  // always topPerformers.length * 10000
  totalValue: number,
  totalReturn: number     // percentage, rounded to integer
}
```

**Input to `verifyMathAccuracy`**:
```js
computedData: {
  winRate: number,        // percentage, e.g. 75
  avgReturn: number,      // percentage, e.g. 120
  portfolioValue: number  // dollar value, e.g. 45000
}
```

---

## Integration Points

The high-level flow in `generate-lead-magnet.js` after this section is implemented:

```
1. Fetch backtest data from NocoDB
2. buildDynamicTitle(topPerformers)              → title string
3. computeWhatIfSimulation(topPerformers)        → whatIfData (pure JS, no AI)
4. Generate 3 charts sequentially → upload to R2 → chart URLs
5. buildNarrativePrompt(data, whatIfData)        → Claude call (max_tokens:8192, beta header)
   a. Word count < 3800 → single retry
   b. Extract <div id="losers-section"> → word count < 500 → single retry
   c. verifyMathAccuracy(text, computedData)    → single retry if errors
6. buildLeadMagnetHTML(narrative, chartUrls, worstPerformers)
   → injects worst performers table
   → injects two CTA blocks at correct positions
   → injects chart <img> tags with R2 URLs
7. Send HTML to screenshot server /pdf endpoint → PDF buffer
8. Upload PDF to R2, save URL to NocoDB
```

---

## What NOT to Do

- Do NOT ask Claude to compute arithmetic. All math in `computeWhatIfSimulation` is plain JavaScript.
- Do NOT use base64 data URIs in lead magnet HTML. This file uses the screenshot server `/pdf` endpoint (not WeasyPrint), which can make outbound requests. Use R2 HTTPS URLs for chart images.
- Do NOT use `Promise.all` for chart generation — if one chart fails the entire lead magnet should not abort. Use sequential generation with try/catch per chart, substituting a placeholder `<div class="chart-unavailable">` if a chart fails.
- Do NOT parse "What Went Wrong" content heuristically from the raw narrative. Use the structured `<div id="losers-section">` content to populate the worst performers table.
- Do NOT make the losers section retry loop infinite. Maximum one retry for this specific section.
