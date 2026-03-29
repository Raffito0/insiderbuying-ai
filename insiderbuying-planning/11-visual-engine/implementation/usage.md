# Unit 11 — Visual Engine — Usage Guide

All 8 sections implemented and committed. This guide covers what was built and how to use it.

---

## Files Created / Modified

| File | Description |
|------|-------------|
| `n8n/code/insiderbuying/visual-css.js` | S01: Design foundation — colors, verdicts, CSS utilities |
| `n8n/code/insiderbuying/generate-chart.js` | S02: Chart.js rendering pipeline (5 chart types) |
| `n8n/code/insiderbuying/visual-templates.js` | S03+04: 15 data card templates |
| `n8n/code/insiderbuying/report-covers.js` | S05: 4 report cover templates |
| `n8n/code/insiderbuying/identity-assets.js` | S06+07: Company logos + insider photos with NocoDB cache |
| `n8n/code/insiderbuying/visual-engine.js` | S08: Unified re-export entry point |
| `n8n/code/insiderbuying/render-pdf.js` | S02: Added optional `contentType` param to `uploadToR2` |
| `tests/insiderbuying/visual-css.test.js` | 30 tests |
| `tests/insiderbuying/generate-chart.test.js` | 27 tests |
| `tests/insiderbuying/visual-templates.test.js` | 55 tests |
| `tests/insiderbuying/report-covers.test.js` | 40 tests |
| `tests/insiderbuying/identity-assets.test.js` | 50 tests |
| `tests/insiderbuying/visual-engine.test.js` | 14 tests |

**Total: 216 tests, all passing**

---

## visual-engine.js — Unified Entry Point

```js
const { charts, templates, covers, identity } = require('./visual-engine');
```

---

## visual-css.js API

```js
const { COLORS, VERDICTS, escapeHtml, normalizeVerdict, wrapTemplate, BASE_CSS } = require('./visual-css');

// Escape dynamic strings before embedding in HTML
escapeHtml("O'Reilly & <test>"); // "O&#39;Reilly &amp; &lt;test&gt;"

// Normalize verdict strings
normalizeVerdict('buy');      // 'BUY'
normalizeVerdict('unknown');  // 'HOLD' (safe default)

// Wrap HTML for screenshot server
const html = wrapTemplate('<div>content</div>', 1200, 675);
```

---

## generate-chart.js API

All render functions take `(opts, helpers)` where `helpers = { fetchFn, env }`.

```js
const { renderBarChart, renderLineChart, renderRadarChart, renderScatterChart, renderTableImage, uploadChart } = require('./generate-chart');

// Bar chart
const buf = await renderBarChart({
  labels: ['Q1', 'Q2', 'Q3'],
  datasets: [{ label: 'Revenue', data: [1.2, 1.8, 2.1], backgroundColor: '#28A745' }],
  title: 'Quarterly Revenue',
  width: 800, height: 400,
}, helpers);

// Line chart with dual axis
const buf = await renderLineChart({
  labels: ['Jan', 'Feb', 'Mar'],
  datasets: [
    { label: 'Price', data: [45, 52, 48], borderColor: '#4A9EFF', yAxisID: 'left' },
    { label: 'Volume', data: [1.2e6, 0.9e6, 1.5e6], borderColor: '#FFC107', yAxisID: 'right' },
  ],
  annotations: [{ x: 'Feb', label: 'CEO bought here', color: '#28A745' }],
}, helpers);

// Radar chart (always 600x600)
const buf = await renderRadarChart({
  labels: ['Growth', 'Value', 'Momentum', 'Quality', 'Volatility', 'Sentiment'],
  datasets: [
    { label: 'NVDA', data: [90, 40, 85, 80, 30, 95] },
    { label: 'Peer Avg', data: [60, 65, 55, 70, 55, 60] },
  ],
}, helpers);

// Table image
const buf = await renderTableImage({
  headers: ['Date', 'Insider', 'Role', 'Shares', 'Value'],
  rows: [
    { values: ['2026-03-01', 'Jensen Huang', 'CEO', '50,000', '$4.5M'], type: 'purchase' },
    { values: ['2026-02-15', 'John Smith', 'CFO', '10,000', '$900K'], type: 'sale' },
  ],
  title: 'Recent Insider Transactions',
}, helpers);

// Upload PNG to R2
const url = await uploadChart(buffer, 'nvda-revenue', helpers);
// → 'https://pub-xxx.r2.dev/earlyinsider/charts/nvda-revenue_1711700000_abc123.png'
```

---

## visual-templates.js API

