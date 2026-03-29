# Spec: 17-infra-polish (Synthesized)

## Overview

Complete the remaining infrastructure changes (A1-A11 minus A3/A4/A8 done in prior units) and add content operations tooling. This unit covers six areas:

1. **A1 + A2** — Disable the redundant data-study workflow; create a report-catalog generator
2. **A5** — SEO tool swap: DataForSEO → Ahrefs API v3 + Ubersuggest
3. **A6** — X monitoring: variable-frequency List polling via NocoDB state machine
4. **A7** — Image swap: fal.ai Flux hero images → Puppeteer Template 13
5. **A9–A11** — VPS documentation, Reddit volume cap verify, sitemap deduplication
6. **Section 6** — Create `content-calendar.js`: content calendar, RSS monitoring, freshness checker, TF-IDF similarity

---

## Section 1: A1 — Disable Data Study + A2 — Report Catalog

### A1: Disable data-study.js

File: `n8n/code/insiderbuying/data-study.js`

Add at the very top of the file:
```javascript
// DISABLED: W3 data study is superseded by the monthly backtest lead magnet.
// Kept in place for potential helper reuse. Set W3 workflow to inactive in n8n.
module.exports.DISABLED = true;
```

Then set the W3 n8n workflow to inactive in the n8n UI. Do NOT delete the file.

### A2: Create report-catalog.js

New file: `n8n/code/insiderbuying/report-catalog.js`

This is W17, a new n8n workflow that runs 2x/week (Monday + Thursday).

**Logic:**
1. Query NocoDB `Insider_Alerts` table: last 30 days, `clusters >= 3` AND `score >= 8`
2. Group results by sector: identify sectors with 3+ high-score alerts
3. Generate catalog entries:
   - Single-stock reports: top 5 individual high-conviction buys
   - Sector report: if 3+ alerts in same sector
   - Bundle candidates: 5 tickers with complementary stories
4. Write entries to NocoDB `Report_Catalog` table
5. Send Telegram message summarizing counts (e.g., "Report catalog updated: 5 single, 1 sector, 1 bundle candidates")

**Edge cases:**
- If query returns 0 results: write empty catalog, send Telegram "Report catalog updated: 0 candidates"
- Insider_Alerts table is assumed to exist (created in prior units)

**NocoDB Report_Catalog schema:**
- id (auto)
- ticker_or_sector (text)
- report_type: `single` | `sector` | `bundle`
- priority_score (number)
- status: `pending` | `generating` | `published`
- created_at (datetime)

Uses standard nocodbPost/nocodbGet helpers.

---

## Section 2: A5 — SEO Tool Swap

### What's Being Replaced

Current: DataForSEO Basic HTTP auth (`DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD`)
- Endpoints: `google_ads/search_volume/live` and `google_ads/keywords_for_keywords/live`

New: Ahrefs API v3 + Ubersuggest free (3/day)

### Research Corrections

- The spec referenced `/v3/site-explorer/keywords-by-traffic` — this endpoint does NOT exist
- Correct endpoint: `/v3/site-explorer/organic-keywords`
- Google KP is dropped entirely (OAuth2 + MCC + developer token = too complex)
- Ubersuggest free tier: 3 exact queries/day, used for top 3 priority keywords only

### Ahrefs API v3

Endpoint: `GET https://api.ahrefs.com/v3/site-explorer/organic-keywords`

Required parameters:
- `target`: domain (e.g., earlyinsider.com)
- `date`: current date in YYYY-MM-DD
- `select`: `keyword,keyword_difficulty,sum_traffic,volume`
- `mode`: `domain`
- `country`: `us`
- `limit`: configurable (default 100 per request)

Auth: `Authorization: Bearer ${env.AHREFS_API_KEY}`

Response fields used:
- `keyword`: the search term
- `keyword_difficulty`: KD score 0–100
- `sum_traffic`: estimated monthly organic traffic
- `volume`: monthly search volume estimate

Rate limits: 60 requests/minute, minimum 50 units per request.

