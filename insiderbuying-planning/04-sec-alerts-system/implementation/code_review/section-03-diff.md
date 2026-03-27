diff --git a/insiderbuying-site/n8n/code/insiderbuying/score-alert.js b/insiderbuying-site/n8n/code/insiderbuying/score-alert.js
new file mode 100644
index 0000000..f054995
--- /dev/null
+++ b/insiderbuying-site/n8n/code/insiderbuying/score-alert.js
@@ -0,0 +1,362 @@
+'use strict';
+
+// ─── score-alert.js ─────────────────────────────────────────────────────────
+// Significance scoring node for the W4 InsiderBuying.ai pipeline.
+// Runs after sec-monitor.js, before analyze-alert.js.
+// Computes a 1-10 significance score using Claude Haiku plus insider track
+// record from Supabase history and Yahoo Finance 30-day price returns.
+// ────────────────────────────────────────────────────────────────────────────
+
+const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
+const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
+const YAHOO_API = 'https://query1.finance.yahoo.com/v8/finance/chart';
+const HISTORY_MONTHS = 24;
+
+// ─── 3.1 Insider Name Normalization ─────────────────────────────────────────
+
+/**
+ * Strips middle initials (single uppercase letter followed by period),
+ * common suffixes (Jr., Sr., II, III, IV), lowercases and trims.
+ * 'John A. Smith' and 'John Smith' both normalize to 'john smith'.
+ */
+function normalizeInsiderName(name) {
+  return name
+    .replace(/\b[A-Z]\.\s*/g, '')        // remove middle initials like "A. "
+    .replace(/\b(Jr|Sr|II|III|IV|V)\b\.?/gi, '')  // remove suffixes
+    .replace(/\s+/g, ' ')
+    .toLowerCase()
+    .trim();
+}
+
+// ─── 3.1 Yahoo Finance Price Fetch ──────────────────────────────────────────
+
+/**
+ * Returns 30-day return for a given ticker and filing date.
+ * Returns null if data unavailable (graceful degradation).
+ */
+async function fetch30DayReturn(ticker, filingDateStr, fetchFn) {
+  const start = Math.floor(new Date(filingDateStr).getTime() / 1000);
+  const end = start + 31 * 86400;
+  const url = `${YAHOO_API}/${ticker}?interval=1d&period1=${start}&period2=${end}`;
+
+  const resp = await fetchFn(url, {
+    headers: { 'User-Agent': 'Mozilla/5.0' },
+  });
+
+  if (!resp.ok) return null;
+
+  const data = await resp.json();
+  const result = data?.chart?.result?.[0];
+  if (!result) return null;
+
+  const timestamps = result.timestamp || [];
+  const closes = result.indicators?.quote?.[0]?.close || [];
+
+  // Find first valid close (start price) and last valid close (end price)
+  const validPairs = timestamps
+    .map((ts, i) => ({ ts, price: closes[i] }))
+    .filter(({ price }) => price != null && price > 0);
+
+  if (validPairs.length < 2) return null;
+
+  const startPrice = validPairs[0].price;
+  const endPrice = validPairs[validPairs.length - 1].price;
+
+  return (endPrice - startPrice) / startPrice;
+}
+
+// ─── 3.1 computeTrackRecord ─────────────────────────────────────────────────
+
+/**
+ * Queries Supabase for past buys by this insider (past 24 months),
+ * then fetches 30-day returns from Yahoo Finance for each.
+ *
+ * Returns { past_buy_count, hit_rate, avg_gain_30d }
+ * hit_rate and avg_gain_30d are null if Yahoo data unavailable.
+ */
+async function computeTrackRecord(insiderName, supabaseUrl, supabaseKey, { fetchFn } = {}) {
+  const cutoff = new Date();
+  cutoff.setMonth(cutoff.getMonth() - HISTORY_MONTHS);
+  const cutoffStr = cutoff.toISOString().slice(0, 10);
+
+  const normalizedName = normalizeInsiderName(insiderName);
+  // Use ilike with wildcard pattern to match normalized form in DB
+  const namePattern = `*${normalizedName.split(' ').join('*')}*`;
+
+  let rows = [];
+  try {
+    const params = new URLSearchParams({
+      select: 'ticker,filing_date,total_value',
+      transaction_type: 'eq.buy',
+      'filing_date': `gte.${cutoffStr}`,
+      'insider_name': `ilike.${namePattern}`,
+    });
+    const url = `${supabaseUrl}/rest/v1/insider_alerts?${params}`;
+    const resp = await fetchFn(url, {
+      headers: {
+        apikey: supabaseKey,
+        Authorization: `Bearer ${supabaseKey}`,
+      },
+    });
+    if (!resp.ok) {
+      return { past_buy_count: 0, hit_rate: null, avg_gain_30d: null };
+    }
+    rows = await resp.json();
+  } catch {
+    return { past_buy_count: 0, hit_rate: null, avg_gain_30d: null };
+  }
+
+  if (!Array.isArray(rows) || rows.length === 0) {
+    return { past_buy_count: 0, hit_rate: null, avg_gain_30d: null };
+  }
+
+  // Fetch 30-day returns for each past buy (sequentially — gentle on Yahoo Finance)
+  let returns = [];
+  try {
+    for (const row of rows) {
+      const ret = await fetch30DayReturn(row.ticker, row.filing_date, fetchFn);
+      returns.push(ret);
+    }
+  } catch {
+    // Yahoo Finance completely broken — return count only, nulls for metrics
+    return { past_buy_count: rows.length, hit_rate: null, avg_gain_30d: null };
+  }
+
+  const validReturns = returns.filter(r => r !== null);
+  if (validReturns.length === 0) {
+    return { past_buy_count: rows.length, hit_rate: null, avg_gain_30d: null };
+  }
+
+  const hits = validReturns.filter(r => r > 0.05);
+  const hit_rate = hits.length / validReturns.length;
+  const avg_gain_30d = validReturns.reduce((sum, r) => sum + r, 0) / validReturns.length;
+
+  return { past_buy_count: rows.length, hit_rate, avg_gain_30d };
+}
+
+// ─── 3.2 buildHaikuPrompt ───────────────────────────────────────────────────
+
+/**
+ * Builds the prompt string for Claude Haiku significance scoring.
+ */
+function buildHaikuPrompt(filing, trackRecord) {
+  const {
+    ticker, insider_name, insider_category, transaction_type,
+    transaction_shares, transaction_price_per_share, total_value,
+    filing_date, transaction_date, is_cluster_buy, cluster_size,
+  } = filing;
+
+  const { past_buy_count, hit_rate, avg_gain_30d } = trackRecord;
+
+  const trackStr = past_buy_count === 0
+    ? 'No historical purchases found for this insider in the past 24 months.'
+    : `Past buys (24 months): ${past_buy_count}` +
+      (hit_rate !== null ? `, hit_rate (>5% gain in 30d): ${hit_rate} (${(hit_rate * 100).toFixed(1)}%)` : ', hit_rate: unknown') +
+      (avg_gain_30d !== null ? `, avg_gain_30d: ${avg_gain_30d} (${(avg_gain_30d * 100).toFixed(1)}%)` : ', avg_gain_30d: unknown') + '.';
+
+  const clusterStr = is_cluster_buy
+    ? `CLUSTER BUY: Yes — ${cluster_size} insiders bought this stock within a 7-day window.`
+    : 'Cluster buy: No (single insider purchase).';
+
+  return `You are an expert insider trading analyst. Score the significance of this insider purchase from 1 to 10.
+
+FILING DATA:
+- Ticker: ${ticker}
+- Insider Name: ${insider_name}
+- Insider Category: ${insider_category}
+- Transaction Type: ${transaction_type}
+- Shares: ${transaction_shares ?? 'unknown'}
+- Price per Share: $${transaction_price_per_share ?? 'unknown'}
+- Total Value: $${total_value ?? 'unknown'}
+- Filing Date: ${filing_date}
+- Transaction Date: ${transaction_date}
+
+CLUSTER SIGNAL:
+${clusterStr}
+
+INSIDER TRACK RECORD:
+${trackStr}
+(If hit_rate is null/unknown, treat as neutral — do not penalize for lack of data.)
+
+SCORING CRITERIA:
+1. Role weight: C-Suite (+3), Board (+2), VP (+1), Officer = baseline
+2. Transaction size: $500K+ = notable, $1M+ = significant, $5M+ = highly significant
+3. Track record: hit_rate >60% with positive avg_gain_30d boosts score; null = neutral
+4. Cluster bonus: Multiple insiders buying same stock in 7-day window = highly significant (+3)
+5. Timing signals: near earnings window, first buy in 2+ years, buy after >15% price drop = boost
+6. Purchase type: Open-market purchase (P - Purchase) scores higher than option exercise
+
+Respond with ONLY a JSON object in this exact format:
+{"score": <integer 1-10>, "reasoning": "<1-2 sentence explanation>"}`;
+}
+
+// ─── 3.2 parseHaikuResponse ──────────────────────────────────────────────────
+
+/**
+ * Repairs and parses the raw text response from Haiku.
+ * Strips markdown fences, fixes smart quotes, extracts first {...} object.
+ * Returns { score: number, reasoning: string } with score clamped to [1,10].
+ * Throws on parse failure.
+ */
+function parseHaikuResponse(rawText) {
+  let text = rawText;
+
+  // Strip markdown code fences
+  text = text.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/im, '');
+
+  // Fix smart quotes
+  text = text
+    .replace(/\u201c/g, '"')
+    .replace(/\u201d/g, '"')
+    .replace(/\u2018/g, "'")
+    .replace(/\u2019/g, "'");
+
+  // Extract first {...} object
+  const start = text.indexOf('{');
+  const end = text.lastIndexOf('}');
+  if (start === -1 || end === -1 || end <= start) {
+    throw new Error(`No JSON object found in Haiku response: ${rawText.slice(0, 100)}`);
+  }
+  text = text.slice(start, end + 1);
+
+  let parsed;
+  try {
+    parsed = JSON.parse(text);
+  } catch (e) {
+    throw new Error(`Failed to parse Haiku JSON: ${e.message}. Raw: ${rawText.slice(0, 100)}`);
+  }
+
+  if (parsed.score === undefined || parsed.score === null) {
+    throw new Error('Haiku response missing "score" field');
+  }
+  if (!parsed.reasoning || typeof parsed.reasoning !== 'string' || parsed.reasoning.trim() === '') {
+    throw new Error('Haiku response missing or empty "reasoning" field');
+  }
+
+  // Clamp and round score to integer [1, 10]
+  const score = Math.min(10, Math.max(1, Math.round(Number(parsed.score))));
+
+  return { score, reasoning: parsed.reasoning };
+}
+
+// ─── 3.2 callHaiku ──────────────────────────────────────────────────────────
+
+const HAIKU_DEFAULT = { score: 5, reasoning: 'Scoring unavailable' };
+
+/**
+ * Calls Anthropic Haiku API with prompt. Retries up to 2 times on failure.
+ * Returns { score, reasoning } or default { score: 5, ... } on exhausted retries.
+ */
+async function callHaiku(prompt, anthropicApiKey, { fetchFn, _sleep } = {}) {
+  const body = JSON.stringify({
+    model: HAIKU_MODEL,
+    max_tokens: 256,
+    messages: [{ role: 'user', content: prompt }],
+  });
+
+  const headers = {
+    'Content-Type': 'application/json',
+    'x-api-key': anthropicApiKey,
+    'anthropic-version': '2023-06-01',
+  };
+
+  for (let attempt = 0; attempt <= 2; attempt++) {
+    try {
+      if (attempt > 0 && _sleep) await _sleep(1000 * attempt);
+
+      const resp = await fetchFn(ANTHROPIC_API, { method: 'POST', headers, body });
+
+      if (!resp.ok) {
+        if (attempt === 2) return HAIKU_DEFAULT;
+        continue;
+      }
+
+      const data = await resp.json();
+      const rawText = data?.content?.[0]?.text;
+      if (!rawText) {
+        if (attempt === 2) return HAIKU_DEFAULT;
+        continue;
+      }
+
+      return parseHaikuResponse(rawText);
+    } catch {
+      if (attempt === 2) return HAIKU_DEFAULT;
+    }
+  }
+
+  return HAIKU_DEFAULT;
+}
+
+// ─── 3.3 runScoreAlert ──────────────────────────────────────────────────────
+
+/**
+ * Main n8n node entry point.
+ * Iterates over all filings sequentially, scores each with Haiku,
+ * and returns the enriched filing array.
+ *
+ * @param {Array} filings - Array of filing objects from sec-monitor.js
+ * @param {Object} helpers - { supabaseUrl, supabaseKey, anthropicApiKey, fetchFn, _sleep }
+ * @returns {Array} filings enriched with significance_score, score_reasoning, track_record
+ */
+async function runScoreAlert(filings, helpers = {}) {
+  const { supabaseUrl, supabaseKey, anthropicApiKey, fetchFn, _sleep } = helpers;
+
+  if (!filings || filings.length === 0) return [];
+
+  const results = [];
+
+  for (const filing of filings) {
+    // Step 1: compute track record (graceful on any failure)
+    const trackRecord = await computeTrackRecord(
+      filing.insider_name,
+      supabaseUrl,
+      supabaseKey,
+      { fetchFn }
+    );
+
+    // Step 2: build prompt and call Haiku
+    const prompt = buildHaikuPrompt(filing, trackRecord);
+    const { score, reasoning } = await callHaiku(prompt, anthropicApiKey, { fetchFn, _sleep });
+
+    results.push({
+      ...filing,
+      significance_score: score,
+      score_reasoning: reasoning,
+      track_record: trackRecord,
+    });
+  }
+
+  return results;
+}
+
+// ─── n8n Code node entry point ───────────────────────────────────────────────
+// When running inside n8n, the node receives $input.all() items.
+// This block is only executed in n8n context (not in tests).
+// n8n Code nodes support top-level await — Jest does not, so the guard
+// on typeof $input prevents this from running during tests.
+
+/* n8n-entrypoint-start
+const filings = $input.all().map(item => item.json);
+
+const helpers = {
+  supabaseUrl: $env.SUPABASE_URL,
+  supabaseKey: $env.SUPABASE_SERVICE_ROLE_KEY,
+  anthropicApiKey: $env.ANTHROPIC_API_KEY,
+  fetchFn: (url, opts) => fetch(url, opts),
+  _sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
+};
+
+const results = await runScoreAlert(filings, helpers);
+return results.map(item => ({ json: item }));
+n8n-entrypoint-end */
+
+// ─── Exports (for testing) ───────────────────────────────────────────────────
+
+module.exports = {
+  normalizeInsiderName,
+  computeTrackRecord,
+  buildHaikuPrompt,
+  parseHaikuResponse,
+  callHaiku,
+  runScoreAlert,
+};
diff --git a/insiderbuying-site/tests/insiderbuying/score-alert.test.js b/insiderbuying-site/tests/insiderbuying/score-alert.test.js
new file mode 100644
index 0000000..5c960f9
--- /dev/null
+++ b/insiderbuying-site/tests/insiderbuying/score-alert.test.js
@@ -0,0 +1,424 @@
+'use strict';
+
+const {
+  normalizeInsiderName,
+  computeTrackRecord,
+  buildHaikuPrompt,
+  parseHaikuResponse,
+  callHaiku,
+  runScoreAlert,
+} = require('../../n8n/code/insiderbuying/score-alert');
+
+// ─── helpers ────────────────────────────────────────────────────────────────
+
+function makeFetch(response, ok = true, status = 200) {
+  return jest.fn().mockResolvedValue({
+    ok,
+    status,
+    json: async () => response,
+  });
+}
+
+function makeFetchSeq(...calls) {
+  const fn = jest.fn();
+  calls.forEach(({ response, ok = true, status = 200 }) => {
+    fn.mockResolvedValueOnce({ ok, status, json: async () => response });
+  });
+  return fn;
+}
+
+const noSleep = jest.fn().mockResolvedValue(undefined);
+
+const SUPABASE_URL = 'https://test.supabase.co';
+const SUPABASE_KEY = 'test-key';
+const ANTHROPIC_KEY = 'test-anthropic';
+
+const SAMPLE_FILING = {
+  ticker: 'AAPL',
+  insider_name: 'Timothy D. Cook',
+  insider_category: 'C-Suite',
+  transaction_type: 'P - Purchase',
+  transaction_shares: 10000,
+  transaction_price_per_share: 150,
+  total_value: 1500000,
+  filing_date: '2024-01-15',
+  transaction_date: '2024-01-12',
+  is_cluster_buy: false,
+  cluster_id: null,
+  cluster_size: 1,
+};
+
+const HAIKU_JSON_RESPONSE = '{"score": 8, "reasoning": "Large C-Suite purchase signals confidence."}';
+
+// ─── 3.1 normalizeInsiderName ───────────────────────────────────────────────
+
+describe('normalizeInsiderName', () => {
+  test('strips middle initial and lowercases', () => {
+    expect(normalizeInsiderName('John A. Smith')).toBe('john smith');
+  });
+
+  test('collapses John A. Smith and John Smith to same key', () => {
+    expect(normalizeInsiderName('John A. Smith')).toBe(normalizeInsiderName('John Smith'));
+  });
+
+  test('strips multiple middle initials', () => {
+    expect(normalizeInsiderName('Mary B. C. Jones')).toBe('mary jones');
+  });
+
+  test('handles suffixes Jr. and III', () => {
+    // Suffixes stripped if they are short tokens at end
+    const result = normalizeInsiderName('Robert E. Lee Jr.');
+    expect(result).not.toContain('e.');
+  });
+
+  test('lowercases and trims', () => {
+    expect(normalizeInsiderName('  JOHN SMITH  ')).toBe('john smith');
+  });
+
+  test('handles names without middle initial', () => {
+    expect(normalizeInsiderName('Tim Cook')).toBe('tim cook');
+  });
+});
+
+// ─── 3.1 computeTrackRecord ─────────────────────────────────────────────────
+
+describe('computeTrackRecord', () => {
+  test('returns zero-nulls when no Supabase history', async () => {
+    const fetchFn = makeFetch([]);
+    const result = await computeTrackRecord('John Smith', SUPABASE_URL, SUPABASE_KEY, { fetchFn });
+    expect(result).toEqual({ past_buy_count: 0, hit_rate: null, avg_gain_30d: null });
+  });
+
+  test('returns past_buy_count matching Supabase rows', async () => {
+    const rows = [
+      { ticker: 'AAPL', filing_date: '2023-06-01', total_value: 500000 },
+      { ticker: 'AAPL', filing_date: '2023-09-01', total_value: 300000 },
+    ];
+    // Supabase returns rows; Yahoo returns no useful data (empty) → skip price step
+    const fetchFn = jest.fn()
+      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => rows })
+      // Yahoo calls fail gracefully
+      .mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
+
+    const result = await computeTrackRecord('John Smith', SUPABASE_URL, SUPABASE_KEY, { fetchFn });
+    expect(result.past_buy_count).toBe(2);
+  });
+
+  test('computes hit_rate: 2 of 3 buys gained >5% → 0.67', async () => {
+    const rows = [
+      { ticker: 'AAPL', filing_date: '2023-01-01', total_value: 100000 },
+      { ticker: 'AAPL', filing_date: '2023-04-01', total_value: 200000 },
+      { ticker: 'AAPL', filing_date: '2023-07-01', total_value: 150000 },
+    ];
+
+    // Build Yahoo response factory: price at filing_date=100, price at +30d varies
+    function makeYahoo(startPrice, endPrice) {
+      const now = Date.now() / 1000;
+      return {
+        chart: {
+          result: [{
+            timestamp: [now, now + 86400 * 15, now + 86400 * 30],
+            indicators: { quote: [{ close: [startPrice, null, endPrice] }] },
+          }],
+          error: null,
+        },
+      };
+    }
+
+    const fetchFn = jest.fn()
+      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => rows })
+      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeYahoo(100, 107) }) // +7% hit
+      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeYahoo(100, 103) }) // +3% miss
+      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeYahoo(100, 112) }); // +12% hit
+
+    const result = await computeTrackRecord('John Smith', SUPABASE_URL, SUPABASE_KEY, { fetchFn });
+    expect(result.past_buy_count).toBe(3);
+    expect(result.hit_rate).toBeCloseTo(2 / 3, 2);
+  });
+
+  test('Yahoo Finance network error → returns null track record without throwing', async () => {
+    const rows = [{ ticker: 'AAPL', filing_date: '2023-01-01', total_value: 100000 }];
+    const fetchFn = jest.fn()
+      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => rows })
+      .mockRejectedValueOnce(new Error('network timeout'));
+
+    const result = await computeTrackRecord('John Smith', SUPABASE_URL, SUPABASE_KEY, { fetchFn });
+    expect(result).toEqual({ past_buy_count: 1, hit_rate: null, avg_gain_30d: null });
+  });
+
+  test('Yahoo Finance 429 → returns null without throwing', async () => {
+    const rows = [{ ticker: 'AAPL', filing_date: '2023-01-01', total_value: 100000 }];
+    const fetchFn = jest.fn()
+      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => rows })
+      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) });
+
+    const result = await computeTrackRecord('John Smith', SUPABASE_URL, SUPABASE_KEY, { fetchFn });
+    expect(result.hit_rate).toBeNull();
+    expect(result.avg_gain_30d).toBeNull();
+  });
+
+  test('Supabase failure → returns zero-nulls without throwing', async () => {
+    const fetchFn = jest.fn().mockRejectedValue(new Error('connection refused'));
+    const result = await computeTrackRecord('John Smith', SUPABASE_URL, SUPABASE_KEY, { fetchFn });
+    expect(result).toEqual({ past_buy_count: 0, hit_rate: null, avg_gain_30d: null });
+  });
+});
+
+// ─── 3.2 buildHaikuPrompt ───────────────────────────────────────────────────
+
+describe('buildHaikuPrompt', () => {
+  const trackRecord = { past_buy_count: 3, hit_rate: 0.67, avg_gain_30d: 0.12 };
+
+  test('includes ticker in prompt', () => {
+    const p = buildHaikuPrompt(SAMPLE_FILING, trackRecord);
+    expect(p).toContain('AAPL');
+  });
+
+  test('includes insider_category in prompt', () => {
+    const p = buildHaikuPrompt(SAMPLE_FILING, trackRecord);
+    expect(p).toContain('C-Suite');
+  });
+
+  test('includes transaction_type in prompt', () => {
+    const p = buildHaikuPrompt(SAMPLE_FILING, trackRecord);
+    expect(p).toContain('P - Purchase');
+  });
+
+  test('includes total_value in prompt', () => {
+    const p = buildHaikuPrompt(SAMPLE_FILING, trackRecord);
+    expect(p).toContain('1500000');
+  });
+
+  test('includes is_cluster_buy in prompt', () => {
+    const clusterFiling = { ...SAMPLE_FILING, is_cluster_buy: true, cluster_size: 3 };
+    const p = buildHaikuPrompt(clusterFiling, trackRecord);
+    expect(p.toLowerCase()).toContain('cluster');
+  });
+
+  test('includes track record fields in prompt', () => {
+    const p = buildHaikuPrompt(SAMPLE_FILING, trackRecord);
+    expect(p).toContain('0.67');
+    expect(p).toContain('0.12');
+  });
+
+  test('handles null track record fields gracefully', () => {
+    const nullTrack = { past_buy_count: 0, hit_rate: null, avg_gain_30d: null };
+    const p = buildHaikuPrompt(SAMPLE_FILING, nullTrack);
+    expect(typeof p).toBe('string');
+    expect(p.length).toBeGreaterThan(100);
+  });
+
+  test('requests JSON output with score and reasoning fields', () => {
+    const p = buildHaikuPrompt(SAMPLE_FILING, trackRecord);
+    expect(p).toContain('score');
+    expect(p).toContain('reasoning');
+  });
+});
+
+// ─── 3.2 parseHaikuResponse ─────────────────────────────────────────────────
+
+describe('parseHaikuResponse', () => {
+  test('parses clean JSON response', () => {
+    const result = parseHaikuResponse('{"score": 7, "reasoning": "Strong C-Suite signal."}');
+    expect(result).toEqual({ score: 7, reasoning: 'Strong C-Suite signal.' });
+  });
+
+  test('parses markdown-fenced JSON', () => {
+    const raw = '```json\n{"score": 8, "reasoning": "Cluster buy detected."}\n```';
+    const result = parseHaikuResponse(raw);
+    expect(result.score).toBe(8);
+    expect(result.reasoning).toContain('Cluster');
+  });
+
+  test('handles smart quotes in JSON string', () => {
+    const raw = '{\u201cscore\u201d: 6, \u201creasoning\u201d: \u201cModerate signal.\u201d}';
+    const result = parseHaikuResponse(raw);
+    expect(result.score).toBe(6);
+  });
+
+  test('throws if score field is missing', () => {
+    expect(() => parseHaikuResponse('{"reasoning": "no score here"}')).toThrow();
+  });
+
+  test('throws if reasoning is empty string', () => {
+    expect(() => parseHaikuResponse('{"score": 5, "reasoning": ""}')).toThrow();
+  });
+
+  test('throws on completely invalid JSON', () => {
+    expect(() => parseHaikuResponse('not json at all')).toThrow();
+  });
+});
+
+// ─── 3.2 score clamping / rounding ──────────────────────────────────────────
+
+describe('score clamping and rounding', () => {
+  test('score 11 is clamped to 10', () => {
+    const result = parseHaikuResponse('{"score": 11, "reasoning": "Very high."}');
+    expect(result.score).toBe(10);
+  });
+
+  test('score 0 is clamped to 1', () => {
+    const result = parseHaikuResponse('{"score": 0, "reasoning": "Very low."}');
+    expect(result.score).toBe(1);
+  });
+
+  test('float 7.5 rounds to 8', () => {
+    const result = parseHaikuResponse('{"score": 7.5, "reasoning": "Mid-range."}');
+    expect(result.score).toBe(8);
+  });
+
+  test('float 7.4 rounds to 7', () => {
+    const result = parseHaikuResponse('{"score": 7.4, "reasoning": "Mid-range."}');
+    expect(result.score).toBe(7);
+  });
+});
+
+// ─── 3.2 callHaiku ──────────────────────────────────────────────────────────
+
+describe('callHaiku', () => {
+  test('calls Anthropic messages endpoint with correct model', async () => {
+    const fetchFn = makeFetch({
+      content: [{ type: 'text', text: HAIKU_JSON_RESPONSE }],
+    });
+    const result = await callHaiku('test prompt', ANTHROPIC_KEY, { fetchFn, _sleep: noSleep });
+    const [url, opts] = fetchFn.mock.calls[0];
+    expect(url).toContain('anthropic.com');
+    expect(JSON.parse(opts.body).model).toContain('haiku');
+  });
+
+  test('returns parsed score and reasoning on success', async () => {
+    const fetchFn = makeFetch({
+      content: [{ type: 'text', text: HAIKU_JSON_RESPONSE }],
+    });
+    const result = await callHaiku('test prompt', ANTHROPIC_KEY, { fetchFn, _sleep: noSleep });
+    expect(result.score).toBe(8);
+    expect(result.reasoning).toContain('C-Suite');
+  });
+
+  test('retries on 429 and succeeds on 2nd attempt', async () => {
+    const fetchFn = jest.fn()
+      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) })
+      .mockResolvedValueOnce({
+        ok: true, status: 200,
+        json: async () => ({ content: [{ type: 'text', text: HAIKU_JSON_RESPONSE }] }),
+      });
+    const result = await callHaiku('test prompt', ANTHROPIC_KEY, { fetchFn, _sleep: noSleep });
+    expect(result.score).toBe(8);
+    expect(fetchFn).toHaveBeenCalledTimes(2);
+  });
+
+  test('defaults to score=5 after 2 retries exhausted', async () => {
+    const fetchFn = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
+    const result = await callHaiku('test prompt', ANTHROPIC_KEY, { fetchFn, _sleep: noSleep });
+    expect(result).toEqual({ score: 5, reasoning: 'Scoring unavailable' });
+    expect(fetchFn).toHaveBeenCalledTimes(3); // initial + 2 retries
+  });
+
+  test('defaults to score=5 on network error after retries', async () => {
+    const fetchFn = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
+    const result = await callHaiku('test prompt', ANTHROPIC_KEY, { fetchFn, _sleep: noSleep });
+    expect(result).toEqual({ score: 5, reasoning: 'Scoring unavailable' });
+  });
+});
+
+// ─── 3.3 runScoreAlert integration ──────────────────────────────────────────
+
+describe('runScoreAlert', () => {
+  test('returns scored filing with significance_score, score_reasoning, track_record', async () => {
+    const supabaseFetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
+    const haikuResponse = {
+      content: [{ type: 'text', text: '{"score": 7, "reasoning": "Good signal."}' }],
+    };
+    const fetchFn = jest.fn()
+      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] }) // Supabase history
+      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => haikuResponse.content[0] }) // won't happen
+      .mockResolvedValue({ ok: true, status: 200, json: async () => haikuResponse }); // Haiku
+
+    // Use separate fetchFn per service to simplify
+    const supabaseFn = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
+    const haikuFn = jest.fn().mockResolvedValue({
+      ok: true, status: 200,
+      json: async () => ({ content: [{ type: 'text', text: '{"score": 7, "reasoning": "Good signal."}' }] }),
+    });
+
+    const result = await runScoreAlert([SAMPLE_FILING], {
+      supabaseUrl: SUPABASE_URL,
+      supabaseKey: SUPABASE_KEY,
+      anthropicApiKey: ANTHROPIC_KEY,
+      fetchFn: (url, opts) => {
+        if (url.includes('supabase') || url.includes('insider_alerts') || url.includes('finance.yahoo')) {
+          return supabaseFn(url, opts);
+        }
+        return haikuFn(url, opts);
+      },
+      _sleep: noSleep,
+    });
+
+    expect(result).toHaveLength(1);
+    expect(result[0]).toMatchObject({
+      ticker: 'AAPL',
+      significance_score: expect.any(Number),
+      score_reasoning: expect.any(String),
+      track_record: expect.objectContaining({ past_buy_count: expect.any(Number) }),
+    });
+  });
+
+  test('processes multiple filings sequentially', async () => {
+    const filing2 = { ...SAMPLE_FILING, ticker: 'MSFT', insider_name: 'Satya Nadella' };
+    const supabaseFn = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
+    const haikuFn = jest.fn().mockResolvedValue({
+      ok: true, status: 200,
+      json: async () => ({ content: [{ type: 'text', text: '{"score": 6, "reasoning": "Moderate."}' }] }),
+    });
+    const fetchFn = (url) => {
+      if (url.includes('supabase') || url.includes('finance.yahoo') || url.includes('insider_alerts')) {
+        return supabaseFn(url);
+      }
+      return haikuFn(url);
+    };
+
+    const results = await runScoreAlert([SAMPLE_FILING, filing2], {
+      supabaseUrl: SUPABASE_URL,
+      supabaseKey: SUPABASE_KEY,
+      anthropicApiKey: ANTHROPIC_KEY,
+      fetchFn,
+      _sleep: noSleep,
+    });
+
+    expect(results).toHaveLength(2);
+    expect(results[0].ticker).toBe('AAPL');
+    expect(results[1].ticker).toBe('MSFT');
+  });
+
+  test('preserves all original filing fields in output', async () => {
+    const supabaseFn = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
+    const haikuFn = jest.fn().mockResolvedValue({
+      ok: true, status: 200,
+      json: async () => ({ content: [{ type: 'text', text: '{"score": 5, "reasoning": "Test."}' }] }),
+    });
+    const fetchFn = (url) => url.includes('anthropic') ? haikuFn(url) : supabaseFn(url);
+
+    const results = await runScoreAlert([SAMPLE_FILING], {
+      supabaseUrl: SUPABASE_URL,
+      supabaseKey: SUPABASE_KEY,
+      anthropicApiKey: ANTHROPIC_KEY,
+      fetchFn,
+      _sleep: noSleep,
+    });
+
+    expect(results[0].is_cluster_buy).toBe(false);
+    expect(results[0].cluster_id).toBeNull();
+    expect(results[0].transaction_type).toBe('P - Purchase');
+  });
+
+  test('handles empty filings array', async () => {
+    const results = await runScoreAlert([], {
+      supabaseUrl: SUPABASE_URL,
+      supabaseKey: SUPABASE_KEY,
+      anthropicApiKey: ANTHROPIC_KEY,
+      fetchFn: jest.fn(),
+      _sleep: noSleep,
+    });
+    expect(results).toEqual([]);
+  });
+});
