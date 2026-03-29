# Section 05 — Report Charts, Price Tiers, WeasyPrint PDF, and 5-Page Preview

## Overview

This section adds the final assembly layer to `generate-report.js`. It builds on the sequential section generation from section-04 and adds: chart generation with graceful failure handling, price tier configuration, HTML layout with guaranteed premium content in pages 1-5, PDF generation via the screenshot server's WeasyPrint endpoint, and a 5-page preview extraction using `pdf-lib`.

**File**: `ryan_cole/insiderbuying-site/n8n/generate-report.js`
**New functions**: `getReportConfig`, `buildReportHTML`, `generateReportPDF`, `generatePreviewPDF`
**New npm package**: `pdf-lib` (add to `n8n/package.json`)
**Test file**: `n8n/tests/generate-report.test.js`
**Depends on**: section-04 (section data shapes and the `completedSections` object structure must exist before this section is implemented)

---

## Tests First

All tests live in `n8n/tests/generate-report.test.js`. Add these stubs and fill in implementations.

### Price Tier Configuration

```js
// Test: getReportConfig('single') → { price: 14.99, coverTemplate: 'A' }
// Test: getReportConfig('complex') → { price: 19.99, coverTemplate: 'A' }
// Test: getReportConfig('sector') → { price: 19.99, coverTemplate: 'B' }
// Test: getReportConfig('bundle') → { price: 24.99, coverTemplate: 'C' }
// Test: getReportConfig('unknown') → throws or returns null (not silently wrong price)
```

### Chart Generation

```js
// Test: Promise.allSettled used for chart generation (not Promise.all)
//   — mock one chart to reject → report generation continues, placeholder div substituted
// Test: failed chart substitutes <div class="chart-unavailable"> in HTML (not an empty string)
// Test: all 5 charts succeed → all appear as base64 data URIs in HTML (no R2 HTTPS URLs)
// Test: chart buffer → base64 data URI format: src="data:image/png;base64,{base64}"
```

### HTML Section Ordering

```js
// Test: buildReportHTML — cover is first element in HTML output
// Test: buildReportHTML — executive summary follows cover (before financial sections)
// Test: buildReportHTML — "CONTINUE READING" banner present in HTML
// Test: buildReportHTML — "CONTINUE READING" banner contains report price
```

### WeasyPrint PDF Generation

```js
// Test: generateReportPDF sends POST to http://host.docker.internal:3456/weasyprint (not /pdf)
// Test: generateReportPDF returns a Buffer
// Test: generateReportPDF — response buffer > 8MB → throws with size error message
```

### 5-Page Preview Extraction

```js
// Test: generatePreviewPDF — 10-page source PDF → output PDF has exactly 5 pages
// Test: generatePreviewPDF — 3-page source PDF → output PDF has exactly 3 pages (not 5, not crash)
// Test: generatePreviewPDF — 5-page source PDF → output PDF has exactly 5 pages
// Test: generatePreviewPDF — returns a Buffer (not Uint8Array)
// Test: generatePreviewPDF — 0-page source PDF → returns empty or 0-page result without throwing
```

---

## Dependencies

- **section-04 must be complete** before implementing this section. You need the `completedSections` object structure (keyed by section id, values are plain strings) and the `exec_summary` text that section-04 produces.
- **`visual-templates.js`** — assumed to be available (built by earlier plan sections). Provides `templates.renderTemplate(templateId, data)` which returns a Buffer.
- **`covers.js`** — assumed to be available. Provides `covers.renderCoverA({ ticker, verdict, reportDate, ... })` which returns a Buffer.
- **`pdf-lib`** — must be added to `n8n/package.json` before implementing `generatePreviewPDF`. This is the only new npm package required by this section.
- **Screenshot server `/weasyprint` endpoint** — must be added to the screenshot server at `host.docker.internal:3456`. This is a server-side infrastructure change outside of the n8n Code node. See infrastructure notes below.

---

## Implementation

### 5.1 Chart Generation

Generate all 5 charts using `Promise.allSettled` (never `Promise.all`). A single chart failure must not abort the whole report.

Charts to generate:
1. **Cover** — `covers.renderCoverA({ ticker, verdict, reportDate, ... })` from `covers.js`
2. **Price chart** — `templates.renderTemplate(5, priceHistoryData)` — 12-month price line with vertical markers at each insider buy date
3. **Revenue trend** — `templates.renderTemplate(6, financialData)` — quarterly revenue bars with YoY growth line
4. **Valuation football field** — `templates.renderTemplate(7, valuationData)` — horizontal bar ranges for 3-4 valuation methods with current price marker
5. **Peer radar** — `templates.renderTemplate(8, peerData)` — spider/radar chart comparing ticker vs 3-4 peers on 5-6 metrics

When a settled promise has status `'rejected'`, log a warning and substitute a placeholder:
```html
<div class="chart-unavailable">Chart temporarily unavailable</div>
```

