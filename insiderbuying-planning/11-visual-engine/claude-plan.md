# Implementation Plan: Visual Engine (Unit 11)

## Overview

This plan describes how to build the visual generation system for the EarlyInsider content pipeline. The system produces dark-themed PNG images (charts, data cards, report covers) and resolves company logos and insider photos. All outputs are uploaded to Cloudflare R2.

The system consists of 4 modules + 1 shared CSS library, called from existing n8n workflows via the standard `(data, helpers)` pattern. Expected volume is 10-50 renders/day.

### Architecture Diagram

```
  n8n Workflows (existing)
    ├── generate-report.js  ──→ report-covers.js   ──→ Screenshot Server ──→ R2
    ├── generate-image.js   ──→ visual-templates.js ──→ Screenshot Server ──→ R2
    ├── generate-article.js ──→ generate-chart.js   ──→ Screenshot Server ──→ R2
    └── (any workflow)      ──→ identity-assets.js  ──→ External APIs     ──→ NocoDB cache
                                                                                │
                                                    visual-css.js ◄─────────────┘
                                                    (shared design tokens + CSS utilities)
```

**All rendering goes through the Screenshot Server** — charts, templates, and covers alike. Chart.js runs inside the browser page (loaded via CDN `<script>` tag), not via node-canvas. This eliminates native C++ dependencies (Cairo, Pango) and Docker build complexity.

### File Layout

```
n8n/code/insiderbuying/
  generate-chart.js       # Chart.js config builders + screenshot server rendering
  visual-templates.js     # 15 HTML data card templates + renderTemplate()
  visual-css.js           # Shared CSS: design tokens, glassmorphism, badges, typography, escapeHtml
  report-covers.js        # 4 HTML report cover templates + renderCover()
  identity-assets.js      # getCompanyLogo() + getInsiderPhoto() + NocoDB cache
tests/insiderbuying/
  generate-chart.test.js
  visual-templates.test.js
  report-covers.test.js
  identity-assets.test.js
```

### Key Design Decisions

1. **Unified rendering via Screenshot Server** — ALL visual output (charts, cards, covers) rendered through the existing Puppeteer screenshot server. No node-canvas, no native deps. Chart.js loads via CDN `<script>` tag inside HTML pages. This was a major change from the original spec, driven by the fact that n8n runs inside Docker — installing native libs on the VPS host does nothing for the container.

2. **Templates are standalone HTML functions with shared CSS** — Each template is a `(data) => htmlString` function that embeds `visual-css.js` design tokens. Independent templates, consistent design.

3. **HTML escaping on all dynamic text** — `escapeHtml()` utility in visual-css.js wraps every template interpolation. Prevents XSS and HTML breakage from company names like "O'Reilly" or "Bed Bath & Beyond".

4. **Self-hosted Inter fonts** — Inter WOFF2 files base64-encoded directly into `visual-css.js`. No Google Fonts CDN dependency. Screenshots always render the correct font.

5. **All functions follow `(data, helpers)` pattern** — Matching the existing 25 n8n Code Node files. `helpers = { fetchFn, env, _sleep }`. Enables mock-based testing.

6. **Identity assets always return something** — Logo and photo cascades NEVER return null. UI Avatars is the guaranteed fallback.

7. **NocoDB caching with TTL** — Logos and photos cached for 30 days. Application-side TTL check on read.

8. **Collision-safe R2 keys** — `${name}_${timestamp}_${randomSuffix}.png` prevents overwrites during batch rendering.

9. **Verdict enum centralization** — `VERDICTS` object in visual-css.js defines `BUY/SELL/HOLD/CAUTION/WAIT` with associated colors. Templates normalize input to enum keys.

10. **Input validation** — Width/height clamped to [200, 3000]. All template data access uses optional chaining with fallback values.

---

## Section 1: Shared CSS Utilities (visual-css.js)

### Purpose
A CommonJS module exporting CSS strings, design tokens, an HTML escaping utility, and a template wrapper used by all 15 templates + 4 covers + chart rendering.

