diff --git a/insiderbuying-site/n8n/code/insiderbuying/sec-monitor.js b/insiderbuying-site/n8n/code/insiderbuying/sec-monitor.js
new file mode 100644
index 0000000..71359a8
--- /dev/null
+++ b/insiderbuying-site/n8n/code/insiderbuying/sec-monitor.js
@@ -0,0 +1,559 @@
+/**
+ * W4 — SEC EDGAR Filing Monitor (n8n Code Node)
+ *
+ * Discovers new Form 4 insider buy filings, enriches via Financial Datasets,
+ * deduplicates, filters buys-only, classifies insider role, and detects
+ * cluster buys. Runs within a 60-second n8n Code node timeout.
+ *
+ * Output: array of enriched filing objects passed to score-alert.js.
+ */
+
+'use strict';
+
+// ---------------------------------------------------------------------------
+// Constants
+// ---------------------------------------------------------------------------
+
+const SEC_USER_AGENT = 'EarlyInsider.com (alerts@earlyinsider.com)';
+const EDGAR_SEARCH_URL = 'https://efts.sec.gov/LATEST/search-index';
+const SEC_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
+const FD_BASE_URL = 'https://api.financialdatasets.ai';
+
+// Required environment variables
+const REQUIRED_ENV = [
+  'AIRTABLE_API_KEY',
+  'AIRTABLE_BASE_ID',
+  'INSIDER_ALERTS_TABLE_ID',
+  'MONITOR_STATE_TABLE_ID',
+  'FINANCIAL_DATASETS_API_KEY',
+  'SUPABASE_URL',
+  'SUPABASE_SERVICE_ROLE_KEY',
+];
+
+// ---------------------------------------------------------------------------
+// Pure helpers
+// ---------------------------------------------------------------------------
+
+/**
+ * Build SEC EDGAR full-text search URL for Form 4 filings.
+ * Uses narrow q="form 4" query (NOT q=*).
+ */
+function buildEdgarUrl(lastCheckDate, today) {
+  const params = new URLSearchParams({
+    q: '"form 4"',
+    forms: '4',
+    dateRange: 'custom',
+    startdt: lastCheckDate,
+    enddt: today,
+    start: '0',
+    count: '40',
+    sort: 'file_date:desc',
+  });
+  return `${EDGAR_SEARCH_URL}?${params.toString()}`;
+}
+
+/**
+ * Extract filing metadata from EDGAR search response.
+ * Returns [] on malformed/empty responses.
+ */
+function parseEdgarResponse(responseJson) {
+  const hits = responseJson && responseJson.hits && responseJson.hits.hits;
+  if (!Array.isArray(hits)) return [];
+  return hits.map((hit) => ({
+    entity_name: (hit._source && hit._source.entity_name) || '',
+    file_date: (hit._source && hit._source.file_date) || '',
+    accession_number: hit._id || '',
+    // CIK is the first segment of the accession number (already zero-padded)
+    cik: (hit._id || '').split('-')[0] || '',
+  }));
+}
+
+/**
+ * Build composite dedup key.
+ * Format: {ticker}_{insider_name_underscored}_{transaction_date}_{shares}
+ */
+function buildDedupKey(ticker, insiderName, transactionDate, shares) {
+  const normalizedName = String(insiderName || '').replace(/\s+/g, '_');
+  return `${ticker}_${normalizedName}_${transactionDate}_${shares}`;
+}
+
+/**
+ * Check dedup: returns false (skip) if key already in Set.
+ * If key is new, adds it to Set immediately (prevents same-run duplicates)
+ * and returns true (proceed).
+ */
+function passesDedup(dedupKey, existingDedupKeys) {
+  if (existingDedupKeys.has(dedupKey)) return false;
+  existingDedupKeys.add(dedupKey);
+  return true;
+}
+
+/**
+ * True only for P - Purchase transactions (buy-only filter).
+ */
+function isBuyTransaction(transactionType) {
+  return transactionType === 'P - Purchase';
+}
+
+/**
+ * Map insider title string to one of five category values.
+ * VP is checked before C-Suite to prevent "Vice President" matching "president".
+ * is_board_director=true overrides all non-C-Suite classifications to 'Board'.
+ */
+function classifyInsider(title, isBoardDirector) {
+  const t = (title || '').toLowerCase();
+
+  // VP first — catches "Executive Vice President", "SVP", etc.
+  if (/vice\s*president|svp|evp|senior\s*vice/i.test(t)) {
+    if (isBoardDirector) return 'Board';
+    return 'VP';
+  }
+
+  // C-Suite — safe after VP check (no false-positive on "vice president")
+  if (/\bceo\b|\bcfo\b|\bcoo\b|\bcto\b|chief|(?<![Vv]ice\s)\bpresident\b/i.test(t)) {
+    return 'C-Suite';
+  }
+
+  // Board director override (after C-Suite check)
+  if (isBoardDirector) return 'Board';
+
+  // Board by title
+  if (/director|board\s*member|chairman|chairwoman/i.test(t)) {
+    return 'Board';
+  }
+
+  // 10% Owner (specific SEC disclosure category)
+  if (/10\s*(%|percent)\s*(owner|beneficial)?/i.test(t)) {
+    return '10% Owner';
+  }
+
+  // Officer
+  if (/treasurer|secretary|controller|general\s*counsel/i.test(t)) {
+    return 'Officer';
+  }
+
+  // Default: never crash on unknown titles
+  return 'Officer';
+}
+
+// ---------------------------------------------------------------------------
+// UUID generator (crypto.randomUUID preferred, fallback for older envs)
+// ---------------------------------------------------------------------------
+
+function generateUUID() {
+  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
+    return crypto.randomUUID();
+  }
+  // RFC 4122 v4 fallback
+  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
+    const r = (Math.random() * 16) | 0;
+    const v = c === 'x' ? r : (r & 0x3) | 0x8;
+    return v.toString(16);
+  });
+}
+
+// ---------------------------------------------------------------------------
+// Async: Airtable — fetch existing dedup keys (past 7 days)
+// ---------------------------------------------------------------------------
+
+/**
+ * Returns a Set<string> of dedup_key values from Airtable Insider_Alerts
+ * for the past 7 days. Handles Airtable pagination.
+ *
+ * @param {Object} opts
+ * @param {string} opts.baseId
+ * @param {string} opts.tableId
+ * @param {string} opts.apiKey
+ * @param {Function} opts.fetchFn  — injectable for tests
+ */
+async function fetchDedupKeys(opts = {}) {
+  const { baseId, tableId, apiKey, fetchFn } = opts;
+  const keys = new Set();
+
+  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
+    .toISOString()
+    .split('T')[0];
+  const formula = `IS_AFTER({filing_date}, '${sevenDaysAgo}')`;
+
+  let offset = null;
+  do {
+    const params = new URLSearchParams({ filterByFormula: formula });
+    if (offset) params.set('offset', offset);
+    const url = `https://api.airtable.com/v0/${baseId}/${tableId}?${params.toString()}`;
+
+    const res = await fetchFn(url, {
+      headers: { Authorization: `Bearer ${apiKey}` },
+    });
+    const data = await res.json();
+
+    for (const record of (data.records || [])) {
+      const key = record.fields && record.fields.dedup_key;
+      if (key != null) keys.add(key);
+    }
+
+    offset = data.offset || null;
+  } while (offset);
+
+  return keys;
+}
+
+// ---------------------------------------------------------------------------
+// Async: SEC — load CIK ticker map
+// ---------------------------------------------------------------------------
+
+/**
+ * Fetch SEC company_tickers.json and build a Map<paddedCik, ticker>.
+ * Zero-pads CIK to 10 digits. Re-fetched every run (no stale cache).
+ *
+ * @param {Object} opts
+ * @param {Function} opts.fetchFn
+ */
+async function loadCikTickerMap(opts = {}) {
+  const { fetchFn } = opts;
+  const data = await fetchFn(SEC_TICKERS_URL, {
+    headers: { 'User-Agent': SEC_USER_AGENT },
+  }).then((r) => r.json());
+
+  const map = new Map();
+  for (const entry of Object.values(data || {})) {
+    if (!entry || entry.cik_str == null || !entry.ticker) continue;
+    const paddedCik = String(entry.cik_str).padStart(10, '0');
+    map.set(paddedCik, entry.ticker);
+  }
+  return map;
+}
+
+// ---------------------------------------------------------------------------
+// Async: Financial Datasets — enrich a single filing
+// ---------------------------------------------------------------------------
+
+/**
+ * Call Financial Datasets API to get insider trade details for a ticker
+ * starting from filingDate. Retries 3x (exponential backoff) on 429/500.
+ * Returns null after 3 failures (does not throw).
+ *
+ * @param {string} ticker
+ * @param {string} filingDate  YYYY-MM-DD
+ * @param {Object} opts
+ * @param {string} opts.apiKey
+ * @param {Function} opts.fetchFn
+ * @param {Function} [opts._sleep]  — injectable for tests (defaults to real setTimeout)
+ */
+async function enrichFiling(ticker, filingDate, opts = {}) {
+  const {
+    apiKey,
+    fetchFn,
+    _sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
+  } = opts;
+
+  const url = `${FD_BASE_URL}/insider-trades?ticker=${encodeURIComponent(ticker)}&filing_date_gte=${filingDate}&limit=10`;
+  const backoffs = [1000, 3000, 9000];
+  let lastErr;
+
+  for (let attempt = 0; attempt < 3; attempt++) {
+    try {
+      // Apply 100ms delay before every call (rate limit mitigation)
+      await _sleep(100);
+
+      const res = await fetchFn(url, {
+        headers: { 'X-API-KEY': apiKey },
+      });
+      const data = await res.json();
+      const trades = data && data.insider_trades;
+      if (!Array.isArray(trades) || trades.length === 0) return null;
+
+      // Return first matching trade (most recent filing for this ticker)
+      const trade = trades[0];
+      return {
+        name: trade.name,
+        title: trade.title,
+        is_board_director: trade.is_board_director || false,
+        transaction_date: trade.transaction_date,
+        transaction_shares: trade.transaction_shares,
+        transaction_price_per_share: trade.transaction_price_per_share,
+        transaction_value: trade.transaction_value,
+        transaction_type: trade.transaction_type,
+        filing_date: trade.filing_date,
+      };
+    } catch (err) {
+      lastErr = err;
+      const isRetryable =
+        err.statusCode === 429 || err.statusCode === 500 || !err.statusCode;
+      if (!isRetryable || attempt === 2) break;
+      await _sleep(backoffs[attempt]);
+    }
+  }
+
+  // After 3 failures: return null (caller increments failureCount)
+  return null;
+}
+
+// ---------------------------------------------------------------------------
+// Async: Supabase — detect cluster buy
+// ---------------------------------------------------------------------------
+
+/**
+ * Query Supabase for other insider buys of the same ticker in the past 7 days,
+ * excluding the current insider. If found, assigns/reuses a cluster_id and
+ * UPDATEs those rows with is_cluster_buy=true.
+ *
+ * @param {string} ticker
+ * @param {string} transactionDate  YYYY-MM-DD
+ * @param {string} currentInsiderName
+ * @param {Object} opts
+ * @param {string} opts.supabaseUrl
+ * @param {string} opts.serviceKey  — must be service_role key
+ * @param {Function} opts.fetchFn
+ */
+async function detectCluster(ticker, transactionDate, currentInsiderName, opts = {}) {
+  const { supabaseUrl, serviceKey, fetchFn } = opts;
+
+  const sevenDaysAgo = new Date(
+    new Date(transactionDate).getTime() - 7 * 24 * 60 * 60 * 1000,
+  )
+    .toISOString()
+    .split('T')[0];
+
+  const supabaseHeaders = {
+    apikey: serviceKey,
+    Authorization: `Bearer ${serviceKey}`,
+    'Content-Type': 'application/json',
+  };
+
+  // Query: other buys of same ticker in last 7 days, excluding current insider
+  const selectUrl =
+    `${supabaseUrl}/rest/v1/insider_alerts` +
+    `?ticker=eq.${encodeURIComponent(ticker)}` +
+    `&transaction_type=eq.buy` +
+    `&transaction_date=gte.${sevenDaysAgo}` +
+    `&insider_name=neq.${encodeURIComponent(currentInsiderName)}` +
+    `&select=id,insider_name,cluster_id,is_cluster_buy`;
+
+  const selectRes = await fetchFn(selectUrl, { headers: supabaseHeaders });
+  const priorRows = await selectRes.json();
+
+  if (!Array.isArray(priorRows) || priorRows.length === 0) {
+    return { isClusterBuy: false, clusterId: null, clusterSize: 1 };
+  }
+
+  // Cluster detected — reuse existing cluster_id or generate new one
+  const existingClusterId = priorRows.find((r) => r.cluster_id)?.cluster_id || null;
+  const clusterId = existingClusterId || generateUUID();
+  const clusterSize = priorRows.length + 1; // prior insiders + current
+
+  // UPDATE prior rows that don't have this cluster_id yet
+  const rowsToUpdate = priorRows
+    .filter((r) => !r.cluster_id || r.cluster_id !== clusterId)
+    .map((r) => r.id);
+
+  if (rowsToUpdate.length > 0) {
+    const idList = rowsToUpdate.map((id) => `"${id}"`).join(',');
+    const patchUrl =
+      `${supabaseUrl}/rest/v1/insider_alerts?id=in.(${idList})`;
+    await fetchFn(patchUrl, {
+      method: 'PATCH',
+      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
+      body: JSON.stringify({ cluster_id: clusterId, is_cluster_buy: true }),
+    });
+  }
+
+  return { isClusterBuy: true, clusterId, clusterSize };
+}
+
+// ---------------------------------------------------------------------------
+// Main orchestrator (n8n Code node entry point)
+// ---------------------------------------------------------------------------
+
+/**
+ * Run the full SEC monitor pipeline:
+ * 1. Pre-load dedup keys + CIK ticker map (parallel)
+ * 2. Fetch EDGAR filings
+ * 3. Enrich each filing via Financial Datasets
+ * 4. Dedup, filter, classify, cluster-detect
+ * 5. Return enriched filing objects for score-alert.js
+ *
+ * @param {Object} input   — { workflowName, monitorStateName }
+ * @param {Object} helpers — { fetchFn, env }
+ */
+async function runSecMonitor(input, helpers) {
+  const fetchFn = helpers && helpers.fetchFn;
+  const env = (helpers && helpers.env) || {};
+
+  // Validate required env vars
+  const missing = REQUIRED_ENV.filter((k) => !env[k]);
+  if (missing.length > 0) {
+    throw new Error(`sec-monitor: missing required env vars: ${missing.join(', ')}`);
+  }
+
+  // Step 1: Pre-load in parallel
+  const [existingDedupKeys, cikTickerMap] = await Promise.all([
+    fetchDedupKeys({
+      baseId: env.AIRTABLE_BASE_ID,
+      tableId: env.INSIDER_ALERTS_TABLE_ID,
+      apiKey: env.AIRTABLE_API_KEY,
+      fetchFn,
+    }),
+    loadCikTickerMap({ fetchFn }),
+  ]);
+
+  // Step 2: Get last_check_timestamp from Monitor_State
+  const stateUrl =
+    `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.MONITOR_STATE_TABLE_ID}` +
+    `?filterByFormula=${encodeURIComponent(`{name}='${input.monitorStateName || 'market'}'`)}`;
+  const stateRes = await fetchFn(stateUrl, {
+    headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` },
+  });
+  const stateData = await stateRes.json();
+  const stateRecord = stateData.records && stateData.records[0];
+  const lastCheckTimestamp =
+    (stateRecord && stateRecord.fields && stateRecord.fields.last_check_timestamp) ||
+    new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
+  const lastCheckDate = lastCheckTimestamp.split('T')[0];
+
+  const today = new Date().toISOString().split('T')[0];
+
+  // Step 3: Fetch EDGAR filings
+  const edgarUrl = buildEdgarUrl(lastCheckDate, today);
+  const edgarRes = await fetchFn(edgarUrl, {
+    headers: { 'User-Agent': SEC_USER_AGENT },
+  });
+  const edgarData = await edgarRes.json();
+  const hits = parseEdgarResponse(edgarData);
+
+  // Filter hits newer than last_check_timestamp
+  const newHits = hits.filter(
+    (h) => h.file_date && h.file_date > lastCheckTimestamp,
+  );
+
+  // Step 4: Process each filing
+  const results = [];
+  let failureCount = 0;
+  let firstError = null;
+
+  for (const hit of newHits) {
+    const ticker = cikTickerMap.get(hit.cik);
+    if (!ticker) continue; // CIK not in map → skip
+
+    // Enrich via Financial Datasets
+    const enriched = await enrichFiling(ticker, lastCheckDate, {
+      apiKey: env.FINANCIAL_DATASETS_API_KEY,
+      fetchFn,
+    });
+    if (!enriched) {
+      failureCount++;
+      if (!firstError) firstError = `No data from FD for ${ticker}`;
+      continue;
+    }
+
+    // Dedup check
+    const dedupKey = buildDedupKey(
+      ticker,
+      enriched.name,
+      enriched.transaction_date,
+      enriched.transaction_shares,
+    );
+    if (!passesDedup(dedupKey, existingDedupKeys)) continue;
+
+    // Filter: buys only
+    if (!isBuyTransaction(enriched.transaction_type)) continue;
+
+    // Classify insider
+    const insiderCategory = classifyInsider(enriched.title, enriched.is_board_director);
+
+    // Cluster detection
+    let clusterData = { isClusterBuy: false, clusterId: null, clusterSize: 1 };
+    try {
+      clusterData = await detectCluster(
+        ticker,
+        enriched.transaction_date,
+        enriched.name,
+        {
+          supabaseUrl: env.SUPABASE_URL,
+          serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
+          fetchFn,
+        },
+      );
+    } catch (clusterErr) {
+      // Non-fatal: log and continue
+      console.warn(`sec-monitor: cluster detection failed for ${ticker}: ${clusterErr.message}`);
+    }
+
+    results.push({
+      ticker,
+      company_name: hit.entity_name,
+      insider_name: enriched.name,
+      insider_title: enriched.title,
+      insider_category: insiderCategory,
+      transaction_type: 'buy', // normalized from 'P - Purchase'
+      transaction_date: enriched.transaction_date,
+      filing_date: enriched.filing_date,
+      transaction_shares: enriched.transaction_shares,
+      transaction_price_per_share: enriched.transaction_price_per_share,
+      transaction_value: enriched.transaction_value,
+      dedup_key: dedupKey,
+      is_cluster_buy: clusterData.isClusterBuy,
+      cluster_id: clusterData.clusterId,
+      cluster_size: clusterData.clusterSize,
+      raw_filing_data: JSON.stringify(enriched),
+    });
+  }
+
+  // Alert if too many failures
+  if (failureCount > 5 && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
+    const msg = encodeURIComponent(
+      `⚠️ sec-monitor: ${failureCount} enrichment failures\nFirst error: ${firstError}`,
+    );
+    await fetchFn(
+      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage` +
+        `?chat_id=${env.TELEGRAM_CHAT_ID}&text=${msg}`,
+    ).catch(() => {});
+  }
+
+  // Update Monitor_State last_check_timestamp
+  if (stateRecord) {
+    const now = new Date().toISOString();
+    await fetchFn(
+      `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.MONITOR_STATE_TABLE_ID}/${stateRecord.id}`,
+      {
+        method: 'PATCH',
+        headers: {
+          Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
+          'Content-Type': 'application/json',
+        },
+        body: JSON.stringify({
+          fields: { last_check_timestamp: now },
+        }),
+      },
+    );
+  }
+
+  return results;
+}
+
+// ---------------------------------------------------------------------------
+// Exports (pure functions + orchestrator — imported by tests)
+// ---------------------------------------------------------------------------
+
+module.exports = {
+  // Pure helpers
+  buildEdgarUrl,
+  parseEdgarResponse,
+  buildDedupKey,
+  passesDedup,
+  isBuyTransaction,
+  classifyInsider,
+  generateUUID,
+
+  // Async functions
+  fetchDedupKeys,
+  loadCikTickerMap,
+  enrichFiling,
+  detectCluster,
+
+  // Orchestrator
+  runSecMonitor,
+
+  // Constants
+  SEC_USER_AGENT,
+  REQUIRED_ENV,
+};
diff --git a/insiderbuying-site/tests/insiderbuying/sec-monitor.test.js b/insiderbuying-site/tests/insiderbuying/sec-monitor.test.js
new file mode 100644
index 0000000..ee495ef
--- /dev/null
+++ b/insiderbuying-site/tests/insiderbuying/sec-monitor.test.js
@@ -0,0 +1,539 @@
+'use strict';
+
+const {
+  buildEdgarUrl,
+  parseEdgarResponse,
+  buildDedupKey,
+  passesDedup,
+  classifyInsider,
+  fetchDedupKeys,
+  loadCikTickerMap,
+  enrichFiling,
+  detectCluster,
+} = require('../../n8n/code/insiderbuying/sec-monitor');
+
+// ─── Shared mock factory ──────────────────────────────────────────────────────
+
+function makeFetch(response) {
+  return jest.fn().mockResolvedValue({
+    ok: true,
+    status: 200,
+    json: async () => response,
+  });
+}
+
+function makeFailFetch(statusCode) {
+  return jest.fn().mockRejectedValue(
+    Object.assign(new Error(`HTTP ${statusCode}`), { statusCode }),
+  );
+}
+
+const noSleep = jest.fn().mockResolvedValue(undefined);
+
+// ─────────────────────────────────────────────────────────────────────────────
+describe('section-02: sec-monitor.js', () => {
+
+  // ── 2.0 Pre-load: fetchDedupKeys ──────────────────────────────────────────
+  describe('fetchDedupKeys()', () => {
+    test('returns a Set of strings, not an array', async () => {
+      const fetchFn = makeFetch({
+        records: [
+          { fields: { dedup_key: 'AAPL_Tim_Cook_2026-03-25_10000' } },
+          { fields: { dedup_key: 'MSFT_Brad_Smith_2026-03-24_5000' } },
+        ],
+      });
+      const result = await fetchDedupKeys({
+        baseId: 'appXXX', tableId: 'tblXXX', apiKey: 'key', fetchFn,
+      });
+      expect(result).toBeInstanceOf(Set);
+      expect([...result]).toEqual(
+        expect.arrayContaining(['AAPL_Tim_Cook_2026-03-25_10000', 'MSFT_Brad_Smith_2026-03-24_5000']),
+      );
+    });
+
+    test('returns empty Set when Airtable returns no records', async () => {
+      const fetchFn = makeFetch({ records: [] });
+      const result = await fetchDedupKeys({
+        baseId: 'appXXX', tableId: 'tblXXX', apiKey: 'key', fetchFn,
+      });
+      expect(result).toBeInstanceOf(Set);
+      expect(result.size).toBe(0);
+    });
+
+    test('filters out null and undefined dedup_key values', async () => {
+      const fetchFn = makeFetch({
+        records: [
+          { fields: { dedup_key: 'AAPL_Cook_2026-03-25_100' } },
+          { fields: {} },
+          { fields: { dedup_key: null } },
+          { fields: { dedup_key: undefined } },
+        ],
+      });
+      const result = await fetchDedupKeys({
+        baseId: 'appXXX', tableId: 'tblXXX', apiKey: 'key', fetchFn,
+      });
+      expect(result.size).toBe(1);
+    });
+
+    test('sends Authorization: Bearer header to Airtable', async () => {
+      const fetchFn = makeFetch({ records: [] });
+      await fetchDedupKeys({
+        baseId: 'appXXX', tableId: 'tblXXX', apiKey: 'myToken', fetchFn,
+      });
+      const [, opts] = fetchFn.mock.calls[0];
+      expect(opts.headers['Authorization']).toBe('Bearer myToken');
+    });
+  });
+
+  // ── 2.0 Pre-load: loadCikTickerMap ────────────────────────────────────────
+  describe('loadCikTickerMap()', () => {
+    const SEC_DATA = {
+      '0': { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' },
+      '1': { cik_str: 789019, ticker: 'MSFT', title: 'Microsoft Corp' },
+      '2': { cik_str: 1045810, ticker: 'NVDA', title: 'NVIDIA Corp' },
+    };
+
+    test('returns a Map of paddedCik -> ticker', async () => {
+      const fetchFn = makeFetch(SEC_DATA);
+      const result = await loadCikTickerMap({ fetchFn });
+      expect(result).toBeInstanceOf(Map);
+      expect(result.get('0000320193')).toBe('AAPL');
+      expect(result.get('0000789019')).toBe('MSFT');
+    });
+
+    test('zero-pads CIK to 10 digits (320193 -> "0000320193")', async () => {
+      const fetchFn = makeFetch(SEC_DATA);
+      const result = await loadCikTickerMap({ fetchFn });
+      expect(result.has('0000320193')).toBe(true);
+      expect(result.has('320193')).toBe(false);
+    });
+
+    test('handles 7-digit CIK correctly (1045810 -> "0001045810")', async () => {
+      const fetchFn = makeFetch(SEC_DATA);
+      const result = await loadCikTickerMap({ fetchFn });
+      expect(result.get('0001045810')).toBe('NVDA');
+    });
+
+    test('handles missing/malformed entries without crashing', async () => {
+      const fetchFn = makeFetch({
+        '0': { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' },
+        '1': { ticker: 'BAD' },           // missing cik_str
+        '2': { cik_str: null, ticker: 'X' }, // null cik_str
+        '3': null,                          // null entry
+      });
+      await expect(loadCikTickerMap({ fetchFn })).resolves.toBeInstanceOf(Map);
+    });
+
+    test('sends SEC User-Agent header', async () => {
+      const fetchFn = makeFetch(SEC_DATA);
+      await loadCikTickerMap({ fetchFn });
+      const [, opts] = fetchFn.mock.calls[0];
+      expect(opts.headers['User-Agent']).toBe('EarlyInsider.com (alerts@earlyinsider.com)');
+    });
+  });
+
+  // ── 2.1 EDGAR URL Tests ───────────────────────────────────────────────────
+  describe('buildEdgarUrl()', () => {
+    test('includes startdt and enddt params', () => {
+      const url = buildEdgarUrl('2026-03-20', '2026-03-27');
+      expect(url).toContain('startdt=2026-03-20');
+      expect(url).toContain('enddt=2026-03-27');
+    });
+
+    test('includes count=40', () => {
+      const url = buildEdgarUrl('2026-03-20', '2026-03-27');
+      expect(url).toContain('count=40');
+    });
+
+    test('includes sort=file_date:desc', () => {
+      const url = buildEdgarUrl('2026-03-20', '2026-03-27');
+      expect(url).toContain('sort=file_date');
+      expect(url).toContain('desc');
+    });
+
+    test('does NOT include q=* (overbroad query guard)', () => {
+      const url = buildEdgarUrl('2026-03-20', '2026-03-27');
+      expect(url).not.toMatch(/q=\*/);
+      expect(url).not.toMatch(/q=%2A/);
+    });
+
+    test('includes "form 4" as narrow query', () => {
+      const url = buildEdgarUrl('2026-03-20', '2026-03-27');
+      // URLSearchParams encodes spaces as '+'; replace back before checking
+      const decoded = decodeURIComponent(url).replace(/\+/g, ' ');
+      expect(decoded.toLowerCase()).toContain('form 4');
+    });
+  });
+
+  // ── 2.1 EDGAR Parse Tests ─────────────────────────────────────────────────
+  describe('parseEdgarResponse()', () => {
+    test('extracts entity_name, file_date, accession_number from hits.hits', () => {
+      const response = {
+        hits: {
+          hits: [
+            {
+              _id: '0000320193-26-000042',
+              _source: {
+                entity_name: 'Apple Inc.',
+                file_date: '2026-03-27T14:23:11.000Z',
+              },
+            },
+          ],
+        },
+      };
+      const results = parseEdgarResponse(response);
+      expect(results).toHaveLength(1);
+      expect(results[0].entity_name).toBe('Apple Inc.');
+      expect(results[0].file_date).toBe('2026-03-27T14:23:11.000Z');
+      expect(results[0].accession_number).toBe('0000320193-26-000042');
+    });
+
+    test('returns empty array when hits.hits is empty', () => {
+      const result = parseEdgarResponse({ hits: { hits: [] } });
+      expect(result).toEqual([]);
+    });
+
+    test('returns empty array when response is malformed', () => {
+      expect(parseEdgarResponse(null)).toEqual([]);
+      expect(parseEdgarResponse({})).toEqual([]);
+      expect(parseEdgarResponse({ hits: {} })).toEqual([]);
+    });
+
+    test('extracts CIK as first segment of accession number', () => {
+      const response = {
+        hits: {
+          hits: [
+            {
+              _id: '0000320193-26-000042',
+              _source: { entity_name: 'Apple', file_date: '2026-03-27T14:00:00.000Z' },
+            },
+          ],
+        },
+      };
+      const results = parseEdgarResponse(response);
+      expect(results[0].cik).toBe('0000320193');
+    });
+  });
+
+  // ── 2.2 Enrichment Tests ──────────────────────────────────────────────────
+  describe('enrichFiling()', () => {
+    const FD_RESPONSE = {
+      insider_trades: [
+        {
+          name: 'Tim Cook',
+          title: 'Chief Executive Officer',
+          is_board_director: false,
+          transaction_date: '2026-03-25',
+          transaction_shares: 10000,
+          transaction_price_per_share: 225.50,
+          transaction_value: 2255000,
+          transaction_type: 'P - Purchase',
+          filing_date: '2026-03-27',
+        },
+      ],
+    };
+
+    test('calls correct endpoint with ticker and filing_date_gte params', async () => {
+      const fetchFn = makeFetch(FD_RESPONSE);
+      await enrichFiling('AAPL', '2026-03-27', { apiKey: 'key', fetchFn, _sleep: noSleep });
+      const [url] = fetchFn.mock.calls[0];
+      expect(url).toContain('ticker=AAPL');
+      expect(url).toContain('filing_date_gte=2026-03-27');
+    });
+
+    test('sends X-API-KEY header', async () => {
+      const fetchFn = makeFetch(FD_RESPONSE);
+      await enrichFiling('AAPL', '2026-03-27', { apiKey: 'myFDKey', fetchFn, _sleep: noSleep });
+      const [, opts] = fetchFn.mock.calls[0];
+      expect(opts.headers['X-API-KEY']).toBe('myFDKey');
+    });
+
+    test('extracts all required fields from response', async () => {
+      const fetchFn = makeFetch(FD_RESPONSE);
+      const result = await enrichFiling('AAPL', '2026-03-27', { apiKey: 'key', fetchFn, _sleep: noSleep });
+      expect(result).toMatchObject({
+        name: 'Tim Cook',
+        title: 'Chief Executive Officer',
+        is_board_director: false,
+        transaction_date: '2026-03-25',
+        transaction_shares: 10000,
+        transaction_price_per_share: 225.50,
+        transaction_value: 2255000,
+        transaction_type: 'P - Purchase',
+        filing_date: '2026-03-27',
+      });
+    });
+
+    test('retries up to 3 times on 429 status', async () => {
+      const err429 = Object.assign(new Error('HTTP 429'), { statusCode: 429 });
+      const fetchFn = jest.fn()
+        .mockRejectedValueOnce(err429)
+        .mockRejectedValueOnce(err429)
+        .mockRejectedValueOnce(err429);
+      const result = await enrichFiling('AAPL', '2026-03-27', {
+        apiKey: 'key', fetchFn, _sleep: noSleep,
+      });
+      expect(fetchFn).toHaveBeenCalledTimes(3);
+      expect(result).toBeNull();
+    });
+
+    test('retries up to 3 times on 500 status', async () => {
+      const err500 = Object.assign(new Error('HTTP 500'), { statusCode: 500 });
+      const fetchFn = jest.fn()
+        .mockRejectedValueOnce(err500)
+        .mockRejectedValueOnce(err500)
+        .mockRejectedValueOnce(err500);
+      const result = await enrichFiling('AAPL', '2026-03-27', {
+        apiKey: 'key', fetchFn, _sleep: noSleep,
+      });
+      expect(fetchFn).toHaveBeenCalledTimes(3);
+      expect(result).toBeNull();
+    });
+
+    test('returns null (not throws) after 3 failed retries', async () => {
+      const err = Object.assign(new Error('HTTP 500'), { statusCode: 500 });
+      const fetchFn = jest.fn().mockRejectedValue(err);
+      await expect(
+        enrichFiling('AAPL', '2026-03-27', { apiKey: 'key', fetchFn, _sleep: noSleep }),
+      ).resolves.toBeNull();
+    });
+
+    test('returns null when insider_trades array is empty', async () => {
+      const fetchFn = makeFetch({ insider_trades: [] });
+      const result = await enrichFiling('UNKNOWN', '2026-03-27', {
+        apiKey: 'key', fetchFn, _sleep: noSleep,
+      });
+      expect(result).toBeNull();
+    });
+
+    test('applies 100ms delay via _sleep between calls', async () => {
+      const fetchFn = makeFetch(FD_RESPONSE);
+      const _sleep = jest.fn().mockResolvedValue(undefined);
+      await enrichFiling('AAPL', '2026-03-27', { apiKey: 'key', fetchFn, _sleep });
+      expect(_sleep).toHaveBeenCalledWith(100);
+    });
+  });
+
+  // ── 2.3 Dedup Tests ───────────────────────────────────────────────────────
+  describe('buildDedupKey()', () => {
+    test('returns ticker_name_date_shares format', () => {
+      const key = buildDedupKey('AAPL', 'Tim Cook', '2026-03-25', 10000);
+      expect(key).toBe('AAPL_Tim_Cook_2026-03-25_10000');
+    });
+
+    test('replaces spaces in insider name with underscores', () => {
+      const key = buildDedupKey('MSFT', 'Brad Smith Jones', '2026-03-24', 5000);
+      expect(key).toBe('MSFT_Brad_Smith_Jones_2026-03-24_5000');
+    });
+
+    test('handles single-word names', () => {
+      const key = buildDedupKey('TSLA', 'Musk', '2026-03-01', 500);
+      expect(key).toBe('TSLA_Musk_2026-03-01_500');
+    });
+  });
+
+  describe('passesDedup()', () => {
+    test('returns false for key already in Set', () => {
+      const s = new Set(['AAPL_Cook_2026-03-25_10000']);
+      expect(passesDedup('AAPL_Cook_2026-03-25_10000', s)).toBe(false);
+    });
+
+    test('returns true for key not in Set', () => {
+      const s = new Set();
+      expect(passesDedup('AAPL_Cook_2026-03-25_10000', s)).toBe(true);
+    });
+
+    test('adds key to Set when passing (prevents same-run duplicates)', () => {
+      const s = new Set();
+      passesDedup('AAPL_Cook_2026-03-25_10000', s);
+      expect(s.has('AAPL_Cook_2026-03-25_10000')).toBe(true);
+    });
+
+    test('second call with same key returns false (duplicate blocked)', () => {
+      const s = new Set();
+      passesDedup('AAPL_Cook_2026-03-25_10000', s);
+      expect(passesDedup('AAPL_Cook_2026-03-25_10000', s)).toBe(false);
+    });
+  });
+
+  // ── 2.4 Filter Tests ─────────────────────────────────────────────────────
+  describe('filterBuysOnly()', () => {
+    // Test via isBuyTransaction helper
+    const { isBuyTransaction } = require('../../n8n/code/insiderbuying/sec-monitor');
+
+    test('P - Purchase passes filter', () => {
+      expect(isBuyTransaction('P - Purchase')).toBe(true);
+    });
+
+    test('S - Sale is filtered out', () => {
+      expect(isBuyTransaction('S - Sale')).toBe(false);
+    });
+
+    test('A - Grant is filtered out', () => {
+      expect(isBuyTransaction('A - Grant')).toBe(false);
+    });
+
+    test('D - Disposition is filtered out', () => {
+      expect(isBuyTransaction('D - Disposition')).toBe(false);
+    });
+
+    test('null transaction_type is filtered out', () => {
+      expect(isBuyTransaction(null)).toBe(false);
+    });
+
+    test('undefined transaction_type is filtered out', () => {
+      expect(isBuyTransaction(undefined)).toBe(false);
+    });
+  });
+
+  // ── 2.5 Classification Tests ──────────────────────────────────────────────
+  describe('classifyInsider()', () => {
+    test('Chief Executive Officer -> C-Suite', () => {
+      expect(classifyInsider('Chief Executive Officer', false)).toBe('C-Suite');
+    });
+
+    test('CFO -> C-Suite', () => {
+      expect(classifyInsider('CFO', false)).toBe('C-Suite');
+    });
+
+    test('CEO -> C-Suite', () => {
+      expect(classifyInsider('CEO', false)).toBe('C-Suite');
+    });
+
+    test('Board Director -> Board', () => {
+      expect(classifyInsider('Board Director', false)).toBe('Board');
+    });
+
+    test('Executive Vice President -> VP (not C-Suite despite "president")', () => {
+      expect(classifyInsider('Executive Vice President', false)).toBe('VP');
+    });
+
+    test('Corporate Secretary -> Officer', () => {
+      expect(classifyInsider('Corporate Secretary', false)).toBe('Officer');
+    });
+
+    test('10% Owner -> 10% Owner', () => {
+      expect(classifyInsider('10% Owner', false)).toBe('10% Owner');
+    });
+
+    test('is_board_director=true overrides ambiguous title to Board', () => {
+      expect(classifyInsider('Special Advisor', true)).toBe('Board');
+    });
+
+    test('is_board_director=true does NOT override C-Suite', () => {
+      expect(classifyInsider('Chief Executive Officer', true)).toBe('C-Suite');
+    });
+
+    test('unrecognized title defaults to Officer (no crash)', () => {
+      expect(classifyInsider('Quantum Facilitator', false)).toBe('Officer');
+    });
+
+    test('classification is case-insensitive (ceo -> C-Suite)', () => {
+      expect(classifyInsider('ceo', false)).toBe('C-Suite');
+    });
+
+    test('empty title defaults to Officer', () => {
+      expect(classifyInsider('', false)).toBe('Officer');
+    });
+
+    test('null title defaults to Officer', () => {
+      expect(classifyInsider(null, false)).toBe('Officer');
+    });
+  });
+
+  // ── 2.6 Cluster Detection Tests ───────────────────────────────────────────
+  describe('detectCluster()', () => {
+    const SUPA_URL = 'https://abc.supabase.co';
+    const SUPA_KEY = 'service_role_key';
+
+    test('no prior buys -> not a cluster, cluster_id null', async () => {
+      const fetchFn = makeFetch([]);  // empty array = no prior buys
+      const result = await detectCluster('AAPL', '2026-03-25', 'Tim Cook', {
+        supabaseUrl: SUPA_URL, serviceKey: SUPA_KEY, fetchFn,
+      });
+      expect(result.isClusterBuy).toBe(false);
+      expect(result.clusterId).toBeNull();
+    });
+
+    test('1 prior buy of same ticker by different insider -> cluster detected', async () => {
+      // First call: SELECT returns 1 row with no cluster_id
+      const fetchFn = jest.fn()
+        .mockResolvedValueOnce({
+          ok: true,
+          json: async () => [{ id: 'rec1', insider_name: 'Jony Ive', cluster_id: null, is_cluster_buy: false }],
+        })
+        .mockResolvedValueOnce({
+          ok: true,
+          json: async () => [],  // PATCH response
+        });
+      const result = await detectCluster('AAPL', '2026-03-25', 'Tim Cook', {
+        supabaseUrl: SUPA_URL, serviceKey: SUPA_KEY, fetchFn,
+      });
+      expect(result.isClusterBuy).toBe(true);
+      expect(result.clusterId).toBeTruthy();
+    });
+
+    test('existing rows with cluster_id -> uses that cluster_id, not new UUID', async () => {
+      const existingClusterId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
+      const fetchFn = jest.fn()
+        .mockResolvedValueOnce({
+          ok: true,
+          json: async () => [
+            { id: 'rec1', insider_name: 'Jony Ive', cluster_id: existingClusterId, is_cluster_buy: true },
+          ],
+        })
+        .mockResolvedValueOnce({ ok: true, json: async () => [] });
+      const result = await detectCluster('AAPL', '2026-03-25', 'Tim Cook', {
+        supabaseUrl: SUPA_URL, serviceKey: SUPA_KEY, fetchFn,
+      });
+      expect(result.clusterId).toBe(existingClusterId);
+    });
+
+    test('cluster detection excludes current insider_name (no self-cluster)', async () => {
+      const fetchFn = jest.fn().mockResolvedValue({
+        ok: true,
+        json: async () => [],
+      });
+      await detectCluster('AAPL', '2026-03-25', 'Tim Cook', {
+        supabaseUrl: SUPA_URL, serviceKey: SUPA_KEY, fetchFn,
+      });
+      const [url] = fetchFn.mock.calls[0];
+      expect(url).toContain('neq.');
+      expect(url).toContain('Tim');
+    });
+
+    test('cluster detection uses 7-day lookback window', async () => {
+      const fetchFn = makeFetch([]);
+      await detectCluster('AAPL', '2026-03-27', 'Tim Cook', {
+        supabaseUrl: SUPA_URL, serviceKey: SUPA_KEY, fetchFn,
+      });
+      const [url] = fetchFn.mock.calls[0];
+      expect(url).toContain('gte.');
+    });
+
+    test('cluster_size = prior matching insiders + 1', async () => {
+      const fetchFn = jest.fn()
+        .mockResolvedValueOnce({
+          ok: true,
+          json: async () => [
+            { id: 'rec1', insider_name: 'Jony Ive', cluster_id: null },
+            { id: 'rec2', insider_name: 'Phil Schiller', cluster_id: null },
+          ],
+        })
+        .mockResolvedValueOnce({ ok: true, json: async () => [] });
+      const result = await detectCluster('AAPL', '2026-03-25', 'Tim Cook', {
+        supabaseUrl: SUPA_URL, serviceKey: SUPA_KEY, fetchFn,
+      });
+      expect(result.clusterSize).toBe(3); // 2 prior + 1 current
+    });
+
+    test('Supabase requests use service_role key in apikey header', async () => {
+      const fetchFn = makeFetch([]);
+      await detectCluster('AAPL', '2026-03-25', 'Tim Cook', {
+        supabaseUrl: SUPA_URL, serviceKey: 'MY_SERVICE_KEY', fetchFn,
+      });
+      const [, opts] = fetchFn.mock.calls[0];
+      expect(opts.headers['apikey']).toBe('MY_SERVICE_KEY');
+    });
+  });
+});
