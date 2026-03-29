<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-data-study-report-catalog
section-02-seo-tool-swap
section-03-x-polling
section-04-hero-image-visual-templates
section-05-infra-fixes
section-06-content-calendar
END_MANIFEST -->

# Implementation Sections Index — 17-infra-polish

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-data-study-report-catalog | — | — | Yes |
| section-02-seo-tool-swap | — | — | Yes |
| section-03-x-polling | — | — | Yes |
| section-04-hero-image-visual-templates | — | — | Yes |
| section-05-infra-fixes | — | — | Yes |
| section-06-content-calendar | — | — | Yes |

All sections modify different files and have no runtime code dependencies on each other. They can all be implemented in parallel after the pre-flight NocoDB table creation is complete.

## Execution Order

1. **Pre-flight** (manual): Create NocoDB tables (Report_Catalog, Content_Calendar, Competitor_Intel, SEO_State, Feed_Health)
2. **All sections in parallel** — no code dependencies between them:
   - section-01-data-study-report-catalog
   - section-02-seo-tool-swap
   - section-03-x-polling
   - section-04-hero-image-visual-templates
   - section-05-infra-fixes
   - section-06-content-calendar

## Section Summaries

### section-01-data-study-report-catalog
Disable `data-study.js` (add `module.exports.DISABLED = true`) and create `report-catalog.js` (W17). Includes: dedup pre-flight with `limit=1000`, `normalizeSector()` lookup, 3-pass catalog generation (single/sector/bundle), alphabetically sorted bundle pair keys, real-count Telegram summary. Test file: `n8n/tests/report-catalog.test.js`.

### section-02-seo-tool-swap
Replace DataForSEO functions in `select-keyword.js` with Ahrefs organic-keywords API + Ubersuggest free tier (sequential `for...of` processing, NocoDB SEO_State quota guard). Update `computePriorityScore()` to use new field names (`kd`, `traffic`, `volume`). Remove `DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD`, add `AHREFS_API_KEY`/`UBERSUGGEST_API_KEY` to `.env.example`. Test file: `n8n/tests/select-keyword.test.js`.

### section-03-x-polling
Add variable-frequency polling to `x-engagement.js`: 1-minute n8n Schedule Trigger + skip-logic Code node. `getCurrentPollingInterval(now)` computes both hour and day-of-week in America/New_York TZ (critical timezone bug fix). `X_State.last_run` written BEFORE engagement logic (race condition fix). n8n workflow settings: Single Execution Mode + Do Not Save Successful Executions. Test file: `n8n/tests/x-engagement.test.js`.

### section-04-hero-image-visual-templates
Create `visual-templates.js` with Template 13 (Article Hero 1200x630, dark navy, rendered via Puppeteer screenshot server at `host.docker.internal:3456`). Rewrite `generateHeroImage()` in `generate-image.js` to call `templates.renderTemplate(13, data)` then upload to R2. Remove fal.ai Flux call from hero path. Add guard that verifies Template 13 exists. `generateOgCard()` unchanged. Test file: `n8n/tests/generate-image.test.js`.

### section-05-infra-fixes
Three small independent changes: (A9) Add VPS setup comments to `.env.example` — `NODE_FUNCTION_ALLOW_EXTERNAL=fast-xml-parser`, `EXECUTIONS_PROCESS_TIMEOUT=600`, RAM check note. (A10) Add reddit cap guard to `reddit-monitor.js` — `console.error` + Telegram alert instead of throw; unit test asserts sum <= 10. (A11) Delete `src/app/sitemap.ts`, add `/sitemap` to `/sitemap.xml` permanent redirect in `next.config.ts`. Test file: `n8n/tests/reddit-monitor.test.js`.

### section-06-content-calendar
Create `content-calendar.js` shared utility module exporting 5 async functions: `addToCalendar`, `getCalendarForDate`, `checkContentFreshness`, `checkCompetitorFeeds` (fast-xml-parser via `NODE_FUNCTION_ALLOW_EXTERNAL`, Insider_Alerts ticker whitelist, Feed_Health table for per-feed failure tracking after 3 consecutive failures), and `checkContentSimilarity` (optional D4.2 — pure JS TF-IDF cosine similarity, threshold 0.85). Earnings calendar D7.3 calls existing `fetchEarningsCalendar()` from `dexter-research.js` with 12-second delays between Alpha Vantage calls. Test file: `n8n/tests/content-calendar.test.js`.
