# TDD Plan: 15-articles-reports

**Testing framework**: Jest 30, `node:test` + `node:assert/strict`
**Test file locations**: `n8n/tests/generate-article.test.js`, `n8n/tests/generate-report.test.js`, `n8n/tests/generate-lead-magnet.test.js`
**Pattern**: Pure function unit tests. Functions that make HTTP calls accept a `fetchFn` injectable. No real network calls in tests.

---

## Section 1: Named Persona + Multi-Step Article Generation

**Test file**: `n8n/tests/generate-article.test.js`

### 1.1 Persona Injection

```
// Test: buildSystemPrompt with blog='insiderbuying' includes Ryan Chen persona text
// Test: buildSystemPrompt with blog='deepstockanalysis' does NOT include Ryan Chen text
// Test: buildSystemPrompt with blog='deepstockanalysis' still includes Dexter Research persona
// Test: persona text is a substring of the full system prompt (not the entire thing)
```

### 1.2 Two-Step Generation

```
// Test: validateOutline — outline with 5 H2 sections and ticker in headline → { valid: true, errors: [] }
// Test: validateOutline — outline with 4 H2 sections → { valid: false, errors: ['Outline has fewer than 5 H2 sections'] }
// Test: validateOutline — outline missing ticker string → { valid: false, errors: ['Outline does not mention ticker'] }
// Test: validateOutline — outline with 0 H2 sections → valid: false (edge case)
// Test: generateArticleOutline (mock fetchFn returns valid outline JSON) → returns parsed ArticleOutline object
// Test: generateArticleOutline (mock fetchFn returns markdown-fenced JSON like ```json{...}```) → strips fences, parses successfully
// Test: generateArticleOutline (mock fetchFn returns invalid outline on first call, valid on retry) → retries with error list injected in prompt; returns valid outline
// Test: generateArticleOutline (mock fetchFn returns invalid outline on both attempts) → throws after 1 retry (not 2 — outline has 1-retry budget)
// Test: draft generation includes validated outline in user message context
// Test: draft prompt includes {{VISUAL_1}}, {{VISUAL_2}}, {{VISUAL_3}} instruction
```

---

## Section 2: Merged Quality Gate (~18-20 Checks)

**Test file**: `n8n/tests/generate-article.test.js`

### Helper Functions

```
// Test: countSyllablesInline('IPO') → 3
// Test: countSyllablesInline('ETF') → 3
// Test: countSyllablesInline('CEO') → 3
// Test: countSyllablesInline('Ceo') → 3 (mixed case normalized to uppercase)
// Test: countSyllablesInline('ceo') → 3 (lowercase normalized)
// Test: countSyllablesInline('SEC') → 3
// Test: countSyllablesInline('ESG') → 3
// Test: countSyllablesInline('CFO') → 3
// Test: countSyllablesInline('the') → 1
// Test: countSyllablesInline('table') → 2
// Test: countSyllablesInline('introduction') → 4 (or ~4, with tolerance)

// Test: computeFleschKincaidEase — empty string → null (not throw)
// Test: computeFleschKincaidEase — single word with no sentences → null (guard division-by-zero)
// Test: computeFleschKincaidEase — known simple sentence ("The cat sat.") → score in range 60-90
// Test: computeFleschKincaidEase — known complex finance paragraph → score in range 20-60
// Test: computeFleschKincaidEase — strips HTML tags before computation (e.g. <p> and <h2> tags ignored)
// Test: computeFleschKincaidEase — strips <script> and <style> blocks before computation

// Test: extractSentences('<p>One. Two! Three?</p>') → array of length 3
// Test: countWords('<p>Hello world</p>') → 2
// Test: stdDev([1,1,1]) → 0
// Test: stdDev([1,2,3]) → approximately 0.816
// Test: mean([2,4,6]) → 4
```

### Quality Gate Checks (each check individually)

