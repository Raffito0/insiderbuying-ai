# Research Findings — 15-articles-reports

## 1. Codebase Analysis

### 1.1 Project Structure

Node.js (n8n Code nodes), Next.js 16 frontend, Supabase + NocoDB data layer, Cloudflare R2 storage.
Testing: Jest 30 (`"testEnvironment": "node", "testMatch": ["**/tests/**/*.test.js"]`) — tests live in `n8n/tests/`.
Test style: `node:test` + `node:assert/strict` within Jest's test runner.

---

### 1.2 generate-article.js — Current State (1182 lines)

**Claude API pattern**: Tool Use (forced) via direct `fetch` to `https://api.anthropic.com/v1/messages`.
Model: `claude-sonnet-4-6-20250514`, temperature: 0.6.

```javascript
// Current pattern (Tool Use — structured output)
const response = await fetchFn('https://api.anthropic.com/v1/messages', {
  body: JSON.stringify({
    model: 'claude-sonnet-4-6-20250514',
    tools: [tool],
    tool_choice: { type: 'tool', name: 'generate_article' },
    ...
  }),
});
```

**Existing quality gate (14 checks — DIFFERENT from spec's gate):**
1. Title length 55-65 chars
2. Meta description 140-155 chars
3. 3-4 key_takeaways each containing a number
4. verdict_type in [BUY, SELL, CAUTION, WAIT, NO_TRADE]
5. verdict_text contains numeric threshold
6. Zero banned AI phrases (83 phrases)
7. ≥40% paragraphs contain numeric data
8. Word count within target range
9. Primary keyword in title (≥50% of keyword words)
10. Primary keyword in first 100 words
11. Primary keyword in at least one H2
12. Primary keyword in meta_description (≥40%)
13. Type A articles require ≥1 data table
14. All required fields present

**Additionally**: SEO score (≥70) and AI detection score (≤40) run after the gate.

**Retry logic**: MAX_RETRIES = 2. Failed gate → feedback injected into next Claude call.

**Author**: "Dexter Research" for insiderbuying blog, "Ryan Cole" for others. No "Ryan Chen" persona exists yet.

**Current generation**: Single-step Tool Use call (no outline → draft multi-step).

**NocoDB helpers**: `nocodbGet()`, `nocodbPost()`, `nocodbPatch()` — base URL from `NOCODB_BASE_URL` env, auth via `xc-token` header.

**Exported pure functions (tested)**: `extractTicker`, `determineArticleParams`, `interpolateTemplate`, `buildToolSchema`, `extractToolResult`, `qualityGate`, `seoScore`, `aiDetectionScore`, `sanitizeHtml`, `ensureUniqueSlug`.

---

### 1.3 generate-report.js — Current State (287 lines)

**Simple single-call generation** — no sequential sections, no WeasyPrint.
Trigger: Stripe `checkout.session.completed` webhook.
PDF: delegated to `render-pdf.js` (screenshot server at `http://host.docker.internal:3456`).

Key functions: `parseWebhook`, `determineReportParams`, `buildReportPrompt`, `buildReportHTML`, `buildDeliveryEmail`, `buildReportRecord`.

Report structure in prompt: Executive Summary, Key Findings, Detailed Analysis, Risk Assessment, Conclusion & Recommendations (5 sections, not 9).

Price tiers: NOT implemented. Report type is deep-dive / sector / watchlist only.

---

### 1.4 generate-lead-magnet.js — Current State (349 lines)

1500-2000 word narrative. Monthly schedule trigger.

Key functions: `gatherBacktestData`, `buildNarrativePrompt`, `buildLeadMagnetHTML`, `buildVersionRecord`.

NO math verification, no dynamic title, no "What If" simulation, no worst performers table, no losers section length check.

Charts: embedded as JSON comment `<!-- charts: {...} -->` in HTML for future rendering — NOT actual chart images.

---

### 1.5 render-pdf.js — Current PDF Stack (116 lines)

Uses **screenshot server** (`http://host.docker.internal:3456` POST `/pdf`), NOT WeasyPrint.
Uploads result to R2 via AWS Sig V4.

WeasyPrint is **not installed** in this project. Adding it would require a new Python dependency on the VPS.

---

### 1.6 Existing Supporting Modules

- `generate-image.js`: fal.ai Flux for hero images, R2 upload with AWS Sig V4
- `dexter-research.js`: financial data aggregation (Financial Datasets API, parallel fetch)
- `blog-helpers.js`: NocoDB query building, sanitization helpers
- `render-pdf.js`: screenshot server → R2 upload

**visual-templates.js / covers.js**: NOT found in codebase. These are referenced by the spec but do not exist yet — they need to be created as part of earlier sections.

---

### 1.7 NocoDB Table Fields

**Articles table**: slug, title_text, meta_description, body_html, verdict_type, verdict_text, key_takeaways (JSON), word_count, primary_keyword, ticker, sector, company_name, blog, author_name, status, quality_gate_pass, seo_score, ai_detection_score, published_at.

**Reports table**: user_id, report_type, pdf_url, payment_id, status, generated_at, created_at.

**Lead Magnet Versions**: month_year, pdf_url, stable_url, alert_count, hit_rate, avg_return, status.

---

## 2. Web Research

### 2.1 Flesch-Kincaid Reading Ease in JavaScript

**Formula**: `FRE = 206.835 - 1.015*(words/sentences) - 84.6*(syllables/words)`

**Score ranges**:
- 60–70: Standard (newspaper)
- **30–50: Difficult (academic / finance) — spec target is correct**
- 0–30: Very difficult (legal)

**Implementation**:
- Use `syllable` npm package (ESM-only) for syllable counting
- Use `flesch` npm package from same `words` monorepo for the final formula
- Must strip HTML BEFORE passing text (libraries do not handle HTML)

```javascript
import { syllable } from 'syllable';
import { flesch } from 'flesch';

function computeFKEase(html) {
  const text = stripHtmlToPlainText(html);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length || 1;
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null; // guard division-by-zero
  const syllableCount = words.reduce((acc, w) => acc + syllable(w), 0);
  return flesch({ sentence: sentences, word: words.length, syllable: syllableCount });
}
```

**Finance abbreviation override** (IPO, ETF, CEO, SEC, ESG all have 3 syllables — `syllable` undercounts):
```javascript
const ABBREV_SYLLABLES = { IPO: 3, ETF: 3, CEO: 3, SEC: 3, ESG: 3, CFO: 3, COO: 3, CTO: 3 };
function countSyllables(word) {
  return ABBREV_SYLLABLES[word.toUpperCase()] ?? syllable(word);
}
```

**HTML stripping pattern**:
```javascript
function stripHtmlToPlainText(html) {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(p|div|br|li|h[1-6]|tr|td)[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#?\w+;/g, '')
    .replace(/\s+/g, ' ').trim();
}
```

**Packages to install**: `npm install syllable flesch` (add to n8n/package.json or inline as vendor modules in the Code node).

> Note: `syllable` is ESM-only. Since n8n Code nodes run in CommonJS context, the project already uses a `require('https')` polyfill pattern. For ESM packages, either use dynamic `import()` inside an async function or bundle the functions as CommonJS shims.

Sources: [syllable npm](https://www.npmjs.com/package/syllable), [flesch npm](https://github.com/words/flesch), [DEV.to Readability Formulas JS](https://dev.to/ckmtools/every-readability-formula-explained-with-javascript-examples-21ml)

---

### 2.2 WeasyPrint CSS @page PDF Generation

**WeasyPrint requires Python** (`pip install weasyprint`) and system libs: `libpango`, `libcairo`, `libgdk-pixbuf2.0`.

**Calling from Node.js**: use `node-weasyprint` npm package (`npm install node-weasyprint`), which calls the Python binary via `child_process.spawn` under the hood.

```javascript
import weasyprint from 'node-weasyprint';
const pdfBuffer = await weasyprint(htmlString, { buffer: true });
```

**@page headers/footers** (CSS Running Elements — WeasyPrint v52+ supported):
```css
/* Place running elements BEFORE content in HTML */
.page-header { position: running(header); }
.page-footer { position: running(footer); }

@page {
  margin: 2.5cm 2cm;
  @top-center { content: element(header); }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); font-size: 8pt; }
}

@page :first { @top-center { content: none; } } /* no header on cover */
```

**TOC with dynamic page numbers**:
```css
.toc a::after {
  content: leader('.') target-counter(attr(href), page);
  float: right;
}
section { break-before: page; }
```

**Font embedding** — serve fonts locally, pass `base_url` to WeasyPrint:
```python
HTML(string=html, base_url='/app/static/').write_pdf('/tmp/report.pdf')
```
Helvetica Neue requires a commercial license; use Inter or Roboto as open-source substitutes.

**Gotchas**:
- Running elements must be placed before body content in HTML source order
- WeasyPrint does NOT accept size/margin as CLI flags — CSS `@page` only
- For large PDFs (>50MB), use temp file output instead of stdout pipe

Sources: [node-weasyprint npm](https://github.com/ericbf/node-weasyprint), [WeasyPrint Tips & Tricks](https://doc.courtbouillon.org/weasyprint/v52.5/tips-tricks.html), [PrintCSS Running Headers](https://medium.com/printcss/printcss-running-headers-and-footers-3bef60a60d62)

---

### 2.3 Claude API Multi-Step Sequential Generation

**SDK pattern** (the spec's `claude.complete(system, user)` maps to):
```javascript
const message = await client.messages.create({
  model: 'claude-sonnet-4-6-20250514',
  max_tokens: 4096,
  system: systemPrompt,
  messages: [{ role: 'user', content: userPrompt }],
});
const text = message.content[0].text;
```

**Context injection between sequential calls** — use XML tags:
```javascript
const userPrompt = `
<prior_sections>
  <section name="company_overview">${completedSections.company_overview}</section>
  <section name="insider_intelligence">${completedSections.insider_intelligence}</section>
</prior_sections>

Now write the Financial Analysis section. Target: 700 words. Build on the above — do not repeat it.
`;
```

Anthropic recommends putting long prior content at the TOP of the user message, above the instruction.

**Token management**: A 9-section report (~5,500 words total) is ~7K tokens — well within the 200K context window. No summarization needed; pass full prior sections for this use case.

**Built-in retry**: The Anthropic SDK has automatic retry (2x default) for 429, 5xx. For sequential pipelines, checkpoint completed sections before throwing on failure to enable resume.

Sources: [Anthropic TypeScript SDK](https://platform.claude.com/docs/en/api/sdks/typescript), [Claude Prompting Best Practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)

---

### 2.4 PDF Page Extraction — pdf-lib vs pdftk

**Recommendation: use `pdf-lib`** (pure JS, no binary dependency).

```javascript
import { PDFDocument } from 'pdf-lib';

async function extractFirstNPages(sourcePdfBuffer, n) {
  const sourceDoc = await PDFDocument.load(sourcePdfBuffer);
  const pageCount = Math.min(n, sourceDoc.getPageCount());
  const newDoc = await PDFDocument.create();
  const indices = Array.from({ length: pageCount }, (_, i) => i);
  const copiedPages = await newDoc.copyPages(sourceDoc, indices);
  copiedPages.forEach(page => newDoc.addPage(page));
  const bytes = await newDoc.save();
  return Buffer.from(bytes); // compatible with R2 upload
}
```

- `copyPages` copies fonts, images, and annotations — no quality loss
- Output `Uint8Array` → `Buffer.from()` → pass directly to R2 upload
- No temp files, no OS binary required

**pdftk** would require `apt-get install pdftk-java` on the VPS and temp files for I/O — unnecessary overhead for extracting 5 pages.

Sources: [pdf-lib npm](https://www.npmjs.com/package/pdf-lib), [pdf-lib GitHub](https://github.com/Hopding/pdf-lib)

---

## 3. Testing Conventions

**Framework**: Jest 30 (`"testEnvironment": "node"`) — tests in `n8n/tests/*.test.js`.
Test style: `node:test` describe/it blocks + `assert` from `node:assert/strict`.
Pattern: pure-function unit tests, no mocking, 1000-iteration statistical tests for weighted random functions.

**New tests for this spec must**:
- Be placed in `n8n/tests/`
- Use `node:test` + `node:assert/strict` style
- Cover all pure functions (qualityGate checks individually, computeFKEase, checkContentFreshness, etc.)
- Mock Claude/NocoDB at the HTTP level (fetchFn injection pattern already used in generate-article.js)

---

## 4. Key Constraints & Gotchas

1. **No visual-templates.js or covers.js exist** — they are referenced by the spec but must be created in earlier sections of the plan.
2. **WeasyPrint is not currently installed** — requires VPS setup (Python, system libs, node-weasyprint npm package).
3. **Current PDF stack uses screenshot server** — WeasyPrint replaces this only for complex reports; simple reports can still use the screenshot server.
4. **`syllable` is ESM-only** — n8n Code nodes run in CommonJS. Either use dynamic `import()` or inline a CommonJS-compatible syllable implementation.
5. **Existing quality gate is completely different** from the spec's 14 checks — the new gate replaces the old one, it is not additive.
6. **Claude Tool Use pattern** should be preserved for articles (structured output); the `claude.complete()` wrapper in the spec is a simplified notation. For reports/lead magnets that generate prose sections, direct `messages.create()` without Tool Use is appropriate.
7. **n8n Code node size limit** — each Code node has a character limit. If a file grows very large, it may need to be split into multiple nodes or helper modules.
