# Spec: 11-visual-engine

## Purpose
Build the complete visual generation system used across all content categories. Four sub-systems: (1) Chart.js server-side chart generation with dark navy design, (2) 15 HTML/CSS visual card templates rendered via Puppeteer, (3) 4 report cover templates for PDF generation, (4) company logo + CEO/insider photo identity systems. All outputs are PNGs uploaded to Cloudflare R2.

## Scope
**Files created**:
- `generate-chart.js` — Chart.js + node-canvas chart generation (bar, line, radar, scatter, table)
- `visual-templates.js` — 15 HTML template strings + Puppeteer render function
- `report-covers.js` — 4 HTML/CSS report cover templates + render + upload
- `identity-assets.js` — `getCompanyLogo()` + `getInsiderPhoto()` with NocoDB caching
**Tests created**: generate-chart.test.js, visual-templates.test.js, identity-assets.test.js

## Constraints
- Chart.js + node-canvas must be installed: `npm install chart.js canvas`
- Puppeteer is already available on VPS (screenshot server on port 3456)
- Screenshot server API: `POST http://localhost:3456/screenshot` with `{html, width, height}` → returns PNG buffer
- All output PNGs uploaded to Cloudflare R2 via existing `uploadToR2()` from render-pdf.js
- CommonJS only
- Brandfetch API: free, no auth required, endpoint: `https://cdn.brandfetch.io/{domain}/w/400/h/400` (auto-serves best logo)
- Google Knowledge Graph: `GET https://kgsearch.googleapis.com/v1/entities:search?query={name}&types=Person&key={GOOGLE_KG_API_KEY}`
- UI Avatars: `https://ui-avatars.com/api/?name={name}&background=0A1128&color=fff&size=128&bold=true` (no auth)

## Design System (ALL templates must follow this)
```
Background:     #0A1128  (dark navy)
Secondary bg:   #1A2238  (card bg)
Text primary:   #FFFFFF
Text secondary: #8892A4
Accent green:   #28A745  (BUY signals, positive)
Accent red:     #DC3545  (SELL signals, negative)
Accent yellow:  #FFC107  (HOLD/CAUTION, neutral)
Accent blue:    #4A9EFF  (data, neutral info)
Font:           Inter (Google Fonts)
Glassmorphism:  background: rgba(26,34,56,0.6); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.08)
Border radius:  12px (cards), 8px (chips/badges), 4px (small elements)
Shadow:         0 4px 24px rgba(0,0,0,0.4)
```

## Sections

### Section 1: generate-chart.js — Server-Side Charts
Uses Chart.js + node-canvas (no Puppeteer — pure Node.js, faster):

```javascript
const { createCanvas } = require('canvas');
const { Chart } = require('chart.js/auto');
```

Dark theme config (applied to all charts):
```javascript
Chart.defaults.color = '#8892A4';
Chart.defaults.borderColor = '#2A3548';
Chart.defaults.backgroundColor = '#0A1128';
```

Functions to implement:
- `renderBarChart(opts)` — `{labels, datasets, title, width=800, height=400}` → PNG buffer
- `renderLineChart(opts)` — `{labels, datasets, title, annotations?, width, height}` → PNG buffer
- `renderRadarChart(opts)` — `{labels, datasets, title}` → PNG buffer (600x600, for peer comparison)
- `renderScatterChart(opts)` — `{datasets, xLabel, yLabel, title}` → PNG buffer
- `renderTableImage(opts)` — `{headers, rows, title, highlightRow?}` → PNG buffer (via node-canvas drawRect + fillText, no Chart.js)
- `uploadChart(buffer, name)` → R2 URL string

Chart.js annotation plugin for price charts: `npm install chartjs-plugin-annotation`
- Used in renderLineChart to add "CEO bought here ↓" markers

Tests: each function produces a valid PNG buffer (check buffer length > 1000 bytes, starts with PNG magic bytes)

### Section 2: visual-templates.js — Data Card Templates (Templates 1-8)
Each template is an HTML string function `(data) => htmlString`. Rendered via screenshot server.

**Template 1 — Data Card** (1200x675, X posts + X replies):
```
Dark navy bg. Left: insider photo circle (getInsiderPhoto). Center: company name + ticker badge.
Large transaction amount ($X.XM). Verdict badge (BUY green / SELL red). 3 stats row below.
Right: "insider-intelligence.com" watermark. Bottom: dark gradient bar with date.
```

