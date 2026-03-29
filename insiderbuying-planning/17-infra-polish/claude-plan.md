# Implementation Plan: 17-infra-polish

## Context and Goals

This unit completes the remaining infrastructure changes from the WORKFLOW-CHANGES.md backlog (items A1–A11, minus A3/A4/A8 completed in prior units) and adds the content-calendar.js module. The work falls into six discrete sections that can be implemented independently.

The codebase is a self-hosted n8n automation platform for InsiderBuying.ai / EarlyInsider, a financial intelligence service. All workflow logic lives in JavaScript Code nodes (`n8n/code/insiderbuying/`), tested with the Node.js native test runner (`node:test` + `node:assert/strict`). NocoDB is the primary persistence layer, accessed via simple HTTP helpers (`nocodbGet`, `nocodbPost`, `nocodbPatch` with `xc-token` auth).

**Two important corrections to the original spec, confirmed by research:**
1. The Ahrefs endpoint `keywords-by-traffic` does not exist — the correct endpoint is `/v3/site-explorer/organic-keywords`.
2. The current `generate-image.js` already uses fal.ai Flux for hero images (not kie.ai — that was removed in a prior unit). Section 4 targets fal.ai → Template 13 accordingly.

---

## Pre-flight: NocoDB Table Creation

NocoDB Data API does not auto-create tables on POST. Before any code in Sections 1 or 6 runs, these tables must be manually created in the NocoDB UI. Create them with the exact column names and types below:

**Report_Catalog**
| Column | Type |
|--------|------|
| id | Auto-number |
| ticker_or_sector | Single line text |
| report_type | Single select (single, sector, bundle) |
| priority_score | Number (decimal) |
| status | Single select (pending, generating, published) |
| created_at | DateTime |

**Content_Calendar**
| Column | Type |
|--------|------|
| id | Auto-number |
| ticker_or_topic | Single line text |
| content_type | Single select (article, reddit_dd, x_thread, report) |
| planned_date | Date |
| status | Single select (planned, published, skipped) |
| channel | Single line text |
| notes | Long text |

**Competitor_Intel**
| Column | Type |
|--------|------|
| id | Auto-number |
| feed_url | Single line text |
| item_title | Single line text |
| item_url | Single line text |
| item_date | DateTime |
| ticker_mentioned | Single line text |
| covered_by_us | Checkbox |
| created_at | DateTime |

**SEO_State** (for Ubersuggest daily quota tracking — add to existing or create new)
| Column | Type |
|--------|------|
| id | Auto-number |
| key | Single line text (unique, e.g. "ubersuggest_quota") |
| date | Date |
| count | Number |

**Feed_Health** (for RSS competitor feed failure tracking)
| Column | Type |
|--------|------|
| id | Auto-number |
| feed_url | Single line text (unique per feed) |
| consecutive_failures | Number |
| last_failure_date | DateTime |
| last_success_date | DateTime |

---

## Section 1: A1 + A2 — Disable Data Study, Create Report Catalog

### A1: Disable data-study.js

`data-study.js` (W3) is the monthly data study generator. It has been superseded by the monthly backtest lead magnet. The file is kept intact (its helper functions may be reused in the future), but the module is disabled.

**Change:** Add `module.exports.DISABLED = true` at the top of `data-study.js`, with a comment explaining the reason. Then set W3 to inactive in the n8n UI. This is a one-line code change plus a manual n8n step.

### A2: report-catalog.js — New Workflow W17

`report-catalog.js` is a new n8n workflow that runs twice weekly (Monday + Thursday). Its purpose is to scan recent Insider_Alerts data and produce a prioritized list of report candidates for the content team, written to NocoDB and summarized via Telegram.

**Pre-flight deduplication:** Before any data passes, query `Report_Catalog` for all records created in the last 30 days, passing `limit=1000` explicitly (NocoDB defaults to 25 rows — an incomplete Set would silently allow duplicates). Extract their `ticker_or_sector` values into a Set. All subsequent passes filter out tickers already in this Set — preventing duplicate entries accumulating across twice-weekly runs.