```
// Test: qualityGate — title 55-65 chars → PASS; title 54 chars → FAIL with title error
// Test: qualityGate — meta description 140-155 chars → PASS; 139 chars → FAIL
// Test: qualityGate — 3 key_takeaways each with a number → PASS; 2 takeaways → FAIL; takeaway with no number → FAIL
// Test: qualityGate — verdict_type present and in valid enum → PASS; missing → FAIL
// Test: qualityGate — verdict_text contains numeric threshold → PASS; no number → FAIL
// Test: qualityGate — zero banned AI phrases → PASS; phrase "In today's fast-paced" in body → FAIL
// Test: qualityGate — ≥40% paragraphs with numeric data → PASS; only 30% → FAIL
// Test: qualityGate — FK Ease score 30 → PASS; score 24 → FAIL; score 56 → FAIL; score 25 → PASS (boundary)
// Test: qualityGate — word count 1800 → PASS; 2500 → PASS; 1799 → FAIL; 2501 → FAIL
// Test: qualityGate — ≥3 {{VISUAL_N}} tokens in body_html → PASS; 2 tokens → FAIL
// Test: qualityGate — ≥4 internal href="/..." links → PASS; 3 links → FAIL
// Test: qualityGate — CTA phrase "subscribe" in first 500 chars → PASS; only in char 600 → FAIL
// Test: qualityGate — "track record" phrase in body → PASS; absent → FAIL
// Test: qualityGate — "subscriber" phrase in body → PASS; absent → FAIL
// Test: qualityGate — daysSinceFiling: 48h → PASS (< 72h); daysSinceFiling: 73h → FAIL (> 72h hard fail)
// Test: qualityGate — daysSinceFiling: 25h → PASS with staleness_warning: true in result
// Test: qualityGate — daysSinceFiling: 23h → PASS with staleness_warning: false
// Test: qualityGate — TLDR keyword in first 200 words → PASS; absent → FAIL
// Test: qualityGate — sentence CV > 0.45 (varied sentence lengths) → PASS
// Test: qualityGate — sentence CV ≤ 0.45 (uniform sentence lengths) → FAIL
// Test: qualityGate — only 1 sentence in article → CV check skipped (not a FAIL)
// Test: qualityGate — keyword density 1.5% → PASS; density 0.9% → FAIL; density 2.6% → FAIL
// Test: qualityGate — body starts with "In this article" → FAIL generic opening check
// Test: qualityGate — body starts with "Today we explore" → FAIL
// Test: qualityGate — body starts with valid hook sentence → PASS
// Test: qualityGate — all checks pass → { valid: true, errors: [], staleness_warning: false }
// Test: qualityGate — multiple failures → errors array contains one entry per failed check
```

---

## Section 3: Visual Injection, Content Freshness, and Schema.org

**Test file**: `n8n/tests/generate-article.test.js`

### 3.1 Visual Placeholder Replacement

```
// Test: replaceVisualPlaceholders — body with {{VISUAL_1}} → replaced with <img> tag containing R2 URL
// Test: replaceVisualPlaceholders — body with all 3 placeholders → all 3 replaced
// Test: replaceVisualPlaceholders — body missing {{VISUAL_2}} → warning logged, other placeholders still replaced (no throw)
// Test: replaceVisualPlaceholders — body with no placeholders → body returned unchanged, no error
// Test: uploadChart — correct Content-Type header (image/png) sent in request
```

### 3.2 Content Freshness Check

```
// Test: checkContentFreshness (mock nocodbGet returns 0 records) → { fresh: true, effectiveArticleType: 'insider_buying' }
// Test: checkContentFreshness (mock nocodbGet returns 1 recent article) → { fresh: false, effectiveArticleType: 'contrarian', lastPublished: '<date string>' }
// Test: checkContentFreshness — returned effectiveArticleType is propagated into slug generation call
// Test: checkContentFreshness — returned effectiveArticleType is propagated into SEO keyword selection call
// Test: checkContentFreshness — NocoDB query uses correct 30-day date range filter
```

### 3.3 Schema.org JSON-LD

```
// Test: generateSchema — returns a string containing valid JSON-LD (parseable with JSON.parse)
// Test: generateSchema — JSON-LD contains @type "Article"
// Test: generateSchema — JSON-LD contains @type "Person" with name "Ryan Chen"
// Test: generateSchema — JSON-LD contains @type "FinancialProduct"
// Test: generateSchema — JSON-LD is wrapped in <script type="application/ld+json"> tag
// Test: generateSchema — returned string appended to article.body_html → script tag is at end of body_html
```

