# Spec: 17-infra-polish

## Purpose
Complete the remaining infrastructure changes (A1-A11 minus A3/A4/A8 already done) and add content operations tooling. Covers: removing redundant workflow, adding report catalog generator, swapping SEO/X monitoring/image tools, adding content calendar NocoDB table, and fixing the duplicate sitemap.

## Scope
**Files modified**: select-keyword.js, generate-image.js, reddit-monitor.js (volume cap), x-engagement.js (list polling frequency), src/app/sitemap.ts (delete)
**Files created**: `content-calendar.js` — content calendar + freshness checker + RSS monitoring

## Reference
- WORKFLOW-CHANGES.md: A1-A11 (minus A3/A4/A8 done in units 10/09/08), D7, D4.1, D4.2

## Sections

### Section 1: A1 — Remove W3 Data Study + A2 — Report Catalog
**A1**: Data study (W3 = data-study.js) is redundant with lead magnet (monthly backtest). Remove from n8n workflow by setting W3 to inactive. Do NOT delete data-study.js (it may have useful helpers) — just add `module.exports.DISABLED = true` and note in comments.

**A2**: Create `report-catalog.js` (new workflow W17, runs 2x/week Mon+Thu):
```javascript
// 1. Query Insider_Alerts last 30 days: clusters (3+ insiders), score >= 8
// 2. Group by sector: identify sectors with multiple high-score alerts
// 3. Generate catalog entries:
//    - Single stock reports: top 5 individual high-conviction buys
//    - Sector report: if 3+ alerts in same sector
//    - Bundle candidates: 5 tickers with complementary stories
// 4. Write to NocoDB Report_Catalog table: {ticker/sector, report_type, priority, status='pending'}
// 5. Telegram message: "Report catalog updated: 5 single, 1 sector, 1 bundle candidates"
```

NocoDB schema for `Report_Catalog`: `id, ticker_or_sector, report_type (single/sector/bundle), priority_score, status (pending/generating/published), created_at`.

### Section 2: A5 — SEO Tool Swap (DataForSEO → Ahrefs Free + Google KP)
Update `select-keyword.js`:

Replace DataForSEO API calls with:
- **Ahrefs Free API** (`https://api.ahrefs.com/v3/site-explorer/keywords-by-traffic`): keyword difficulty (KD) score + traffic range. Auth: `Authorization: Bearer {AHREFS_API_KEY}`
- **Google Keyword Planner via Google Ads API** (free with Google Ads account): search volume ranges. This returns ranges ("100-1K", "1K-10K") not exact — acceptable for new site
- **Ubersuggest free** (3 exact queries/day): use for top 3 priority keywords only

Updated `fetchSEOData(keywords)`:
```javascript
// For each keyword:
// 1. Ahrefs: get KD score (0-100), monthly traffic range
// 2. Google KP: get search volume range
// 3. Ubersuggest (only for top 3): get exact volume if daily quota not exhausted
// 4. Combine into: {keyword, kd, volumeRange, exactVolume?, cpc}
```

Scoring update: remove DataForSEO-specific fields, update `classifyIntent()` and `scorePriority()` to use new fields.

Remove `DATAFORSEO_API_KEY` references. Add `AHREFS_API_KEY`, `GOOGLE_ADS_CUSTOMER_ID`.

### Section 3: A6 — X Monitoring Swap (variable frequency List polling)
Update `x-engagement.js` polling configuration:

```javascript
const POLLING_FREQUENCIES = {
  market_open: { hours: [9, 16], days: [1,2,3,4,5], intervalMs: 5 * 60 * 1000 },    // 9:30-16:00 EST weekdays
  extended:    { hours: [16, 20], days: [1,2,3,4,5], intervalMs: 15 * 60 * 1000 },   // 16:00-20:00 EST
  overnight:   { hours: [20, 9],  days: [0,1,2,3,4,5,6], intervalMs: 60 * 60 * 1000 } // nights + weekends
};

function getCurrentPollingInterval() {
  const now = new Date();
  const estHour = getESTHour(now);
  const day = now.getDay();
  if ([1,2,3,4,5].includes(day) && estHour >= 9 && estHour < 16) return POLLING_FREQUENCIES.market_open;
  if ([1,2,3,4,5].includes(day) && estHour >= 16 && estHour < 20) return POLLING_FREQUENCIES.extended;
  return POLLING_FREQUENCIES.overnight;
}
```

n8n schedule: use Expression node to dynamically set next run interval based on `getCurrentPollingInterval()`. Store last interval in NocoDB `X_State.polling_interval`.

Cost: twitterapi.io $6/month List polling is already configured — this just adds variable frequency.

### Section 4: A7 — Image Swap (kie.ai → Puppeteer OG Cards)
Update `generate-image.js`:

