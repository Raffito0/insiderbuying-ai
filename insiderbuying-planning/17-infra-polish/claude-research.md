# Research: 17-infra-polish

## 1. Codebase Analysis

### 1.1 select-keyword.js — Current State

**Location:** `ryan_cole/insiderbuying-site/n8n/code/insiderbuying/select-keyword.js`

Current external APIs:
- **DataForSEO** (to be removed)
  - Endpoint: `https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live`
  - Endpoint: `https://api.dataforseo.com/v3/keywords_data/google_ads/keywords_for_keywords/live`
  - Auth: Basic HTTP (Base64 `login:password`)
  - Env vars: `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`

Key functions to update:
- `fetchSearchVolume(keywords, auth, opts)` — wraps DataForSEO search volume call
- `fetchRelatedKeywords(keywords, auth, opts)` — wraps DataForSEO related keywords call
- `computePriorityScore(volume, difficulty, multiplier)` — uses DataForSEO-specific field names
- `classifyIntent(keyword)` — returns A/B/C/D intent type
- `scorePriority()` — combines volume + difficulty into numeric priority

Fields currently returned by DataForSEO:
- `keyword`, `search_volume`, `competition_index`, `cpc`, `monthly_searches`

New fields from Ahrefs + Google KP:
- Ahrefs `organic-keywords`: `keyword`, `keyword_difficulty` (KD 0-100), `sum_traffic`, `volume`
- Google KP `generateKeywordHistoricalMetrics`: `keyword`, `avg_monthly_searches`, `competition` (LOW/MED/HIGH), `competition_index` (0-100)

### 1.2 x-engagement.js — Current State

**Location:** `ryan_cole/insiderbuying-site/n8n/code/insiderbuying/x-engagement.js`

Current structure:
- Bot filtering thresholds: MIN_FOLLOWERS=10, MIN_FOLLOWING=10, MIN_ACCOUNT_AGE_DAYS=30
- Draft reply via Claude Haiku (max 240 chars, under 100 tokens)
- Telegram inline keyboard review: Approve / Edit / Skip
- Callback format: `x:approve:{tweetId}` | `x:edit:{tweetId}` | `x:skip:{tweetId}`

No polling frequency configuration currently — fixed scheduling is handled at the n8n Schedule Trigger level. The plan needs to add a `getCurrentPollingInterval()` helper and store state in NocoDB `X_State.polling_interval`.

### 1.3 generate-image.js — Current State (Important Discrepancy)

**Location:** `ryan_cole/insiderbuying-site/n8n/code/insiderbuying/generate-image.js`

The spec references removing "kie.ai API calls". However, codebase research shows the current `generateHeroImage()` already uses **fal.ai Flux** (not kie.ai). kie.ai was likely swapped in unit 10 (ai-provider-swap).

Current state:
- `generateHeroImage(prompt, opts)` → fal.ai Flux (`https://queue.fal.run/fal-ai/flux/dev`), async polling, env: `FAL_KEY`
- `generateOgCard(html, opts)` → Screenshot server (`http://host.docker.internal:3456/screenshot`)
- Both upload to Cloudflare R2 via AWS SigV4

For unit 17, the task is to replace `generateHeroImage()` with Puppeteer Template 13 from `visual-templates.js`. The grep check `KIEAI_API_KEY` may return 0 already — that's fine. The Definition of Done should check for absence of both `kieai` AND `fal.ai` hero references, replaced by `visual-templates`.

Env vars to remove: `FAL_KEY` (for hero generation — may still be used elsewhere, check callers)
Env vars to add: none (screenshot server already configured)

### 1.4 data-study.js — Current State

**Location:** `ryan_cole/insiderbuying-site/n8n/code/insiderbuying/data-study.js`

File exists. To disable (A1): add `module.exports.DISABLED = true` at top with comment explaining it's superseded by monthly backtest report. Do NOT delete — helpers may be useful.

### 1.5 NocoDB Integration Pattern

Established pattern across all modules:
```javascript
// Base URL: env.NOCODB_BASE_URL (http://nocodb:8080/api/v1/db/data/noco/{BASE_ID})
// Auth header: 'xc-token': env.NOCODB_API_TOKEN

async function nocodbGet(path, token, opts = {}) { ... }
async function nocodbPost(path, data, token, opts = {}) { ... }
async function nocodbPatch(path, data, token, opts = {}) { ... }
```

New tables needed:
- `Report_Catalog`: id, ticker_or_sector, report_type, priority_score, status, created_at
- `Content_Calendar`: id, ticker_or_topic, content_type, planned_date, status, channel, notes
- `Competitor_Intel`: (for RSS competitor monitoring)
- `X_State`: polling_interval field (may already exist from unit 08)

All new tables follow same CRUD pattern. No new NocoDB client library needed.

