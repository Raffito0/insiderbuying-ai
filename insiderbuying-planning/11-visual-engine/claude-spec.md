# Spec: Visual Engine (Unit 11) — Combined

## Purpose
Build the complete visual generation system for the EarlyInsider content pipeline. Four sub-systems:
1. **Chart.js server-side chart generation** with dark navy design (5 chart types)
2. **15 HTML/CSS visual card templates** rendered via existing screenshot server
3. **4 report cover templates** for PDF/web generation
4. **Company logo + CEO/insider photo identity systems** with NocoDB caching

All outputs are PNG buffers uploaded to Cloudflare R2 via existing `uploadToR2()`.

## Integration Context
- Called from existing n8n workflows (generate-report.js, generate-image.js, etc.)
- All functions follow the standard n8n helpers pattern: `(data, helpers)` where `helpers = { fetchFn, env, _sleep }`
- CommonJS only (`module.exports`, `require()`)
- Medium volume: 10-50 renders/day
- VPS has Node.js + Docker + n8n — nothing else pre-installed for this unit

## Files to Create
- `generate-chart.js` — Chart.js + node-canvas chart generation (bar, line, radar, scatter, table-via-screenshot)
- `visual-templates.js` — 15 HTML template strings + shared CSS utilities + screenshot server render
- `report-covers.js` — 4 HTML/CSS report cover templates + render + upload
- `identity-assets.js` — `getCompanyLogo()` + `getInsiderPhoto()` with NocoDB caching
- `visual-css.js` — shared CSS utility library (design tokens, glassmorphism, badges, typography)
- Tests: `generate-chart.test.js`, `visual-templates.test.js`, `report-covers.test.js`, `identity-assets.test.js`

## Existing Integration Points

