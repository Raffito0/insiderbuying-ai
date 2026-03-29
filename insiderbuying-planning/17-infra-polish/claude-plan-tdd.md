# TDD Plan: 17-infra-polish

## Testing Framework

All tests use the **Node.js native test runner** (`node:test` + `node:assert/strict`). Test files live in `n8n/tests/` with naming convention `<module>.test.js`. Run with `npm test`.

```javascript
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
```

Dependencies (NocoDB, Telegram, Alpha Vantage, Ahrefs, Ubersuggest, screenshot server) are mocked by replacing the `opts` helpers passed to each exported function. Tests must be runnable offline with no live API credentials.

---

## Pre-flight: NocoDB Tables

No automated tests. Manual verification: confirm all tables exist in NocoDB UI and accept a test POST before running Section 1 or Section 6 code for the first time.

---

## Section 1: A1 + A2 — Disable Data Study, Create Report Catalog

**Test file:** `n8n/tests/report-catalog.test.js`

### A1 — data-study.js

- Test: `require('./data-study.js').DISABLED` equals `true`
- Test: other named exports are not removed (require the module and assert no TypeError on access)

### A2 — report-catalog.js deduplication

- Test: when Report_Catalog mock returns 2 existing tickers in last 30 days, those tickers are absent from the candidate array
- Test: dedup NocoDB query is called with `limit=1000` parameter (verify call args)
- Test: when Report_Catalog returns empty, all alerts are candidates

### Sector normalization

- Test: `normalizeSector("Tech")` returns `"Technology"`
- Test: `normalizeSector("Information Technology")` returns `"Technology"`
- Test: `normalizeSector("unknown-xyz")` returns input unchanged
- Test: normalization is case-insensitive (`"tech"` and `"TECH"` both map to `"Technology"`)

### Pass 1 — single-stock reports

- Test: given 7 qualifying alerts, only top 5 are written to Report_Catalog
- Test: each written record has `report_type = 'single'` and `priority_score` matching the alert score
- Test: given 0 qualifying alerts, Pass 1 writes nothing and does not call nocodbPost

### Pass 2 — sector reports

- Test: given 3 alerts in sector "Technology", one sector record is created with `report_type = 'sector'`
- Test: given 2 alerts in a sector (below threshold), no sector record is created
- Test: given alerts across 2 sectors (one with 3+, one with 2), only the qualifying sector gets a record

### Pass 3 — bundle candidates

- Test: given one large-cap + one small-cap in the same sector (both score >= 8), one bundle record is created
- Test: bundle `ticker_or_sector` is always alphabetically sorted: `[t1,t2].sort().join('+')` — verify `'AAPL+SMCI'` is produced regardless of input order
- Test: running the same pair with reversed input order produces the same canonical string (idempotency)
- Test: when `market_cap` field is missing from all alerts, no bundle records are written
- Test: no more than 5 bundle records are written when many pairs qualify

### Telegram summary

- Test: Telegram message uses actual inserted record counts, not hardcoded values
- Test: zero-result path sends "Report catalog updated: 0 candidates"
- Test: format is "Report catalog updated: N single, N sector, N bundle candidates"

---

## Section 2: A5 — SEO Tool Swap (select-keyword.js)

**Test file:** `n8n/tests/select-keyword.test.js` (update existing file)

Note: Ubersuggest has NO public API (confirmed by their FAQ). Ahrefs has no free tier.
The plan uses **Keywords Everywhere Bronze** as primary and **DataForSEO keyword_overview** as
named fallback. No SEO_State NocoDB table or quota guard needed.

### fetchKWEKeywords — response mapping

- Test: given mock 200 response with 2 items, returns array of `{ keyword, kd, volume, cpc }` objects
- Test: `kd` is mapped from `data[n].seo_difficulty`; falls back to `data[n].on_page_difficulty` when `seo_difficulty` is absent
- Test: `volume` is mapped from `data[n].vol`
- Test: `cpc` is mapped from `data[n].competition.value`

### fetchKWEKeywords — request shape

- Test: request method is `POST` to `https://api.keywordseverywhere.com/v1/get_keyword_data`
- Test: request body includes `{ country: 'us', currency: 'usd', dataSource: 'gkp', 'kw[]': [...] }`
- Test: Authorization header is `Bearer <KWE_API_KEY>`