Report generation must continue regardless. Do not re-throw chart errors.

**Base64 embedding rule**: Charts are embedded as base64 data URIs in the HTML sent to WeasyPrint — NOT as R2 HTTPS URLs. This prevents WeasyPrint from making synchronous outbound network calls during PDF rendering. Pattern:

```js
const base64 = Buffer.from(chartBuffer).toString('base64');
const dataUri = `data:image/png;base64,${base64}`;
// Use as: src="${dataUri}"
```

This applies to all 5 charts. R2 upload still happens separately for asset storage (so the cover and charts are available for other uses), but the HTML passed to WeasyPrint uses data URIs exclusively.

### 5.2 Price Tier Configuration

```js
/**
 * Maps report type to price and cover template.
 * @param {string} reportType - 'single' | 'complex' | 'sector' | 'bundle'
 * @returns {{ price: number, coverTemplate: 'A' | 'B' | 'C' }}
 * @throws if reportType is unrecognized
 */
function getReportConfig(reportType) { ... }
```

Mapping:
- `'single'` → `{ price: 14.99, coverTemplate: 'A' }`
- `'complex'` → `{ price: 19.99, coverTemplate: 'A' }`
- `'sector'` → `{ price: 19.99, coverTemplate: 'B' }`
- `'bundle'` → `{ price: 24.99, coverTemplate: 'C' }`
- anything else → throw (do not silently return a wrong price)

### 5.3 HTML Section Ordering

```js
/**
 * Assembles the full report HTML in a fixed order that guarantees premium content
 * appears within the first 5 pages of the PDF.
 * @param {Object} sections - keyed by section id, values are plain text strings
 * @param {Object} charts - keyed by chart name, values are base64 data URIs or placeholder HTML
 * @param {Object} config - from getReportConfig()
 * @returns {string} full HTML string ready for WeasyPrint
 */
function buildReportHTML(sections, charts, config) { ... }
```

The HTML must lay out content in this order to guarantee the most visually impressive content lands in the first 5 pages:

1. **Page 1**: Report cover (the rendered cover chart, base64 data URI)
2. **Page 2**: Executive summary with a metrics highlight box (key numbers extracted from the `insider_intelligence` section text)
3. **Pages 3-4**: Insider Intelligence section with the transaction table chart and timeline chart embedded
4. **Page 5**: Price chart with buy markers + "CONTINUE READING" banner
5. **Pages 6+**: Remaining sections in this order: `financial_analysis`, `valuation_analysis`, `bull_case`, `bear_case`, `peer_comparison`, `catalysts_timeline`, `investment_thesis`, `company_overview`

The "CONTINUE READING" banner is a full-width HTML block containing the report price (from `config.price`) and a purchase URL. It is part of the HTML before PDF generation — not a post-processing overlay. Example structure:

```html
<div class="continue-reading-banner">
  <p>Continue reading — Full report: $${config.price}</p>
  <a href="https://earlyinsider.com/reports/${slug}">Get Full Access</a>
</div>
```

**CSS requirements embedded in the HTML**:
- `@font-face` for Inter or Roboto — font files served locally from the screenshot server, NOT from CDN, to avoid network calls during PDF rendering
- `@page` rule with running header and page counter
- `@page :first { @top-center { content: none; } }` — suppresses header on the cover page
- `section { break-before: page; }` — each section starts on a new page
- TOC entries: `a::after { content: leader('.') target-counter(attr(href), page); }` for dynamic page numbers

### 5.4 WeasyPrint PDF Generation

```js
/**
 * Calls the screenshot server's /weasyprint endpoint to generate a PDF.
 * NOTE: WeasyPrint is NOT called via child_process from the n8n Code node.
 * The n8n sandbox blocks child_process.spawn. WeasyPrint runs in the
 * screenshot server's Docker container.
 * @param {string} htmlString - full HTML string from buildReportHTML()
 * @param {Object} config - from getReportConfig()
 * @param {Function} fetchFn - injectable fetch for testing
 * @returns {Promise<Buffer>}
 * @throws if response buffer exceeds 8MB
 */
async function generateReportPDF(htmlString, config, fetchFn = fetch) { ... }
```

- Sends `POST` to `http://host.docker.internal:3456/weasyprint` (same host as the existing `/pdf` endpoint — same server, new route)
- Request body: the HTML string
- Request headers: `Content-Type: text/html`
- Returns response as a `Buffer`
- After receiving the buffer, check size: if `buffer.length > 8 * 1024 * 1024` throw with a clear error message (e.g. `"PDF too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB exceeds 8MB limit"`)

### 5.5 5-Page Preview Extraction

```js
/**
 * Uses pdf-lib to extract the first N pages where N = min(pageCount, 5).
 * @param {Buffer} fullPdfBuffer
 * @returns {Promise<Buffer>}
 */
async function generatePreviewPDF(fullPdfBuffer) { ... }
```