---

## Section 4: 9-Section Sequential Report Generation

**Test file**: `n8n/tests/generate-report.test.js`

### Section Generation Loop

```
// Test: generateReportSection — mock fetchFn returns section text at target word count → accepted, returned as-is
// Test: generateReportSection — mock fetchFn returns text 25% below target → retry triggered once
// Test: generateReportSection — mock fetchFn returns short text on both attempts → returns text anyway (best effort), does not throw
// Test: generateReportSection — prior sections are passed as XML-tagged context in user prompt
//   (assert user message contains <section name="company_overview">...</section>)
// Test: generateReportSection — first section call has empty prior sections context (no XML block)

// Test: sequential loop — failedSections counter: 2 failures → loop continues; 3rd failure → aborts loop
// Test: sequential loop — aborted loop throws with clear error message (not silent failure)
```

### Bear Case + Authenticity Review

```
// Test: bear case uses adversarial system prompt (assert contains "skeptical short seller")
// Test: reviewBearCaseAuthenticity (mock fetchFn returns { score: 4, reasoning: '...' }) → returns score < 7
// Test: bear case retry triggered when authenticity score < 7
// Test: bear case NOT retried when authenticity score >= 7
// Test: bear case allows max 2 total attempts (score < 7 on both → accepted after 2nd attempt anyway)
// Test: reviewBearCaseAuthenticity — strips markdown fences from JSON response before JSON.parse
//   (mock fetchFn returns ```json\n{"score":8}\n``` → parsed correctly)
// Test: all JSON.parse calls on Claude output strip ```json code fences before parsing
```

### Executive Summary

```
// Test: exec summary call receives all 9 completed sections as context (not called before all 9 are done)
// Test: exec summary system prompt instructs Claude to lead with verdict and top insider signal
```

---

## Section 5: Charts, Price Tiers, WeasyPrint PDF, and Preview

**Test file**: `n8n/tests/generate-report.test.js`

### Price Tier Configuration

```
// Test: getReportConfig('single') → { price: 14.99, coverTemplate: 'A' }
// Test: getReportConfig('complex') → { price: 19.99, coverTemplate: 'A' }
// Test: getReportConfig('sector') → { price: 19.99, coverTemplate: 'B' }
// Test: getReportConfig('bundle') → { price: 24.99, coverTemplate: 'C' }
// Test: getReportConfig('unknown') → throws or returns null (not silently wrong price)
```

### Chart Generation

```
// Test: Promise.allSettled used for chart generation (not Promise.all)
//   — mock one chart to reject → report generation continues, placeholder div substituted
// Test: failed chart substitutes <div class="chart-unavailable"> in HTML (not an empty string)
// Test: all 5 charts succeed → all appear as base64 data URIs in HTML (no R2 HTTPS URLs)
// Test: chart buffer → base64 data URI format: src="data:image/png;base64,{base64}"
```

### HTML Section Ordering

```
// Test: buildReportHTML — cover is first element in HTML output
// Test: buildReportHTML — executive summary follows cover (before financial sections)
// Test: buildReportHTML — "CONTINUE READING" banner present in HTML
// Test: buildReportHTML — "CONTINUE READING" banner contains report price
```

### WeasyPrint PDF Generation

```
// Test: generateReportPDF sends POST to http://host.docker.internal:3456/weasyprint (not /pdf)
// Test: generateReportPDF returns a Buffer
// Test: generateReportPDF — response buffer > 8MB → throws with size error message
```

### 5-Page Preview Extraction

```
// Test: generatePreviewPDF — 10-page source PDF → output PDF has exactly 5 pages
// Test: generatePreviewPDF — 3-page source PDF → output PDF has exactly 3 pages (not 5, not crash)
// Test: generatePreviewPDF — 5-page source PDF → output PDF has exactly 5 pages
// Test: generatePreviewPDF — returns a Buffer (not Uint8Array)
// Test: generatePreviewPDF — 0-page source PDF → returns empty or 0-page result without throwing
```

---

## Section 6: generate-lead-magnet.js Expansion

**Test file**: `n8n/tests/generate-lead-magnet.test.js`

### Dynamic Title

```
// Test: buildDynamicTitle([{ticker:'AAPL', return:340.7}, ...17 total]) → includes "17 Insider Buys"
// Test: buildDynamicTitle — percentage uses Math.floor of top performer's return (340.7 → "340%+")
// Test: buildDynamicTitle — includes current month and year (e.g., "The March 2026 Backtest")
// Test: buildDynamicTitle — single performer array → "1 Insider Buy" (not "1 Insider Buys")
```

### Deterministic Math

```
// Test: computeWhatIfSimulation([{ticker:'AAPL', return:100}]) → perPick[0].value = 20000
// Test: computeWhatIfSimulation([{ticker:'AAPL', return:50}, {ticker:'MSFT', return:200}])
//   → totalInvested = 20000, totalValue = 45000 (10000+15000 + 10000+30000)
// Test: computeWhatIfSimulation — all values are integers (Math.round applied)
// Test: computeWhatIfSimulation — empty array → { perPick:[], totalInvested:0, totalValue:0, totalReturn:0 }
// Test: computeWhatIfSimulation — negative return (losing pick) → value < 10000 (not clamped to 0)
```

### Math Accuracy Verification

```
// Test: verifyMathAccuracy — text contains exact computed win rate → empty error array
// Test: verifyMathAccuracy — text states win rate 1% off from computed → empty error array (within tolerance)
// Test: verifyMathAccuracy — text states win rate 2% off from computed → error in array
// Test: verifyMathAccuracy — text contains correct avg return → no error
// Test: verifyMathAccuracy — text states portfolio value off by > 1% → error in array
// Test: verifyMathAccuracy — returns string[] (not boolean; allows multiple errors)
```

### Losers Section Validation

```
// Test: losers section extraction — body contains <div id="losers-section">500+ words</div> → extracted text word count >= 500 → accepted
// Test: losers section extraction — <div id="losers-section">400 words</div> → retry triggered
// Test: losers section extraction — retry prompt includes instruction to "expand each loss with what went wrong"
// Test: losers section extraction — retry prompt wraps result in <div id="losers-section"> tag again
// Test: losers section extraction — <div id="losers-section"> absent → triggers retry (not silent pass)
```

### Lead Magnet Generation Config

```
// Test: buildNarrativePrompt — Claude call uses max_tokens: 8192
// Test: buildNarrativePrompt — Claude call includes anthropic-beta header with max-tokens value
// Test: buildNarrativePrompt — prompt includes the computed whatIf numbers as data (not asking Claude to compute)
// Test: word count check — generated text < 3800 words → retry triggered once
// Test: word count check — generated text >= 3800 words → accepted without retry
```

### CTA Placement

```
// Test: buildLeadMagnetHTML — contains two CTA blocks
// Test: buildLeadMagnetHTML — first CTA appears before the halfway mark of the HTML (after Quick Wins)
// Test: buildLeadMagnetHTML — both CTAs link to https://earlyinsider.com/alerts
```

### Worst Performers Table

```
// Test: buildLeadMagnetHTML — HTML contains a table with columns Ticker, Insider, Amount, Return, What Went Wrong
// Test: buildLeadMagnetHTML — worst performers table appears after top performers table in HTML order
```

---

## Cross-Cutting Concerns

```
// Test (all 3 files): JSON.parse on Claude output strips ```json fences before parsing
//   — "```json\n{\"valid\":true}\n```" → parsed to { valid: true } not throws

// Test (generate-article.js): qualityGate receives daysSinceFiling from caller opts (not computed internally)

// Test (generate-report.js): all section texts are plain strings (not JSON objects) before being
//   passed as context to next section call

// Test (generate-lead-magnet.js): computeWhatIfSimulation and verifyMathAccuracy are exported as
//   named exports for direct test access (confirm they are pure functions with no side effects)
```