### 1.6 Sitemap — Confirmed Duplicate

Both files exist:
- `src/app/sitemap.ts` — Next.js App Router native, static routes
- `next-sitemap.config.js` — Dynamic generation via next-sitemap library

Action: Delete `src/app/sitemap.ts`. Keep `next-sitemap.config.js` as single source.

### 1.7 Testing Patterns

All tests use **Node.js native test runner** (`node:test` + `node:assert/strict`). No Jest, no Vitest.

```javascript
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
```

Tests for select-keyword.js: intent classification, priority scoring, seed generation, deduplication
Tests for reddit-monitor.js: query building, filtering, comment validation

New tests for 17-infra-polish should follow the same pattern.

---

## 2. Web Research: Ahrefs API v3

### Critical Finding: Wrong Endpoint in Spec

The spec references `GET /v3/site-explorer/keywords-by-traffic` — **this endpoint does not exist**. HTTP 404 confirmed.

**Correct endpoint for keyword + traffic data:**
```
GET /v3/site-explorer/organic-keywords
```

Parameters:
- `target` (required): domain or URL
- `date` (required): YYYY-MM-DD
- `select` (required): comma-separated fields (`keyword,keyword_difficulty,sum_traffic,volume,best_position`)
- `country`: ISO 2-letter code
- `mode`: `domain` | `prefix` | `exact` | `subdomains`
- `limit`: default 1000

Response fields relevant to select-keyword.js:
| Field | Description |
|---|---|
| `keyword` | Search term |
| `keyword_difficulty` | KD score 0–100 |
| `sum_traffic` | Estimated monthly organic visitors |
| `volume` | Monthly search volume estimate |

Authentication:
```
Authorization: Bearer YOUR_API_KEY
```

Base URL: `https://api.ahrefs.com/v3/`

### Free Tier Reality

**No free plan with API access.** API requires paid Ahrefs subscription (Lite or higher). Enterprise plan required for new API applications.

Free test queries available on paid plans:
- Requests using `ahrefs.com` or `wordcount.com` as `target` don't consume units
- Limit capped at 100 for free test requests

Rate limits:
- 60 requests per minute
- Minimum cost: 50 API units per request
- Cost per row with volume + KD + traffic: +30 units/row. 100 keywords = ~3,050 units minimum
- Lite plan 10,000 units/month ≈ 3 requests of 100 keywords each (very tight)

**Implication for plan:** The spec says "Ahrefs Free API". This is misleading — there's no truly free API. The plan should note this requires a paid Ahrefs account (Lite at minimum). Alternatively, fall back to a different free source for keyword difficulty (e.g., Ubersuggest or a different provider). The Ahrefs endpoint in the spec (`keywords-by-traffic`) does not exist — must use `organic-keywords`.

---

## 3. Web Research: Google Ads Keyword Planner API

### What Actually Returns Volume Data

**`POST /customers/{CID}/generateKeywordHistoricalMetrics`** — returns metrics for a provided keyword list.

Response shape (actual integers, not ranges):
```json
{
  "results": [{
    "text": "insider buying",
    "keywordMetrics": {
      "avgMonthlySearches": 12100,
      "monthlySearchVolumes": [
        { "year": 2024, "month": "DECEMBER", "monthlySearches": 14400 }
      ],
      "competition": "MEDIUM",
      "competitionIndex": 41,
      "lowTopOfPageBidMicros": "300000",
      "highTopOfPageBidMicros": "1200000"
    }
  }]
}
```

**Note:** The spec states Google KP "returns ranges" (e.g., "100-1K") but the API actually returns exact integers. The UI shows ranges, not the API. This is a minor simplification in the spec — the plan should use exact `avgMonthlySearches` values.

**Exception:** Inactive accounts (no ad spend in 30 days) get range buckets. Active accounts (any spend) get exact numbers. A $5–10/month spend is often enough to unlock exact data.

### Access Requirements (Not Simple)

Getting "free" access requires:
1. **Google Ads Manager Account (MCC)** — free to create at ads.google.com
2. **Developer Token** — from MCC API Center, initially Test Access only
3. **Basic Access approval** — apply in API Center, typically approved in days for personal/internal use
4. **OAuth2 setup** — Client ID + Secret from Google Cloud Console + refresh token
5. **New Explorer Access tier (Feb 2026)**: auto-granted but **blocks Keyword Planner entirely** — must apply for Basic/Standard Access

**No official Node.js client library** from Google. Options:
- `google-ads-api` npm package (Opteo) — TypeScript, actively maintained
- Raw HTTP with `google-auth-library` for OAuth2

5 env vars needed: `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID`

### Rate Limits

- 1 request per second per Customer ID
- Basic Access: 15,000 API operations/day total
- Google recommends caching results (keyword metrics update monthly)