**Template 2 — SEC Filing Mini Card** (600x337, X replies + Reddit):
```
Compact. Left column: insider photo + name + title. Right: ticker + amount + date.
Single verdict chip. Data density > visual flair.
```

**Template 3 — Comparison Card** (1200x675, X posts):
```
Split layout. Left: current insider. Right: "Last time this happened: +23% in 6 months".
Side-by-side comparison of two data points.
```

**Template 4 — Insider Transaction Table** (1200x675, articles + reports + emails):
```
Dark table. Columns: Insider | Title | Date | Shares | Value | Type | Change.
Row colors: green tint for purchases, red for sales. Insider photo in Name column.
```

**Template 5 — Price Chart with Buy Marker** (1200x675, articles + reports):
```
Line chart (renderLineChart). Blue line = price history. Green arrow annotation at purchase date.
"CEO bought here ↓" label. Volume bars at bottom (semi-transparent).
```

**Template 6 — Revenue Trend** (1200x675, reports):
```
Bar chart (renderBarChart). Blue bars = revenue. Gold line = net income margin %.
Dual axis. 8 quarters of data.
```

**Template 7 — Valuation Football Field** (1200x675, reports):
```
Horizontal bar chart. Each row = valuation method (DCF, P/E, EV/EBITDA, Comps).
Range bars with current price marker. Green zone = undervalued.
```

**Template 8 — Peer Radar** (600x600, reports):
```
Radar/spider chart (renderRadarChart). 6 axes: Revenue Growth, Margins, Valuation, Insider Activity, Momentum, Analyst Rating.
Subject company in blue, peer average in gray.
```

**Templates 9-15 — Content Templates**:
- T9: Market Movers card (top 3 insider buys this week, table format)
- T10: Contrarian Card (bearish narrative + data)
- T11: Newsletter Stats card (weekly performance summary)
- T12: Sector Activity Heatmap (sector × activity level grid)
- T13: Article Hero (blog post header, 1200x630 OG card replacement)
- T14: Alert Score Badge (standalone score pill for email/web)
- T15: Weekly Leaderboard (top performers list)

Function: `renderTemplate(templateId, data, opts)` → PNG buffer → R2 URL
- Renders HTML via screenshot server POST
- Returns R2 URL string

### Section 3: report-covers.js — 4 Report Cover Templates
All: HTML/CSS → Puppeteer (screenshot server) → PNG → R2. Size: 1240x1754 (A4 at 150dpi) for print, 1200x675 for web.

**Cover A — Single Stock ($14.99)**:
```html
<!-- Full bleed dark navy. Company logo (Brandfetch) top-left. -->
<!-- Ticker 64px hero center. Verdict badge glassmorphism (green/red/yellow). -->
<!-- 3 metric cards: current price, market cap, insider signal 1-5 stars. -->
<!-- Hook thesis italic below metrics. Abstract network SVG pattern bottom. -->
<!-- "INSIDER INTELLIGENCE REPORT" label + date top-right. -->
```

**Cover B — Sector ($19.99)**:
```html
<!-- Two zones divided by gradient bar. -->
<!-- Top: editorial zone — sector name + creative title (e.g. "The AI Arms Race: Who Wins the $500B Cycle"). -->
<!-- Bottom: data grid — 6 stock cards (ticker + verdict badge + upside %). -->
<!-- "SECTOR ANALYSIS" chip in yellow top-right. -->
```

**Cover C — Bundle ($24.99-$29.99)**:
```html
<!-- Hero metric bar (glassmorphism): total insider purchases, avg upside, % rated BUY. -->
<!-- 10 ticker pills, 2 rows of 5, border colored by verdict. -->
<!-- Title emphasizes collection ("10 Stocks Insiders Are Loading Up On"). -->
<!-- Page count badge bottom-right. -->
```

**Cover D — Hero Featured** (web only, 1200x675 16:9):
```html
<!-- Mesh gradient glow background (CSS radial-gradient layers). -->
<!-- "FEATURED REPORT" badge yellow top-right. -->
<!-- Editorial title + subtitle. -->
<!-- 3 glassmorphism stat cards row. -->
<!-- Ticker pill preview + "READ THE FULL REPORT" button CTA. -->
```