### fetchKWEKeywords — edge cases

- Test: empty keyword list → returns `[]` without making an HTTP call
- Test: KWE returns HTTP 5xx → function throws (not silent empty array)
- Test: KWE returns HTTP 429 → function throws with message containing "429"

### fetchDataForSEOFallback (named fallback)

- Test: called when `fetchKWEKeywords` throws → returns same `{ keyword, kd, volume, cpc }` shape
- Test: uses Basic Auth header (Base64 `DATAFORSEO_LOGIN:DATAFORSEO_PASSWORD`)
- Test: endpoint is `dataforseo_labs/google/keyword_overview/live` (not the old `keywords_data/google_ads/` path)

### fetchKeywordData (combined wrapper)

- Test: KWE succeeds → `fetchDataForSEOFallback` is NOT called
- Test: KWE throws → `fetchDataForSEOFallback` IS called with the same keyword list
- Test: both providers throw → error propagates to caller (no silent empty return)

### computePriorityScore

- Test: accepts `{ kd, volume }` field names and returns a numeric score
- Test: low-kd, high-volume keyword scores higher than high-kd, low-volume keyword
- Test: DataForSEO field names (`competition_index`, `search_volume`) and Ahrefs field `traffic`
  do NOT appear in the function signature or body

### classifyIntent — regression guard

- Test: classification results for a known set of keywords are unchanged from pre-refactor (intent is API-agnostic and must not regress)

---

## Section 3: A6 — X Monitoring Variable Frequency Polling (x-engagement.js)

**Test file:** `n8n/tests/x-engagement.test.js`

All tests for `getCurrentPollingInterval(now)` pass a specific `Date` object.

### getCurrentPollingInterval — timezone correctness

- Test: Monday 10:00 AM NY time → 5 minutes (market hours)
- Test: Monday 10:00 AM NY expressed as UTC 15:00 → same result (5 minutes) — same wall-clock time
- Test: Friday 17:00 NY (extended hours) → 15 minutes
- Test: Friday 21:00 NY (overnight) → 60 minutes
- Test: Saturday 14:00 NY → 60 minutes (weekend)
- Test: **critical TZ bug regression**: a Date that is 00:30 UTC Monday (= 19:30 EST Sunday) → 60 minutes (weekend, NOT weekday after-hours)
- Test: DST boundary — a Date during the spring-forward hour (2:00–3:00 AM NY in March) → 60 minutes (weekend/overnight)

### Skip logic ordering

- Test: elapsed < pollingInterval → engagement function is NOT called (mock it, verify zero calls)
- Test: elapsed >= pollingInterval → `X_State.last_run` PATCH occurs BEFORE engagement function is called (call order assertion on mock)
- Test: after engagement completes → `X_State.polling_interval` is updated via PATCH

---

## Section 4: A7 — Hero Image Swap (generate-image.js)

**Test file:** `n8n/tests/generate-image.test.js` (update existing)

### generateHeroImage

- Test: calls `templates.renderTemplate(13, data)` with all required fields (`headline`, `ticker`, `verdict`, `insiderName`, `date`)
- Test: result buffer is passed to `uploadToR2()`; the R2 URL returned from uploadToR2 is the function's return value
- Test: no fal.ai / `queue.fal.run` calls are made (regression guard — mock and assert zero calls)
- Test: when `templates.renderTemplate` is not a function, the guard throws with a helpful error before calling it
- Test: R2 key is `hero-${article.slug}.png`

### generateOgCard — regression guard

- Test: `generateOgCard()` still calls screenshot server (`host.docker.internal:3456`), not visual-templates.js
- Test: `generateOgCard()` behavior is unchanged (no fal.ai calls, no Template 13 calls)

### visual-templates.js — Template 13

- Test: `templates.renderTemplate(13, mockData)` resolves without throwing
- Test: return value is a Buffer
- Test: Buffer length is > 0 (non-empty image)

---

## Section 5: A9, A10, A11 — VPS Docs, Reddit Cap, Sitemap

**Test file:** `n8n/tests/reddit-monitor.test.js` (update existing)

### A9 — VPS Docs