### Ubersuggest Free (Top 3 Keywords)

Used only for the top 3 highest-priority keywords after Ahrefs scoring.
3 exact queries/day limit — only call if daily quota not exhausted.
Env var: `UBERSUGGEST_API_KEY`

### Changes to select-keyword.js

1. Remove `fetchSearchVolume()` and `fetchRelatedKeywords()` DataForSEO functions
2. Add `fetchAhrefsKeywords(domain, opts)` → calls Ahrefs organic-keywords, returns array of `{keyword, kd, traffic, volume}`
3. Add `fetchUbersuggestVolume(keyword, opts)` → exact volume for top 3 keywords only, with daily quota guard
4. Update `computePriorityScore()` to use new fields: `kd` (keyword_difficulty), `traffic` (sum_traffic), `volume`
5. Update `classifyIntent()` — no changes needed (keyword text classification is API-agnostic)
6. Remove env vars: `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`
7. Add env vars: `AHREFS_API_KEY`, `UBERSUGGEST_API_KEY`

**Combined fetch flow:**
```
For each seed keyword batch:
  1. Ahrefs organic-keywords → get KD + traffic for domain
  2. Score and rank all keywords
  3. Top 3: call Ubersuggest for exact volume (if daily quota not exhausted)
  4. Combine: {keyword, kd, traffic, volume or volumeRange, cpc}
```

---

## Section 3: A6 — X Monitoring Variable Frequency Polling

### Current State

x-engagement.js runs on a fixed n8n Schedule Trigger. No variable frequency logic exists.

### Variable Frequency Design

n8n Schedule Triggers do not support truly dynamic intervals. Solution: 1-minute cron + skip-logic pattern.

**n8n setup:** Set the existing W8 Schedule Trigger to 1 minute (the polling loop itself).

**Code in x-engagement.js:**

```javascript
const POLLING_FREQUENCIES = {
  market_open: 5 * 60 * 1000,    // 9:30–16:00 EST weekdays
  extended:   15 * 60 * 1000,    // 16:00–20:00 EST weekdays
  overnight:  60 * 60 * 1000,    // 20:00–9:30 + weekends
};

// Accepts injectable 'now' Date for testability
function getCurrentPollingInterval(now = new Date()) {
  const estHour = getESTHour(now);
  const day = now.getDay(); // 0=Sun, 6=Sat
  if ([1,2,3,4,5].includes(day) && estHour >= 9 && estHour < 16)
    return POLLING_FREQUENCIES.market_open;
  if ([1,2,3,4,5].includes(day) && estHour >= 16 && estHour < 20)
    return POLLING_FREQUENCIES.extended;
  return POLLING_FREQUENCIES.overnight;
}
```

**Skip-logic at entry point:**
```
At start of x-engagement workflow:
  1. Read X_State.last_run and X_State.polling_interval from NocoDB
  2. If Date.now() - last_run < getCurrentPollingInterval(): return early (skip run)
  3. Else: run main engagement logic
  4. At end: PATCH X_State.last_run = Date.now(), X_State.polling_interval = getCurrentPollingInterval()
```

`X_State` table already exists from unit 08. Fields used: `last_run` (timestamp ms), `polling_interval` (ms integer).

---

## Section 4: A7 — Hero Image Swap

### Current State (Corrected from Spec)

The spec referenced kie.ai, but codebase research confirms kie.ai was already removed in a prior unit. The current `generate-image.js` uses **fal.ai Flux** for hero images.

### What Changes

Function: `generateHeroImage(article)` — currently calls `queue.fal.run/fal-ai/flux/dev`

Replace fal.ai Flux call with visual-templates.js Template 13:

```javascript
async function generateHeroImage(article) {
  const { templates } = require('./visual-templates');
  const buffer = await templates.renderTemplate(13, {
    headline: article.headline,
    ticker: article.ticker,
    verdict: article.verdict,
    insiderName: article.insiderName,
    date: article.publishDate,
  });
  const url = await uploadToR2(buffer, `hero-${article.slug}.png`);
  return url;
}
```

