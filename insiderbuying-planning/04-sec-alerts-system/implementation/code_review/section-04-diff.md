diff --git a/insiderbuying-site/n8n/code/insiderbuying/analyze-alert.js b/insiderbuying-site/n8n/code/insiderbuying/analyze-alert.js
new file mode 100644
index 0000000..25491ee
--- /dev/null
+++ b/insiderbuying-site/n8n/code/insiderbuying/analyze-alert.js
@@ -0,0 +1,169 @@
+'use strict';
+
+// ─── Prompt builder ─────────────────────────────────────────────────────────
+
+function buildAnalysisPrompt(filing) {
+  const trackRecordSection = filing.track_record
+    ? [
+        `Track record: ${filing.track_record.past_buy_count} past buys, ` +
+        `${Math.round((filing.track_record.hit_rate || 0) * 100)}% hit rate, ` +
+        `${Math.round((filing.track_record.avg_gain_30d || 0) * 100)}% avg 30-day gain.`,
+      ].join('')
+    : 'This insider has no track record of prior purchases in our database.';
+
+  const clusterSection = filing.is_cluster_buy
+    ? `This is a CLUSTER BUY: ${filing.cluster_size} insiders are buying within a 7-day window.`
+    : '';
+
+  return `You are a financial analyst writing about an SEC insider trading filing for retail investors.
+
+FILING DATA:
+- Company: ${filing.company_name} (${filing.ticker})
+- Insider: ${filing.insider_name}, ${filing.insider_title} (${filing.insider_category})
+- Transaction: ${filing.transaction_shares} shares at $${filing.price_per_share} per share, total value $${filing.total_value}
+- Date: ${filing.transaction_date}
+- Significance score: ${filing.significance_score}/10
+- Score reasoning: ${filing.score_reasoning}
+${clusterSection ? `- ${clusterSection}` : ''}
+- ${trackRecordSection}
+
+INSTRUCTIONS:
+Write 2-3 paragraphs covering these three angles:
+1. TRADE SIGNAL: Why would this insider make this specific trade now? What context explains the timing or size? Stick to what the data supports.
+2. HISTORICAL CONTEXT: This insider's track record. How does this trade compare to past behavior? If no track record, acknowledge it neutrally.
+3. RISK FACTORS: Why this trade might be less meaningful than it appears (scheduled 10b5-1 plan, routine compensation, sector headwinds, diversification).
+
+TONE: Informative, not alarmist. Written for a retail investor who understands basic market concepts.
+
+CRITICAL: Do NOT use generic phrases like "insiders have information about their company" or "this is significant because insiders know more than the market". Be specific. Reference the actual numbers: ${filing.transaction_shares} shares at $${filing.price_per_share} per share for a total of $${filing.total_value}. Name the insider's role. If track record data is available, cite it. If cluster data is present, reference how many insiders are buying.
+
+Return ONLY the analysis prose. No JSON, no markdown headers, no bullet points.`;
+}
+
+// ─── Validation ─────────────────────────────────────────────────────────────
+
+function validateAnalysis(text) {
+  if (!text || typeof text !== 'string') return false;
+  if (text.length < 50) return false;
+  // Check for at least 2 paragraphs (separated by double newline or multiple newlines)
+  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
+  return paragraphs.length >= 2;
+}
+
+// ─── API call ───────────────────────────────────────────────────────────────
+
+async function callClaude(prompt, helpers) {
+  const response = await helpers.fetchFn('https://api.anthropic.com/v1/messages', {
+    method: 'POST',
+    headers: {
+      'Content-Type': 'application/json',
+      'x-api-key': helpers.anthropicApiKey,
+      'anthropic-version': '2023-06-01',
+    },
+    body: JSON.stringify({
+      model: 'claude-sonnet-4-6',
+      max_tokens: 1024,
+      messages: [{ role: 'user', content: prompt }],
+    }),
+  });
+
+  if (!response.ok) {
+    const err = new Error(`Anthropic API error: ${response.status}`);
+    err.status = response.status;
+    throw err;
+  }
+
+  const data = await response.json();
+  return data.content[0].text;
+}
+
+// ─── Main function ──────────────────────────────────────────────────────────
+
+/**
+ * Generate AI prose analysis for a qualifying filing.
+ *
+ * @param {object} filing - Enriched filing object from score-alert.js
+ * @param {object} helpers - { anthropicApiKey, fetchFn, _sleep }
+ * @returns {Promise<string|null>} - Prose analysis string, or null on skip/failure
+ */
+async function analyze(filing, helpers) {
+  // Score gate
+  if (filing.significance_score < 4) {
+    return null;
+  }
+
+  const prompt = buildAnalysisPrompt(filing);
+
+  try {
+    // First attempt
+    let text = await callWithRetry(prompt, helpers);
+
+    // Validate
+    if (validateAnalysis(text)) {
+      return text;
+    }
+
+    // One retry on validation failure
+    console.warn(
+      `[analyze-alert] Validation failed for ${filing.dedup_key}, retrying. ` +
+      `Response: ${(text || '').slice(0, 200)}`
+    );
+    text = await callWithRetry(prompt, helpers);
+
+    if (validateAnalysis(text)) {
+      return text;
+    }
+
+    console.warn(
+      `[analyze-alert] Retry also failed validation for ${filing.dedup_key}. ` +
+      `Response: ${(text || '').slice(0, 200)}`
+    );
+    return null;
+  } catch (err) {
+    console.warn(`[analyze-alert] Error for ${filing.dedup_key}: ${err.message}`);
+    return null;
+  }
+}
+
+/**
+ * Call Claude with error-specific retry logic.
+ * Handles 429 (rate limit) with 5s wait and 500/503 with immediate retry.
+ */
+async function callWithRetry(prompt, helpers) {
+  try {
+    return await callClaude(prompt, helpers);
+  } catch (err) {
+    if (err.status === 429) {
+      await helpers._sleep(5000);
+      return await callClaude(prompt, helpers);
+    }
+    if (err.status === 500 || err.status === 503) {
+      return await callClaude(prompt, helpers);
+    }
+    throw err;
+  }
+}
+
+// ─── n8n Code node wrapper (commented) ──────────────────────────────────────
+//
+// Usage inside an n8n Code node:
+//
+//   const helpers = {
+//     anthropicApiKey: $env.ANTHROPIC_API_KEY,
+//     fetchFn: (url, opts) => fetch(url, opts),
+//     _sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
+//   };
+//   for (const item of $input.all()) {
+//     item.json.ai_analysis = await analyze(item.json, helpers);
+//   }
+//   return $input.all();
+// ─────────────────────────────────────────────────────────────────────────────
+
+// ─── Exports (for testing) ───────────────────────────────────────────────────
+
+module.exports = {
+  buildAnalysisPrompt,
+  validateAnalysis,
+  callClaude,
+  analyze,
+};
diff --git a/insiderbuying-site/tests/insiderbuying/analyze-alert.test.js b/insiderbuying-site/tests/insiderbuying/analyze-alert.test.js
new file mode 100644
index 0000000..da78397
--- /dev/null
+++ b/insiderbuying-site/tests/insiderbuying/analyze-alert.test.js
@@ -0,0 +1,283 @@
+'use strict';
+
+const {
+  buildAnalysisPrompt,
+  validateAnalysis,
+  analyze,
+} = require('../../n8n/code/insiderbuying/analyze-alert');
+
+// ─── helpers ────────────────────────────────────────────────────────────────
+
+function makeFetch(responseText, ok = true, status = 200) {
+  return jest.fn().mockResolvedValue({
+    ok,
+    status,
+    json: async () => ({
+      content: [{ type: 'text', text: responseText }],
+    }),
+  });
+}
+
+const noSleep = jest.fn().mockResolvedValue(undefined);
+const ANTHROPIC_KEY = 'test-anthropic';
+
+const GOOD_ANALYSIS = [
+  'This is the first paragraph of the analysis discussing the trade signal.',
+  'The insider purchased 50,000 shares at $12.50 per share for a total of $625,000.',
+  '',
+  'The second paragraph covers historical context and risk factors in detail.',
+  'This trade is notable because of the size relative to the insider\'s typical activity.',
+].join('\n');
+
+const SAMPLE_FILING = {
+  ticker: 'AAPL',
+  company_name: 'Apple Inc.',
+  insider_name: 'Timothy D. Cook',
+  insider_title: 'Chief Executive Officer',
+  insider_category: 'C-Suite',
+  transaction_shares: 50000,
+  price_per_share: 150.25,
+  total_value: 7512500,
+  transaction_date: '2026-03-15',
+  significance_score: 7,
+  score_reasoning: 'Large C-Suite purchase with strong track record',
+  is_cluster_buy: false,
+  cluster_size: 0,
+  track_record: {
+    past_buy_count: 5,
+    hit_rate: 0.8,
+    avg_gain_30d: 0.12,
+  },
+  dedup_key: 'AAPL-TimothyDCook-2026-03-15-50000',
+};
+
+function makeHelpers(overrides = {}) {
+  return {
+    anthropicApiKey: ANTHROPIC_KEY,
+    fetchFn: makeFetch(GOOD_ANALYSIS),
+    _sleep: noSleep,
+    ...overrides,
+  };
+}
+
+// ─── Tests ──────────────────────────────────────────────────────────────────
+
+describe('analyze-alert', () => {
+  beforeEach(() => {
+    jest.clearAllMocks();
+  });
+
+  // ── Score gate ──────────────────────────────────────────────────────────
+
+  test('analyze() returns null when score < 4 (no API call)', async () => {
+    const helpers = makeHelpers();
+    const filing = { ...SAMPLE_FILING, significance_score: 3 };
+    const result = await analyze(filing, helpers);
+
+    expect(result).toBeNull();
+    expect(helpers.fetchFn).not.toHaveBeenCalled();
+  });
+
+  test('analyze() returns null when score is 0', async () => {
+    const helpers = makeHelpers();
+    const filing = { ...SAMPLE_FILING, significance_score: 0 };
+    const result = await analyze(filing, helpers);
+
+    expect(result).toBeNull();
+    expect(helpers.fetchFn).not.toHaveBeenCalled();
+  });
+
+  test('analyze() IS called when score >= 4', async () => {
+    const helpers = makeHelpers();
+    const filing = { ...SAMPLE_FILING, significance_score: 4 };
+    const result = await analyze(filing, helpers);
+
+    expect(helpers.fetchFn).toHaveBeenCalled();
+    expect(result).toBeTruthy();
+  });
+
+  test('analyze() IS called when score is exactly 4', async () => {
+    const helpers = makeHelpers();
+    const filing = { ...SAMPLE_FILING, significance_score: 4 };
+    await analyze(filing, helpers);
+
+    expect(helpers.fetchFn).toHaveBeenCalledTimes(1);
+  });
+
+  // ── Model ───────────────────────────────────────────────────────────────
+
+  test('analyze() uses model claude-sonnet-4-6', async () => {
+    const helpers = makeHelpers();
+    await analyze(SAMPLE_FILING, helpers);
+
+    const callArgs = helpers.fetchFn.mock.calls[0];
+    const body = JSON.parse(callArgs[1].body);
+    expect(body.model).toBe('claude-sonnet-4-6');
+  });
+
+  // ── Validation & retry ─────────────────────────────────────────────────
+
+  test('response with < 50 characters triggers one retry', async () => {
+    const shortResponse = 'Too short.';
+    const fetchFn = jest.fn()
+      .mockResolvedValueOnce({
+        ok: true, status: 200,
+        json: async () => ({ content: [{ type: 'text', text: shortResponse }] }),
+      })
+      .mockResolvedValueOnce({
+        ok: true, status: 200,
+        json: async () => ({ content: [{ type: 'text', text: GOOD_ANALYSIS }] }),
+      });
+
+    const helpers = makeHelpers({ fetchFn });
+    const result = await analyze(SAMPLE_FILING, helpers);
+
+    expect(fetchFn).toHaveBeenCalledTimes(2);
+    expect(result).toBe(GOOD_ANALYSIS);
+  });
+
+  test('response with only 1 paragraph triggers one retry', async () => {
+    const singleParagraph = 'This is a single paragraph without any breaks and it is long enough to pass the character check but has no paragraph separation at all.';
+    const fetchFn = jest.fn()
+      .mockResolvedValueOnce({
+        ok: true, status: 200,
+        json: async () => ({ content: [{ type: 'text', text: singleParagraph }] }),
+      })
+      .mockResolvedValueOnce({
+        ok: true, status: 200,
+        json: async () => ({ content: [{ type: 'text', text: GOOD_ANALYSIS }] }),
+      });
+
+    const helpers = makeHelpers({ fetchFn });
+    const result = await analyze(SAMPLE_FILING, helpers);
+
+    expect(fetchFn).toHaveBeenCalledTimes(2);
+    expect(result).toBe(GOOD_ANALYSIS);
+  });
+
+  test('after failed retry, ai_analysis = null (no throw)', async () => {
+    const bad = 'Bad.';
+    const fetchFn = jest.fn().mockResolvedValue({
+      ok: true, status: 200,
+      json: async () => ({ content: [{ type: 'text', text: bad }] }),
+    });
+
+    const helpers = makeHelpers({ fetchFn });
+    const result = await analyze(SAMPLE_FILING, helpers);
+
+    expect(fetchFn).toHaveBeenCalledTimes(2);
+    expect(result).toBeNull();
+  });
+
+  // ── Prompt quality ─────────────────────────────────────────────────────
+
+  test('prompt forbids generic phrases like "insiders have information"', () => {
+    const prompt = buildAnalysisPrompt(SAMPLE_FILING);
+    expect(prompt.toLowerCase()).toContain('do not use generic phrases');
+  });
+
+  test('prompt includes actual numbers (shares, price, total_value)', () => {
+    const prompt = buildAnalysisPrompt(SAMPLE_FILING);
+    expect(prompt).toContain('50000');
+    expect(prompt).toContain('150.25');
+    expect(prompt).toContain('7512500');
+  });
+
+  test('prompt includes insider name and role', () => {
+    const prompt = buildAnalysisPrompt(SAMPLE_FILING);
+    expect(prompt).toContain('Timothy D. Cook');
+    expect(prompt).toContain('Chief Executive Officer');
+  });
+
+  test('prompt includes track record when available', () => {
+    const prompt = buildAnalysisPrompt(SAMPLE_FILING);
+    expect(prompt).toContain('5');   // past_buy_count
+    expect(prompt).toContain('80%'); // hit_rate formatted
+  });
+
+  test('prompt handles null track record gracefully', () => {
+    const filing = { ...SAMPLE_FILING, track_record: null };
+    const prompt = buildAnalysisPrompt(filing);
+    expect(prompt).toContain('no track record');
+  });
+
+  test('prompt includes cluster info when present', () => {
+    const filing = { ...SAMPLE_FILING, is_cluster_buy: true, cluster_size: 4 };
+    const prompt = buildAnalysisPrompt(filing);
+    expect(prompt).toContain('cluster');
+    expect(prompt).toContain('4');
+  });
+
+  // ── Error handling ─────────────────────────────────────────────────────
+
+  test('network error returns null (no throw)', async () => {
+    const fetchFn = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
+    const helpers = makeHelpers({ fetchFn });
+    const result = await analyze(SAMPLE_FILING, helpers);
+
+    expect(result).toBeNull();
+  });
+
+  test('429 rate limit waits 5s and retries once', async () => {
+    const fetchFn = jest.fn()
+      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) })
+      .mockResolvedValueOnce({
+        ok: true, status: 200,
+        json: async () => ({ content: [{ type: 'text', text: GOOD_ANALYSIS }] }),
+      });
+
+    const helpers = makeHelpers({ fetchFn });
+    const result = await analyze(SAMPLE_FILING, helpers);
+
+    expect(fetchFn).toHaveBeenCalledTimes(2);
+    expect(helpers._sleep).toHaveBeenCalledWith(5000);
+    expect(result).toBe(GOOD_ANALYSIS);
+  });
+
+  test('429 twice returns null', async () => {
+    const fetchFn = jest.fn().mockResolvedValue({
+      ok: false, status: 429, json: async () => ({}),
+    });
+
+    const helpers = makeHelpers({ fetchFn });
+    const result = await analyze(SAMPLE_FILING, helpers);
+
+    expect(fetchFn).toHaveBeenCalledTimes(2);
+    expect(result).toBeNull();
+  });
+
+  test('500/503 retries once immediately', async () => {
+    const fetchFn = jest.fn()
+      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
+      .mockResolvedValueOnce({
+        ok: true, status: 200,
+        json: async () => ({ content: [{ type: 'text', text: GOOD_ANALYSIS }] }),
+      });
+
+    const helpers = makeHelpers({ fetchFn });
+    const result = await analyze(SAMPLE_FILING, helpers);
+
+    expect(fetchFn).toHaveBeenCalledTimes(2);
+    expect(result).toBe(GOOD_ANALYSIS);
+  });
+
+  // ── validateAnalysis unit tests ────────────────────────────────────────
+
+  test('validateAnalysis accepts 2+ paragraphs > 50 chars', () => {
+    expect(validateAnalysis(GOOD_ANALYSIS)).toBe(true);
+  });
+
+  test('validateAnalysis rejects < 50 chars', () => {
+    expect(validateAnalysis('Short.')).toBe(false);
+  });
+
+  test('validateAnalysis rejects single paragraph', () => {
+    const single = 'A'.repeat(100);
+    expect(validateAnalysis(single)).toBe(false);
+  });
+
+  test('validateAnalysis rejects null/undefined', () => {
+    expect(validateAnalysis(null)).toBe(false);
+    expect(validateAnalysis(undefined)).toBe(false);
+  });
+});
