<!-- PROJECT_CONFIG
runtime: javascript-npm
test_command: npm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-visual-css
section-02-chart-generation
section-03-templates-1-8
section-04-templates-9-15
section-05-report-covers
section-06-identity-logos
section-07-identity-photos
section-08-integration-wiring
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-visual-css | — | 02, 03, 04, 05 | Yes (first) |
| section-02-chart-generation | 01 | 08 | Yes |
| section-03-templates-1-8 | 01 | 04 | Yes |
| section-04-templates-9-15 | 01, 03 | 08 | No |
| section-05-report-covers | 01 | 08 | Yes |
| section-06-identity-logos | — | 07 | Yes |
| section-07-identity-photos | 06 | 08 | No |
| section-08-integration-wiring | 02, 04, 05, 07 | — | No |

## Execution Order

1. **section-01-visual-css** (no dependencies — must be first)
2. **section-02-chart-generation**, **section-03-templates-1-8**, **section-05-report-covers**, **section-06-identity-logos** (parallel — all independent after 01 is done)
3. **section-04-templates-9-15** (after 03), **section-07-identity-photos** (after 06)
4. **section-08-integration-wiring** (final — wires everything together)

## Section Summaries

### section-01-visual-css
Create `visual-css.js` — the shared design foundation. Exports: `COLORS`, `VERDICTS` enum, `DESIGN_TOKENS`, `INTER_FONT_CSS` (base64 Inter WOFF2), `BASE_CSS`, `escapeHtml()`, `normalizeVerdict()`, glassmorphism CSS utilities, and `wrapTemplate()`. Tests: escapeHtml edge cases, normalizeVerdict normalization, COLORS/VERDICTS values, wrapTemplate output.

### section-02-chart-generation
Create `generate-chart.js` — 5 chart builders (bar, line, radar, scatter, table) that generate HTML pages with Chart.js loaded via CDN, rendered through the screenshot server. Also `uploadChart()` with collision-safe R2 key. Input validation (width/height clamps). Tests: HTML generation, CDN script tag presence, config JSON correctness, screenshot server mock.

### section-03-templates-1-8
Create `visual-templates.js` with first 8 templates (T1-T8). Each is a `(data) => htmlString` function using `visual-css.js` utilities. All dynamic text wrapped in `escapeHtml()`. All data access uses optional chaining with fallbacks. Tests: HTML generation for each template, escaping, missing data graceful degradation.

### section-04-templates-9-15
Complete `visual-templates.js` with templates T9-T15 + the main `renderTemplate(templateId, data, opts, helpers)` orchestrator function. Tests: T9-T15 HTML generation, `renderTemplate` screenshot server integration, invalid templateId error.

### section-05-report-covers
Create `report-covers.js` — 4 cover templates (A4 print + web) rendered via screenshot server with upload to R2. Print covers (A, B, C) use `deviceScaleFactor: 2`. Tests: HTML generation, correct viewport dimensions per cover, full pipeline (screenshot → R2 URL).

### section-06-identity-logos
Create `identity-assets.js` logo system: `getCompanyLogo(domain, tickerAbbrev, helpers)` with Brandfetch CDN → UI Avatars cascade, NocoDB caching (30-day TTL), SVG rasterization via screenshot server, content-size guard. Shared cache helpers `_cacheGet` and `_cacheSet`. Also `prefetchLogos()` with domain deduplication. Tests: cascade logic, SVG handling, cache hit/miss/expired, prefetch dedup.

### section-07-identity-photos
Complete `identity-assets.js` photo system: `getInsiderPhoto(fullName, title, helpers)` with Wikidata SPARQL → Google Knowledge Graph → UI Avatars cascade, redirect-following HEAD verification, NocoDB caching. Name normalization (unicode NFKD, strip prefixes/suffixes). Tests: 3-tier cascade, 403 fallthrough, name normalization edge cases, User-Agent header presence.

### section-08-integration-wiring
Create NocoDB tables (`Logo_Cache`, `Insider_Photos`) via REST API. Create `visual-engine.js` unified export. Run full Jest suite, fix any cross-module issues. Smoke test: NVDA logo + Jensen Huang photo + unknown fallbacks. Document any VPS-level changes needed.
