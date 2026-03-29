# Research: 12-scoring-analysis

## Part A: Codebase Research

### Project Overview

**InsiderBuying.ai** is an automated finance blog + SaaS alert system:
- Monitors SEC Form 4 insider trading filings
- Generates AI-powered analysis articles
- Delivers real-time alerts to subscribers
- Runs 12 content categories via n8n workflows

### Relevant Code Files

```
ryan_cole/insiderbuying-site/n8n/
  code/insiderbuying/
    score-alert.js          (~400 lines) — current AI-only scoring via Claude Haiku
    analyze-alert.js        (~250 lines) — current generic 2-3 paragraph analysis via Claude Sonnet
    sec-monitor.js          (~500 lines) — SEC EDGAR polling, Form 4 detection, enrichment, cluster detection
    deliver-alert.js        — writes to Supabase + Airtable, sends Telegram, triggers downstream
    write-persistence.js    — stores analysis to Airtable + Supabase for track record lookups
    25 total JS files
  workflows/insiderbuying/
    w4-market.json          — SEC alert pipeline (every 15min during market hours)
    w4-afterhours.json      — after-hours alert pipeline
  tests/
    25 test files, 515 tests passing (Jest)
```

### Current score-alert.js Architecture

- 100% delegated to Claude Haiku — no deterministic formula
- Yahoo Finance used for 30-day price returns
- Supabase track record lookup
- Score: 1-10 integer
- No market cap context, no 10b5-1 cap, no gift/tax exclusion, no calibration

### Current analyze-alert.js Architecture

- Claude Sonnet generates 2-3 paragraph generic analysis
- No score-based word targets
- No Hook/Context/What-to-Watch structure
- No current price injection, no earnings date, no portfolio %
- No banned phrase validation

### sec-monitor.js Data Flow

- Polls `efts.sec.gov` for Form 4 filings
- Enriches via Financial Datasets API (to be replaced by Finnhub)
- Detects cluster buys (3+ insiders within 7 days)
- Deduplicates, filters buy-only
- Passes enriched filing data to score-alert.js

### Testing Setup

- **Framework**: Jest (Node.js test environment)
- **Pattern**: `npm test` runs all `**/tests/**/*.test.js`
- **Coverage**: 515 passing tests
- **Style**: Pure function unit tests + mocked API calls
- **Dependency injection**: fetchFn, sleep, env passed as parameters for testability

### Code Style

- Pure functions (no side effects, deterministic)
- Inline HTTP clients (require('https')) — no axios/fetch
- String templates with `{{variable}}` interpolation for prompts
- Entirely functional imperative style (no classes/OOP)
- n8n Code Node sandbox: no global fetch, no global URL

### Key Reference Documents

#### WORKFLOW-CHANGES.md — CAT 9 Gaps (Scoring)
- 9.1: No deterministic formula (100% AI)
- 9.2: No market cap context
- 9.3: No 10b5-1 hard cap
- 9.4: No gift/tax exclusions
- 9.5: No weekly calibration
- 9.6: Incomplete cluster detection
- 9.7: No "days since last buy"
- 9.8: No option exercise held vs sold detection

#### WORKFLOW-CHANGES.md — CAT 10 Gaps (Analysis)
- 10.1: No word count per score
- 10.2: Structure mismatch (no Hook/Context/What-to-Watch)
- 10.3: "What to Watch" section missing
- 10.4: Current price missing
- 10.5: % portfolio missing
- 10.6: Days-to-earnings missing
- 10.7: Weak validation
- 10.8: 300-word max missing
- 10.9: No banned phrases check
- 10.10: No cautionary language check

#### PROMPT-WORKFLOW-FRAMEWORK.md — Scoring Formula
- Deterministic: 30% value, 25% role, 20% market cap, 15% cluster, 5% track record, 5% timing
- Base 5, adjusted per factor, clamped 1-10
- 10b5-1 hard cap at 5
- Gifts/tax excluded
- DeepSeek refinement (-1/0/+1 only)
- Weekly calibration alert

#### PROMPT-WORKFLOW-FRAMEWORK.md — Analysis Structure
- Score-based word targets: 9-10=200-250, 7-8=150-200, 4-5=100-150
- Hook/Context/What-to-Watch 3-part structure
- Current price lookup via Finnhub
- Days-to-earnings via Alpha Vantage cache
- Banned phrase validation

### Dependency Graph (Unit 12 Position)

```
08-nocodb-migration → 09-data-pipeline → 10-ai-provider-swap → 11-visual-engine
                                                                       ↓
                                                              12-scoring-analysis (THIS)
```