**Sector normalization:** The `sector` field in Insider_Alerts may be inconsistent (e.g., "Tech", "Technology", "Information Technology" all mean the same thing). Apply a `normalizeSector(s)` function that maps known variants to canonical names before any grouping. Implement as a lookup object with 20–30 common variants.

**Logic flow:**

The entry point queries the `Insider_Alerts` NocoDB table for the last 30 days, filtering for `clusters >= 3` AND `score >= 8`, then filters out already-cataloged tickers via the deduplication Set. If the filtered set is empty, write nothing and send Telegram "Report catalog updated: 0 candidates."

**Pass 1 — Single-stock reports:** Sort by `score` descending. Select up to 5 individual tickers. Write each as a `Report_Catalog` record with `report_type = 'single'`.

**Pass 2 — Sector report:** Group filtered alerts by normalized sector. If any sector has 3+ qualifying alerts, create one sector-level entry with `report_type = 'sector'` and `ticker_or_sector = sectorName`.

**Pass 3 — Bundle candidates:** Find pairs of tickers meeting: same sector AND different market cap tiers (one >= $10B market cap, one < $10B) AND both `score >= 8`. If `market_cap` is not available in Insider_Alerts, skip bundle generation entirely (0 bundles). Pairing algorithm: for each qualifying sector, sort large-cap candidates by score descending and small-cap candidates by score descending; pair #1 large-cap with #1 small-cap, #2 with #2, etc.; drop any unpaired remainders. Cap at 5 bundle candidates total. **When writing the pair key:** always sort both tickers alphabetically before joining — `[ticker1, ticker2].sort().join('+')` — to prevent 'AAPL+SMCI' and 'SMCI+AAPL' being treated as distinct dedup keys on successive runs.

**Telegram summary:** After all inserts complete, count actual inserted records per type. Send: "Report catalog updated: N single, N sector, N bundle candidates." — using the real counts.

**Environment variables:** No new ones. Uses existing `NOCODB_BASE_URL`, `NOCODB_API_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

---

## Section 2: A5 — SEO Tool Swap (DataForSEO → Keywords Everywhere)

### Why This Change + Tool Selection

DataForSEO requires paid credentials and has vendor-specific request/response shapes baked into `select-keyword.js`. Full tool evaluation (see claude-research.md Section 6) identified:

- **Ubersuggest**: **No public API** — their own FAQ confirms it. Cannot be used.
- **Ahrefs**: No free tier for API; paid plans are hundreds/month.
- **Google KP**: Dropped — requires OAuth2 + MCC + developer token; Explorer tier (Feb 2026) blocks KP entirely.
- **Keywords Everywhere Bronze**: $1.75/month ($21/year), 100,000 credits/year. Single API call returns KD (0-100) + exact volume + CPC + trend. **This is the primary replacement.**
- **DataForSEO**: Already have credentials. Keep as fallback — do NOT remove credentials.

### What Changes in select-keyword.js

The two DataForSEO HTTP calls (`fetchSearchVolume` and `fetchRelatedKeywords`) are replaced by one new function. The `SEO_State` NocoDB table is no longer needed for quota tracking (KWE has ample credits), but can remain in the schema for future use.

**fetchKWEKeywords(keywords, opts)** calls `POST https://api.keywordseverywhere.com/v1/get_keyword_data` with a body containing up to 100 keyword strings in `kw[]` array format, `country=us`, `currency=usd`, `dataSource=gkp`. Auth is `Authorization: Bearer ${env.KWE_API_KEY}`. The function returns an array of objects with shape `{ keyword, kd, traffic, volume, cpc }` — mapped from `data[n].seo_difficulty` (or `on_page_difficulty`), `data[n].vol`, and `data[n].competition.value` respectively. If the response is empty, return an empty array and short-circuit the pipeline with a Telegram notification.

**No quota guard needed:** Keywords Everywhere Bronze provides 100,000 credits/year; at ~300 keywords/month the pipeline uses 3.6% of quota. No NocoDB-backed counter is required.

**DataForSEO fallback:** If `fetchKWEKeywords` returns an error (non-2xx response), fall through to the existing DataForSEO `fetchSearchVolume` call rather than failing the entire pipeline. Both paths produce the same output shape.

**Scoring updates:** `computePriorityScore()` is updated to accept the new field names (`kd`, `traffic`, `volume`). `classifyIntent()` is unchanged.