Remove: all kie.ai API calls, `KIEAI_API_KEY` references.

Keep: OG card generation (already uses screenshot server / Puppeteer).

Replace hero image generation:
```javascript
async function generateHeroImage(article) {
  // Was: kie.ai API call
  // Now: use Template 13 (Article Hero) from visual-templates.js
  const { templates } = require('./visual-templates');
  const buffer = await templates.renderTemplate(13, {
    headline: article.headline,
    ticker: article.ticker,
    verdict: article.verdict,
    insiderName: article.insiderName,
    date: article.publishDate
  });
  const url = await uploadToR2(buffer, `hero-${article.slug}.png`);
  return url;
}
```

Template 13 (Article Hero, 1200x630): dark navy, ticker badge, verdict color, headline text, EarlyInsider logo bottom-right, abstract financial pattern background.

Tests: generateHeroImage mock screenshot server, verify R2 upload called.

### Section 5: A9-A11 + VPS + Sitemap
**A9 — VPS shared setup** (documentation only, not code):
Add to env var docs:
```
# VPS Setup Check (run once on Hostinger VPS):
free -h  # Must show ≥ 4GB RAM available
# If < 4GB: upgrade or reduce n8n worker concurrency
# Shared services on same VPS: Toxic or Nah n8n, InsiderBuying n8n, NocoDB
```

**A10 — Reddit volume cap**: Already handled in unit 13 (daily cap = 8-10, was 17). Verify `SUBREDDIT_TONE_MAP` total daily limits sum to ≤ 10 across all subs.

**A11 — Remove duplicate sitemap**:
Delete `src/app/sitemap.ts` (or move to `_sitemap.ts.bak`). Keep `next-sitemap.config.js` as the single source. Verify: `npm run build` produces only one sitemap.xml.

### Section 6: content-calendar.js + D7
Create `n8n/code/insiderbuying/content-calendar.js`:

**Content Calendar** (NocoDB `Content_Calendar` table):
```javascript
// Schema: {id, ticker_or_topic, content_type (article/reddit_dd/x_thread/report), planned_date, status, channel, notes}

async function addToCalendar(entry) {
  await nocodb.create('Content_Calendar', {
    ticker_or_topic: entry.ticker,
    content_type: entry.type,
    planned_date: entry.date,
    status: 'planned',
    channel: entry.channel
  });
}

async function getCalendarForDate(date) {
  return nocodb.list('Content_Calendar', {
    where: `(planned_date,eq,${date})~and(status,eq,planned)`
  });
}
```

**Earnings calendar integration** (D7.3):
Weekly fetch Alpha Vantage earnings for next 4 weeks → auto-populate `Content_Calendar` with pre-earnings article stubs for tickers with recent insider buying.

**Competitor RSS monitoring** (D7.2):
```javascript
const COMPETITOR_RSS_FEEDS = [
  'https://unusualwhales.com/feed.rss',
  'https://www.marketbeat.com/rss/news/',
  // Seeking Alpha via Google Alerts RSS
];

async function checkCompetitorFeeds() {
  for (const feed of COMPETITOR_RSS_FEEDS) {
    const items = await fetchRSS(feed); // parse RSS XML
    // Log to NocoDB Competitor_Intel table
    // Telegram alert if competitor covers ticker we haven't covered in 30 days
  }
}
```

**Content freshness checker** (D4.1): already implemented in generate-article.js (unit 15). `content-calendar.js` exposes `checkContentFreshness(ticker)` as shared utility for all content generators.

**Cosine similarity checker** (D4.2, optional):
```javascript
async function checkContentSimilarity(newArticleText, ticker) {
  // Fetch last 10 published articles for this ticker
  // Compute cosine similarity using simple TF-IDF (no external library)
  // If similarity > 0.85 with any existing article: return {similar: true, match: article.id}
  // Called before article generation to prevent duplicate angles
}
```
Implement simple TF-IDF in ~50 lines (no npm package needed).

## Test Requirements
- report-catalog: mock NocoDB alert data, verify correct catalog entries generated
- select-keyword: mock Ahrefs + Google KP responses, verify combined output shape
- getCurrentPollingInterval: all time/day combinations hit correct frequency
- generateHeroImage: mock screenshot server, verify Puppeteer template used (not kie.ai)
- content-calendar: CRUD operations with mock NocoDB
- checkCompetitorFeeds: mock RSS XML, verify NocoDB write + Telegram alert

## Definition of Done
- `grep -r "dataforseo\|DATAFORSEO\|kieai\|KIEAI" --include="*.js" -i` = 0 matches
- select-keyword.js uses Ahrefs + Google KP
- generate-image.js hero generation uses Template 13 (not kie.ai)
- content-calendar.js exported and usable from other modules
- src/app/sitemap.ts deleted (only next-sitemap.config.js remains)
- All existing tests pass