### Exports

```javascript
module.exports = {
  COLORS,         // Object: { bg, bgSecondary, textPrimary, textSecondary, green, red, yellow, blue }
  VERDICTS,       // Object: { BUY: {label, color}, SELL: {label, color}, HOLD: {label, color}, ... }
  DESIGN_TOKENS,  // CSS custom properties block as string
  BASE_CSS,       // Reset + embedded Inter font + body styles + utility classes
  INTER_FONT_CSS, // Base64-encoded @font-face declarations for Inter (400, 500, 600, 700)
  escapeHtml,     // (str) => safe HTML string. Escapes &, <, >, ", '
  normalizeVerdict, // (str) => VERDICTS key. "buy" | "Buy" | "BUY" → "BUY"
  glassCard,      // CSS class string for glassmorphism cards
  verdictBadge,   // CSS for verdict badges (uses VERDICTS colors)
  statRow,        // CSS for stat metric rows
  tickerPill,     // CSS for ticker pills with border
  wrapTemplate,   // (innerHtml, width, height) => full HTML document string
};
```

### Key Patterns

- `COLORS` object contains all hex values from the design system for programmatic use
- `INTER_FONT_CSS` embeds Inter WOFF2 files as base64 `@font-face` declarations — zero network dependency
- `BASE_CSS` includes `INTER_FONT_CSS` + reset + body styles (`background: #0A1128; color: #FFFFFF; font-family: 'Inter', sans-serif`)
- `escapeHtml(str)` replaces `& < > " '` with HTML entities. **Every** dynamic string in every template must be wrapped in this
- `normalizeVerdict(str)` uppercases and maps to VERDICTS enum. Returns HOLD for unknown values
- `wrapTemplate(innerHtml, width, height)` wraps inner HTML in a complete `<!DOCTYPE html>` document with `<style>${BASE_CSS}</style>` and viewport meta
- All CSS classes use the design system values: glassmorphism `backdrop-filter: blur(12px)`, `border-radius: 12px`, `box-shadow: 0 4px 24px rgba(0,0,0,0.4)`

---

## Section 2: Chart Generation (generate-chart.js)

### Purpose
Chart configuration builders that produce HTML pages with Chart.js loaded via CDN. All rendering happens through the Screenshot Server — no node-canvas, no native dependencies.

### Architecture

Each chart function:
1. Builds a Chart.js configuration object (type, data, options, plugins)
2. Wraps it in an HTML page that loads Chart.js via CDN `<script>` tag
3. The HTML page includes an inline `<script>` that instantiates Chart.js on a `<canvas>` element
4. The HTML page includes the dark background plugin and design tokens via `visual-css.js`
5. Returns the complete HTML string (or calls screenshot server directly)

The HTML template for charts:
```html
<!DOCTYPE html>
<html><head>
  <style>{BASE_CSS}</style>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@3/dist/chartjs-plugin-annotation.min.js"></script>
</head><body>
  <canvas id="chart" width="{width}" height="{height}"></canvas>
  <script>
    const ctx = document.getElementById('chart').getContext('2d');
    new Chart(ctx, {CONFIG_JSON});
  </script>
</body></html>
```

### Functions