Dependencies:
- NocoDB must be migrated (unit 08) — score-alert.js currently uses Airtable
- SEC EDGAR parser + Finnhub must exist (unit 09) — market cap, earnings data
- DeepSeek must be integrated (unit 10) — AI refinement layer
- Prior units provide: edgar-parser.js, Finnhub client, DeepSeek client, NocoDB client

### External Services

| Service | Purpose | Current | Planned |
|---------|---------|---------|---------|
| Claude Haiku | Scoring | Active | Replace with deterministic + DeepSeek |
| Claude Sonnet | Analysis text | Active | Replace with DeepSeek for analysis |
| Yahoo Finance | 30-day returns | Active | Replace with Finnhub |
| Airtable | Alert storage | Active | Migrate to NocoDB (unit 08) |
| Finnhub | Quotes, insider data | Not yet | Integrate (unit 09) |
| Alpha Vantage | Earnings calendar | Not yet | Integrate (unit 09) |
| DeepSeek V3.2 | AI refinement + analysis | Not yet | Integrate (unit 10) |
| Telegram | Admin alerts | Active | Keep |

---

## Part B: Web Research

### Topic 1: SEC Insider Trading Scoring Formulas

#### Professional Scoring Services

**Quiver Quantitative** — logistic regression model with 10 factors (1-10 conviction score):
- Trade Value (log of purchase amount)
- Consensus (net insiders buying minus selling over 90 days)
- Historical Track Record (insider's past timing accuracy)
- Trading Frequency (frequent traders score lower)
- Holdings Ratio (% increase in insider's position)
- Insider Level (CEO/CFO > C-suite > Directors > 10% shareholders)
- Momentum (6-month price trend, sector-adjusted; negative momentum = more informative)
- Price-to-Book (value stocks score higher)
- Company Size (smaller companies = better signal)
- Sector (information asymmetry varies)

Strategy selects scores 9-10 within prior 60 days, with time-decay weighting (>30 days old = 50% weight).

**InsiderScore (VerityData)** — behavioral flags approach:
- Cluster buying detection
- Buy/sell inflections vs. 90-day baseline
- Cessation of selling (sudden stop after steady selling)
- Trading into strength vs. weakness context
- 10b5-1 plan valuation signaling
- 18 years of cleaned Form 4 data

**Finnhub MSPR** — Monthly Share Purchase Ratio (-100 to +100):
- Per-stock per-month aggregate signal
- Values near 100 = insider buying dominance
- Predictive for 30-90 day price changes

#### Factors Ranked by Consensus

1. Transaction type — only open market purchases ("P" code) matter
2. Cluster buying — 2.1% monthly abnormal returns (academic study 1986-2014)
3. Transaction value relative to compensation
4. Insider role hierarchy: CEO/CFO > C-suite > Directors > 10% shareholders
5. Holdings ratio (% increase in position)
6. Market cap context (small-cap more reliable)
7. Historical track record

#### Expected Score Distribution

- ~70-80% of trades should score low (1-4)
- ~15-20% medium (5-7)
- ~5-10% high conviction (8-10)
- Buy/sell ratio across all US insiders: ~0.29-0.34 (far more selling)

#### Best Practice: Deterministic + AI

- Deterministic base: ~85-90% of final score
- AI refinement: constrained to small adjustments only (+/-1)
- AI only for qualitative context (first buy in 15 years, post-earnings dip, quiet period)

### Topic 2: DeepSeek API Structured JSON Output

#### Three Approaches (ranked by reliability)

1. **Strict Function Calling (Beta)** — most reliable
   - `base_url="https://api.deepseek.com/beta"` with `"strict": true`
   - All properties must be `required`, `additionalProperties: false`
   - Supports enum constraints (perfect for -1/0/+1)
   - Up to 128 functions per call

2. **JSON Mode** — simpler but less structured
   - `response_format: {'type': 'json_object'}`
   - Must include "json" in prompt + example
   - Known issue: occasionally returns empty content

3. **Instructor Library (Python)** — best DX
   - Pydantic models, auto-validation, retry

#### Temperature Settings

- Scoring refinement: 0.0-0.1 (deterministic)
- Analysis text: 0.3-0.5 (balanced creativity)
- Note: even temp=0 not perfectly deterministic due to GPU non-determinism

#### Cost

- Input: $0.14/M tokens (cache hit $0.028/M)
- Output: $0.28/M tokens
- Per-alert adjustment: ~$0.00007
- 50 alerts/day = ~$0.10/month

### Topic 3: Finnhub + Alpha Vantage API

#### Finnhub

- **Quote**: `GET /api/v1/quote?symbol=X` — price, change, % change
- **Rate limits**: Free tier 60 calls/min, 30 calls/sec hard cap
- **No batch endpoint**: Each symbol = separate call
- **Insider transactions**: `/api/v1/stock/insider-transactions?symbol=X` (100 per call)
- **Insider sentiment**: `/api/v1/stock/insider-sentiment?symbol=X` (monthly MSPR)
- **Caching**: Quotes 60s during market, 24h after close. Transactions 1h. Company profile 7d.

#### Alpha Vantage

- **Earnings calendar**: `EARNINGS_CALENDAR` function, CSV output
- **Rate limits**: Free tier 25 requests/day, 5/minute
- **Strategy**: Fetch full 3-month calendar once daily, store in NocoDB, query locally (zero API calls per alert)

#### Data Injection Pattern

1. On new Form 4: fetch Finnhub quote (1 API call)
2. Compute: current price vs. transaction price, % from 52-week high/low
3. Check earnings from cached Alpha Vantage data (0 API calls)
4. Inject into alert template
5. Total cost: $0/month on free tiers

### Topic 4: NocoDB API for Calibration

#### Querying

- **Filter syntax**: `(score,gt,80)~and(created_at,gt,2026-03-01)`
- **Date filters**: `isWithin` with `pastWeek`, `pastMonth`, `pastNumberOfDays`
- **Rate limit**: 5 requests/sec per user
- **Pagination**: `limit` (default 10, set to 1000 for batch reads), `offset`

#### Weekly Calibration Pattern

1. Store every scored alert: `alert_id, ticker, score, ai_adjustment, final_score, created_at`
2. Weekly query: `(created_at,isWithin,pastWeek)` with limit=1000
3. Client-side bucketing: [1-3, 4-5, 6-7, 8-10]
4. Compare to target: 8+ = 10-20%, 6-7 = 30-40%, 4-5 = 30-40%, 1-3 = 10-20%
5. If drift detected: Telegram alert

#### Distribution Drift Detection — PSI (Population Stability Index)

| PSI Value | Interpretation | Action |
|-----------|---------------|--------|
| < 0.10 | No significant change | Continue |
| 0.10 - 0.25 | Moderate shift | Investigate |
| > 0.25 | Significant shift | Halt and recalibrate |

Formula: `PSI = SUM( (actual% - expected%) * ln(actual% / expected%) )`

#### Best Practices

- Immutable alert records (never update scored alerts)
- Separate tables: `alerts`, `calibration_runs`, `score_adjustments`
- DateTime format: ISO 8601 (`2026-03-28T00:00:00.000Z`)
- NocoDB pagination: always set explicit limit (default is 10)

---

## Sources

- [Quiver Quantitative Corporate Insider Model](https://quiverquant.medium.com/quiver-quants-corporate-insider-model-752382b9dfd)
- [VerityData / InsiderScore](https://verityplatform.com/solution/veritydata/insiderscore/)
- [StableBread: Track and Evaluate Insider Trading](https://stablebread.com/insider-trading/)
- [2iQ Research: Profiting From Insider Transactions (Academic)](https://www.2iqresearch.com/blog/profiting-from-insider-transactions-a-review-of-the-academic-research)
- [Finnhub Insider Sentiment (MSPR)](https://medium.com/@stock-api/finnhub-insiders-sentiment-analysis-cc43f9f64b3a)
- [Finnhub API Rate Limits](https://finnhub.io/docs/api/rate-limit)
- [DeepSeek Function Calling](https://api-docs.deepseek.com/guides/function_calling)
- [DeepSeek JSON Mode](https://api-docs.deepseek.com/guides/json_mode)
- [DeepSeek Pricing](https://api-docs.deepseek.com/quick_start/pricing)
- [Alpha Vantage Earnings Calendar](https://www.macroption.com/alpha-vantage-earnings-calendar/)
- [Alpha Vantage Rate Limits](https://www.macroption.com/alpha-vantage-api-limits/)
- [NocoDB REST API](https://nocodb.com/docs/product-docs/developer-resources/rest-apis)
- [PSI Distribution Monitoring](https://arize.com/blog-course/population-stability-index-psi/)
- [GuruFocus Insider Buy/Sell Ratio](https://www.gurufocus.com/economic_indicators/4359/insider-buysell-ratio-usa-overall-market)