Template 13 spec (Article Hero, 1200×630): dark navy background, ticker badge, verdict color, headline text, EarlyInsider logo bottom-right, abstract financial pattern background.

Template 13 must already exist in visual-templates.js (from unit 11). If it doesn't, this section must create it.

### Env var changes

Remove `FAL_KEY` only if not used by any other function in generate-image.js. Check all callers before removing.

### Definition of Done (Corrected)

- No fal.ai Flux calls in `generateHeroImage()` (not kie.ai — already gone)
- Hero images use `templates.renderTemplate(13, ...)` → screenshot server → R2
- OG card generation (screenshot server path) unchanged
- `grep -r "queue.fal.run\|fal-ai/flux" --include="*.js" -i` on hero image path = 0 matches

---

## Section 5: A9, A10, A11 — VPS, Reddit Cap, Sitemap

### A9 — VPS Shared Setup Documentation

Not a code change. Add to environment documentation or `.env.example`:
```
# VPS Setup Check (run once on Hostinger VPS):
# free -h → must show >= 4GB RAM available
# Shared VPS hosts: Toxic or Nah n8n, InsiderBuying n8n, NocoDB
# If < 4GB: upgrade VPS or reduce n8n worker concurrency
```

### A10 — Reddit Volume Cap + Runtime Assertion

reddit-monitor.js already has daily cap of 8–10 from unit 13. Verify `SUBREDDIT_TONE_MAP` total daily limits across all subs sum to ≤ 10. Add a startup runtime assertion:

```javascript
// At module load time:
const totalDailyLimit = Object.values(SUBREDDIT_TONE_MAP).reduce((sum, s) => sum + (s.daily_limit || 0), 0);
if (totalDailyLimit > 10) throw new Error(`SUBREDDIT daily limit total ${totalDailyLimit} exceeds 10`);
```

If currently > 10: reduce individual limits until sum ≤ 10. Document which subs were capped.

### A11 — Remove Duplicate Sitemap

1. Delete `src/app/sitemap.ts` (or rename to `_sitemap.ts.bak` if cautious)
2. Check `next.config.ts` for conflicting settings:
   - Look for `output: 'export'` (incompatible with next-sitemap)
   - Look for `generateSitemaps()` override or custom sitemap config
   - Add comment if any conflict found: `// next-sitemap.config.js is the single sitemap source — do not add App Router sitemap.ts`
3. Keep `next-sitemap.config.js` as sole source
4. Manual verification: `npm run build` → confirm single `public/sitemap.xml` (no duplicate)

---

## Section 6: content-calendar.js + D7

New file: `n8n/code/insiderbuying/content-calendar.js`

### NocoDB Tables

#### Content_Calendar (created in this unit)
Schema: `id, ticker_or_topic, content_type (article/reddit_dd/x_thread/report), planned_date, status (planned/published/skipped), channel, notes`

#### Competitor_Intel (created in this unit)
Schema: `id, feed_url, item_title, item_url, item_date, ticker_mentioned, covered_by_us (bool), created_at`

### Functions to Export

#### addToCalendar(entry)
Create a Content_Calendar record:
```javascript
async function addToCalendar(entry) {
  // entry: { ticker, type, date, channel }
  await nocodbPost('Content_Calendar', {
    ticker_or_topic: entry.ticker,
    content_type: entry.type,
    planned_date: entry.date,
    status: 'planned',
    channel: entry.channel,
  }, opts);
}
```

#### getCalendarForDate(date)
Fetch planned items for a given date:
```javascript
async function getCalendarForDate(date) {
  return nocodbGet(`Content_Calendar?where=(planned_date,eq,${date})~and(status,eq,planned)`, opts);
}
```

#### checkContentFreshness(ticker)
Shared utility: check if a ticker has been covered in the last 30 days. Queries Articles table with `where=(ticker,eq,${ticker})~and(created_at,gte,${thirtyDaysAgo})`. Used by other content generators. Already implemented in generate-article.js per spec — content-calendar.js exposes it as a shared export.