**`renderBarChart(opts, helpers)`** — Bar charts for revenue trends, comparisons
- Input: `{ labels, datasets, title, width?, height? }` (defaults: 800x400)
- Chart config: vertical bars, dark grid lines (#2A3548), secondary text color (#8892A4), no animation
- Output: PNG `Buffer` (via screenshot server)

**`renderLineChart(opts, helpers)`** — Price history with optional buy markers
- Input: `{ labels, datasets, title, annotations?, width?, height? }`
- `annotations` array of `{ x, label, color }` → translated to `chartjs-plugin-annotation` vertical line annotations with "CEO bought here" labels
- Supports dual-axis (`yAxisID: 'left'` for price, `yAxisID: 'right'` for volume)
- Output: PNG `Buffer`

**`renderRadarChart(opts, helpers)`** — Peer comparison spider charts
- Input: `{ labels, datasets, title }` (always 600x600)
- 6 axes (Revenue Growth, Margins, Valuation, Insider Activity, Momentum, Analyst Rating)
- Two datasets: subject company (#4A9EFF fill) and peer average (gray, lower opacity)
- Output: PNG `Buffer`

**`renderScatterChart(opts, helpers)`** — Correlation plots
- Input: `{ datasets, xLabel, yLabel, title, width?, height? }`
- Each dataset: `{ label, data: [{x, y}], backgroundColor }`
- Output: PNG `Buffer`

**`renderTableImage(opts, helpers)`** — HTML table via screenshot server
- Input: `{ headers, rows, title, highlightRow? }`
- Generates HTML table with dark theme, row coloring (green tint for purchases, red for sales)
- All text values escaped via `escapeHtml()`
- Output: PNG `Buffer`

**`uploadChart(buffer, name, helpers)`** — Upload to R2
- Calls `uploadToR2(buffer, key)` from render-pdf.js
- Key pattern: `earlyinsider/charts/${name}_${Date.now()}_${randomSuffix(6)}.png`
- Returns public R2 URL string

### Input Validation
- Width clamped to [200, 3000], height clamped to [200, 3000]
- Missing labels/datasets → throw descriptive error (not silent fail)

### Screenshot Server Call Pattern
All chart renders share a common helper:
1. Build HTML string with chart config
2. POST to screenshot server: `{ html, viewport: { width, height }, format: 'png' }`
3. Verify response is OK and Content-Type is image/png
4. Return PNG buffer

---

## Section 3: Visual Templates 1-8 (visual-templates.js, Part A)

### Purpose
First 8 of 15 HTML data card templates. Each is a function `(data) => htmlString` that uses `visual-css.js` for shared styles.

### Architecture

Each template function:
1. Receives a `data` object with template-specific fields
2. All dynamic text wrapped in `escapeHtml()` — no exceptions
3. All data access uses optional chaining with fallbacks (`data.stats?.[0]?.label ?? 'N/A'`)
4. Verdict values normalized via `normalizeVerdict(data.verdict)`
5. Builds inner HTML using template literals with design tokens
6. Calls `wrapTemplate(innerHtml, width, height)` for complete HTML document
7. Returns the HTML string (NOT the rendered PNG)

### Template Definitions

**T1 — Data Card** (1200x675): Main social card for X posts. Insider photo (circular), company name + ticker badge, transaction amount ($X.XM), verdict badge, 3 stats row, watermark, date bar.
- Data: `{ insiderPhotoUrl, companyName, ticker, amount, verdict, stats: [{label, value}], date }`

**T2 — SEC Filing Mini Card** (600x337): Compact card for replies/Reddit. Left: photo + name + title. Right: ticker + amount + date. Single verdict chip.
- Data: `{ insiderPhotoUrl, insiderName, insiderTitle, ticker, amount, date, verdict }`

**T3 — Comparison Card** (1200x675): Side-by-side. Left: current insider data. Right: historical analogy ("Last time this happened: +23% in 6 months").
- Data: `{ current: {ticker, amount, date}, historical: {description, outcome, timeframe} }`

**T4 — Insider Transaction Table** (1200x675): Dark HTML table with row coloring (green=buy, red=sell). Insider photo in name column.
- Data: `{ title, transactions: [{insiderPhotoUrl, name, title, date, shares, value, type, change}] }`

**T5 — Price Chart with Buy Marker** (1200x675): Embeds a Chart.js line chart (rendered inline in the same HTML page via CDN script) with annotation markers. Title bar and legend frame.
- Data: `{ ticker, priceHistory: [{date, price}], buyDate, buyLabel, volumeData? }`
- Chart.js config built inline — no separate render call needed

**T6 — Revenue Trend** (1200x675): Embeds a Chart.js bar chart with dual-axis (bars=revenue, gold line=margin%). 8 quarters of data.
- Data: `{ ticker, quarters: [{label, revenue, margin}] }`

**T7 — Valuation Football Field** (1200x675): Horizontal range bars using CSS (div widths as percentages). Current price marker. Green zone = undervalued.
- Data: `{ ticker, currentPrice, methods: [{name, low, high}] }`
- Pure HTML/CSS, no Chart.js

**T8 — Peer Radar** (600x600): Embeds a Chart.js radar chart with 6 axes.
- Data: `{ ticker, subjectScores: {}, peerAvgScores: {} }`

### renderTemplate(templateId, data, opts, helpers)

The main entry point for rendering any template:
1. Validate templateId (1-15), throw if invalid
2. Look up template function by ID
3. Call template function with data → HTML string
4. POST to screenshot server with `{ html, viewport: { width, height }, format: 'png' }`
5. Verify response OK
6. If `opts.upload` is true, call `uploadChart(buffer, name, helpers)` and return R2 URL
7. Otherwise return PNG buffer

---

## Section 4: Visual Templates 9-15 (visual-templates.js, Part B)

### Template Definitions (continued)

**T9 — Market Movers** (1200x675): Top 3 insider buys this week. Table with rank, ticker, insider name, amount, verdict.
- Data: `{ title, weekLabel, movers: [{rank, ticker, insiderName, amount, verdict}] }`

**T10 — Contrarian Card** (1200x675): Bearish narrative + supporting evidence metrics.
- Data: `{ ticker, narrative, evidence: [{metric, value, interpretation}], verdict }`

**T11 — Newsletter Stats** (1200x675): Weekly performance summary. Subscriber count, open rate, click rate, top article.
- Data: `{ weekLabel, subscribers, openRate, clickRate, topArticle: {title, clicks} }`

**T12 — Sector Activity Heatmap** (1200x675): Grid of sectors x activity level. Cell color intensity = insider buying activity.
- Data: `{ sectors: [{name, activity, topTicker}] }`
- CSS grid with `background-color: rgba(40,167,69, ${activity/100})` scaling

**T13 — Article Hero** (1200x630): Blog post header / OG card replacement. Title, subtitle, category badge, date.
- Data: `{ title, subtitle, category, date, authorName? }`

**T14 — Alert Score Badge** (400x400): Standalone score pill. Large number, verdict color ring, ticker.
- Data: `{ score, verdict, ticker }`

**T15 — Weekly Leaderboard** (1200x675): Top performers ranked list. Ticker, insider, return %, verdict.
- Data: `{ title, weekLabel, leaders: [{rank, ticker, insiderName, returnPct, verdict}] }`

All templates follow the same patterns as Section 3: `escapeHtml()` on all text, optional chaining, `normalizeVerdict()`, `wrapTemplate()`.

---

## Section 5: Report Covers (report-covers.js)

### Purpose
4 HTML/CSS report cover templates rendered via screenshot server. Used by `generate-report.js` (W15) and `generate-lead-magnet.js` (W16).

### Sizes
- **Print (A4)**: 1240x1754 (A4 at 150dpi) — Covers A, B, C. Rendered with `deviceScaleFactor: 2` for crisp print text.
- **Web (16:9)**: 1200x675 — Cover D. Standard `deviceScaleFactor: 1`.

### Cover Definitions

**Cover A — Single Stock ($14.99)**
- Full bleed dark navy. Company logo (from `getCompanyLogo()`) top-left
- Ticker in 64px hero center. Verdict badge in glassmorphism container
- 3 metric cards: current price, market cap, insider signal (1-5 stars)
- Hook thesis in italic below metrics
- Abstract network SVG pattern at bottom (decorative, inline SVG)
- "INSIDER INTELLIGENCE REPORT" label + date top-right
- Data: `{ ticker, companyName, logoUrl, verdict, price, marketCap, insiderScore, thesis, date }`

**Cover B — Sector ($19.99)**
- Two zones split by gradient bar
- Top: editorial zone with sector name + creative title
- Bottom: data grid with 6 stock cards (ticker + verdict badge + upside %)
- "SECTOR ANALYSIS" chip in yellow top-right
- Data: `{ sectorName, title, stocks: [{ticker, verdict, upside}] }`

**Cover C — Bundle ($24.99-$29.99)**
- Hero metric bar (glassmorphism): total purchases, avg upside, % rated BUY
- 10 ticker pills in 2 rows of 5, border colored by verdict
- Title emphasizes collection
- Page count badge bottom-right
- Data: `{ title, stats: {totalPurchases, avgUpside, buyPct}, stocks: [{ticker, verdict}], pageCount }`

**Cover D — Hero Featured** (web only, 1200x675)
- Mesh gradient glow background (CSS `radial-gradient` layers)
- "FEATURED REPORT" badge in yellow top-right
- Editorial title + subtitle
- 3 glassmorphism stat cards in a row
- Ticker pill preview + CTA text
- Data: `{ title, subtitle, stats: [{label, value}], tickers: [string], ctaText? }`

### Functions

Each cover: `renderCoverX(data, helpers)` →
1. Build HTML string using visual-css.js (`escapeHtml()` on all text)
2. POST to screenshot server (A4 covers: `deviceScaleFactor: 2`)
3. Upload PNG to R2 via `uploadChart()`
4. Return R2 URL

---

## Section 6: Identity Assets — Logos (identity-assets.js, Part A)

### Purpose
Resolve company logos with guaranteed fallback. Cache in NocoDB to avoid redundant API calls.

### getCompanyLogo(domain, tickerAbbrev, helpers)

**Cascade**:
1. **Check NocoDB cache**: Query `Logo_Cache` table for `domain`. If found and not expired (TTL 30 days), return cached URL
2. **Brandfetch CDN**: `GET https://cdn.brandfetch.io/{domain}/w/200/h/200`
   - Verify: response status 200 AND Content-Type starts with `image/`
   - **SVG handling**: If Content-Type is `image/svg+xml`, rasterize to PNG via screenshot server (`<img src="data:image/svg+xml;base64,...">` in an HTML page) before uploading
   - **Content size guard**: Reject responses > 500KB (prevent abuse)
   - If valid: upload PNG to R2 (permanent URL), cache in NocoDB, return R2 URL
3. **UI Avatars fallback** (always succeeds): `https://ui-avatars.com/api/?name={tickerAbbrev}&background=1A2238&color=4A9EFF&size=200&bold=true`
   - Cache the URL in NocoDB
   - Return URL

**Why upload to R2**: Brandfetch CDN URLs may change. R2 gives permanent URLs we control.

### Batch Prefetch

`prefetchLogos(domains, helpers)` — Given an array of domains (e.g., all companies in a report):
1. **Deduplicate** the domains array in memory (prevents NocoDB race conditions on parallel inserts)
2. Check NocoDB cache in batch (single query with `~or` filter)
3. Fetch missing logos in parallel (max 3 concurrent to respect rate limits)
4. Used by report generation to avoid serial API calls during render

### NocoDB Logo_Cache Table

Columns: `domain` (text, primary), `logo_url` (text), `source` (text: 'brandfetch' | 'ui_avatars'), `fetched_at` (datetime), `ttl_seconds` (number, default 2592000 = 30 days)

---

## Section 7: Identity Assets — Insider Photos (identity-assets.js, Part B)

### Purpose
Resolve CEO/insider photos with 3-tier cascade and guaranteed fallback.

### getInsiderPhoto(fullName, title, helpers)

**Name normalization** (for cache key): strip prefixes (Dr., Mr., Mrs.), strip suffixes (Jr., Sr., III, IV), normalize unicode (`String.normalize('NFKD')`), lowercase, trim. E.g., "Dr. Jensen Huang Jr." -> "jensen huang".

**Cascade**:
1. **Check NocoDB cache**: Query `Insider_Photos` for normalized name. If found and not expired, return cached URL
2. **Wikidata SPARQL** (Tier 1):
   - POST to `https://query.wikidata.org/sparql` with P18 image query + `LIMIT 1`
   - **CRITICAL**: Set `User-Agent: EarlyInsiderBot/1.0 (contact@earlyinsider.com)` — Wikimedia blocks without descriptive UA
   - If result has image: construct `Special:FilePath/{filename}?width=300` URL
   - HEAD request with `redirect: 'follow'` to verify image loads (200 + Content-Type image/*)
   - If valid: cache with source 'wikidata', return URL
3. **Google Knowledge Graph** (Tier 2):
   - GET `https://kgsearch.googleapis.com/v1/entities:search?query={fullName}+{title}&types=Person&key={GOOGLE_KG_API_KEY}`
   - Parse: `result.itemListElement[0].result.image.contentUrl`
   - HEAD request with `redirect: 'follow'` to verify (some KG URLs are encrypted/blocked — cascade to Tier 3 on 403)
   - If valid: cache with source 'google_kg', return URL
4. **UI Avatars** (Tier 3, always succeeds):
   - `https://ui-avatars.com/api/?name={firstName}+{lastName}&background=0A1128&color=fff&size=128&bold=true&rounded=true`
   - Cache with source 'ui_avatars', return URL

### Error Isolation

Each tier is wrapped in try/catch. A Wikidata timeout does NOT prevent the KG attempt. Tier failures logged as warnings, execution continues to next tier.

### NocoDB Insider_Photos Table

Columns: `name_normalized` (text, primary), `photo_url` (text), `source` (text: 'wikidata' | 'google_kg' | 'ui_avatars'), `fetched_at` (datetime), `ttl_seconds` (number, default 2592000)

---

## Section 8: NocoDB Table Setup + Integration Wiring

### New Tables to Create

Two tables in the EarlyInsider NocoDB base. Created via NocoDB REST API or manually in the UI.

**Logo_Cache**:
| Field | Type | Notes |
|-------|------|-------|
| domain | SingleLineText | Primary field, unique |
| logo_url | URL | R2 URL or UI Avatars URL |
| source | SingleLineText | 'brandfetch' or 'ui_avatars' |
| fetched_at | DateTime | ISO 8601 |
| ttl_seconds | Number | Default 2592000 (30 days) |

**Insider_Photos**:
| Field | Type | Notes |
|-------|------|-------|
| name_normalized | SingleLineText | Primary field, unique |
| photo_url | URL | Direct image URL |
| source | SingleLineText | 'wikidata', 'google_kg', or 'ui_avatars' |
| fetched_at | DateTime | ISO 8601 |
| ttl_seconds | Number | Default 2592000 (30 days) |

### Cache Helper Functions

Both logo and photo modules share NocoDB cache logic. Internal helpers:
- `_cacheGet(tableId, keyField, keyValue, helpers)` — fetch row by key + TTL check. Returns cached value or null
- `_cacheSet(tableId, keyField, keyValue, data, helpers)` — upsert: check exists first (GET), then POST (new) or PATCH (existing)

### Unified Export

```javascript
// visual-engine.js (optional index file)
module.exports = {
  charts: require('./generate-chart'),
  templates: require('./visual-templates'),
  covers: require('./report-covers'),
  identity: require('./identity-assets'),
};
```

Callers import what they need: `const { charts } = require('./visual-engine')`.

### VPS Setup (Manual, Documented)

Since all rendering goes through the Screenshot Server (no node-canvas), VPS setup is minimal:

1. **No native deps needed** — no Cairo, Pango, or build-essential. The screenshot server's headless Chrome handles all rendering.
2. **No font installation needed** — Inter fonts are base64-embedded in visual-css.js.
3. **No npm packages needed for rendering** — Chart.js loads via CDN in HTML pages.
4. **NocoDB tables**: Create `Logo_Cache` and `Insider_Photos` tables (manually or via API) in the EarlyInsider base.

---

## Section 9: Tests

### Test Strategy

All tests use Jest with the existing mock pattern (`jest.fn().mockResolvedValue(...)`). No integration tests requiring VPS or live APIs — all external calls are mocked.

### generate-chart.test.js

Test each of the 5 chart functions:
- **HTML generation**: Each chart builder returns valid HTML containing `<canvas>`, Chart.js CDN script tag, and correct config JSON
- **Config correctness**: Verify Chart.js config has correct type (bar/line/radar/scatter), datasets match input
- **Annotation insertion**: `renderLineChart` with annotations includes annotation config in output
- **Screenshot + buffer**: Mock `fetchFn` for screenshot server, verify POST body contains chart HTML, verify PNG buffer returned
- **Input validation**: Width > 3000 gets clamped. Missing datasets throws descriptive error.
- **Table rendering**: `renderTableImage` generates HTML table with correct row count and colors

### visual-templates.test.js

Test each of the 15 templates:
- **HTML generation**: Template function returns a string containing expected elements (company name, ticker, etc.)
- **No throw**: Template function with valid data does not throw
- **HTML escaping**: Company name with `&` or `<` is properly escaped in output
- **Missing data**: Template with partial data renders without throwing (optional chaining fallback)
- **renderTemplate()**: Mock screenshot server, verify POST body, verify PNG buffer returned

### report-covers.test.js

Test each of the 4 covers:
- **HTML generation**: Cover function returns HTML with expected structure
- **No throw**: All 4 covers render without throwing
- **Screenshot + upload**: Mock screenshot server and `uploadToR2`, verify full pipeline returns R2 URL
- **deviceScaleFactor**: Print covers (A, B, C) use factor 2 in screenshot request

### identity-assets.test.js

Test cascade logic:
- **Logo happy path**: Mock Brandfetch 200 + image content-type -> caches in NocoDB, returns R2 URL
- **Logo SVG handling**: Mock Brandfetch returning SVG -> screenshot server rasterizes to PNG
- **Logo fallback**: Mock Brandfetch 404 -> UI Avatars URL returned
- **Logo cache hit**: Mock NocoDB cached entry within TTL -> returns cached URL, no Brandfetch call
- **Logo cache expired**: Mock NocoDB expired entry -> re-fetches
- **Logo prefetch dedup**: `prefetchLogos(['nvidia.com', 'nvidia.com'])` only queries Brandfetch once
- **Photo Tier 1 (Wikidata)**: Mock SPARQL returning image -> returns Commons URL
- **Photo Tier 2 (Google KG)**: Mock Wikidata fail + KG returning image -> returns KG URL
- **Photo Tier 2 fallthrough**: Mock KG returning 403 -> cascades to Tier 3
- **Photo Tier 3 (UI Avatars)**: Mock both Wikidata + KG fail -> returns UI Avatars URL
- **Photo cache**: Same TTL patterns as logos
- **Name normalization**: "Dr. Jensen Huang Jr." -> "jensen huang"
- **Redirect following**: Wikidata HEAD request uses `redirect: 'follow'`

### Smoke Test (Optional, Manual)

Run with real APIs:
- `getCompanyLogo('nvidia.com', 'NVDA', helpers)` -> Brandfetch logo URL
- `getInsiderPhoto('Jensen Huang', 'CEO', helpers)` -> Wikidata or KG photo URL
- `getCompanyLogo('xyznonexistent.com', 'XYZ', helpers)` -> UI Avatars fallback
- `getInsiderPhoto('John Q. Nobody', 'VP', helpers)` -> UI Avatars fallback

---

## Dependencies and Environment

### New npm Packages
None required for rendering. Chart.js loads via CDN in HTML pages.

### Existing Dependencies Used
- `render-pdf.js` — `uploadToR2(buffer, key)` function
- Screenshot server — `POST http://host.docker.internal:3456/screenshot`
- NocoDB — `xc-token` auth, REST API v2

### Environment Variables
All existing — no new env vars needed:
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_URL`
- `NOCODB_API_URL`, `NOCODB_API_TOKEN`
- `GOOGLE_KG_API_KEY`