**Combined fetch flow:**
1. Call `fetchKWEKeywords(seedKeywords)` — returns KD + volume + CPC in one call
2. If empty or error → fall back to DataForSEO, else short-circuit with Telegram notification on total failure
3. Score and rank all candidates using `computePriorityScore({ kd, traffic, volume })`
4. Return ranked keyword objects: `{ keyword, kd, traffic, volume, cpc }`

**Environment variable changes:**
- **Add:** `KWE_API_KEY` (Keywords Everywhere API key)
- **Keep:** `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` (fallback — do NOT remove)
- **Remove from `.env.example`:** `AHREFS_API_KEY`, `UBERSUGGEST_API_KEY` (neither tool has a usable API in this context)

---

## Section 3: A6 — X Monitoring Variable Frequency Polling

### Problem

n8n Schedule Trigger nodes do not support truly dynamic intervals. The existing W8 uses a fixed cron schedule. The goal is market-hours-aware polling: 5-minute intervals during market hours, 15-minute in extended hours, 60-minute overnight and on weekends.

### Solution: 1-Minute Loop + Skip Logic

Change the W8 Schedule Trigger to run every 1 minute. Also apply two n8n workflow settings:
- **Single Execution Mode** (Settings → Concurrency = 1): prevents overlapping executions if an engagement run takes > 1 minute.
- **"Save execution data for failed executions only"** (Settings → Save execution data): prevents the 1-minute polling from generating 1,440 execution log entries per day, which would bloat n8n's database on the shared VPS. State observability comes from NocoDB X_State, not n8n's execution history.

**getCurrentPollingInterval()** computes the correct interval based on current EST/EDT time (DST-safe). **Critical:** both `h` (hour) and `day` (day-of-week) must be derived from the same America/New_York-normalized date. Using `now.getDay()` directly would use the server's UTC timezone — on a UTC server at 00:30 UTC Monday (19:30 EST Sunday), `now.getDay()` returns 1 (Monday) but the market is closed (Sunday night):

```javascript
// Accepts injectable 'now' for testability (tests pass specific Date objects)
function getCurrentPollingInterval(now = new Date()) {
  // Normalize to America/New_York so both hour and day-of-week are in the same TZ
  const nyDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const h   = nyDate.getHours();
  const day = nyDate.getDay(); // 0=Sun, 6=Sat — in NY time
  if ([1,2,3,4,5].includes(day) && h >= 9 && h < 16)
    return 5 * 60 * 1000;
  if ([1,2,3,4,5].includes(day) && h >= 16 && h < 20)
    return 15 * 60 * 1000;
  return 60 * 60 * 1000;
}
```

Both `h` and `day` are now derived from the same TZ-normalized date, correctly handling EST (UTC-5) and EDT (UTC-4) across DST transitions.

**Skip logic — critical ordering:**
1. Read `X_State.last_run` (timestamp ms) from NocoDB
2. Compute `elapsed = Date.now() - last_run`
3. If `elapsed < getCurrentPollingInterval()`: return immediately (skip)
4. **Immediately** PATCH `X_State.last_run = Date.now()` — **before** calling engagement logic (prevents race condition if execution runs long)
5. Proceed with engagement flow
6. At end: PATCH `X_State.polling_interval = getCurrentPollingInterval()` for observability

The `X_State` table exists from unit 08. `last_run` and `polling_interval` fields are the only ones read/written.

---

## Section 4: A7 — Hero Image Swap (fal.ai → Template 13)

### Current State

`generate-image.js` contains two image generation paths: `generateHeroImage()` calls fal.ai Flux (`queue.fal.run/fal-ai/flux/dev`) with async job polling; `generateOgCard()` calls the screenshot server. Only the hero image path changes.

### What Changes

`generateHeroImage(article)` is rewritten to call `templates.renderTemplate(13, data)` from `visual-templates.js`, then upload the resulting buffer to Cloudflare R2 via the existing `uploadToR2()` helper.

Template 13 is the "Article Hero" template (1200×630): dark navy background, ticker badge with verdict color accent, headline text, EarlyInsider logo bottom-right, abstract financial pattern background. Template 13 must exist in `visual-templates.js` before this section can be implemented. If it doesn't exist, add it first.

