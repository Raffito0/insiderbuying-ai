# Spec: 15-articles-reports (Synthesized)

## Overview

Elevate three Node.js content generation files (`generate-article.js`, `generate-report.js`, `generate-lead-magnet.js`) to professional finance publication standard. This is a targeted upgrade of existing, production code — not a rewrite from scratch.

---

## Context

### What exists today

- **`generate-article.js`** (1182 lines): Full 13-step pipeline, single-step Claude Tool Use call, 14-check quality gate (different from spec's version), SEO score, AI detection score. Author persona: "Dexter Research" or "Ryan Cole" depending on blog. No named Ryan Chen persona. No multi-step outline → draft. No visual placeholders. No Schema.org JSON-LD.

- **`generate-report.js`** (287 lines): Stripe webhook trigger, single-step Claude call, 5-section prose report, screenshot server for PDF, no sequential generation, no WeasyPrint, no charts, no price tiers, no 5-page preview.

- **`generate-lead-magnet.js`** (349 lines): Monthly schedule trigger, 1500-2000 word single Claude call, basic backtest table, no math verification, no dynamic title, no "What If" simulation, no losers section, no worst performers table.

- **`render-pdf.js`**: Screenshot server at `host.docker.internal:3456`. Used by all three files today.

- **`visual-templates.js`** and **`covers.js`**: Referenced by this spec but DO NOT exist yet. They are built by earlier sections of the broader plan. This section assumes they are available.

### Testing convention

Jest 30, `node:test` + `node:assert/strict` style, tests in `n8n/tests/*.test.js`. Pure function unit tests, no mocking. 1000-iteration statistical tests for weighted random functions.

---

## Section 1: generate-article.js — Named Persona + Multi-Step Generation

### 1.1 Named Persona

The system prompt for the insiderbuying blog gets a named analyst persona added:

```
You are Ryan Chen, former Goldman Sachs equity research analyst, now independent investor
and founder of an insider trading intelligence service. Write in first-person singular.
Reference your analytical background naturally. Do not make it forced.
```

This persona is ONLY injected for the insiderbuying blog (author_name="Ryan Chen"). The Dexter Research and Ryan Cole personas remain unchanged for other blogs.

### 1.2 Multi-Step Generation (Outline → Draft)

Replace the current single Tool Use call with a 2-step process:

**Step 1 — Outline** (~300 tokens, returns JSON):
Ask Claude to produce a structured outline:
- Headline (55-65 chars with primary keyword)
- 5-7 H2 sections, each with 2-3 H3 subsections
- TLDR bullets (3-5)
- Required data points

Outline validation: must have ≥5 H2 sections and mention the ticker. If not, fail fast and request a revised outline (counts as part of the article retry budget, not a separate retry cycle).

**Step 2 — Full Draft** (~4000 tokens, receives outline + Dexter data):
The existing Tool Use call is modified to receive the validated outline as additional context. The article generation prompt explicitly instructs Claude to include `{{VISUAL_1}}`, `{{VISUAL_2}}`, `{{VISUAL_3}}` placeholders where charts should appear.

The persona system prompt from 1.1 is part of the Step 2 system prompt.

---

## Section 2: generate-article.js — Merged Quality Gate (~18-20 checks)

The existing 14-check gate is merged with the spec's 14-check gate into a single unified gate of approximately 18-20 checks. The merge rules:

**Kept from existing (not duplicated by spec):**
- Meta description 140-155 chars
- Key takeaways count (3-4, each containing a number)
- Verdict field presence (verdict_type, verdict_text)
- Banned AI phrases (83 phrases list, zero tolerance)
- ≥40% paragraphs contain numeric data

**Replaced/upgraded (spec has better version):**
- Old: FK Grade 8-10 → New: FK Ease 30-50
- Old: data_tables_count ≥1 → New: visual placeholder count ≥3 (`{{VISUAL_N}}`)
- Old: word count 800-3000 (length-dependent) → New: 1800-2500 (standardized)

**New checks from spec (not in existing):**
- Internal links ≥4 (href starting with "/")
- CTA in first 500 chars of body_html (alert/subscribe/notification/free regex)
- Track record section present (last N buy / previous buy / track record / historically)
- Social proof injection (subscriber/tracking/member/N users regex)
- Filing timeliness: >72h → hard fail; >24h → staleness_warning flag (not rejection)
- TLDR/key takeaway in first 200 words
- Sentence variation CV > 0.45
- Keyword density 1.0-2.5% (changed from 0.5-1.5%)
- No generic opening (in this article / today we / recently / welcome to / introduction)
- Title 55-65 chars (already exists as check #1 — confirmed)

**Retry logic**: max 2 attempts. On 2nd attempt, error list from failed checks is injected back into Claude's context as "Previous attempt failed: [errors]. Fix these specifically."

**daysSinceFiling** is passed as `opts.daysSinceFiling` to the gate. This value comes from the Dexter research package (filing_date → compute hours elapsed).

**Helper functions added**:
- `computeFleschKincaidEase(html)`: strips HTML to plain text, applies inline syllable counter, computes FK Ease formula (206.835 - 1.015*(w/s) - 84.6*(syl/w)). Guards division-by-zero. Finance abbreviation overrides: IPO=3, ETF=3, CEO=3, SEC=3, ESG=3, CFO=3, COO=3, CTO=3.
- `computeKeywordDensity(html, keyword)`: existing logic upgraded to 1.0-2.5% range.
- `extractSentences(html)`, `countWords(html)`, `stdDev(arr)`, `mean(arr)`: small utilities.

---

## Section 3: generate-article.js — Visual Injection + Freshness + Schema

### 3.1 Visual Placeholder Replacement

After generation and quality gate pass, `replaceVisualPlaceholders(article, filingData)` is called:
- `{{VISUAL_1}}` → `templates.renderTemplate(4, transactionData)` — Insider Transaction Table
- `{{VISUAL_2}}` → `templates.renderTemplate(5, priceData)` — Price Chart with buy marker
- `{{VISUAL_3}}` → `templates.renderTemplate(6, revenueData)` — Revenue Trend

Each renders a chart buffer, uploads to R2 via `uploadChart(buffer, key)`, replaces the placeholder with `<img src="[url]" alt="Insider data visualization" />`.

`visual-templates.js` is assumed to exist from earlier sections. The interface: `templates.renderTemplate(templateId, data)` → `Promise<Buffer>`.

### 3.2 Content Freshness Check

Before attempting article generation (step 5 of the pipeline), query NocoDB Articles table:
```
(ticker,eq,{ticker})~and(published_at,gt,exactDate,{thirtyDaysAgo})
```
If a result exists: use a different article type angle (contrarian / sector / earnings-preview) instead of standard insider_buying. This prevents duplicate coverage of the same ticker within 30 days.

`checkContentFreshness(ticker)` returns `{ fresh: boolean, lastPublished?: string }`.

### 3.3 Schema.org JSON-LD

`generateSchema(article)` produces a JSON-LD block for:
- `@type: "Article"` with name, datePublished, author
- `@type: "Person"` with name: "Ryan Chen", jobTitle, worksFor
- `@type: "FinancialProduct"` with name, description

The JSON-LD `<script>` tag is appended to `article.body_html` before writing to NocoDB. The Next.js frontend renders it as-is.

---

## Section 4: generate-report.js — 9-Section Sequential Generation

Replace the current single Claude call with a sequential 9-section loop. Section order is:

1. company_overview (600 words)
2. insider_intelligence (800 words) — CORE section
3. financial_analysis (700 words)
4. valuation_analysis (600 words)
5. bull_case (500 words)
6. bear_case (500 words) — SEPARATE ADVERSARIAL CALL
7. peer_comparison (600 words)
8. catalysts_timeline (400 words)
9. investment_thesis (400 words)
10. exec_summary generated LAST (400-500 words, summarizes 9 completed sections)

**Context injection**: each section call receives ALL previously completed sections as XML-tagged context in the user prompt. Full text passed (not summaries) — ~5K-7K total tokens per call, well within context window.

**Bear case**: separate Claude call with adversarial system prompt ("You are a skeptical short seller"). Required: 3 genuine fundamental risks (not "market uncertainty"), 1 bear scenario with specific downside target, historical precedents. After generation, `reviewBearCaseAuthenticity(bearCaseText)` makes a second Claude call that returns `{ score: 1-10, reasoning: string }`. If score < 7 → retry bear case (max 2 attempts total for this section).

**Section validation** per section: word count within ±20% of target. If too short, include feedback and retry (counts against section's 2-attempt budget, not global retry).

**Exec summary**: generated after ALL 9 sections are complete. Context = JSON of all 9 sections. Target 400-500 words.

---

## Section 5: generate-report.js — Charts, Cover, Preview, PDF

### 5.1 Chart Generation

5 charts generated in parallel using `Promise.all`:
1. Report cover (`covers.renderCoverA({ ticker, verdict, ... })`) — uses `covers.js` from earlier sections
2. Price chart with buy markers (`templates.renderTemplate(5, priceHistory)`)
3. Revenue trend (`templates.renderTemplate(6, financials)`)
4. Valuation football field (`templates.renderTemplate(7, valuation)`)
5. Peer radar (`templates.renderTemplate(8, peerData)`)

### 5.2 Price Tier Configuration

```javascript
function getReportConfig(reportType) {
  if (reportType === 'single')  return { price: 14.99, coverTemplate: 'A' };
  if (reportType === 'complex') return { price: 19.99, coverTemplate: 'A' };
  if (reportType === 'sector')  return { price: 19.99, coverTemplate: 'B' };
  if (reportType === 'bundle')  return { price: 24.99, coverTemplate: 'C' };
}
```

### 5.3 WeasyPrint PDF with CSS @page

WeasyPrint (`node-weasyprint` npm package) is used ONLY for paid reports (single, complex, sector, bundle). The screenshot server remains in use for lead magnets.

`buildReportHTML(sections, charts, config)` generates full HTML with:
- Helvetica Neue substitute font (Inter or Roboto, served locally via @font-face)
- CSS `@page` with running header ("EarlyInsider — Insider Intelligence Report") and page counter
- Report cover as page 1
- TOC with `target-counter(attr(href), page)` dynamic page numbers
- Sections break with `break-before: page`

`generateReportPDF(sections, charts, config)` calls WeasyPrint to produce the PDF buffer.

File size check: `if (pdfBuffer.length > 5_242_880) throw new Error('Report PDF exceeds 5MB')`.

### 5.4 Section Ordering for Preview Guarantee

**Critical**: the HTML layout must place the most visually impressive content in the first 5 pages to ensure the free preview sample looks premium. Section order in HTML:
1. Cover page (page 1)
2. Executive Summary with key metrics table (page 2)
3. Insider Intelligence section with transaction table chart + timeline chart (pages 3-4)
4. Price chart with buy markers (page 5)
5. Remaining sections (pages 6+)

### 5.5 5-Page Preview PDF

`generatePreviewPDF(pdfBuffer)` uses `pdf-lib` (`PDFDocument.load()` → `copyPages([0,1,2,3,4])` → `save()`) to extract the first 5 pages.

Page 5 has a "CONTINUE READING" watermark/banner injected into the HTML before PDF generation (not added post-extraction). Banner: full-width, positioned near bottom of the Insider Intelligence section close to the 5-page cut-off, with pricing CTA linking to the report purchase page.

Both full PDF and preview PDF are uploaded to R2. Preview URL is public (accessible to free users); full report URL is auth-gated.

---

## Section 6: generate-lead-magnet.js — Expansion

### 6.1 Expanded Generation

`buildNarrativePrompt(data)` updated to target 4000-5000 words. Single Claude call with 6000 `max_tokens`. The prompt explicitly instructs Claude to write sections matching the lead magnet structure. Word count is validated post-generation; if <3800 words, retry once with explicit instruction.

### 6.2 Dynamic Title

```javascript
const title = `${topPerformers.length} Insider Buys That Jumped ${Math.floor(topPerformers[0].return)}%+ — The ${currentMonth} Backtest`;
```

### 6.3 Quick Wins Page

Second page after the cover: a bullet list of the 5 most actionable insights from the data. Generated by Claude as part of the main narrative prompt (explicitly requested as the second section).

### 6.4 Worst Performers Table

Table: Ticker | Insider | Amount | Return | What Went Wrong. Added after the Top Performers section in the HTML.

### 6.5 "What If" Simulation (Math Verified)

Computed deterministically in code (no Claude math):
```javascript
const whatIfReturns = topPerformers.map(p => ({
  ticker: p.ticker,
  invested: 10000,
  value: Math.round(10000 * (1 + p.return/100))
}));
const totalInvested = topPerformers.length * 10000;
const totalValue = whatIfReturns.reduce((sum, p) => sum + p.value, 0);
```
Computed numbers are passed to Claude for narrative framing. Claude is NEVER asked to do math.

`verifyMathAccuracy(text, computedData)` validates that win rate, avg return, and portfolio value in the generated text match computed values within ±1%. On mismatch, retry once with explicit correction.

### 6.6 CTA Placement

Two CTA HTML blocks injected after sections 2 (winners) and 4 (methodology) in `buildLeadMagnetHTML()`:
```html
<div class="cta-block">
  📊 Get real-time alerts when CEOs make moves like these.
  <a href="https://earlyinsider.com/alerts">Start free →</a>
</div>
```

### 6.7 Three Charts

Generated via `generate-chart.js` (assumed to exist from earlier sections):
1. Portfolio vs S&P line chart (12-month comparison)
2. Winners table image (Template 4)
3. Monthly stats bar chart (scores by month)

### 6.8 Losers Section Validation

After generation, check `losersSection.split(/\s+/).length > 500`. If not, retry with instruction: "The losers section is too short. Expand each loss with: what went wrong, what the data missed, what we learned." Counts as one retry attempt.

---

## Requirements Summary

### generate-article.js after this section
- Named Ryan Chen persona (insiderbuying blog only)
- 2-step generation: outline (validated) → full draft with visual placeholders
- Merged quality gate with ~18-20 checks including FK Ease 30-50, visual ≥3, CV >0.45, keyword density 1.0-2.5%, filing timeliness, CTA, track record, social proof, TLDR in first 200 words, no generic opening
- `computeFleschKincaidEase(html)` with inline syllable counter
- Content freshness check (30-day NocoDB query per ticker)
- Visual placeholder replacement (templates.renderTemplate)
- Schema.org JSON-LD appended to body_html

### generate-report.js after this section
- 9-section sequential generation with XML-tagged context injection
- Bear case as separate adversarial Claude call + authenticity review (separate scoring call, retry if <7/10)
- Exec summary generated LAST
- 5 charts in parallel (cover + 4 chart types)
- Price tier config (4 types)
- WeasyPrint PDF with @page headers/footers, TOC, font embedding
- Section ordering guarantees impressive content in first 5 pages
- 5-page preview with "CONTINUE READING" banner, extracted via pdf-lib
- File size guard (5MB max)
- Both full + preview uploaded to R2

### generate-lead-magnet.js after this section
- 4000-5000 word single-call generation (6000 max_tokens)
- Dynamic title from real data
- Quick Wins page (section 2)
- Worst performers table
- "What If" simulation computed deterministically in code, passed to Claude for narrative
- Math accuracy verification (win rate, avg return, portfolio value ±1%)
- CTA blocks after sections 2 and 4
- 3 charts via generate-chart.js
- Losers section ≥500 words validation with retry

---

## Dependencies to Add (VPS / package.json)

1. `node-weasyprint` (npm) — WeasyPrint Node.js wrapper
2. `pdf-lib` (npm) — PDF page extraction
3. WeasyPrint Python package + system libs on VPS (one-time setup):
   ```bash
   pip3 install weasyprint
   apt-get install -y libpango-1.0-0 libpangocairo-1.0-0 libcairo2 libgdk-pixbuf2.0-0
   ```
4. A local web font (Inter or Roboto) served from `/app/static/fonts/` for WeasyPrint PDF rendering

No ESM packages required — syllable counter is inlined as CommonJS-compatible code.