```js
const { renderTemplate, getTemplateDimensions } = require('./visual-templates');

// Render any of 15 templates by number
const html = renderTemplate(1, data);   // scoreCard
const html = renderTemplate(2, data);   // filingCard
// ... through renderTemplate(15, data)

// Get pixel dimensions for a template
const { width, height } = getTemplateDimensions(1); // { width: 400, height: 500 }
```

### Template map

| # | Name | Use case |
|---|------|----------|
| 1 | scoreCard | Alert score display (score + verdict + key metrics) |
| 2 | filingCard | SEC filing summary card |
| 3 | pricePerformance | Stock price vs index comparison |
| 4 | revenueTrend | Quarterly revenue chart wrapper |
| 5 | peerRadar | Peer comparison radar chart wrapper |
| 6 | marketMovers | Top movers list |
| 7 | insiderTrackRecord | Insider historical performance |
| 8 | watchlist | Watchlist items |
| 9 | sectorHeatMap | Sector performance heat map |
| 10 | newsSentiment | News sentiment meter |
| 11 | dataTable | Generic data table |
| 12 | statGrid | Grid of key statistics |
| 13 | alertBanner | Alert notification banner |
| 14 | miniPriceChart | Compact price sparkline |
| 15 | comparisonCard | Side-by-side metric comparison |

---

## report-covers.js API

```js
const { generateSingleStockCover, generateSectorCover, generateBundleCover, generateHeroFeaturedCover } = require('./report-covers');

const html = generateSingleStockCover({
  ticker: 'NVDA', companyName: 'NVIDIA Corporation',
  reportTitle: 'Q1 2026 Insider Activity Deep Dive',
  verdict: 'BUY', score: 9.2,
  logoUrl: 'https://...', date: 'March 2026',
});
// Returns HTML string — pass to screenshot server for 1200x675 PNG
```

---

## identity-assets.js API

```js
const { getCompanyLogo, getInsiderPhoto } = require('./identity-assets');

// Company logo — Brandfetch API → text abbreviation fallback
const logoUrl = await getCompanyLogo('nvidia.com', 'NVDA', helpers);
// → 'https://asset.brandfetch.io/...' or null (SVG data URI as fallback)

// Insider photo — Wikidata P18 → Google KGS → UI Avatars initials (+ NocoDB cache)
const photoUrl = await getInsiderPhoto('Jensen Huang', 'nvidia.com', helpers);
// → permanent URL or UI Avatars initials URL
```

`helpers` must include `fetchFn` and `env`:
```js
const helpers = {
  fetchFn,
  env: {
    BRANDFETCH_API_KEY: '...',
    GOOGLE_KGS_API_KEY: '...',
    NOCODB_API_URL: '...',
    NOCODB_API_TOKEN: '...',
    NOCODB_PROJECT_ID: '...',
    NOCODB_INSIDER_PHOTOS_TABLE_ID: '...',
  },
};
```

---

## Running Tests

```bash
cd ryan_cole/insiderbuying-site

# All unit 11 tests
npx jest --testPathPatterns="visual-css|generate-chart|visual-templates|report-covers|identity-assets|visual-engine"

# Individual suites
npx jest --testPathPatterns="visual-css"       # 30 tests
npx jest --testPathPatterns="generate-chart"   # 27 tests
npx jest --testPathPatterns="visual-templates" # 55 tests
npx jest --testPathPatterns="report-covers"    # 40 tests
npx jest --testPathPatterns="identity-assets"  # 50 tests
npx jest --testPathPatterns="visual-engine"    # 14 tests
```

---

## Section Completion Summary

| Section | Tests | Commit |
|---------|-------|--------|
| S01 visual-css | 30/30 | 31a46e3 |
| S02 chart-generation | 27/27 | affa94f |
| S03+04 templates 1-15 | 55/55 | 3174642 |
| S05 report-covers | 40/40 | e4a650e |
| S06+07 identity assets | 50/50 | 16a4e42 |
| S08 integration-wiring | 14/14 | 004cfe2 |

## Production Notes

- **Inter font**: `INTER_FONT_CSS` in visual-css.js uses placeholder base64 stubs. Before deployment, embed full Inter WOFF2 files: `base64 -w 0 inter-400.woff2` from https://rsms.me/inter/
- **Screenshot server**: All chart/template/cover renders require the screenshot server running at `host.docker.internal:3456` (or `SCREENSHOT_SERVER_URL` env var)
- **No native dependencies**: Charts run via Chart.js in headless Chrome (screenshot server) — no node-canvas/Cairo needed on VPS
