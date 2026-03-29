# Implementation Plan: 15-articles-reports

## What We Are Building

This plan describes targeted upgrades to three content generation files in the EarlyInsider n8n pipeline: `generate-article.js`, `generate-report.js`, and `generate-lead-magnet.js`. These files orchestrate AI-generated financial content — articles, premium research reports, and monthly lead magnet PDFs. The goal is to raise content quality to professional finance publication standard through three categories of changes: (1) richer AI generation with persona and multi-step prompting, (2) stricter quality gates with measurable readability and freshness checks, and (3) better report structure with sequential generation, premium PDFs, and verified math.

All three files live in the n8n Code node environment (Node.js / CommonJS). The surrounding infrastructure — NocoDB for storage, Cloudflare R2 for file hosting, the Anthropic API for generation, and the screenshot server for PDFs — remains unchanged unless explicitly noted below.

**Files modified**: `generate-article.js`, `generate-report.js`, `generate-lead-magnet.js`
**New npm packages**: `pdf-lib` only (WeasyPrint is NOT called from n8n — see Section 5.4)
**Screenshot server changes**: New `/weasyprint` endpoint added to the existing screenshot server
**VPS/Docker changes**: WeasyPrint installed in screenshot server container; n8n `EXECUTIONS_TIMEOUT=600` env var
**Assumed available** (built by earlier sections): `visual-templates.js`, `covers.js`, `generate-chart.js`

---

## Background: Existing Architecture

Understanding the current patterns is necessary before changing them.

**Claude API pattern in generate-article.js**: The file uses Claude Tool Use (forced — `tool_choice: { type: 'tool', name: 'generate_article' }`). This is the right pattern for structured JSON output from an article. All three generation files call the Anthropic API directly via `fetch`, using the `x-api-key` header and `anthropic-version: 2023-06-01`. This convention must be preserved.

**NocoDB query pattern**: `nocodbGet(path, token, opts)` builds requests against `http://nocodb:8080/api/v1/db/data/noco/{BASE_ID}`. Filters use NocoDB's `where` syntax: `(field,eq,value)~and(...)~or(...)`. Table names come from environment variables (e.g. `NOCODB_TABLE_ARTICLES`).

**Screenshot server**: The existing PDF path calls `http://host.docker.internal:3456/pdf`. A new `/weasyprint` endpoint is added to this same server for premium report PDFs. This is not part of the n8n Code node — it runs in the screenshot server's Docker container.

**Testing**: Jest 30 with `node:test` + `node:assert/strict` style. Tests live in `n8n/tests/*.test.js`. Every new pure function must have a corresponding test. Functions that make HTTP calls must accept an injectable `fetchFn` parameter (already the pattern in generate-article.js) so tests can mock them without network access.

---

## Section 1: Named Persona + Multi-Step Article Generation

### Goal

Move from a single-pass Claude Tool Use call to a two-step outline → draft process, and add a named analyst persona for the insiderbuying blog.

### 1.1 Persona Injection

The system prompt for articles targeting the insiderbuying blog is extended with a named persona block. The persona is Ryan Chen — a former Goldman Sachs equity research analyst. This persona is injected ONLY when `blog === 'insiderbuying'` (and the author_name becomes "Ryan Chen" for this blog). Other blogs (deepstockanalysis, dividenddeep) retain their existing authors (Dexter Research, Ryan Cole).

The persona text is a constant added near the system prompt template. It instructs Claude to write in first-person singular and reference the analytical background naturally without forcing it.

### 1.2 Two-Step Generation

**Why**: A single call asks Claude to do too much simultaneously — structure, content, quality, and SEO. Breaking it into outline then draft produces better-organized articles with predictable H2/H3 structures.

**Step 1 — Outline generation**: A lightweight Claude call (no Tool Use, plain JSON output) that produces a structured outline containing: headline (55-65 chars with primary keyword), an array of 5-7 H2 sections each with 2-3 H3 subsections, 3-5 TLDR bullets, and a list of required data points. Target ~300 tokens.

