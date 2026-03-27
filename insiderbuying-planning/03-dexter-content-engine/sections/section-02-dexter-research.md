# Section 2: Dexter Research Agent (n8n Sub-Workflow)

## Context

Dexter is the "brain" that gathers everything Claude needs to write a high-quality article. It takes a ticker and returns structured financial data matching the 18 template variables in FINANCIAL-ARTICLE-SYSTEM-PROMPT.md.

Dexter runs as an n8n sub-workflow, called by W2 (Article Generation) via webhook. It fetches data from Financial Datasets API, caches results in NocoDB Financial_Cache, and returns aggregated JSON.

This section depends on Section 1 (NocoDB tables must exist, especially Financial_Cache).

## Implementation

### Workflow Design

**Trigger**: Webhook (called by W2 with `{ ticker, keyword, article_type, blog }`)

**Pipeline** (all data fetches run in parallel where possible):

### Step 1: Check Cache

Before any API call, query NocoDB Financial_Cache for each data type where `ticker = input.ticker AND expires_at > NOW()`. If found, use cached data. If not, proceed to API call.

### Step 2: Financial Datasets API Calls (parallel)

7 concurrent HTTP Request nodes:

1. **Income Statements**: GET `/api/v1/financial-statements/income-statements?ticker={TICKER}&period=quarterly&limit=4` + annual limit=3
2. **Balance Sheet**: GET `/api/v1/financial-statements/balance-sheets?ticker={TICKER}&period=quarterly&limit=1`
3. **Cash Flow**: GET `/api/v1/financial-statements/cash-flow-statements?ticker={TICKER}&period=quarterly&limit=4`
4. **Key Ratios**: GET `/api/v1/financial-ratios?ticker={TICKER}&period=quarterly&limit=12` (3Y)
5. **Insider Trades**: GET `/api/v1/insider-trades?ticker={TICKER}&limit=50` (filter last 90 days in code)
6. **Stock Prices**: GET `/api/v1/stock-prices?ticker={TICKER}&interval=day&limit=252` (1Y trading days)
7. **Competitors**: Use sector from income statement response -> query top 5 by market cap in same sector

Auth: `X-API-Key: <FINANCIAL_DATASETS_API_KEY>` header on all requests.

### Step 3: Web Search for News

HTTP Request node to Google Custom Search API (or SerpAPI):
- Query: `"{company_name}" OR "{ticker}" stock analysis news {current_month} {current_year}`
- Extract: top 5 results with title, snippet, date
- Purpose: recent news, analyst ratings, controversies

### Step 4: Earnings Call Transcripts

Financial Datasets API endpoint for transcripts (if available), or web search fallback:
- Query: `"{company_name}" earnings call transcript Q{quarter} {year}`
- Extract CEO/CFO quotes with surrounding context

### Step 5: Cache Write

For each data type fetched from API (not cache), upsert into NocoDB Financial_Cache:
- `ticker`, `data_type`, `data_json` (full response), `fetched_at = NOW()`, `expires_at = NOW() + 24h`

### Step 6: Aggregation (Code Node -- `dexter-research.js`)

Combine all data into the structured JSON matching FINANCIAL-ARTICLE-SYSTEM-PROMPT.md variables:

```javascript
// Function signature -- implementation in deep-implement
function aggregateDexterData(financialData, insiderTrades, stockPrices, competitorData, managementQuotes, newsResults) {
  // Returns: { company_name, ticker, sector, market_cap, financial_data, insider_trades, stock_prices, competitor_data, management_quotes, dexter_analysis }
}
```

#### Price Data Aggregation

Do NOT send raw 252-day OHLCV array to Claude. In `dexter-research.js`, compute and send only:
- 52-week high/low
- Current price
- 50-day and 200-day moving averages
- 1-month/6-month/1-year returns
- 30-day avg volume

This reduces input tokens by ~80% and improves Claude's focus.

#### Dexter Pre-Analysis via LLM

The `dexter_analysis` field is a pre-analysis summary:
- `key_findings[]`: 3-5 notable data points (e.g., "Revenue grew 34% YoY but 22 points came from a single contract")
- `risks[]`: 2-3 identified risks from the data
- `catalysts[]`: 2-3 potential catalysts

This pre-analysis helps Claude write more focused articles by highlighting what matters most in the data.

The `dexter_analysis` summary (key_findings, risks, catalysts) requires semantic understanding -- a Code node can't do this. Insert a lightweight LLM call (Claude Haiku or GPT-4o-mini) inside Dexter to process the aggregated financial JSON and extract the 3-5 key findings, 2-3 risks, and 2-3 catalysts. This costs ~$0.005 per article.

**Output**: Return aggregated JSON via webhook response to W2.