#### checkCompetitorFeeds()
RSS monitoring for competitor coverage:

```javascript
const COMPETITOR_RSS_FEEDS = [
  'https://unusualwhales.com/feed.rss',
  'https://www.marketbeat.com/rss/news/',
];

async function checkCompetitorFeeds() {
  const allItems = [];
  let allFailed = true;

  for (const feed of COMPETITOR_RSS_FEEDS) {
    try {
      const items = await fetchRSS(feed); // parse RSS XML with built-in xml parser
      allFailed = false;
      for (const item of items) {
        // Check if covers a ticker we haven't published on in 30 days
        const tickers = extractTickers(item.title + ' ' + item.description);
        for (const ticker of tickers) {
          const covered = await checkContentFreshness(ticker);
          if (!covered) {
            await nocodbPost('Competitor_Intel', { feed_url: feed, item_title: item.title,
              item_url: item.link, item_date: item.pubDate, ticker_mentioned: ticker,
              covered_by_us: false, created_at: new Date().toISOString() }, opts);
            await sendTelegramAlert(`Competitor covered ${ticker}: ${item.title}`);
          }
        }
      }
    } catch (err) {
      // Track consecutive failure count per feed in NocoDB
      await incrementFeedFailCount(feed);
      const failCount = await getFeedFailCount(feed);
      if (failCount >= 3) {
        await sendTelegramAlert(`ERROR: ${feed} has failed ${failCount} consecutive times`);
      }
    }
  }
}
```

RSS parsing uses Node.js built-in `require('https')` + simple XML regex parser (no npm package).

#### checkContentSimilarity(newArticleText, ticker) — Optional (D4.2)

TF-IDF cosine similarity in ~50 lines of pure JS:
1. Fetch last 10 published articles for `ticker` from NocoDB
2. Compute TF-IDF vectors for `newArticleText` and each existing article
3. Compute cosine similarity
4. If similarity > 0.85 with any article: return `{ similar: true, match: article.id }`
5. Else: return `{ similar: false }`

Called before article generation to prevent duplicate angles. Implementation is self-contained pure math.

### Earnings Calendar Integration (D7.3)

Calls the existing Alpha Vantage helper from unit 09. Weekly run:
1. Fetch earnings for next 4 weeks from Alpha Vantage
2. For each earnings ticker: check if insider buying alert exists in Insider_Alerts (last 30 days)
3. If yes: call `addToCalendar()` with `type: 'article'` and `planned_date` = 3 days before earnings

---

## Environment Variables Summary

### Removed
- `DATAFORSEO_LOGIN`
- `DATAFORSEO_PASSWORD`
- `FAL_KEY` (only if not used elsewhere in generate-image.js)

### Added
- `AHREFS_API_KEY` — Ahrefs API v3 Bearer token
- `UBERSUGGEST_API_KEY` — Ubersuggest free tier API key

### Unchanged
- All NocoDB, Telegram, R2, Supabase, Resend vars remain as-is

---

## Definition of Done

1. `grep -ri "dataforseo\|DATAFORSEO" --include="*.js" .` = 0 matches
2. `grep -ri "kieai\|KIEAI" --include="*.js" .` = 0 matches (already true)
3. `grep -ri "queue.fal.run\|fal-ai/flux" --include="*.js" .` in hero image function = 0 matches
4. select-keyword.js uses Ahrefs organic-keywords + Ubersuggest (no DataForSEO)
5. generate-image.js hero generation calls `templates.renderTemplate(13, ...)`
6. content-calendar.js exports: `addToCalendar`, `getCalendarForDate`, `checkContentFreshness`, `checkCompetitorFeeds`, `checkContentSimilarity`
7. `src/app/sitemap.ts` deleted (only next-sitemap.config.js remains)
8. `npm run build` produces a single sitemap.xml
9. data-study.js has `module.exports.DISABLED = true` at top
10. All new and modified modules have unit tests passing
