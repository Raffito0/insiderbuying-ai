# 09-data-pipeline — Usage Guide

Generated after successful completion of all 5 sections.

---

## What Was Built

A complete insider-buying data pipeline for the EarlyInsider platform, consisting of three JavaScript modules:

### `n8n/code/insiderbuying/edgar-parser.js`

EDGAR data fetching and parsing (Sections 01–03).

**Exports:**

| Function | Description |
|---|---|
| `buildEdgarRssUrl(formType, startDate, endDate)` | Builds EDGAR EFTS search URL for recent Form 4 filings |
| `fetchRecentFilings(maxAgeDays, fetchFn?)` | Fetches Form 4 filings from the last N days via EDGAR EFTS |
| `deduplicateFilings(filings, lastCheckTimestamp?)` | Filters to filings newer than a watermark timestamp |
| `buildForm4XmlUrl(issuerCik, accessionNumber)` | Builds primary + index fallback URLs for a Form 4 XML |
| `fetchForm4Xml(issuerCik, accessionNumber, fetchFn?)` | Downloads Form 4 XML with 404→index.json fallback |
| `parseForm4Xml(xmlString)` | Parses Form 4 XML into structured object (no XML library) |
| `classifyTransaction(transaction)` | Maps transaction code (P/S/G/F/M/X/A/D/J) to semantic string |
| `classifyInsiderRole(officerTitle)` | Maps raw SEC officer title to canonical role (CEO/CFO/etc.) |
| `filterScorable(transactions)` | Whitelist filter: keeps only P (purchase) and S (sale) |
| `calculate10b5Plan(xmlBlock)` | Detects 10b5-1 plan flag (legacy + modern SEC schema) |

**Rate limiter:** Shared dual-rate `TokenBucket` (58 req/min for EDGAR EFTS). All HTTP calls respect this budget.

**User-Agent:** All EDGAR requests include `EarlyInsider/1.0 (contact@earlyinsider.com)` as required by SEC policy.

---

### `n8n/code/insiderbuying/dexter-research.js`

Financial data enrichment via Finnhub and Alpha Vantage (Sections 04–05).

**Exports:**

| Function | Description |
|---|---|
| `fetchFinancialData(ticker, nocoBaseUrl, nocoTableId, nocoToken, fetchFn?)` | Orchestrates all Finnhub calls, returns enriched data with completeness score |
| `alphaVantage.getEarningsCalendar(apiKey, fetchFn?)` | Downloads SEC earnings calendar CSV, caches in NocoDB as `__all__` record |
| `getNextEarningsDate(ticker, calendarMap)` | Pure function: looks up next report date from calendar Map |

**Finnhub sub-fetchers (used internally by `fetchFinancialData`):**

| Function | API endpoint | Cache TTL |
|---|---|---|
| `getQuote(ticker, ...)` | `/quote` | 24h |
| `getProfile(ticker, ...)` | `/stock/profile2` | 24h |
| `getBasicFinancials(ticker, ...)` | `/stock/metric` | 24h |
| `getInsiderTransactions(ticker, ...)` | `/stock/insider-transactions` | 24h |

**Rate limiter:** `TokenBucket` (capacity=5, refill 5 tokens/5s = 60 req/min). Skipped when `fetchFn` is provided (tests only).

**Data weights** used for `completenessScore`:

| Source | Weight |
|---|---|
| Quote + Profile | 0.25 |
| Basic metrics | 0.25 |
| Stock prices | 0.25 |
| Competitors | 0.10 |
| Insider trades | 0.15 |

**NocoDB cache schema** (`Financial_Cache` table):

| Field | Type | Notes |
|---|---|---|
| `ticker` | text | Primary lookup key |
| `data_type` | text | `'quote_profile'`, `'basic_metrics'`, etc., or `'earnings_calendar'` |
| `data_json` | LONGTEXT/JSON | Serialized payload |
| `fetched_at` | datetime | ISO 8601 timestamp of last fetch |

Cache TTL: 24 hours. The `__all__` earnings calendar record is updated at most once per day.

---

### `n8n/code/insiderbuying/sec-monitor.js`

Alert pipeline: EDGAR → Form 4 XML → parse → dedup → alert (Section 05 rewrite).

**Pipeline flow:**

```
1. fetchRecentFilings(6 days)
2. deduplicateFilings(filings, last_check_timestamp)
3. For each filing:
   a. fetchForm4Xml → null? failureCount++, continue
   b. parseForm4Xml → null? failureCount++, continue
   c. isAmendment? → log INFO, skip (not a failure)
   d. Store dedup keys for ALL transactions (primary + semantic)
   e. filterScorable → only P and S codes
   f. For each scorable tx: passesDedup? → create alert record
4. Update Monitor_State.last_check_timestamp
5. failureCount > 5? → Telegram alert
```

**Dedup keys:**
- Primary: `{accessionNumber}_{transactionIndex}` — prevents duplicate alerts for same filing run
- Secondary: `{ticker}_{ownerName}_{transactionDate}_{shares}` — prevents semantic duplicates across runs

---

## Running Tests

```bash
# Jest tests (edgar-parser + sec-monitor) — 169 tests total
cd ryan_cole/insiderbuying-site
npm test

# Native runner tests (dexter-research) — 65 tests
node n8n/tests/dexter-research.test.js
```

---

## Environment Variables

| Variable | Module | Required? |
|---|---|---|
| `ALPHA_VANTAGE_API_KEY` | dexter-research.js | Yes (free tier, 25 calls/day) |
| `FINNHUB_API_KEY` | dexter-research.js | Yes |
| `NOCODB_BASE_URL` | dexter-research.js | Yes |
| `NOCODB_FINANCIAL_CACHE_TABLE_ID` | dexter-research.js | Yes |
| `NOCODB_API_TOKEN` | dexter-research.js | Yes |
| `AIRTABLE_API_KEY` | sec-monitor.js | Yes |
| `AIRTABLE_BASE_ID` | sec-monitor.js | Yes |
| `SUPABASE_URL` | sec-monitor.js | Yes |
| `SUPABASE_KEY` | sec-monitor.js | Yes |
| `TELEGRAM_BOT_TOKEN` | sec-monitor.js | Yes (for failure alerts) |
| `TELEGRAM_CHAT_ID` | sec-monitor.js | Yes |

---

## Git Commits (inner ryan_cole repo)

| Section | Commit | Description |
|---|---|---|
| 01 | `96c30da` | EDGAR RSS discovery + rate limiter |
| 02 | `f7fe44d` | Form 4 XML parser |
| 03 | `6522f1c` | Transaction classification + filterScorable |
| 04 | `47fcbf5` | Finnhub integration + NocoDB cache |
| 05 | `dda3f40` | Alpha Vantage earnings + sec-monitor rewrite |