Functions:
- `renderCoverA(data)` — `{ticker, companyName, verdict, price, marketCap, insiderScore, thesis, logoUrl, date}` → R2 URL
- `renderCoverB(data)` — `{sectorName, title, stocks: [{ticker, verdict, upside}]}` → R2 URL
- `renderCoverC(data)` — `{title, stats, stocks: [{ticker, verdict}], pageCount}` → R2 URL
- `renderCoverD(data)` — `{title, subtitle, stats, tickers, ctaUrl}` → R2 URL (web use)

### Section 4: identity-assets.js — Company Logos
```javascript
async function getCompanyLogo(domain, tickerAbbrev) {
  // Try 1: Brandfetch CDN — https://cdn.brandfetch.io/{domain}/w/200/h/200
  //   Fetch, verify 200 response and Content-Type: image/*
  //   Cache URL in NocoDB: Logo_Cache table (domain, logoUrl, fetchedAt)
  // Try 2 (non-single-ticker fallback): UI Avatars with text abbreviation
  //   https://ui-avatars.com/api/?name={tickerAbbrev}&background=1A2238&color=4A9EFF&size=200&bold=true
  // Returns: URL string (either R2-uploaded logo or UI Avatars URL)
}
```

Logo cache:
- NocoDB `Logo_Cache` table: `{domain, logo_url, fetched_at}`
- Cache TTL: 30 days (logos don't change often)
- Batch prefetch: when generating report, pre-fetch all logos in the report before generation

### Section 5: identity-assets.js — CEO/Insider Photo System
```javascript
async function getInsiderPhoto(fullName, title) {
  // Check cache first: NocoDB Insider_Photos table {name_normalized, photo_url, source, fetched_at}

  // Tier 1: Wikidata P18 (image)
  //   SPARQL: SELECT ?image WHERE { ?person wdt:P31 wd:Q5; rdfs:label "{name}"@en; wdt:P18 ?image }
  //   Endpoint: https://query.wikidata.org/sparql
  //   If result: https://commons.wikimedia.org/wiki/Special:FilePath/{filename}?width=300
  //   Verify image loads (HEAD request to check 200 + Content-Type image/*)

  // Tier 2: Google Knowledge Graph
  //   GET https://kgsearch.googleapis.com/v1/entities:search?query={name}+{title}&types=Person&key={GOOGLE_KG_API_KEY}
  //   Parse: result.itemListElement[0].result.image.contentUrl
  //   Verify: image URL accessible

  // Tier 3: UI Avatars (always succeeds)
  //   https://ui-avatars.com/api/?name={firstName}+{lastName}&background=0A1128&color=fff&size=128&bold=true&rounded=true

  // Cache result with source tag ('wikidata' | 'google_kg' | 'ui_avatars')
  // Return: URL string
}
```

Name normalization: strip titles (Dr., Jr., III), lowercase, trim for cache key.
Env var needed: `GOOGLE_KG_API_KEY` (free, 100K requests/day)

### Section 6: Integration + uploadToR2 Wiring
- All render functions in generate-chart.js, visual-templates.js, report-covers.js use shared `uploadToR2()` from render-pdf.js
- Export unified API:
  ```javascript
  module.exports = {
    charts: require('./generate-chart'),
    templates: require('./visual-templates'),
    covers: require('./report-covers'),
    identity: require('./identity-assets')
  };
  ```
- Smoke test: render each of the 15 templates + 4 covers with mock data, verify non-empty PNG buffer

### Section 7: Tests + VPS Setup Notes
Tests:
- generate-chart.test.js: each chart type produces valid PNG buffer (PNG magic bytes + length > 1KB)
- visual-templates.test.js: each of 15 templates renders without throwing (mock screenshot server)
- identity-assets.test.js: cascade logic (tier 1 fail → tier 2 fail → tier 3 always returns)
- report-covers.test.js: 4 covers render without throwing

VPS Setup (document in spec, not automated — user does manually):
```bash
# On VPS in n8n project directory
npm install chart.js canvas chartjs-plugin-annotation
# Verify canvas native binding
node -e "require('canvas'); console.log('canvas OK')"
```

## Definition of Done
- All 15 templates + 4 covers render valid PNG buffers in test
- `getInsiderPhoto()` returns valid URL for known CEO (Jensen Huang), unknown insider (UI Avatars fallback)
- `getCompanyLogo()` returns valid URL for NVDA, returns abbreviation card for "AI sector"
- All chart types produce valid PNG buffers
- `npm install chart.js canvas` documented