**Guard at top of function:**
```javascript
if (!templates || typeof templates.renderTemplate !== 'function') {
  throw new Error('visual-templates.js renderTemplate not found');
}
// Call renderTemplate to verify Template 13 exists before proceeding
```

The function signature stays the same: `generateHeroImage(article)` → returns R2 URL string. Callers are unchanged.

The R2 key for hero images is `hero-${article.slug}.png` — slugs are unique per article, so no key collision risk.

**Env var cleanup:** Before removing `FAL_KEY`, grep the entire `n8n/code/insiderbuying/` directory (not just generate-image.js) for any remaining fal.ai references. If `FAL_KEY` is used elsewhere, keep it in `.env.example`.

**Definition of Done for this section:**
- `generateHeroImage()` calls `templates.renderTemplate(13, ...)`
- No fal.ai (`queue.fal.run`) calls remain in the hero image path
- `generateOgCard()` is untouched
- `grep -ri "queue.fal.run" n8n/code/insiderbuying/` within hero-related functions = 0 matches

---

## Section 5: A9, A10, A11 — VPS Docs, Reddit Cap, Sitemap

### A9 — VPS Documentation

No code change. Add a comment block to `.env.example`:

```
# VPS Setup (run once on Hostinger VPS after provisioning):
# free -h  → must show >= 4GB RAM available
# Shared VPS services: Toxic or Nah n8n, InsiderBuying n8n, NocoDB
# If < 4GB: upgrade VPS tier or reduce via EXECUTIONS_DATA_PRUNE and EXECUTIONS_PROCESS_TIMEOUT
#
# Required for content-calendar.js RSS parsing (fast-xml-parser npm package):
# NODE_FUNCTION_ALLOW_EXTERNAL=fast-xml-parser
# Add to n8n container .env and restart: docker-compose -f /docker/n8n/docker-compose.yml up -d
#
# For earnings calendar integration (Alpha Vantage delay loop, ~4-5 min per run):
# EXECUTIONS_PROCESS_TIMEOUT=600
```

### A10 — Reddit Volume Cap + Runtime Assertion

`reddit-monitor.js` has a daily cap of 8–10 comments from unit 13. First, verify that `SUBREDDIT_TONE_MAP` daily limits already sum to ≤ 10 across all active subreddits. Then add a **runtime guard at module load time** — but use `console.error` + Telegram alert rather than `throw`, to avoid crashing every execution permanently if someone bumps a limit in production:

```javascript
// At top of reddit-monitor.js (module-level, runs on each execution start):
const _totalDailyLimit = Object.values(SUBREDDIT_TONE_MAP)
  .reduce((sum, s) => sum + (s.daily_limit || 0), 0);
if (_totalDailyLimit > 10) {
  const msg = `SUBREDDIT_TONE_MAP total daily limit ${_totalDailyLimit} exceeds max 10`;
  console.error('[REDDIT-CAP]', msg);
  // Fire-and-forget Telegram alert so ops are notified immediately
  sendTelegramAlert(`ERROR: reddit-monitor cap exceeded — ${msg}`).catch(() => {});
  // Return early — do not proceed with commenting when over cap
  return { error: msg, skipped: true };
}
```

The **unit test still asserts `_totalDailyLimit <= 10`** — this ensures the bad state is caught in CI before reaching production. The runtime guard provides resilient observability in case a limit is edited post-deploy.

If the current sum already exceeds 10 (unlikely but possible), reduce individual limits proportionally until sum ≤ 10 and document which subs were capped.

### A11 — Sitemap Deduplication

Two sitemap systems currently coexist:
- `src/app/sitemap.ts` — Next.js App Router static sitemap (to be deleted)
- `next-sitemap.config.js` — Dynamic sitemap with robots.txt generation (to be kept)

**Steps:**
1. Delete `src/app/sitemap.ts`
2. Open `next.config.ts` and:
   - Check for `output: 'export'` (incompatible with next-sitemap) — add comment if found
   - Check for `generateSitemaps()` override — remove if present (conflicts with next-sitemap)
   - Add a redirect: `{ source: '/sitemap', destination: '/sitemap.xml', permanent: true }` — preserves any Google-crawled URLs pointing to `/sitemap`
   - Add comment: `// next-sitemap.config.js is the single sitemap source`