### Error Handling

- **Individual API failures**: log warning, continue with available data. Dexter returns partial data with a `data_completeness` score (0-1).
- **If `data_completeness < 0.5`** (e.g., no income statement and no prices), abort and set keyword status to 'skipped' with reason.
- **Rate limit errors**: exponential backoff (1s, 2s, 4s, max 3 retries).

### Code File

`n8n/code/insiderbuying/dexter-research.js` -- Dexter aggregation + cache logic

### Workflow JSON

`n8n/workflows/insiderbuying/dexter-research.json`

## Tests (TDD)

```
# Test: Cache check -- given cached AAPL income_stmt with expires_at > NOW(), Dexter skips API call and uses cache
# Test: Cache miss -- given expired cache entry, Dexter calls Financial Datasets API and writes fresh cache
# Test: Financial Datasets API -- income statements endpoint returns valid JSON for AAPL (real API call)
# Test: Financial Datasets API -- insider trades endpoint returns array of transactions for AAPL
# Test: Financial Datasets API -- 404 for invalid ticker "ZZZZZ" handled gracefully (not crash)
# Test: Price data aggregation -- given 252-day OHLCV array, output contains only: 52w_high, 52w_low, current_price, ma_50, ma_200, returns_1m/6m/1y, avg_volume_30d
# Test: Parallel fetch -- all 7 data types fetched concurrently (measure wall time < sequential time)
# Test: Dexter pre-analysis LLM call -- given aggregated financial JSON, returns key_findings (3-5), risks (2-3), catalysts (2-3)
# Test: Data completeness score -- missing income_stmt + prices = score < 0.5, triggers abort
# Test: Data completeness score -- all 7 types present = score 1.0
# Test: Cache upsert -- writing same (ticker, data_type) updates row, doesn't create duplicate
# Test: Webhook response -- returns complete JSON matching FINANCIAL-ARTICLE-SYSTEM-PROMPT.md variable structure
# Test: Rate limit handling -- simulated 429 response triggers retry with exponential backoff (1s, 2s, 4s)
```

### Test Implementation Notes

- **Cache check test**: Pre-populate Financial_Cache with a row for `(AAPL, income_stmt)` with `expires_at` 1 hour from now. Call Dexter. Verify no HTTP request was made to Financial Datasets API for income_stmt (mock or intercept).
- **Cache miss test**: Set `expires_at` to 1 hour ago for the cached row. Call Dexter. Verify the API was called AND the cache row was updated with fresh `expires_at`.
- **Real API tests**: Use AAPL as test ticker (high liquidity, always has data). Verify response JSON has expected top-level fields.
- **Invalid ticker test**: Call with ticker "ZZZZZ". Verify Dexter returns gracefully with `data_completeness < 0.5` and does not throw.
- **Price aggregation test**: Create a mock 252-element OHLCV array with known values. Run the aggregation function. Assert output has exactly the 9 summary fields (52w_high, 52w_low, current_price, ma_50, ma_200, return_1m, return_6m, return_1y, avg_volume_30d) and no raw daily data.
- **Parallel fetch test**: Time Dexter execution. All 7 API calls should complete in roughly the time of the slowest single call, not 7x sequential time.
- **LLM pre-analysis test**: Provide a known financial JSON blob. Verify the LLM returns `key_findings` (array, 3-5 items), `risks` (array, 2-3 items), `catalysts` (array, 2-3 items). Each item should be a string.
- **Data completeness test**: Mock responses where income_stmt and prices both return null/error. Verify `data_completeness` < 0.5. Mock all 7 returning valid data. Verify score = 1.0.
- **Rate limit test**: Mock Financial Datasets API to return 429 on first call, 200 on retry. Verify the retry happened with 1s delay, and the final result is valid.

## Acceptance Criteria

1. Dexter webhook accepts `{ ticker, keyword, article_type, blog }` and returns aggregated financial JSON
2. Cache check works: cached data with valid `expires_at` is reused without API call
3. Cache miss works: expired data triggers fresh API call and cache update
4. All 7 Financial Datasets API endpoints are called in parallel
5. Price data is aggregated to 9 summary fields (not raw 252-day array)
6. LLM pre-analysis produces `key_findings`, `risks`, `catalysts` from the aggregated data
7. `data_completeness` score is computed correctly (0-1 range)
8. If `data_completeness < 0.5`, Dexter aborts and returns error status
9. Rate limit 429 responses trigger exponential backoff retry (1s, 2s, 4s, max 3 retries)
10. Invalid tickers are handled gracefully without crashes
11. Webhook response JSON matches the variable structure expected by FINANCIAL-ARTICLE-SYSTEM-PROMPT.md
12. All 13 test stubs pass
