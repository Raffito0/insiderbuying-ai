<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-article-persona-multistep
section-02-article-quality-gate
section-03-article-visual-freshness-schema
section-04-report-sequential-generation
section-05-report-charts-pdf-preview
section-06-lead-magnet-expansion
END_MANIFEST -->

# Implementation Sections Index

Three files are upgraded across 6 sections. Sections 1-3 cover `generate-article.js`, sections 4-5 cover `generate-report.js`, and section 6 covers `generate-lead-magnet.js`. Sections 1-4 and 6 are independent and can be written in parallel. Section 5 depends on section 4 (it assembles charts around the report sections produced by section 4's loop).

---

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-article-persona-multistep | — | — | Yes |
| section-02-article-quality-gate | — | — | Yes |
| section-03-article-visual-freshness-schema | — | — | Yes |
| section-04-report-sequential-generation | — | section-05 | Yes |
| section-05-report-charts-pdf-preview | section-04 | — | No |
| section-06-lead-magnet-expansion | — | — | Yes |

---

## Execution Order

1. **Batch 1** (parallel): section-01, section-02, section-03, section-04, section-06 — all independent
2. **Batch 2**: section-05 — requires section-04 to be complete first

---

## Section Summaries

### section-01-article-persona-multistep
Adds the Ryan Chen named persona (insiderbuying blog only) and replaces the current single-step Claude Tool Use call with a two-step outline → draft process. The outline step uses a plain JSON call (~300 tokens) validated by `validateOutline()` with a 1-retry budget. The draft step receives the validated outline plus the existing Dexter data and now embeds `{{VISUAL_1}}`, `{{VISUAL_2}}`, `{{VISUAL_3}}` placeholders for chart injection.

**File**: `generate-article.js`
**New functions**: `generateArticleOutline(ticker, articleType, dexterData, fetchFn)`, `validateOutline(outline)`
**Modified functions**: system prompt builder (persona injection), draft generation call (outline context injection)
**Tests**: `n8n/tests/generate-article.test.js` — validateOutline pass/fail cases, persona injection by blog, markdown fence stripping on JSON parse, outline retry budget (1 max)

### section-02-article-quality-gate
Merges the existing 14-check quality gate with the spec's 14 checks into a unified ~18-20 check gate. Retains 5 existing checks not duplicated by spec (meta description, key_takeaways, verdict fields, banned phrases, numeric density). Upgrades 3 checks (FK Ease 25-55 replaces FK Grade; visual ≥3 replaces data_tables; word count 1800-2500 replaces variable range). Adds 10 new spec checks (internal links, CTA in first 500 chars, track record, social proof, filing timeliness, TLDR position, sentence CV, keyword density, no generic opening, title length). Also adds all required helper functions: `computeFleschKincaidEase`, `countSyllablesInline` (inline, CommonJS-compatible, uppercase-normalizes abbreviations), `extractSentences`, `countWords`, `stdDev`, `mean`.

**File**: `generate-article.js`
**New/modified functions**: `qualityGate(article, opts)` (merged gate), `computeFleschKincaidEase(html)`, `countSyllablesInline(word)`, `extractSentences(html)`, `countWords(html)`, `stdDev(arr)`, `mean(arr)`
**Return type**: `{ valid: boolean, errors: string[], staleness_warning: boolean }`
**Tests**: `n8n/tests/generate-article.test.js` — each check individually (pass + fail), FK helper with known inputs, syllable abbreviation overrides (IPO/ETF/CEO mixed case), CV null guard for ≤1 sentence

### section-03-article-visual-freshness-schema
Adds three capabilities that run after the quality gate passes. (1) `replaceVisualPlaceholders(article, filingData)` replaces `{{VISUAL_N}}` tokens with real chart images via `templates.renderTemplate()` + R2 upload; missing tokens are warned and skipped, not thrown. (2) `checkContentFreshness(ticker, nocodbOpts)` queries NocoDB for articles in the last 30 days; returns `effectiveArticleType` that must be propagated through slug, CTA, SEO keyword, and tags. (3) `generateSchema(article)` produces a `<script type="application/ld+json">` string with Article + Person (Ryan Chen) + FinancialProduct entities, appended to `body_html` before the NocoDB write.

**File**: `generate-article.js`
**New functions**: `replaceVisualPlaceholders(article, filingData)`, `uploadChart(buffer, key)`, `checkContentFreshness(ticker, nocodbOpts)`, `generateSchema(article)`
**Tests**: `n8n/tests/generate-article.test.js` — freshness check mock (fresh / not fresh), effectiveArticleType propagation, JSON-LD structure validation (parseable, contains 3 entity types), placeholder replacement with missing tokens

### section-04-report-sequential-generation
Replaces `generate-report.js`'s single Claude call with a 10-call sequential loop. Sections are generated in fixed order (company_overview, insider_intelligence, financial_analysis, valuation_analysis, bull_case, bear_case, peer_comparison, catalysts_timeline, investment_thesis) followed by exec_summary generated last. Each section call receives all prior sections as XML-tagged context. Bear case uses an adversarial system prompt and triggers `reviewBearCaseAuthenticity()` (a separate Claude scoring call returning `{ score: 1-10, reasoning }`) — retried if score < 7, max 2 total attempts. A global `failedSections` guard aborts the loop if more than 2 sections fail after their per-section retries. Exec summary receives all 9 sections as context.

**File**: `generate-report.js`
**New functions**: `generateReportSection(sectionId, wordTarget, completedSections, data, fetchFn)`, `buildSectionSystemPrompt(sectionId)`, `reviewBearCaseAuthenticity(bearCaseText, fetchFn)`, `generateExecSummary(allSections, fetchFn)`
**Tests**: `n8n/tests/generate-report.test.js` — XML context injection verified, bear case retry on score < 7, abort guard at failedSections > 2, markdown fence stripping on authenticity JSON parse

### section-05-report-charts-pdf-preview
Adds chart generation, price tier config, WeasyPrint PDF via screenshot server, and 5-page preview extraction. Five charts use `Promise.allSettled` (not `Promise.all`) — failed charts substitute a placeholder `<div class="chart-unavailable">`. Charts are embedded as base64 data URIs in the HTML (not R2 HTTPS URLs) to prevent synchronous network calls inside WeasyPrint. `buildReportHTML()` lays out sections in a specific order that guarantees premium content in pages 1-5 (Cover → Exec Summary → Insider Intelligence with charts → Price chart + CONTINUE READING banner → remaining sections). `generateReportPDF()` calls `http://host.docker.internal:3456/weasyprint` (NOT from n8n Code node's child_process — WeasyPrint runs inside the screenshot server). `generatePreviewPDF()` uses `pdf-lib` with `Math.min(sourceDoc.getPageCount(), 5)` to safely extract preview pages. Both PDFs uploaded to R2 with keys `reports/{slug}-preview.pdf` and `reports/{slug}-full.pdf`.

**File**: `generate-report.js`
**New functions**: `getReportConfig(reportType)`, `buildReportHTML(sections, charts, config)`, `generateReportPDF(htmlString, config)`, `generatePreviewPDF(fullPdfBuffer)`
**Dependencies**: section-04 (needs knowledge of section data shapes and HTML ordering)
**Tests**: `n8n/tests/generate-report.test.js` — all 4 report type configs, preview edge cases (3-page and 10-page source), chart fallback on rejection, data URI format check, 8MB size guard

### section-06-lead-magnet-expansion
Expands `generate-lead-magnet.js` from 1500-2000 words to 4000-4500 words with verified math, dynamic title, and enhanced HTML. Key changes: `buildNarrativePrompt()` uses `max_tokens: 8192` + `anthropic-beta: max-tokens-3-5-sonnet-2024-07-15` header; `computeWhatIfSimulation()` computes all arithmetic deterministically in JS (never asks Claude to do math); `verifyMathAccuracy()` validates Claude's narrative matches computed values within ±1%; `buildDynamicTitle()` derives title from real top performer data; losers section extracted via `<div id="losers-section">` tag and word-counted (retry if < 500 words); worst performers table added to HTML; two CTA blocks injected; three charts generated sequentially and uploaded to R2 before HTML assembly; lead magnet HTML uses R2 URLs (not data URIs) since it renders via the screenshot server.

**File**: `generate-lead-magnet.js`
**New functions**: `buildDynamicTitle(topPerformers)`, `computeWhatIfSimulation(topPerformers)`, `verifyMathAccuracy(text, computedData)`
**Modified functions**: `buildNarrativePrompt()` (extended output header, 4000-4500 word target, losers section tag instruction), `buildLeadMagnetHTML()` (worst performers table, 2 CTA blocks, chart img tags)
**Tests**: `n8n/tests/generate-lead-magnet.test.js` — deterministic math tests, ±1% math accuracy tolerance, dynamic title format, losers section retry on < 500 words, extended output beta header present in API call