3. Run `npm run build` locally and confirm `public/sitemap.xml` is generated once with no duplicate

---

## Section 6: content-calendar.js

### Purpose

`content-calendar.js` is a shared utility module used by other content generators to: schedule planned content, check whether a topic has been recently covered, monitor competitor coverage via RSS, and avoid publishing duplicate-angle articles.

It is not itself a complete n8n workflow — it exports functions that other workflows call. The three NocoDB tables it uses (Content_Calendar, Competitor_Intel, SEO_State) must be created manually in the NocoDB UI before first use (see Pre-flight section above).

### RSS Parsing

Since n8n Code nodes support `require()` for built-in and npm modules, use `fast-xml-parser` (MIT, 17 kB) instead of a custom regex parser. Regex RSS parsing breaks on CDATA sections, HTML-encoded entities, and namespace variants (`<content:encoded>`) found in most production RSS feeds.

Install: `fast-xml-parser` must be available in the n8n Code node environment. n8n's `NODE_FUNCTION_ALLOW_BUILTIN` governs only Node.js native built-in modules (fs, crypto, etc.). For npm packages, the correct env var is `NODE_FUNCTION_ALLOW_EXTERNAL=fast-xml-parser`. Add this to the n8n container's `.env` file and restart n8n before deploying this section (see A9 VPS docs). Without it, `require('fast-xml-parser')` will throw in the Code node.

### Ticker Extraction

Extracting ticker symbols from RSS item titles/descriptions: at the start of `checkCompetitorFeeds()`, query the `Insider_Alerts` NocoDB table for all distinct `ticker` values and build an in-memory Set (the "ticker whitelist"). Apply regex `\b[A-Z]{2,5}\b` to the RSS text to extract uppercase-letter candidates, then **only keep candidates present in the whitelist Set**. This eliminates financial false positives that a stop-words list cannot reliably filter ("SEC", "GDP", "ETF", "NYSE", "CEO", "IPO", "QTR", "YTD" all pass regex but are never real tickers in Insider_Alerts). A secondary stop-words reject-list (e.g., "THE", "FOR", "AND") may be applied first as a cheap pre-filter, but the whitelist is the authoritative gate.

### Exported Functions

All functions are async and return Promises. They accept an `opts` parameter containing `{ nocodb, telegram }` helpers — following the same dependency injection pattern used throughout the existing codebase.

**addToCalendar(entry, opts)** — Creates a Content_Calendar record with status `planned`. Entry shape: `{ ticker, type, date, channel, notes? }`. Returns the created NocoDB record.

**getCalendarForDate(date, opts)** — Returns all Content_Calendar records with `planned_date = date` AND `status = planned`. Date is ISO date string (YYYY-MM-DD).

**checkContentFreshness(ticker, opts)** — Queries the Articles NocoDB table for any article with `ticker = ticker` published in the last 30 days. Returns `{ fresh: boolean, lastPublished: date | null }`. If this logic already exists in `generate-article.js`, extract it to this module and update generate-article.js to import it from content-calendar.js.

**checkCompetitorFeeds(opts)** — Iterates the `COMPETITOR_RSS_FEEDS` array. For each feed:
1. Fetch and parse RSS using `fast-xml-parser`
2. For each `<item>`: extract ticker symbols from title + description (see Ticker Extraction above)
3. For each ticker: call `checkContentFreshness(ticker)`
4. If competitor covers a ticker we haven't published on in 30 days: write a Competitor_Intel record and send a Telegram alert

Failure handling: if a single feed errors, look up (or upsert) the feed's row in the `Feed_Health` NocoDB table by `feed_url`, increment `consecutive_failures`, and update `last_failure_date`. After `consecutive_failures >= 3`, send a Telegram alert naming that feed. On successful fetch: PATCH the feed's row with `consecutive_failures = 0` and `last_success_date = now`. Note: Competitor_Intel tracks individual article items; Feed_Health is the correct table for per-feed health state — they must remain separate.