`generateArticleOutline(ticker, articleType, dexterData, fetchFn)` — makes the Claude call with a focused outline prompt and parses the returned JSON. All JSON parsing must strip markdown code fences first: `text.replace(/```json/g, '').replace(/```/g, '').trim()` before `JSON.parse`.

`validateOutline(outline)` — checks that the outline has ≥5 H2 sections and mentions the ticker string. Returns `{ valid: boolean, errors: string[] }`. Outline generation has its own **1-retry budget** independent of the draft's retry budget. On retry, the failure list is injected as "Regenerate outline fixing: [error list]" — not a generic regeneration.

**Step 2 — Full draft generation**: The existing Tool Use call is modified to receive the validated outline as additional context in the user message, alongside the Dexter research data. The system prompt gains the persona block (for insiderbuying blog). The article generation prompt explicitly instructs Claude to embed `{{VISUAL_1}}`, `{{VISUAL_2}}`, `{{VISUAL_3}}` placeholders at appropriate chart positions in the body_html.

The rest of the pipeline (quality gate, SEO check, AI detection, NocoDB write, downstream triggers) is unchanged.

---

## Section 2: Merged Quality Gate (~18-20 Checks)

### Goal

Replace the current 14-check gate with a merged gate that keeps the best existing checks and adds missing checks from the spec, totalling approximately 18-20 checks.

### Merge Rationale

The existing gate is primarily structural (meta description length, verdict field presence, key_takeaways count, banned AI phrases, numeric density). The new spec's gate targets readability, freshness, and content engagement. These are complementary — neither set subsumes the other.

**Checks retained from the existing gate** (no equivalent in spec):
- Meta description 140-155 chars
- Key takeaways: 3-4 entries, each containing at least one number
- Verdict field presence (verdict_type and verdict_text populated)
- Zero banned AI phrases (83-phrase list)
- ≥40% of paragraphs contain numeric data — run on text AFTER stripping all HTML tags (not on raw HTML with injected img tags)

**Checks upgraded** (spec has a better version of an existing check):
- FK Grade 8-10 → FK Ease **25-55** (replaces the existing readability check; range is loosened vs spec's 30-50 to account for inline syllable counter's inherent ±10% inaccuracy)
- `data_tables_count >= 1` → visual placeholder count ≥3 (replaces table check)
- Word count 800-3000 (length-variant) → standardized 1800-2500

**New checks from spec** (not in the existing gate):
- Internal links ≥4 (href values starting with "/")
- CTA present in first 500 chars of body_html (alert/subscribe/notification/free)
- Track record section present (phrase pattern in body text)
- Social proof present (phrase pattern in body text)
- Filing timeliness: >72h is a hard fail; >24h sets `staleness_warning: true` flag without rejection
- TLDR or key takeaway in first 200 words of body text
- Sentence variation CV > 0.45 — skip this check if sentence count is ≤1 (returns null, not fail)
- Keyword density 1.0-2.5% (upgraded from old 0.5-1.5%)
- No generic opening (first 100 chars must not start with banned opening phrases)
- Title 55-65 chars (already in existing gate — kept unchanged)

### Key Functions

`qualityGate(article, opts)` — the merged gate function. Returns `{ valid: boolean, errors: string[], staleness_warning: boolean }`. `opts` includes `daysSinceFiling` (computed before calling the gate from the filing_date in Dexter data), `primaryKeyword`, and article metadata.

`computeFleschKincaidEase(html)` — strips HTML to plain text, counts words and sentences, counts syllables via an inline syllable counter (CommonJS-compatible, no external packages), applies the FK formula: `206.835 - 1.015*(words/sentences) - 84.6*(syllables/words)`. Guards against division-by-zero (returns null if no words or sentences).

`countSyllablesInline(word)` — a pure, CommonJS-compatible syllable counter (~20 lines) inlined in the file. Uses vowel-cluster regex heuristics. Before lookup in the finance abbreviation override map, normalizes the word to uppercase. Abbreviation overrides: IPO, ETF, CEO, SEC, ESG, CFO, COO, CTO all mapped to 3 syllables.

`extractSentences(html)`, `countWords(html)`, `stdDev(arr)`, `mean(arr)` — small utility functions.

### Retry Integration

Retry logic is unchanged at 2 attempts max for the draft. The failing check list is formatted and injected back into the Step 2 draft prompt as "Previous attempt failed quality gate: [list of failures]. Fix specifically."

---

## Section 3: Visual Injection, Content Freshness, and Schema.org

### 3.1 Visual Placeholder Replacement

After the quality gate passes, `replaceVisualPlaceholders(article, filingData)` replaces the three `{{VISUAL_N}}` tokens in body_html with real chart images:
- `{{VISUAL_1}}` → Insider Transaction Table (Template 4)
- `{{VISUAL_2}}` → Price Chart with buy marker (Template 5)
- `{{VISUAL_3}}` → Revenue Trend (Template 6)

The function calls `templates.renderTemplate(templateId, data)` from `visual-templates.js` (assumed to exist), gets a Buffer, uploads to R2 via `uploadChart(buffer, key)`, and replaces the placeholder token with an `<img>` tag using the returned public URL. Replacement is tolerant — missing tokens are warned and skipped, not thrown.

`uploadChart(buffer, key)` — wraps the existing R2 upload pattern from `render-pdf.js` / `generate-image.js`. Includes `Content-Type: image/png` header. Returns the public R2 URL.

### 3.2 Content Freshness Check

Before the outline-generation step, `checkContentFreshness(ticker, nocodbOpts)` queries NocoDB for any article in the Articles table matching the ticker published in the last 30 days.

`checkContentFreshness(ticker, nocodbOpts)` returns `{ fresh: boolean, effectiveArticleType: string, lastPublished?: string }`. When not fresh, `effectiveArticleType` is set to an alternate angle (e.g. 'contrarian' or 'sector'). This value is propagated through the entire pipeline — slug generation, CTA copy, SEO keyword selection, and tags all use `effectiveArticleType` to prevent metadata/content mismatch.

### 3.3 Schema.org JSON-LD

After the quality gate and placeholder replacement, `generateSchema(article)` builds a JSON-LD block containing:
- An `Article` entity (name, datePublished, description, author link)
- A `Person` entity (Ryan Chen, Goldman Sachs background, jobTitle: "Independent Finance Analyst")
- A `FinancialProduct` entity (the insider intelligence service description)

The resulting `<script type="application/ld+json">` string is appended to `article.body_html` before the NocoDB write step. The Next.js frontend renders it as-is.

---

## Section 4: 9-Section Sequential Report Generation

### Goal

Replace generate-report.js's current single Claude call (5 prose sections) with a controlled sequential generation loop that produces 9 discrete sections plus an executive summary, with contextual coherence maintained across all calls.

### Why Sequential Generation

A single 5000-word prompt produces a monolithic text that Claude can't reason about section-by-section. Splitting into sequential calls where each call has the full prior sections as context produces better coherence, allows per-section word count validation, and enables the bear case to be generated with a completely different adversarial system prompt.

### Section Order and Targets

The sections are generated in this fixed order:

1. **company_overview** — 600 words. Business description, competitive position, key financials overview.
2. **insider_intelligence** — 800 words. CORE section. Full insider transaction analysis, cluster detection, historical pattern comparison.
3. **financial_analysis** — 700 words. Revenue trends, margin analysis, balance sheet health.
4. **valuation_analysis** — 600 words. P/E, EV/EBITDA, DCF summary, relative valuation.
5. **bull_case** — 500 words. Three specific catalysts with target prices.
6. **bear_case** — 500 words. Generated separately — see bear case section below.
7. **peer_comparison** — 600 words. Relative performance vs. sector peers.
8. **catalysts_timeline** — 400 words. Upcoming events, earnings dates, regulatory milestones.
9. **investment_thesis** — 400 words. Synthesizes 1-8 into a directional recommendation.
10. **exec_summary** — 400-500 words. Generated LAST, receives all 9 sections as context.

The executive summary is generated after all other sections complete. It summarizes the completed report rather than trying to anticipate content before it's written.

### Context Injection Pattern

Each section call receives all previously completed sections as XML-tagged context at the top of the user prompt, followed by the section-specific instruction. A typical call looks like:

```
[XML block containing all prior sections as <section name="...">...</section> tags]

Now write the [section_name] section. Target: [wordTarget] words. Do not repeat content from prior sections.
```

The full text of each section is passed (not summaries). At ~600 words per section and 600 tokens per call, the total context for section 9 is approximately 5,500 words (~7K tokens) — well within the context window. No summarization or truncation is needed.

**Global abort guard**: the orchestration loop tracks `failedSections`. If more than 2 sections fail after their individual retries, the orchestrator aborts and surfaces an error to NocoDB/Telegram rather than continuing with a degraded report.

`generateReportSection(sectionId, wordTarget, completedSections, data, fetchFn)` — makes a single Claude call for one section. Returns the section text. Validates word count is within ±20% of `wordTarget`; if not, retries once with explicit instruction to hit the target.

`buildSectionSystemPrompt(sectionId)` — returns the section-specific system prompt. For bear_case, this is never called — bear case has its own adversarial system prompt.

### Bear Case — Adversarial Generation

The bear case section is generated with a completely different system prompt: "You are a skeptical short seller. Argue AGAINST buying [ticker]." Requirements enforced in the prompt: 3 genuine fundamental risks (not generic "market uncertainty"), 1 bear scenario with a specific downside price target, and at least one historical precedent where similar insider buying preceded a price decline.

After generation, `reviewBearCaseAuthenticity(bearCaseText, fetchFn)` makes a separate Claude call that reads the bear case and returns a JSON object with `{ score: number (1-10), reasoning: string }` (strip markdown backticks before JSON.parse). If score < 7, the bear case is regenerated (max 2 total attempts). The authenticity reviewer's system prompt instructs it to score low if the bear case contains generic risks, hedging language like "market uncertainty" or "macro headwinds", or fails to include specific price targets or historical precedents.

### Executive Summary Generation

After all 9 sections are complete, a final Claude call summarizes them into a 400-500 word executive summary. This call receives all 9 sections as context and is instructed to lead with the key verdict, the top insider transaction signal, and the price target range.

---

## Section 5: Charts, Price Tiers, WeasyPrint PDF, and Preview

### 5.1 Chart Generation

Five charts are generated using `Promise.allSettled` (not Promise.all — individual chart failures must not abort the whole report):
1. **Cover** — `covers.renderCoverA({ ticker, verdict, reportDate, ... })` using `covers.js` from prior sections.
2. **Price chart** — `templates.renderTemplate(5, priceHistoryData)` — 12-month price line with vertical markers at each insider buy date.
3. **Revenue trend** — `templates.renderTemplate(6, financialData)` — quarterly revenue bars with YoY growth line.
4. **Valuation football field** — `templates.renderTemplate(7, valuationData)` — horizontal bar ranges for 3-4 valuation methods with current price marker.
5. **Peer radar** — `templates.renderTemplate(8, peerData)` — spider/radar chart comparing ticker vs 3-4 peers on 5-6 metrics.

A settled promise that was rejected logs a warning and substitutes a placeholder `<div class="chart-unavailable">Chart temporarily unavailable</div>` in the HTML. Report generation continues.

### 5.2 Price Tier Configuration

`getReportConfig(reportType)` — maps report type string to price and cover template:

```
getReportConfig(reportType: string) -> { price: number, coverTemplate: 'A' | 'B' | 'C' }
```

Report types: `single` ($14.99, cover A), `complex` ($19.99, cover A), `sector` ($19.99, cover B), `bundle` ($24.99, cover C).

### 5.3 HTML Section Ordering for Preview Guarantee

The `buildReportHTML(sections, charts, config)` function must lay out the HTML in an order that guarantees the most visually impressive content falls within the first 5 pages of the PDF:

1. **Page 1**: Report cover (rendered chart from `covers.js`)
2. **Page 2**: Executive summary with a metrics highlight box (key numbers from the insider_intelligence section)
3. **Pages 3-4**: Insider Intelligence section with the transaction table chart and timeline chart embedded
4. **Page 5**: Price chart with buy markers + "CONTINUE READING" banner
5. **Pages 6+**: Remaining sections (financial_analysis, valuation_analysis, bull_case, bear_case, peer_comparison, catalysts_timeline, investment_thesis, company_overview)

The "CONTINUE READING" banner is an HTML block with full-width styling, the report price, and a purchase URL. It is rendered as part of the HTML before PDF generation — not added as a post-processing overlay.

**Charts are embedded as base64 data URIs** (not R2 HTTPS URLs) in the HTML that is sent to WeasyPrint. This prevents WeasyPrint from making synchronous outbound network calls during PDF rendering. Pattern: `Buffer.from(chartBuffer).toString('base64')` → inject as `src="data:image/png;base64,{base64}"`.

### 5.4 WeasyPrint PDF Generation — Via Screenshot Server

**IMPORTANT**: WeasyPrint is NOT called from the n8n Code node. The n8n sandbox blocks `child_process.spawn`, making `node-weasyprint` non-functional. Instead:

The existing screenshot server at `host.docker.internal:3456` gains a new `/weasyprint` HTTP endpoint. WeasyPrint and its Python/system dependencies are installed inside the screenshot server's Docker container. The n8n Code node sends the HTML string to this endpoint via `fetch` (exactly as it calls `/pdf` today) and receives a PDF buffer.

`generateReportPDF(htmlString, config)` — calls `fetch('http://host.docker.internal:3456/weasyprint', { method: 'POST', body: htmlString })` and returns the response as a Buffer.

The HTML includes embedded CSS with:
- `@font-face` for Inter or Roboto (font files served locally — NOT from CDN — to avoid network calls during PDF generation)
- `@page` rule with running header and page counter
- `@page :first { @top-center { content: none; } }` to suppress the header on the cover page
- `section { break-before: page; }` to separate sections onto new pages
- TOC entries use `a::after { content: leader('.') target-counter(attr(href), page); }` for dynamic page numbers

File size check: after generation, if the PDF buffer exceeds 8MB, throw an error (raised from 5MB in original spec to account for high-DPI chart images).

### 5.5 5-Page Preview Extraction

`generatePreviewPDF(fullPdfBuffer)` — uses `pdf-lib` to extract the first N pages, where N = `Math.min(sourceDoc.getPageCount(), 5)`:

```
generatePreviewPDF(fullPdfBuffer: Buffer) -> Promise<Buffer>
```

Pattern: `PDFDocument.load(buffer)` → compute `pageCount = Math.min(doc.getPageCount(), 5)` → `PDFDocument.create()` → `copyPages(source, [0,...,pageCount-1])` → add pages → `save()` → `Buffer.from(Uint8Array)`.

The preview and full PDFs are both uploaded to R2. The preview URL is public-accessible; the full URL requires authentication. Both keys are saved to the NocoDB reports record. R2 key naming convention: `reports/{slug}-preview.pdf` and `reports/{slug}-full.pdf`.

---

## Section 6: generate-lead-magnet.js Expansion

### Goal

Expand the monthly backtest lead magnet from 1500-2000 words / simple HTML to 4000-4500 words / 12-15 pages with verified math, dynamic title, additional content sections, and real chart images.

### 6.1 Expanded Single-Call Generation

`buildNarrativePrompt(data)` is updated to instruct Claude to write 4000-4500 words in a structured format. The Claude call uses:
- `max_tokens: 8192`
- Header: `anthropic-beta: max-tokens-3-5-sonnet-2024-07-15` (unlocks extended output beyond 4096 tokens)

The word target is 4000-4500 (not 5000) to stay within the extended token limit reliably. The prompt requests these sections in order: Opening Hook, Quick Wins (5 actionable insights), The Numbers, What If $10K per Alert, Cluster vs Individual, The Losers (wrapped in `<div id="losers-section">...</div>`), Key Takeaways, CTA.

After generation, word count is checked. If < 3800 words, a single retry with an explicit word count instruction is made.

### 6.2 Dynamic Title

`buildDynamicTitle(topPerformers)` — derives the title from real data:

```
buildDynamicTitle(topPerformers: Array<{ ticker, return }>) -> string
```

Returns a string like: "17 Insider Buys That Jumped 340%+ — The March 2026 Backtest". The count is the actual number of winning picks, the percentage is the top performer's return floored to the nearest integer, and the month is the current month/year.

### 6.3 "What If" Simulation — Deterministic Math

`computeWhatIfSimulation(topPerformers)` — computes the simulation in pure JavaScript with no AI involvement:

```
computeWhatIfSimulation(topPerformers: Array<{ ticker, return }>) -> {
  perPick: Array<{ ticker, invested: 10000, value: number }>,
  totalInvested: number,
  totalValue: number,
  totalReturn: number (percentage)
}
```

These computed numbers are passed to Claude in the narrative prompt as data. Claude writes the narrative framing; Claude never computes arithmetic.

### 6.4 Math Accuracy Verification

`verifyMathAccuracy(text, computedData)` — runs after generation to catch any case where Claude's narrative uses incorrect numbers:

```
verifyMathAccuracy(text: string, computedData: { winRate, avgReturn, portfolioValue }) -> string[]
```

Returns an array of error messages for any value that deviates from the computed value by more than 1 percentage point. On errors, the lead magnet generation retries once with explicit corrections. This is not a quality gate — it runs after the narrative is generated and before HTML assembly.

### 6.5 Worst Performers Table

`buildLeadMagnetHTML()` gains a Worst Performers HTML table inserted after the Top Performers table: columns are Ticker, Insider, Amount, Return (red), What Went Wrong. The "What Went Wrong" column content is pre-extracted from Claude's narrative using the structured losers section format rather than parsed heuristically.

### 6.6 Losers Section Length Validation

After generation, the losers section is extracted by finding `<div id="losers-section">...</div>` in the generated HTML/text. The inner text is word-counted. If it falls below 500 words, a targeted retry is made for just the losers section with the explicit instruction: "The losers section is too short. Expand each loss with: what went wrong, what the data missed, what we learned. Wrap in `<div id="losers-section">...</div>`."

### 6.7 CTA Placement

`buildLeadMagnetHTML()` injects two CTA HTML blocks: one after the Quick Wins section and one after the methodology/numbers section. Each CTA links to `https://earlyinsider.com/alerts`.

### 6.8 Three Charts

Three charts are generated before building the HTML:
1. Portfolio vs S&P 500 line chart over 12 months — via `generate-chart.js` (assumed available)
2. Winners table image (Template 4 from visual-templates.js)
3. Monthly stats bar chart — scores (win rate × avg return) plotted by month

Charts are generated sequentially since the lead magnet runs once monthly and latency is not critical. Each chart buffer is uploaded to R2 before HTML assembly. Lead magnet HTML uses `<img src="{r2_url}">` (not data URIs) since it renders via the existing screenshot server, not WeasyPrint.

---

## Data Shapes

The following types are introduced or modified. These are for reference only — not complete implementations.

**`QualityGateResult`**
```
{ valid: boolean, errors: string[], staleness_warning: boolean }
```

**`ArticleOutline`**
```
{ headline: string, tldr: string[], sections: Array<{ h2: string, h3s: string[] }>, required_data_points: string[] }
```

**`FreshnessCheck`**
```
{ fresh: boolean, effectiveArticleType: string, lastPublished?: string }
```

**`ReportSection`**
```
{ id: string, wordTarget: number, text: string }
```

**`BearCaseReview`**
```
{ score: number, reasoning: string }
```

**`ReportConfig`**
```
{ price: number, coverTemplate: 'A' | 'B' | 'C' }
```

**`WhatIfResult`**
```
{ perPick: Array<{ ticker: string, invested: number, value: number }>, totalInvested: number, totalValue: number, totalReturn: number }
```

---

## Infrastructure and Dependencies

### New npm Packages (add to `n8n/package.json`)

- `pdf-lib` — pure-JS PDF manipulation for preview page extraction (no binary dependency)

### Screenshot Server Changes

The screenshot server at `host.docker.internal:3456` needs a new `/weasyprint` endpoint:
- Accepts: POST with `Content-Type: text/html`, body = HTML string
- Returns: binary PDF buffer
- WeasyPrint Python package and system libs (`libpango`, `libcairo`, `libgdk-pixbuf2.0`) must be installed in the screenshot server's Dockerfile

This is the correct architecture because n8n Code nodes cannot spawn child processes, but the screenshot server has full OS access.

### n8n Environment Variables

Add to the n8n `.env` file:
- `EXECUTIONS_TIMEOUT=600` (10 min — required for sequential 10-call report generation)
- `EXECUTIONS_TIMEOUT_MAX=900` (15 min — hard ceiling)

### Font Files

A font directory served by the screenshot server must contain Inter or Roboto TTF/WOFF2 files for WeasyPrint PDF rendering. CDN font URLs are not used during PDF generation.

---

## Test Requirements

Every new pure function must have unit tests in `n8n/tests/generate-article.test.js`, `generate-report.test.js`, or `generate-lead-magnet.test.js` as appropriate:

**generate-article.js tests:**
- `computeFleschKincaidEase`: known HTML inputs → expected FK Ease scores within ±3 (loose tolerance due to inline syllable counter)
- `countSyllablesInline`: finance abbreviations (IPO, ETF) → 3; "Ceo" (mixed case) → 3; common words → expected counts
- `qualityGate` (merged): each of the ~18-20 checks individually — test pass case and fail case for each
- `validateOutline`: valid outline passes; outline with <5 sections fails; outline missing ticker fails
- `checkContentFreshness`: mock nocodbGet — ticker with no recent articles → `{ fresh: true, effectiveArticleType: 'insider_buying' }`; ticker with recent article → `{ fresh: false, effectiveArticleType: 'contrarian', lastPublished: '...' }`
- `generateSchema`: given an article object → returns valid JSON-LD string containing Article, Person, and FinancialProduct entities

**generate-report.js tests:**
- `getReportConfig`: all 4 report types → correct price and cover template
- `generateReportSection` (mock fetchFn): verify prior sections are passed as XML-tagged context
- `reviewBearCaseAuthenticity` (mock fetchFn with `{ score: 4, reasoning: '...' }`): retry triggered; mock with score 8 → accepted
- `generatePreviewPDF`: given a 10-page PDF buffer → output has exactly 5 pages; given a 3-page PDF buffer → output has 3 pages (not 5)

**generate-lead-magnet.js tests:**
- `computeWhatIfSimulation`: pure arithmetic test — $10K × 5 picks with known returns → correct per-pick values, total invested, total value
- `verifyMathAccuracy`: text matching computed values → empty error array; text with win rate 2% off from computed → error in array
- `buildDynamicTitle`: given topPerformers array with 17 picks, top return 340.7% → expected title string
- Losers section length check: `<div id="losers-section">` with 400 words → retry triggered; 600 words → accepted