**Implication for plan:** The spec treats this as simple "free API with Google Ads account" but setup is significantly more complex (OAuth2, MCC, developer token approval, Explorer Access tier blocks it). The plan should either simplify the scope (use Ubersuggest for volume only, skip Google KP initially) or provide a concrete setup path.

---

## 4. Testing Strategy

No existing test runner beyond Node.js native. All tests follow:
```javascript
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
```

For 17-infra-polish, new test files:
- `report-catalog.test.js` — mock NocoDB alert data, verify catalog entries
- `select-keyword.test.js` updates — mock Ahrefs + Google KP responses, verify combined output
- `x-engagement.test.js` — `getCurrentPollingInterval()` across all time/day combinations
- `generate-image.test.js` — mock screenshot server, verify Template 13 used (not fal.ai/kie.ai)
- `content-calendar.test.js` — CRUD operations with mock NocoDB
- `content-calendar.test.js` — `checkCompetitorFeeds()` mock RSS XML, Telegram alert

---

## 5. Key Decisions for Plan

1. **Ahrefs endpoint**: Use `/v3/site-explorer/organic-keywords` (not `keywords-by-traffic` which doesn't exist)
2. **Google KP access**: Plan should document the MCC + OAuth2 setup requirement upfront, not treat it as trivial
3. **Hero image swap**: Target is fal.ai → Template 13, not kie.ai → Template 13 (kie.ai already removed). Update Definition of Done accordingly.
4. **`KIEAI_API_KEY` grep**: Will likely return 0 already. DoD check is still valid.
5. **`module.exports.DISABLED`**: Add to data-study.js at top-level export
6. **NocoDB tables**: Create Report_Catalog, Content_Calendar, Competitor_Intel via standard nocodbPost pattern
7. **TF-IDF**: Pure JS ~50 lines, no research needed (user confirmed)
8. **Alpha Vantage earnings**: Already implemented in unit 09 (user confirmed) — content-calendar.js just calls the existing helper

---

## 6. SEO Tool Comparison (Background Research — 2026-03-29)

Full comparison of free and low-cost SEO keyword tools with API access, max €10/month.

### Eliminated (no viable API)

| Tool | Reason |
|------|---------|
| Ubersuggest | **No public API** — FAQ explicitly states "Ubersuggest doesn't have API or webhook functionality." Only fragile scraping workarounds exist. **The plan's reference to Ubersuggest 3/day is incorrect.** |
| Keyword Surfer | Browser extension only. No REST API. |
| WhatsMySERP | $19.99/month minimum. Over budget. |
| Ahrefs free tier | No API on free tier. Paid API requires hundreds/month. |
| Semrush free tier | API requires Business plan + add-on. Free tier = UI only. |
| Serpstat | API starts at $100/month (Team plan). Over budget. |

### Recommended: Keywords Everywhere Bronze — $1.75/month

**API endpoint:** `POST https://api.keywordseverywhere.com/v1/get_keyword_data`

**Auth:** `Authorization: Bearer <KWE_API_KEY>`

**Request:**
```json
{ "country": "us", "currency": "usd", "dataSource": "gkp",
  "kw[]": ["insider buying stocks", "best index funds"] }
```
Max 100 keywords per request. No documented daily rate limit.

**Response fields:**
- `data[n].keyword` — keyword string
- `data[n].vol` — monthly search volume (exact integer)
- `data[n].seo_difficulty` (or `on_page_difficulty` + `off_page_difficulty`) — KD 0-100
- `data[n].competition.value` — PPC competition 0-1 (not organic KD — already covered above)
- `data[n].trend` — 12-month trend array

**Cost for ~300 keywords/month:**
- Bronze plan: 100,000 credits/year = $21/year ($1.75/month)
- 300 keywords/month = 3,600/year = 3.6% of quota — massive headroom
- 1 credit = 1 keyword (direct API lookup)

**Env var:** `KWE_API_KEY`

### Secondary: DataForSEO keyword_overview ~$6/month

Existing credentials (`DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD`) already in the project. DataForSEO `dataforseo_labs/google/keyword_overview/live` returns both KD and volume in one call at $0.0201/keyword ($6/month for 300 keywords).

**Decision: Keep DataForSEO as fallback** — do not remove credentials. If Keywords Everywhere goes down or credits exhaust, DataForSEO provides full fallback coverage.

### SEO Tool Stack Decision

| Role | Tool | Env Var | Cost |
|------|------|---------|------|
| Primary KD + volume | Keywords Everywhere Bronze | `KWE_API_KEY` | $1.75/month |
| Fallback | DataForSEO keyword_overview | `DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD` | ~$6/month if needed |
| Google KP | Dropped entirely | — | — |
| Ahrefs | Not needed | — | — |
| Ubersuggest | No API, cannot use | — | — |