Implementation pattern using `pdf-lib`:

```js
const { PDFDocument } = require('pdf-lib');

async function generatePreviewPDF(fullPdfBuffer) {
  const sourceDoc = await PDFDocument.load(fullPdfBuffer);
  const pageCount = Math.min(sourceDoc.getPageCount(), 5);
  const previewDoc = await PDFDocument.create();
  const pages = await previewDoc.copyPages(sourceDoc, Array.from({ length: pageCount }, (_, i) => i));
  pages.forEach(p => previewDoc.addPage(p));
  const bytes = await previewDoc.save();
  return Buffer.from(bytes);
}
```

Key rules:
- Use `Math.min(sourceDoc.getPageCount(), 5)` — never assume source has at least 5 pages
- If source has 0 pages, `pageCount` is 0, `copyPages` receives an empty array, and `previewDoc.save()` returns an empty document — this must not throw
- Return type must be `Buffer` (from `Buffer.from(Uint8Array)`) — not a `Uint8Array` directly

### R2 Upload

After generating both PDFs, upload both to R2. Key naming convention:
- Full PDF: `reports/{slug}-full.pdf`
- Preview PDF: `reports/{slug}-preview.pdf`

The preview URL is public-accessible; the full PDF URL requires authentication. Both keys are saved to the NocoDB reports record. Use the existing R2 upload pattern from elsewhere in the pipeline (`Content-Type: application/pdf`).

---

## Infrastructure Changes Required

These changes are outside the n8n Code node and must be made separately:

### Screenshot Server — New `/weasyprint` Endpoint

The existing screenshot server at `host.docker.internal:3456` needs:
1. A new HTTP endpoint `POST /weasyprint` that accepts `Content-Type: text/html` and returns a binary PDF buffer
2. WeasyPrint Python package installed in the screenshot server's Dockerfile
3. System libraries installed: `libpango`, `libcairo`, `libgdk-pixbuf2.0`
4. Font files (Inter or Roboto TTF/WOFF2) served locally — NOT from CDN

The endpoint implementation is Python/Node depending on the screenshot server's runtime, but the contract from n8n's perspective is: POST HTML string → receive PDF bytes.

### n8n Environment Variables

Add to the n8n `.env` file:
- `EXECUTIONS_TIMEOUT=600` — 10 minutes, required for the 10-call sequential generation from section-04 plus chart generation
- `EXECUTIONS_TIMEOUT_MAX=900` — hard ceiling at 15 minutes

### `pdf-lib` Package

Add to `n8n/package.json`:
```json
"pdf-lib": "^1.17.1"
```

Then run `npm install` in the n8n directory before deploying.

---

## Integration with Section-04

After section-04's loop completes, you have:
- `completedSections` — object keyed by section id (`company_overview`, `insider_intelligence`, etc.) with plain text string values
- `exec_summary` — plain text string

Pass these as `sections` to `buildReportHTML()`. The sections object should also include `exec_summary` under the key `'exec_summary'` so `buildReportHTML` can place it on page 2.

The full call sequence after section-04:

```js
// 1. Generate 5 charts (Promise.allSettled)
const chartResults = await Promise.allSettled([
  covers.renderCoverA({ ... }),
  templates.renderTemplate(5, priceHistoryData),
  templates.renderTemplate(6, financialData),
  templates.renderTemplate(7, valuationData),
  templates.renderTemplate(8, peerData),
]);
const charts = resolveCharts(chartResults); // converts settled results to base64 or placeholder

// 2. Get report config
const config = getReportConfig(reportType);

// 3. Build HTML
const html = buildReportHTML(completedSections, charts, config);

// 4. Generate full PDF
const fullPdfBuffer = await generateReportPDF(html, config);

// 5. Generate preview PDF
const previewPdfBuffer = await generatePreviewPDF(fullPdfBuffer);

// 6. Upload both to R2
await uploadToR2(fullPdfBuffer, `reports/${slug}-full.pdf`, 'application/pdf');
await uploadToR2(previewPdfBuffer, `reports/${slug}-preview.pdf`, 'application/pdf');

// 7. Save both URLs to NocoDB report record
```

---

## What NOT to Do

- Do not use `Promise.all` for chart generation — one failure must not abort everything
- Do not embed R2 HTTPS URLs in the HTML sent to WeasyPrint — use base64 data URIs only
- Do not call WeasyPrint via `child_process.spawn` from inside the n8n Code node — the sandbox blocks it
- Do not load fonts from CDN URLs in the WeasyPrint CSS — use locally served font files
- Do not hardcode the preview page count — always use `Math.min(sourceDoc.getPageCount(), 5)`
- Do not return `Uint8Array` from `generatePreviewPDF` — wrap in `Buffer.from()` first