**checkContentSimilarity(newArticleText, ticker, opts)** (optional, D4.2) — Fetches the last 10 published articles for `ticker` from NocoDB. Computes TF-IDF cosine similarity between `newArticleText` and each article using a pure JS implementation (~50 lines, no npm). Pre-truncate each article to 2,000 words before computing to bound memory usage. Remove a predefined stop-words list (common English + financial terms: "the", "a", "stock", "company", "shares", "insider", "buy", etc.) before building term vectors. Returns `{ similar: boolean, match: articleId | null }` — threshold 0.85. Called by content generators before starting a new article.

### Earnings Calendar Integration (D7.3)

A weekly helper function in this module calls the Alpha Vantage earnings function imported from the unit 09 module — no new Alpha Vantage HTTP client in this file. The helper:
1. Calls the unit 09 earnings fetch for the next 4 weeks
2. For each earnings ticker, queries `Insider_Alerts` (last 30 days) for insider activity
3. For matching tickers: calls `addToCalendar()` with `type: 'article'` and `planned_date` = 3 days before the earnings date

**Rate limit handling:** Add a 12-second delay between Alpha Vantage API calls to stay within the free tier limit of 5 calls/minute.

---

## File Changes Summary

| File | Type | Change |
|------|------|--------|
| `n8n/code/insiderbuying/data-study.js` | Modify | Add `module.exports.DISABLED = true` at top |
| `n8n/code/insiderbuying/report-catalog.js` | Create | New W17 workflow with dedup + sector normalization |
| `n8n/code/insiderbuying/select-keyword.js` | Modify | Replace DataForSEO with Ahrefs + Ubersuggest |
| `n8n/code/insiderbuying/x-engagement.js` | Modify | Add DST-safe variable polling skip-logic |
| `n8n/code/insiderbuying/generate-image.js` | Modify | Replace fal.ai hero with Template 13 |
| `n8n/code/insiderbuying/content-calendar.js` | Create | New shared utility module (with Feed_Health table support) |
| `src/app/sitemap.ts` | Delete | Remove duplicate sitemap |
| `next.config.ts` | Modify | Add sitemap redirect + remove conflicts |
| `.env.example` | Modify | Remove DataForSEO vars, add Ahrefs + Ubersuggest, add VPS note |

## Test Files Summary

| Test File | What it Covers |
|-----------|---------------|
| `n8n/tests/report-catalog.test.js` | Mock NocoDB Insider_Alerts data; verify correct catalog entries and deduplication |
| `n8n/tests/select-keyword.test.js` (update) | Mock Ahrefs + Ubersuggest responses; quota guard behavior; empty Ahrefs response short-circuit |
| `n8n/tests/x-engagement.test.js` (update/new) | `getCurrentPollingInterval()` across all day/hour combos including DST switch dates |
| `n8n/tests/generate-image.test.js` (update) | Mock screenshot server + Template 13; verify fal.ai path not called |
| `n8n/tests/content-calendar.test.js` | CRUD ops with mock NocoDB; `checkCompetitorFeeds()` with mock RSS (CDATA, partial failures); all-feeds-failed Telegram alert |
| `n8n/tests/reddit-monitor.test.js` (update) | Sum `SUBREDDIT_TONE_MAP` limits and assert ≤ 10 |

All tests use `const { describe, it } = require('node:test')` + `const assert = require('node:assert/strict')`.

## Definition of Done

1. `grep -ri "dataforseo\|DATAFORSEO" --include="*.js" .` = 0 matches
2. `grep -ri "kieai\|KIEAI" --include="*.js" .` = 0 matches (already true from prior unit)
3. `grep -ri "queue.fal.run" n8n/code/insiderbuying/generate-image.js` within hero function = 0 matches
4. `select-keyword.js` uses Ahrefs organic-keywords + Ubersuggest NocoDB quota guard
5. `generate-image.js` hero generation calls `templates.renderTemplate(13, ...)`
6. `content-calendar.js` exports all 5 functions; uses `fast-xml-parser` for RSS
7. `src/app/sitemap.ts` deleted; `/sitemap` redirect in `next.config.ts`
8. `npm run build` produces a single `public/sitemap.xml`
9. `data-study.js` has `module.exports.DISABLED = true` at top
10. All new/modified modules have passing unit tests