### uploadToR2(buffer, key) — render-pdf.js
- Auth: AWS Signature V4 (pure crypto, no SDK)
- Bucket: `toxic-or-nah`
- Returns public URL string
- Env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_URL`

### Screenshot Server — Already on VPS
```
POST http://host.docker.internal:3456/screenshot
Body: { html, viewport: { width, height }, format: "png" }
Response: PNG buffer
```

### NocoDB — EarlyInsider Base
- API v2: `/api/v2/tables/{tableId}/records`
- Auth: `xc-token: {NOCODB_API_TOKEN}`
- 12 existing tables + 2 new tables (Logo_Cache, Insider_Photos)
- Rate limit: 5 req/s, 429 → 30s backoff

### Environment Variables (existing)
- `R2_*` — Cloudflare R2 credentials
- `NOCODB_API_URL`, `NOCODB_API_TOKEN`
- `GOOGLE_KG_API_KEY` — for insider photo lookup (exists but untested)

## Design System
```
Background:     #0A1128  (dark navy)
Secondary bg:   #1A2238  (card bg)
Text primary:   #FFFFFF
Text secondary: #8892A4
Accent green:   #28A745  (BUY signals, positive)
Accent red:     #DC3545  (SELL signals, negative)
Accent yellow:  #FFC107  (HOLD/CAUTION, neutral)
Accent blue:    #4A9EFF  (data, neutral info)
Font:           Inter (Google Fonts) — must be installed on VPS
Glassmorphism:  background: rgba(26,34,56,0.6); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.08)
Border radius:  12px (cards), 8px (chips/badges), 4px (small elements)
Shadow:         0 4px 24px rgba(0,0,0,0.4)
```

## Section 1: generate-chart.js — Server-Side Charts

Uses Chart.js + node-canvas (no Puppeteer — pure Node.js):
- `renderBarChart(opts, helpers)` — `{labels, datasets, title, width=800, height=400}` → PNG buffer
- `renderLineChart(opts, helpers)` — `{labels, datasets, title, annotations?, width, height}` → PNG buffer
- `renderRadarChart(opts, helpers)` — `{labels, datasets, title}` → PNG buffer (600x600)
- `renderScatterChart(opts, helpers)` — `{datasets, xLabel, yLabel, title}` → PNG buffer
- `renderTableImage(opts, helpers)` — `{headers, rows, title, highlightRow?}` → PNG buffer (**via screenshot server HTML table**, not canvas drawRect)
- `uploadChart(buffer, name, helpers)` → R2 URL string

Dark theme: background plugin draws #0A1128, Chart.defaults.color = '#8892A4', borderColor = '#2A3548'.
Annotation plugin for "CEO bought here" markers on line charts.
Font: Inter registered once at module load.
Server-side settings: `animation: false`, `responsive: false`, `devicePixelRatio: 1`.

## Section 2: visual-templates.js — 15 Data Card Templates

Each template: `(data) => htmlString`. Rendered via screenshot server POST.

Shared CSS utilities in `visual-css.js`:
- Design tokens (all colors, fonts, radii, shadows)
- `.glass-card` (glassmorphism)
- `.verdict-badge` (BUY green, SELL red, HOLD yellow)
- `.stat-row`, `.metric-card`, `.ticker-pill`
- Inter font import

Templates 1-15 as defined in original spec (see spec.md for full descriptions).

**Key change**: `renderTableImage()` (Template 4) uses HTML table via screenshot server instead of canvas drawRect for consistency.

Main function: `renderTemplate(templateId, data, opts, helpers)` → R2 URL

## Section 3: report-covers.js — 4 Cover Templates

All: HTML/CSS → screenshot server → PNG → R2.
- A4 at 150dpi (1240x1754) for print, 1200x675 for web
- Cover A: Single Stock ($14.99)
- Cover B: Sector ($19.99)
- Cover C: Bundle ($24.99-$29.99)
- Cover D: Hero Featured (web only, 1200x675)

Functions: `renderCoverA(data, helpers)` through `renderCoverD(data, helpers)` → R2 URL

## Section 4: identity-assets.js — Company Logos

```
getCompanyLogo(domain, tickerAbbrev, helpers)
  → Try 1: Brandfetch CDN (https://cdn.brandfetch.io/{domain}/w/200/h/200)
  → Try 2: UI Avatars text abbreviation (always succeeds)
  → Cache in NocoDB Logo_Cache table (domain, logo_url, fetched_at)
  → TTL: 30 days
  → Always returns a valid URL (never broken images)
```

## Section 5: identity-assets.js — Insider Photos

```
getInsiderPhoto(fullName, title, helpers)
  → Check NocoDB Insider_Photos cache first
  → Tier 1: Wikidata SPARQL P18 query (User-Agent required!)
  → Tier 2: Google Knowledge Graph (GOOGLE_KG_API_KEY, untested — validate)
  → Tier 3: UI Avatars (always succeeds)
  → Cache with source tag ('wikidata' | 'google_kg' | 'ui_avatars')
  → Name normalization: strip titles (Dr., Jr., III), lowercase, trim
```

## Section 6: NocoDB Table Setup

Create 2 new tables in EarlyInsider base:

**Logo_Cache**: domain (text, indexed), logo_url (text), source (text), fetched_at (datetime), ttl_seconds (number, default 2592000)

**Insider_Photos**: name_normalized (text, indexed), photo_url (text), source (text), fetched_at (datetime), ttl_seconds (number, default 2592000)

## Section 7: VPS Setup

```bash
# Install native deps for node-canvas
apt-get install -y build-essential libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev

# Install Inter font
mkdir -p /usr/local/share/fonts/inter
# Download Inter static .ttf weights (400, 500, 600, 700)
fc-cache -f -v

# Install npm packages
npm install chart.js canvas chartjs-plugin-annotation
node -e "require('canvas'); console.log('canvas OK')"
node -e "require('chart.js/auto'); console.log('chart.js OK')"
```

## Section 8: Tests

- `generate-chart.test.js`: 5 chart types produce valid PNG buffer (magic bytes `\x89PNG`, length > 1KB)
- `visual-templates.test.js`: 15 templates render HTML without throwing + mock screenshot server returns buffer
- `report-covers.test.js`: 4 covers render HTML without throwing + mock screenshot server
- `identity-assets.test.js`: Logo cascade (Brandfetch 404 → UI Avatars), Photo cascade (Wikidata fail → KG fail → UI Avatars)
- Smoke test: NVDA logo, Jensen Huang photo, unknown company/person fallback

## Definition of Done
- All 15 templates + 4 covers render valid PNG buffers in test
- `getInsiderPhoto()` returns valid URL for Jensen Huang + unknown person (UI Avatars fallback)
- `getCompanyLogo()` returns valid URL for NVDA + unknown company (UI Avatars fallback)
- All 5 chart types produce valid PNG buffers
- NocoDB Logo_Cache and Insider_Photos tables created
- VPS setup documented and npm packages documented
- All functions follow `(data, helpers)` pattern
- All tests pass with Jest
