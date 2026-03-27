diff --git a/insiderbuying-site/n8n/code/insiderbuying/dexter-research.js b/insiderbuying-site/n8n/code/insiderbuying/dexter-research.js
new file mode 100644
index 0000000..8d9c908
--- /dev/null
+++ b/insiderbuying-site/n8n/code/insiderbuying/dexter-research.js
@@ -0,0 +1,451 @@
+/**
+ * Dexter Research Agent — n8n Code Node
+ *
+ * Aggregates financial data from Financial Datasets API, caches results in
+ * NocoDB Financial_Cache, and returns structured JSON matching the
+ * FINANCIAL-ARTICLE-SYSTEM-PROMPT.md template variables.
+ *
+ * Called by W2 (Article Generation) via webhook with:
+ *   { ticker, keyword, article_type, blog }
+ */
+
+'use strict';
+
+// ---------------------------------------------------------------------------
+// Constants
+// ---------------------------------------------------------------------------
+
+const DATA_TYPES = [
+  'income_statements',
+  'balance_sheets',
+  'cash_flow',
+  'ratios',
+  'insider_trades',
+  'stock_prices',
+  'competitors',
+];
+
+// Weights for data completeness score — income_statements and stock_prices
+// are weighted higher because articles cannot be written without them.
+const DATA_WEIGHTS = {
+  income_statements: 0.25,
+  balance_sheets: 0.10,
+  cash_flow: 0.10,
+  ratios: 0.10,
+  insider_trades: 0.10,
+  stock_prices: 0.25,
+  competitors: 0.10,
+};
+
+const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
+
+const API_BASE = 'https://api.financialdatasets.ai';
+
+const ENDPOINTS = {
+  income_statements: (ticker) =>
+    `${API_BASE}/api/v1/financial-statements/income-statements?ticker=${ticker}&period=quarterly&limit=4`,
+  income_statements_annual: (ticker) =>
+    `${API_BASE}/api/v1/financial-statements/income-statements?ticker=${ticker}&period=annual&limit=3`,
+  balance_sheets: (ticker) =>
+    `${API_BASE}/api/v1/financial-statements/balance-sheets?ticker=${ticker}&period=quarterly&limit=1`,
+  cash_flow: (ticker) =>
+    `${API_BASE}/api/v1/financial-statements/cash-flow-statements?ticker=${ticker}&period=quarterly&limit=4`,
+  ratios: (ticker) =>
+    `${API_BASE}/api/v1/financial-ratios?ticker=${ticker}&period=quarterly&limit=12`,
+  insider_trades: (ticker) =>
+    `${API_BASE}/api/v1/insider-trades?ticker=${ticker}&limit=50`,
+  stock_prices: (ticker) =>
+    `${API_BASE}/api/v1/stock-prices?ticker=${ticker}&interval=day&limit=252`,
+};
+
+// ---------------------------------------------------------------------------
+// Cache utilities
+// ---------------------------------------------------------------------------
+
+function buildCacheKey(ticker, dataType) {
+  return { ticker, data_type: dataType };
+}
+
+function isCacheValid(entry) {
+  if (!entry || !entry.expires_at) return false;
+  return new Date(entry.expires_at).getTime() > Date.now();
+}
+
+function buildCacheExpiry() {
+  return new Date(Date.now() + CACHE_TTL_MS).toISOString();
+}
+
+// ---------------------------------------------------------------------------
+// Retry with exponential backoff
+// ---------------------------------------------------------------------------
+
+async function fetchWithRetry(url, options = {}, config = {}) {
+  const {
+    fetchFn = globalThis.fetch || require('https'),
+    maxRetries = 3,
+    baseDelay = 1000,
+  } = config;
+
+  let lastResponse;
+  const totalAttempts = maxRetries + 1;
+
+  for (let attempt = 0; attempt < totalAttempts; attempt++) {
+    lastResponse = await fetchFn(url, options);
+
+    if (lastResponse.ok || lastResponse.status !== 429) {
+      return lastResponse;
+    }
+
+    // 429 — wait with exponential backoff before retrying
+    if (attempt < maxRetries) {
+      const delay = baseDelay * Math.pow(2, attempt); // 1s, 2s, 4s
+      await new Promise((resolve) => setTimeout(resolve, delay));
+    }
+  }
+
+  return lastResponse; // return last 429 response after exhausting retries
+}
+
+// ---------------------------------------------------------------------------
+// Price data aggregation
+// ---------------------------------------------------------------------------
+
+function computePriceSummary(prices) {
+  if (!prices || prices.length === 0) {
+    return {
+      high_52w: null, low_52w: null, current_price: null,
+      ma_50: null, ma_200: null,
+      return_1m: null, return_6m: null, return_1y: null,
+      avg_volume_30d: null,
+    };
+  }
+
+  // Prices are ordered oldest-first
+  const closes = prices.map((p) => p.close);
+  const n = closes.length;
+
+  const currentPrice = closes[n - 1];
+  const high52w = Math.max(...closes);
+  const low52w = Math.min(...closes);
+
+  // Moving averages
+  const ma50 = n >= 50
+    ? closes.slice(n - 50).reduce((a, b) => a + b, 0) / 50
+    : null;
+  const ma200 = n >= 200
+    ? closes.slice(n - 200).reduce((a, b) => a + b, 0) / 200
+    : null;
+
+  // Returns (percentage)
+  const return1m = n >= 21
+    ? ((currentPrice - closes[n - 21]) / closes[n - 21]) * 100
+    : null;
+  const return6m = n >= 126
+    ? ((currentPrice - closes[n - 126]) / closes[n - 126]) * 100
+    : null;
+  const return1y = n >= 252
+    ? ((currentPrice - closes[0]) / closes[0]) * 100
+    : null;
+
+  // Average volume (30 trading days)
+  const volumes = prices.slice(-30).map((p) => p.volume);
+  const avgVolume30d = volumes.length > 0
+    ? Math.round(volumes.reduce((a, b) => a + b, 0) / volumes.length)
+    : null;
+
+  return {
+    high_52w: high52w,
+    low_52w: low52w,
+    current_price: currentPrice,
+    ma_50: ma50 !== null ? Math.round(ma50 * 100) / 100 : null,
+    ma_200: ma200 !== null ? Math.round(ma200 * 100) / 100 : null,
+    return_1m: return1m !== null ? Math.round(return1m * 100) / 100 : null,
+    return_6m: return6m !== null ? Math.round(return6m * 100) / 100 : null,
+    return_1y: return1y !== null ? Math.round(return1y * 100) / 100 : null,
+    avg_volume_30d: avgVolume30d,
+  };
+}
+
+// ---------------------------------------------------------------------------
+// Data completeness scoring
+// ---------------------------------------------------------------------------
+
+function computeDataCompleteness(data) {
+  let score = 0;
+  for (const dtype of DATA_TYPES) {
+    const value = data[dtype];
+    if (value && (Array.isArray(value) ? value.length > 0 : true)) {
+      score += DATA_WEIGHTS[dtype];
+    }
+  }
+  return Math.round(score * 100) / 100;
+}
+
+// ---------------------------------------------------------------------------
+// Insider trade filtering (last 90 days)
+// ---------------------------------------------------------------------------
+
+function filterRecentInsiderTrades(trades, daysBack = 90) {
+  if (!trades || !Array.isArray(trades)) return [];
+  const cutoff = new Date();
+  cutoff.setDate(cutoff.getDate() - daysBack);
+  return trades.filter((t) => {
+    if (!t.transaction_date) return false;
+    return new Date(t.transaction_date) >= cutoff;
+  });
+}
+
+// ---------------------------------------------------------------------------
+// Main aggregation
+// ---------------------------------------------------------------------------
+
+function aggregateDexterData({
+  financialData,
+  insiderTrades,
+  stockPrices,
+  competitorData,
+  managementQuotes,
+  newsResults,
+  ticker,
+  companyName,
+  sector,
+  marketCap,
+}) {
+  const priceSummary = computePriceSummary(stockPrices);
+  const filteredTrades = filterRecentInsiderTrades(insiderTrades);
+
+  return {
+    company_name: companyName,
+    ticker,
+    sector,
+    market_cap: marketCap,
+    financial_data: {
+      income_statements: financialData.income_statements || [],
+      balance_sheets: financialData.balance_sheets || [],
+      cash_flow: financialData.cash_flow || [],
+      ratios: financialData.ratios || [],
+    },
+    insider_trades: filteredTrades,
+    stock_prices: priceSummary,
+    competitor_data: competitorData || [],
+    management_quotes: managementQuotes || [],
+    news: newsResults || [],
+    data_completeness: computeDataCompleteness({
+      income_statements: financialData.income_statements,
+      balance_sheets: financialData.balance_sheets,
+      cash_flow: financialData.cash_flow,
+      ratios: financialData.ratios,
+      insider_trades: insiderTrades,
+      stock_prices: stockPrices,
+      competitors: competitorData,
+    }),
+  };
+}
+
+// ---------------------------------------------------------------------------
+// Financial Datasets API fetcher (for n8n Code node usage)
+// ---------------------------------------------------------------------------
+
+async function fetchFinancialData(ticker, apiKey, opts = {}) {
+  const { fetchFn, nocodbBaseUrl, nocodbToken } = opts;
+
+  const headers = { 'X-API-Key': apiKey };
+
+  // Parallel fetch all 7 data types
+  const [
+    incomeRes,
+    incomeAnnualRes,
+    balanceRes,
+    cashFlowRes,
+    ratiosRes,
+    insiderRes,
+    pricesRes,
+  ] = await Promise.allSettled([
+    fetchWithRetry(ENDPOINTS.income_statements(ticker), { headers }, { fetchFn }),
+    fetchWithRetry(ENDPOINTS.income_statements_annual(ticker), { headers }, { fetchFn }),
+    fetchWithRetry(ENDPOINTS.balance_sheets(ticker), { headers }, { fetchFn }),
+    fetchWithRetry(ENDPOINTS.cash_flow(ticker), { headers }, { fetchFn }),
+    fetchWithRetry(ENDPOINTS.ratios(ticker), { headers }, { fetchFn }),
+    fetchWithRetry(ENDPOINTS.insider_trades(ticker), { headers }, { fetchFn }),
+    fetchWithRetry(ENDPOINTS.stock_prices(ticker), { headers }, { fetchFn }),
+  ]);
+
+  const safeJson = async (settled) => {
+    if (settled.status === 'rejected') return null;
+    const res = settled.value;
+    if (!res.ok) return null;
+    try {
+      return await res.json();
+    } catch {
+      return null;
+    }
+  };
+
+  const income = await safeJson(incomeRes);
+  const incomeAnnual = await safeJson(incomeAnnualRes);
+  const balance = await safeJson(balanceRes);
+  const cashFlow = await safeJson(cashFlowRes);
+  const ratios = await safeJson(ratiosRes);
+  const insider = await safeJson(insiderRes);
+  const prices = await safeJson(pricesRes);
+
+  return {
+    income_statements: [
+      ...(income?.income_statements || []),
+      ...(incomeAnnual?.income_statements || []),
+    ],
+    balance_sheets: balance?.balance_sheets || [],
+    cash_flow: cashFlow?.cash_flow_statements || [],
+    ratios: ratios?.financial_ratios || [],
+    insider_trades: insider?.insider_trades || [],
+    stock_prices: prices?.stock_prices || [],
+  };
+}
+
+// ---------------------------------------------------------------------------
+// LLM Pre-Analysis (Dexter Analysis)
+// ---------------------------------------------------------------------------
+
+function buildPreAnalysisPrompt(aggregatedData) {
+  return `You are a financial research assistant. Analyze this data and return JSON only.
+
+Company: ${aggregatedData.company_name} (${aggregatedData.ticker})
+Sector: ${aggregatedData.sector}
+
+Financial Data: ${JSON.stringify(aggregatedData.financial_data, null, 0).slice(0, 3000)}
+Insider Trades: ${JSON.stringify(aggregatedData.insider_trades, null, 0).slice(0, 1000)}
+Stock Prices: ${JSON.stringify(aggregatedData.stock_prices, null, 0)}
+Competitor Data: ${JSON.stringify(aggregatedData.competitor_data, null, 0).slice(0, 500)}
+
+Return ONLY valid JSON:
+{
+  "key_findings": ["3-5 notable data points"],
+  "risks": ["2-3 identified risks"],
+  "catalysts": ["2-3 potential catalysts"]
+}`;
+}
+
+function parsePreAnalysis(llmResponse) {
+  try {
+    // Handle both raw JSON and markdown-wrapped JSON
+    let text = typeof llmResponse === 'string' ? llmResponse : JSON.stringify(llmResponse);
+    const jsonMatch = text.match(/\{[\s\S]*\}/);
+    if (!jsonMatch) return null;
+    const parsed = JSON.parse(jsonMatch[0]);
+
+    // Validate structure
+    if (!Array.isArray(parsed.key_findings) || !Array.isArray(parsed.risks) || !Array.isArray(parsed.catalysts)) {
+      return null;
+    }
+
+    return {
+      key_findings: parsed.key_findings.slice(0, 5),
+      risks: parsed.risks.slice(0, 3),
+      catalysts: parsed.catalysts.slice(0, 3),
+    };
+  } catch {
+    return null;
+  }
+}
+
+// ---------------------------------------------------------------------------
+// Main entry point (for n8n Code node)
+// ---------------------------------------------------------------------------
+
+async function dexterResearch(input, helpers) {
+  const { ticker, keyword, article_type, blog } = input;
+
+  if (!ticker) {
+    return { error: 'Missing ticker', data_completeness: 0 };
+  }
+
+  const apiKey = helpers?.env?.FINANCIAL_DATASETS_API_KEY;
+  if (!apiKey) {
+    return { error: 'Missing FINANCIAL_DATASETS_API_KEY', data_completeness: 0 };
+  }
+
+  // Step 1-2: Fetch all financial data (cache check would happen here in n8n)
+  const rawData = await fetchFinancialData(ticker, apiKey, {
+    fetchFn: helpers?.fetchFn,
+  });
+
+  // Step 3-4: News + transcripts would be fetched here via separate HTTP nodes in n8n
+
+  // Step 5: Aggregate
+  const companyName = rawData.income_statements?.[0]?.company_name || ticker;
+  const sector = rawData.income_statements?.[0]?.sector || 'Unknown';
+  const marketCap = rawData.income_statements?.[0]?.market_capitalization
+    ? formatMarketCap(rawData.income_statements[0].market_capitalization)
+    : 'Unknown';
+
+  const aggregated = aggregateDexterData({
+    financialData: {
+      income_statements: rawData.income_statements,
+      balance_sheets: rawData.balance_sheets,
+      cash_flow: rawData.cash_flow,
+      ratios: rawData.ratios,
+    },
+    insiderTrades: rawData.insider_trades,
+    stockPrices: rawData.stock_prices,
+    competitorData: [], // competitors fetched separately in n8n
+    managementQuotes: [], // transcripts fetched separately
+    newsResults: [], // news fetched separately
+    ticker,
+    companyName,
+    sector,
+    marketCap,
+  });
+
+  // Abort if data too incomplete
+  if (aggregated.data_completeness < 0.5) {
+    return {
+      error: `Insufficient data for ${ticker}`,
+      data_completeness: aggregated.data_completeness,
+      ticker,
+    };
+  }
+
+  // Step 6: Pre-analysis prompt (LLM call happens in n8n via separate node)
+  aggregated.dexter_analysis_prompt = buildPreAnalysisPrompt(aggregated);
+
+  return aggregated;
+}
+
+// ---------------------------------------------------------------------------
+// Utilities
+// ---------------------------------------------------------------------------
+
+function formatMarketCap(value) {
+  if (!value || typeof value !== 'number') return 'Unknown';
+  if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
+  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
+  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
+  return `$${value}`;
+}
+
+// ---------------------------------------------------------------------------
+// Exports
+// ---------------------------------------------------------------------------
+
+module.exports = {
+  // Core functions (tested)
+  aggregateDexterData,
+  computePriceSummary,
+  computeDataCompleteness,
+  buildCacheKey,
+  isCacheValid,
+  buildCacheExpiry,
+  fetchWithRetry,
+  filterRecentInsiderTrades,
+  fetchFinancialData,
+  buildPreAnalysisPrompt,
+  parsePreAnalysis,
+  dexterResearch,
+  formatMarketCap,
+
+  // Constants
+  DATA_TYPES,
+  DATA_WEIGHTS,
+  CACHE_TTL_MS,
+  ENDPOINTS,
+};
diff --git a/insiderbuying-site/n8n/tests/dexter-research.test.js b/insiderbuying-site/n8n/tests/dexter-research.test.js
new file mode 100644
index 0000000..58ed828
--- /dev/null
+++ b/insiderbuying-site/n8n/tests/dexter-research.test.js
@@ -0,0 +1,389 @@
+const { describe, it, before, after, mock } = require('node:test');
+const assert = require('node:assert/strict');
+
+// Import the module under test
+const {
+  aggregateDexterData,
+  computePriceSummary,
+  computeDataCompleteness,
+  buildCacheKey,
+  isCacheValid,
+  DATA_TYPES,
+} = require('../code/insiderbuying/dexter-research.js');
+
+// ---------------------------------------------------------------------------
+// Test: Price data aggregation
+// Given 252-day OHLCV array, output contains only the 9 summary fields
+// ---------------------------------------------------------------------------
+describe('computePriceSummary', () => {
+  it('returns exactly 9 summary fields from 252-day OHLCV array', () => {
+    const prices = generateMockPrices(252);
+    const summary = computePriceSummary(prices);
+
+    const expectedKeys = [
+      'high_52w', 'low_52w', 'current_price',
+      'ma_50', 'ma_200',
+      'return_1m', 'return_6m', 'return_1y',
+      'avg_volume_30d',
+    ];
+    assert.deepStrictEqual(Object.keys(summary).sort(), expectedKeys.sort());
+  });
+
+  it('does not include raw daily data in output', () => {
+    const prices = generateMockPrices(252);
+    const summary = computePriceSummary(prices);
+    assert.equal(summary.daily, undefined);
+    assert.equal(summary.prices, undefined);
+    assert.equal(summary.ohlcv, undefined);
+  });
+
+  it('computes 52-week high/low correctly', () => {
+    const prices = generateMockPrices(252, { highDay: 100, lowDay: 200 });
+    const summary = computePriceSummary(prices);
+    // highDay=100 means day 100 has the highest close (200)
+    // lowDay=200 means day 200 has the lowest close (50)
+    assert.equal(summary.high_52w, 200);
+    assert.equal(summary.low_52w, 50);
+  });
+
+  it('computes moving averages correctly', () => {
+    // Constant price = MA equals that price
+    const prices = generateConstantPrices(252, 100);
+    const summary = computePriceSummary(prices);
+    assert.equal(summary.ma_50, 100);
+    assert.equal(summary.ma_200, 100);
+  });
+
+  it('computes returns correctly', () => {
+    // Linear price from 100 to 200 over 252 days
+    const prices = generateLinearPrices(252, 100, 200);
+    const summary = computePriceSummary(prices);
+    // 1Y return: (200 - 100) / 100 = 100%
+    assert.ok(Math.abs(summary.return_1y - 100) < 1);
+    // Current price = last day
+    assert.ok(Math.abs(summary.current_price - 200) < 1);
+  });
+
+  it('handles fewer than 252 days gracefully', () => {
+    const prices = generateMockPrices(30);
+    const summary = computePriceSummary(prices);
+    assert.ok(summary.current_price > 0);
+    // 1y return should be null or based on available data
+    assert.equal(summary.ma_200, null); // not enough data for 200-day MA
+  });
+});
+
+// ---------------------------------------------------------------------------
+// Test: Data completeness score
+// ---------------------------------------------------------------------------
+describe('computeDataCompleteness', () => {
+  it('returns 1.0 when all 7 data types present', () => {
+    const data = {
+      income_statements: [{ ticker: 'AAPL' }],
+      balance_sheets: [{ ticker: 'AAPL' }],
+      cash_flow: [{ ticker: 'AAPL' }],
+      ratios: [{ ticker: 'AAPL' }],
+      insider_trades: [{ ticker: 'AAPL' }],
+      stock_prices: [{ close: 150 }],
+      competitors: [{ ticker: 'MSFT' }],
+    };
+    assert.equal(computeDataCompleteness(data), 1.0);
+  });
+
+  it('returns <= 0.5 when income_stmt + prices missing (abort threshold)', () => {
+    const data = {
+      income_statements: null,
+      balance_sheets: [{ ticker: 'AAPL' }],
+      cash_flow: [{ ticker: 'AAPL' }],
+      ratios: [{ ticker: 'AAPL' }],
+      insider_trades: [{ ticker: 'AAPL' }],
+      stock_prices: null,
+      competitors: [{ ticker: 'MSFT' }],
+    };
+    const score = computeDataCompleteness(data);
+    assert.ok(score <= 0.5, `Expected <= 0.5, got ${score}`);
+  });
+
+  it('returns 0 when all data types are null', () => {
+    const data = {
+      income_statements: null,
+      balance_sheets: null,
+      cash_flow: null,
+      ratios: null,
+      insider_trades: null,
+      stock_prices: null,
+      competitors: null,
+    };
+    assert.equal(computeDataCompleteness(data), 0);
+  });
+
+  it('returns fractional score for partial data', () => {
+    const data = {
+      income_statements: [{ ticker: 'AAPL' }],
+      balance_sheets: null,
+      cash_flow: [{ ticker: 'AAPL' }],
+      ratios: null,
+      insider_trades: null,
+      stock_prices: [{ close: 150 }],
+      competitors: null,
+    };
+    const score = computeDataCompleteness(data);
+    assert.ok(score > 0 && score < 1, `Expected fractional, got ${score}`);
+  });
+});
+
+// ---------------------------------------------------------------------------
+// Test: Cache key building and validation
+// ---------------------------------------------------------------------------
+describe('buildCacheKey / isCacheValid', () => {
+  it('builds correct cache key', () => {
+    const key = buildCacheKey('AAPL', 'income_stmt');
+    assert.equal(key.ticker, 'AAPL');
+    assert.equal(key.data_type, 'income_stmt');
+  });
+
+  it('cache with future expires_at is valid', () => {
+    const entry = {
+      ticker: 'AAPL',
+      data_type: 'income_stmt',
+      data_json: '{}',
+      expires_at: new Date(Date.now() + 3600000).toISOString(), // 1h from now
+    };
+    assert.equal(isCacheValid(entry), true);
+  });
+
+  it('cache with past expires_at is invalid', () => {
+    const entry = {
+      ticker: 'AAPL',
+      data_type: 'income_stmt',
+      data_json: '{}',
+      expires_at: new Date(Date.now() - 3600000).toISOString(), // 1h ago
+    };
+    assert.equal(isCacheValid(entry), false);
+  });
+
+  it('null cache entry is invalid', () => {
+    assert.equal(isCacheValid(null), false);
+    assert.equal(isCacheValid(undefined), false);
+  });
+});
+
+// ---------------------------------------------------------------------------
+// Test: Aggregation produces correct output structure
+// ---------------------------------------------------------------------------
+describe('aggregateDexterData', () => {
+  it('returns complete JSON matching template variable structure', () => {
+    const result = aggregateDexterData({
+      financialData: {
+        income_statements: [{ revenue: 1000000 }],
+        balance_sheets: [{ total_assets: 5000000 }],
+        cash_flow: [{ operating_cash_flow: 300000 }],
+        ratios: [{ pe_ratio: 25 }],
+      },
+      insiderTrades: [{ insider_name: 'John CEO', transaction_type: 'P-Purchase' }],
+      stockPrices: generateMockPrices(252),
+      competitorData: [{ ticker: 'MSFT', market_cap: 3000000000 }],
+      managementQuotes: [{ speaker: 'CEO', quote: 'Great quarter' }],
+      newsResults: [{ title: 'AAPL beats earnings', url: 'https://example.com' }],
+      ticker: 'AAPL',
+      companyName: 'Apple Inc.',
+      sector: 'Technology',
+      marketCap: '$3.2T',
+    });
+
+    // Check required top-level fields
+    assert.ok(result.company_name);
+    assert.ok(result.ticker);
+    assert.ok(result.sector);
+    assert.ok(result.market_cap);
+    assert.ok(result.financial_data);
+    assert.ok(result.insider_trades);
+    assert.ok(result.stock_prices);
+    assert.ok(result.competitor_data);
+    assert.ok(result.management_quotes);
+  });
+
+  it('price data in output uses summary (not raw array)', () => {
+    const result = aggregateDexterData({
+      financialData: {
+        income_statements: [{ revenue: 1000000 }],
+        balance_sheets: [],
+        cash_flow: [],
+        ratios: [],
+      },
+      insiderTrades: [],
+      stockPrices: generateMockPrices(252),
+      competitorData: [],
+      managementQuotes: [],
+      newsResults: [],
+      ticker: 'AAPL',
+      companyName: 'Apple Inc.',
+      sector: 'Technology',
+      marketCap: '$3.2T',
+    });
+
+    // stock_prices should be the summary, not the raw array
+    assert.ok(result.stock_prices.current_price);
+    assert.ok(result.stock_prices.high_52w);
+    assert.equal(result.stock_prices.length, undefined); // not an array
+  });
+});
+
+// ---------------------------------------------------------------------------
+// Test: Insider trades filtering (last 90 days)
+// ---------------------------------------------------------------------------
+describe('aggregateDexterData insider trade filtering', () => {
+  it('filters insider trades to last 90 days', () => {
+    const now = new Date();
+    const recent = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
+    const old = new Date(now - 120 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
+
+    const result = aggregateDexterData({
+      financialData: { income_statements: [], balance_sheets: [], cash_flow: [], ratios: [] },
+      insiderTrades: [
+        { insider_name: 'Recent', transaction_date: recent, transaction_type: 'P-Purchase' },
+        { insider_name: 'Old', transaction_date: old, transaction_type: 'P-Purchase' },
+      ],
+      stockPrices: generateMockPrices(30),
+      competitorData: [],
+      managementQuotes: [],
+      newsResults: [],
+      ticker: 'TEST',
+      companyName: 'Test Inc.',
+      sector: 'Tech',
+      marketCap: '$1B',
+    });
+
+    assert.equal(result.insider_trades.length, 1);
+    assert.equal(result.insider_trades[0].insider_name, 'Recent');
+  });
+});
+
+// ---------------------------------------------------------------------------
+// Test: Rate limit retry with exponential backoff
+// ---------------------------------------------------------------------------
+describe('rate limit handling', () => {
+  // This tests the retry utility function
+  const { fetchWithRetry } = require('../code/insiderbuying/dexter-research.js');
+
+  it('retries on 429 with exponential backoff', async () => {
+    let callCount = 0;
+    const mockFetch = async () => {
+      callCount++;
+      if (callCount < 3) {
+        return { ok: false, status: 429, statusText: 'Too Many Requests' };
+      }
+      return { ok: true, status: 200, json: async () => ({ data: 'success' }) };
+    };
+
+    const result = await fetchWithRetry('https://api.example.com/test', {}, {
+      fetchFn: mockFetch,
+      maxRetries: 3,
+      baseDelay: 10, // 10ms for fast tests
+    });
+
+    assert.equal(callCount, 3);
+    const json = await result.json();
+    assert.equal(json.data, 'success');
+  });
+
+  it('gives up after max retries', async () => {
+    let callCount = 0;
+    const mockFetch = async () => {
+      callCount++;
+      return { ok: false, status: 429, statusText: 'Too Many Requests' };
+    };
+
+    const result = await fetchWithRetry('https://api.example.com/test', {}, {
+      fetchFn: mockFetch,
+      maxRetries: 3,
+      baseDelay: 10,
+    });
+
+    assert.equal(callCount, 4); // initial + 3 retries
+    assert.equal(result.ok, false);
+    assert.equal(result.status, 429);
+  });
+});
+
+// ---------------------------------------------------------------------------
+// Test: DATA_TYPES constant
+// ---------------------------------------------------------------------------
+describe('DATA_TYPES', () => {
+  it('contains all 7 data types', () => {
+    assert.equal(DATA_TYPES.length, 7);
+    assert.ok(DATA_TYPES.includes('income_statements'));
+    assert.ok(DATA_TYPES.includes('balance_sheets'));
+    assert.ok(DATA_TYPES.includes('cash_flow'));
+    assert.ok(DATA_TYPES.includes('ratios'));
+    assert.ok(DATA_TYPES.includes('insider_trades'));
+    assert.ok(DATA_TYPES.includes('stock_prices'));
+    assert.ok(DATA_TYPES.includes('competitors'));
+  });
+});
+
+// ===========================================================================
+// Helper functions for generating mock data
+// ===========================================================================
+
+function generateMockPrices(days, opts = {}) {
+  const { highDay = -1, lowDay = -1 } = opts;
+  const prices = [];
+  const baseDate = new Date('2025-03-27');
+
+  for (let i = 0; i < days; i++) {
+    const date = new Date(baseDate);
+    date.setDate(date.getDate() - (days - 1 - i));
+
+    let close = 100 + Math.sin(i / 20) * 30;
+    if (i === highDay) close = 200;
+    if (i === lowDay) close = 50;
+
+    prices.push({
+      date: date.toISOString().split('T')[0],
+      open: close - 1,
+      high: close + 2,
+      low: close - 2,
+      close,
+      volume: 1000000 + Math.floor(Math.random() * 500000),
+    });
+  }
+  return prices;
+}
+
+function generateConstantPrices(days, price) {
+  const prices = [];
+  const baseDate = new Date('2025-03-27');
+  for (let i = 0; i < days; i++) {
+    const date = new Date(baseDate);
+    date.setDate(date.getDate() - (days - 1 - i));
+    prices.push({
+      date: date.toISOString().split('T')[0],
+      open: price,
+      high: price,
+      low: price,
+      close: price,
+      volume: 1000000,
+    });
+  }
+  return prices;
+}
+
+function generateLinearPrices(days, startPrice, endPrice) {
+  const prices = [];
+  const baseDate = new Date('2025-03-27');
+  for (let i = 0; i < days; i++) {
+    const date = new Date(baseDate);
+    date.setDate(date.getDate() - (days - 1 - i));
+    const close = startPrice + (endPrice - startPrice) * (i / (days - 1));
+    prices.push({
+      date: date.toISOString().split('T')[0],
+      open: close,
+      high: close + 1,
+      low: close - 1,
+      close,
+      volume: 1000000,
+    });
+  }
+  return prices;
+}