No automated tests. Manual check: `.env.example` contains `NODE_FUNCTION_ALLOW_EXTERNAL=fast-xml-parser` and `EXECUTIONS_PROCESS_TIMEOUT=600`.

### A10 — Reddit cap guard

- Test: `SUBREDDIT_TONE_MAP` with limits summing to 8 → no error logged, no Telegram alert sent
- Test: limits summing to 11 → `console.error` is called with message containing "11" and "10"
- Test: limits summing to 11 → `sendTelegramAlert` is called (mock it, verify called once)
- Test: limits summing to 11 → function returns `{ error: ..., skipped: true }` (early return, does NOT proceed)
- Test: limits summing to 11 → function does NOT throw (`assert.doesNotThrow`)

### A11 — Sitemap

No automated tests. Manual verification:
- `src/app/sitemap.ts` is deleted
- `npm run build` produces single `public/sitemap.xml`
- `GET /sitemap` returns HTTP 301 to `/sitemap.xml`

---

## Section 6: content-calendar.js

**Test file:** `n8n/tests/content-calendar.test.js`

### addToCalendar

- Test: calls nocodbPost with correct fields including `status = 'planned'`
- Test: optional `notes` field is included when provided, omitted when not
- Test: returns the created NocoDB record

### getCalendarForDate

- Test: queries with `planned_date = date` AND `status = planned` (verify query string)
- Test: returns empty array when no records match
- Test: date is passed as ISO string `YYYY-MM-DD`

### checkContentFreshness

- Test: article exists for ticker within 30 days → returns `{ fresh: true, lastPublished: <date> }`
- Test: no article exists → returns `{ fresh: false, lastPublished: null }`
- Test: 30-day lookback is relative to current date (mock Date, verify cutoff date in NocoDB query)

### checkCompetitorFeeds — RSS parsing

- Test: mock RSS with 2 items: both are parsed and each item's tickers are extracted
- Test: CDATA section in RSS description is handled (text extracted, no raw `<![CDATA[` markers in output)
- Test: HTML entity `&amp;` in title is decoded to `&` before ticker extraction
- Test: ticker not in Insider_Alerts whitelist → NOT written to Competitor_Intel
- Test: ticker in whitelist + `checkContentFreshness` returns `false` → Competitor_Intel record written + Telegram alert sent
- Test: "SEC", "GDP", "ETF", "NYSE", "CEO" do not appear in Competitor_Intel even when present in RSS (whitelist blocks them)

### checkCompetitorFeeds — Feed_Health failure tracking

- Test: when feed throws an error, Feed_Health row for that feed has `consecutive_failures` incremented
- Test: other feeds continue processing after one feed errors (error is caught per-feed, not re-thrown)
- Test: `consecutive_failures` reaches 3 → Telegram alert naming that feed is sent
- Test: `consecutive_failures` is 2 → NO Telegram alert
- Test: previously failing feed succeeds → `consecutive_failures` PATCHed to 0 and `last_success_date` updated

### checkCompetitorFeeds — Ticker whitelist

- Test: Insider_Alerts is queried for distinct tickers at function start (verify nocodbGet call)
- Test: tickers from RSS not in the whitelist Set are filtered out before any Competitor_Intel write

### checkContentSimilarity (optional D4.2)

- Test: `newArticleText` identical to a stored article → `{ similar: true, match: articleId }`
- Test: `newArticleText` with no word overlap → `{ similar: false, match: null }`
- Test: similarity at 0.84 (below 0.85 threshold) → `{ similar: false }`
- Test: similarity at 0.86 (above threshold) → `{ similar: true }`
- Test: 0 stored articles for ticker → `{ similar: false, match: null }` (no crash or divide-by-zero)
- Test: each article is truncated to 2,000 words before vector computation (verify truncation via mock)

### Earnings Calendar Integration (D7.3)

- Test: `fetchEarningsCalendar()` from dexter-research.js is called (mock and verify)
- Test: ticker in earnings calendar AND Insider_Alerts → `addToCalendar()` called with `type = 'article'`, `planned_date` = earnings date minus 3 days
- Test: ticker in earnings calendar but NOT in Insider_Alerts → `addToCalendar()` NOT called
- Test: delay of ~12 seconds between Alpha Vantage calls (mock the delay helper and verify it's awaited between iterations)
