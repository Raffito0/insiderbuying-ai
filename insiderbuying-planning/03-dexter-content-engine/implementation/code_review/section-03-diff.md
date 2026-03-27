diff --git a/insiderbuying-site/n8n/code/insiderbuying/select-keyword.js b/insiderbuying-site/n8n/code/insiderbuying/select-keyword.js
new file mode 100644
index 0000000..6a08af4
--- /dev/null
+++ b/insiderbuying-site/n8n/code/insiderbuying/select-keyword.js
@@ -0,0 +1,374 @@
+/**
+ * W1 — Keyword Selection Workflow (n8n Code Node)
+ *
+ * Weekly workflow that generates seed keywords, fetches SEO data from
+ * DataForSEO, classifies intent, scores priority, deduplicates against
+ * existing NocoDB entries, and selects the top 21 keywords per blog.
+ *
+ * Trigger: Schedule — every Sunday at midnight EST
+ */
+
+'use strict';
+
+// ---------------------------------------------------------------------------
+// Constants
+// ---------------------------------------------------------------------------
+
+const TYPE_MAP = {
+  A: ['earnings', 'analysis', 'forecast', 'valuation', 'revenue', 'results', 'financials'],
+  B: ['why', 'how', 'signal', 'insider', 'buying', 'selling', 'pattern', 'meaning'],
+  C: ['vs', 'compare', 'best', 'top', 'alternative', 'which'],
+  D: ['strategy', 'guide', 'opinion', 'approach', 'should', 'when'],
+};
+
+const INTENT_MULTIPLIERS = {
+  A: 1.0,
+  B: 1.2,
+  C: 0.8,
+  D: 0.9,
+};
+
+const KEYWORDS_PER_BLOG = 21; // 3/day * 7 days
+
+const BLOG_SEED_PATTERNS = {
+  insiderbuying: [
+    (ticker) => `insider buying ${ticker}`,
+    (ticker) => `insider selling ${ticker}`,
+    (ticker) => `Form 4 filing ${ticker}`,
+    (ticker) => `insider trading signal ${ticker}`,
+    (ticker) => `${ticker} insider transactions`,
+  ],
+  deepstockanalysis: [
+    (ticker) => `${ticker} earnings analysis`,
+    (ticker) => `${ticker} stock forecast`,
+    (ticker) => `${ticker} valuation`,
+    (ticker) => `${ticker} revenue growth`,
+  ],
+  dividenddeep: [
+    (ticker) => `${ticker} dividend safety`,
+    (ticker) => `best dividend stocks ${ticker}`,
+    (ticker) => `${ticker} payout ratio`,
+    (ticker) => `${ticker} dividend yield analysis`,
+  ],
+};
+
+// Sector-level seeds (no ticker needed)
+const BLOG_SECTOR_SEEDS = {
+  insiderbuying: [
+    'insider buying signals this week',
+    'most significant insider purchases',
+    'insider selling warnings',
+    'Form 4 cluster buys',
+  ],
+  deepstockanalysis: [
+    'undervalued stocks analysis',
+    'growth stocks forecast',
+    'stock comparison sector',
+  ],
+  dividenddeep: [
+    'best dividend stocks 2026',
+    'dividend aristocrats analysis',
+    'high yield dividend safety',
+  ],
+};
+
+const DATAFORSEO_BASE = 'https://api.dataforseo.com/v3';
+
+// ---------------------------------------------------------------------------
+// Intent classification
+// ---------------------------------------------------------------------------
+
+function classifyIntent(keyword) {
+  if (!keyword || typeof keyword !== 'string') return 'A';
+
+  const lower = keyword.toLowerCase();
+  const words = lower.split(/\s+/);
+
+  // Check types in priority order: C and D first (more specific),
+  // then B, then A. This prevents "insider buying strategy guide"
+  // from matching B (insider/buying) instead of D (strategy/guide).
+  for (const type of ['C', 'D', 'B', 'A']) {
+    for (const signal of TYPE_MAP[type]) {
+      if (words.includes(signal) || lower.includes(signal)) {
+        return type;
+      }
+    }
+  }
+
+  return 'A'; // default
+}
+
+// ---------------------------------------------------------------------------
+// Priority scoring
+// ---------------------------------------------------------------------------
+
+function computePriorityScore(searchVolume, difficulty, intentMultiplier) {
+  const vol = searchVolume || 0;
+  const diff = difficulty || 0;
+  const mult = intentMultiplier || 1.0;
+  return Math.round(vol * (1 - diff / 100) * mult * 100) / 100;
+}
+
+// ---------------------------------------------------------------------------
+// Seed keyword generation
+// ---------------------------------------------------------------------------
+
+function generateSeedKeywords(blog, tickers) {
+  const patterns = BLOG_SEED_PATTERNS[blog];
+  if (!patterns) return [];
+
+  const seeds = [];
+
+  // Ticker-based seeds
+  for (const ticker of (tickers || [])) {
+    for (const pattern of patterns) {
+      seeds.push(pattern(ticker));
+    }
+  }
+
+  // Sector-level seeds
+  const sectorSeeds = BLOG_SECTOR_SEEDS[blog] || [];
+  seeds.push(...sectorSeeds);
+
+  return seeds;
+}
+
+// ---------------------------------------------------------------------------
+// Deduplication
+// ---------------------------------------------------------------------------
+
+function isDuplicate(keyword, existingKeywords) {
+  if (!keyword || !existingKeywords || existingKeywords.length === 0) return false;
+  const lower = keyword.toLowerCase().trim();
+  return existingKeywords.some((existing) =>
+    existing.toLowerCase().trim() === lower
+  );
+}
+
+// ---------------------------------------------------------------------------
+// Top keyword selection
+// ---------------------------------------------------------------------------
+
+function selectTopKeywords(candidates, limit = KEYWORDS_PER_BLOG) {
+  return [...candidates]
+    .sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0))
+    .slice(0, limit);
+}
+
+// ---------------------------------------------------------------------------
+// DataForSEO API helpers
+// ---------------------------------------------------------------------------
+
+function buildDataForSEOAuth(login, password) {
+  const encoded = Buffer.from(`${login}:${password}`).toString('base64');
+  return `Basic ${encoded}`;
+}
+
+async function fetchSearchVolume(keywords, auth, opts = {}) {
+  const { fetchFn } = opts;
+  if (!fetchFn) throw new Error('fetchFn is required');
+
+  const response = await fetchFn(
+    `${DATAFORSEO_BASE}/keywords_data/google_ads/search_volume/live`,
+    {
+      method: 'POST',
+      headers: {
+        'Authorization': auth,
+        'Content-Type': 'application/json',
+      },
+      body: JSON.stringify([{
+        keywords,
+        location_code: 2840, // US
+        language_code: 'en',
+      }]),
+    }
+  );
+
+  if (!response.ok) return null;
+  const data = await response.json();
+  return data?.tasks?.[0]?.result || [];
+}
+
+async function fetchRelatedKeywords(keywords, auth, opts = {}) {
+  const { fetchFn } = opts;
+  if (!fetchFn) throw new Error('fetchFn is required');
+
+  const response = await fetchFn(
+    `${DATAFORSEO_BASE}/keywords_data/google_ads/keywords_for_keywords/live`,
+    {
+      method: 'POST',
+      headers: {
+        'Authorization': auth,
+        'Content-Type': 'application/json',
+      },
+      body: JSON.stringify([{
+        keywords,
+        location_code: 2840,
+      }]),
+    }
+  );
+
+  if (!response.ok) return [];
+  const data = await response.json();
+  return data?.tasks?.[0]?.result || [];
+}
+
+// ---------------------------------------------------------------------------
+// Full keyword pipeline for one blog
+// ---------------------------------------------------------------------------
+
+async function runKeywordPipeline(blog, tickers, existingKeywords, opts = {}) {
+  const { fetchFn, dataForSEOAuth } = opts;
+
+  // Step 1: Generate seeds
+  const seeds = generateSeedKeywords(blog, tickers);
+  if (seeds.length === 0) {
+    return { blog, keywords: [], warning: `No seed patterns for blog: ${blog}` };
+  }
+
+  let allCandidates = [];
+
+  // Step 2: Fetch SEO data (if DataForSEO available)
+  if (fetchFn && dataForSEOAuth) {
+    try {
+      const [volumeResults, relatedResults] = await Promise.allSettled([
+        fetchSearchVolume(seeds, dataForSEOAuth, { fetchFn }),
+        fetchRelatedKeywords(seeds, dataForSEOAuth, { fetchFn }),
+      ]);
+
+      // Process volume results
+      if (volumeResults.status === 'fulfilled' && volumeResults.value) {
+        for (const item of volumeResults.value) {
+          if (!item?.keyword) continue;
+          const type = classifyIntent(item.keyword);
+          allCandidates.push({
+            keyword: item.keyword,
+            blog,
+            search_volume: item.search_volume || 0,
+            difficulty: item.keyword_info?.keyword_difficulty || 0,
+            cpc: item.cpc || 0,
+            article_type: type,
+            intent_multiplier: INTENT_MULTIPLIERS[type],
+            priority_score: computePriorityScore(
+              item.search_volume || 0,
+              item.keyword_info?.keyword_difficulty || 0,
+              INTENT_MULTIPLIERS[type]
+            ),
+          });
+        }
+      }
+
+      // Process related keywords
+      if (relatedResults.status === 'fulfilled' && relatedResults.value) {
+        for (const item of relatedResults.value) {
+          if (!item?.keyword) continue;
+          const type = classifyIntent(item.keyword);
+          allCandidates.push({
+            keyword: item.keyword,
+            blog,
+            search_volume: item.search_volume || 0,
+            difficulty: item.keyword_info?.keyword_difficulty || 0,
+            cpc: item.cpc || 0,
+            article_type: type,
+            intent_multiplier: INTENT_MULTIPLIERS[type],
+            priority_score: computePriorityScore(
+              item.search_volume || 0,
+              item.keyword_info?.keyword_difficulty || 0,
+              INTENT_MULTIPLIERS[type]
+            ),
+          });
+        }
+      }
+    } catch (err) {
+      console.warn(`DataForSEO failed for ${blog}: ${err.message}. Falling back to seeds only.`);
+    }
+  }
+
+  // Fallback: if no API results, use seeds with default scores
+  if (allCandidates.length === 0) {
+    for (const seed of seeds) {
+      const type = classifyIntent(seed);
+      allCandidates.push({
+        keyword: seed,
+        blog,
+        search_volume: 0,
+        difficulty: 0,
+        cpc: 0,
+        article_type: type,
+        intent_multiplier: INTENT_MULTIPLIERS[type],
+        priority_score: 0,
+      });
+    }
+  }
+
+  // Step 3: Dedup against existing
+  const existingLower = (existingKeywords || []).map((k) => k.toLowerCase().trim());
+  allCandidates = allCandidates.filter((c) => !isDuplicate(c.keyword, existingKeywords || []));
+
+  // Step 4: Select top 21
+  const selected = selectTopKeywords(allCandidates, KEYWORDS_PER_BLOG);
+
+  // Step 5: Warning if too few
+  const warning = selected.length < 7
+    ? `WARNING: Blog "${blog}" has only ${selected.length} new keywords (< 7 minimum)`
+    : null;
+
+  return { blog, keywords: selected, warning };
+}
+
+// ---------------------------------------------------------------------------
+// Main entry point (for n8n Code node)
+// ---------------------------------------------------------------------------
+
+async function selectKeywords(input, helpers) {
+  const activeBlogs = input.active_blogs || ['insiderbuying'];
+  const tickers = input.tickers || [];
+  const existingKeywords = input.existing_keywords || [];
+  const dataForSEOLogin = helpers?.env?.DATAFORSEO_LOGIN;
+  const dataForSEOPassword = helpers?.env?.DATAFORSEO_PASSWORD;
+
+  const auth = dataForSEOLogin && dataForSEOPassword
+    ? buildDataForSEOAuth(dataForSEOLogin, dataForSEOPassword)
+    : null;
+
+  const results = [];
+
+  for (const blog of activeBlogs) {
+    const result = await runKeywordPipeline(blog, tickers, existingKeywords, {
+      fetchFn: helpers?.fetchFn,
+      dataForSEOAuth: auth,
+    });
+    results.push(result);
+  }
+
+  return {
+    total_keywords: results.reduce((sum, r) => sum + r.keywords.length, 0),
+    blogs: results,
+    warnings: results.filter((r) => r.warning).map((r) => r.warning),
+  };
+}
+
+// ---------------------------------------------------------------------------
+// Exports
+// ---------------------------------------------------------------------------
+
+module.exports = {
+  // Core functions (tested)
+  classifyIntent,
+  computePriorityScore,
+  generateSeedKeywords,
+  isDuplicate,
+  selectTopKeywords,
+  runKeywordPipeline,
+  selectKeywords,
+  buildDataForSEOAuth,
+  fetchSearchVolume,
+  fetchRelatedKeywords,
+
+  // Constants
+  TYPE_MAP,
+  INTENT_MULTIPLIERS,
+  KEYWORDS_PER_BLOG,
+  BLOG_SEED_PATTERNS,
+  BLOG_SECTOR_SEEDS,
+};
diff --git a/insiderbuying-site/n8n/tests/select-keyword.test.js b/insiderbuying-site/n8n/tests/select-keyword.test.js
new file mode 100644
index 0000000..575b0b6
--- /dev/null
+++ b/insiderbuying-site/n8n/tests/select-keyword.test.js
@@ -0,0 +1,251 @@
+const { describe, it } = require('node:test');
+const assert = require('node:assert/strict');
+
+const {
+  classifyIntent,
+  computePriorityScore,
+  generateSeedKeywords,
+  isDuplicate,
+  selectTopKeywords,
+  INTENT_MULTIPLIERS,
+  TYPE_MAP,
+  BLOG_SEED_PATTERNS,
+} = require('../code/insiderbuying/select-keyword.js');
+
+// ---------------------------------------------------------------------------
+// Test: Intent classification
+// ---------------------------------------------------------------------------
+describe('classifyIntent', () => {
+  it('"NVDA earnings analysis" maps to type A', () => {
+    assert.equal(classifyIntent('NVDA earnings analysis'), 'A');
+  });
+
+  it('"why insiders are buying" maps to type B', () => {
+    assert.equal(classifyIntent('why insiders are buying'), 'B');
+  });
+
+  it('"NVDA vs AMD" maps to type C', () => {
+    assert.equal(classifyIntent('NVDA vs AMD'), 'C');
+  });
+
+  it('"insider buying strategy guide" maps to type D', () => {
+    assert.equal(classifyIntent('insider buying strategy guide'), 'D');
+  });
+
+  it('keyword with no signal words defaults to type A', () => {
+    assert.equal(classifyIntent('AAPL stock'), 'A');
+  });
+
+  it('"best dividend stocks technology" maps to type C', () => {
+    assert.equal(classifyIntent('best dividend stocks technology'), 'C');
+  });
+
+  it('"TSLA revenue results Q1" maps to type A', () => {
+    assert.equal(classifyIntent('TSLA revenue results Q1'), 'A');
+  });
+
+  it('handles empty/null input', () => {
+    assert.equal(classifyIntent(''), 'A');
+    assert.equal(classifyIntent(null), 'A');
+  });
+});
+
+// ---------------------------------------------------------------------------
+// Test: Priority scoring
+// ---------------------------------------------------------------------------
+describe('computePriorityScore', () => {
+  it('volume=1000, difficulty=30, multiplier=1.2 -> 840', () => {
+    const score = computePriorityScore(1000, 30, 1.2);
+    assert.equal(score, 840);
+  });
+
+  it('volume=500, difficulty=0, multiplier=1.0 -> 500', () => {
+    assert.equal(computePriorityScore(500, 0, 1.0), 500);
+  });
+
+  it('volume=0 -> 0 regardless of other params', () => {
+    assert.equal(computePriorityScore(0, 50, 1.2), 0);
+  });
+
+  it('difficulty=100 -> 0 regardless of volume', () => {
+    assert.equal(computePriorityScore(1000, 100, 1.0), 0);
+  });
+
+  it('handles missing/null inputs gracefully', () => {
+    assert.equal(computePriorityScore(null, 30, 1.0), 0);
+    assert.equal(computePriorityScore(1000, null, 1.0), 1000);
+  });
+});
+
+// ---------------------------------------------------------------------------
+// Test: Seed keyword generation
+// ---------------------------------------------------------------------------
+describe('generateSeedKeywords', () => {
+  it('insiderbuying seeds contain insider buying / Form 4 / insider trading patterns', () => {
+    const seeds = generateSeedKeywords('insiderbuying', ['AAPL', 'NVDA']);
+    const joined = seeds.join(' ');
+    assert.ok(seeds.some((s) => s.toLowerCase().includes('insider buying')),
+      'Should contain "insider buying"');
+    assert.ok(seeds.some((s) => s.includes('Form 4')),
+      'Should contain "Form 4"');
+    assert.ok(seeds.some((s) => s.toLowerCase().includes('insider trading')),
+      'Should contain "insider trading"');
+  });
+
+  it('deepstockanalysis seeds contain earnings / forecast patterns', () => {
+    const seeds = generateSeedKeywords('deepstockanalysis', ['AAPL']);
+    const joined = seeds.join(' ').toLowerCase();
+    assert.ok(joined.includes('earnings'), 'Should contain "earnings"');
+    assert.ok(joined.includes('forecast'), 'Should contain "forecast"');
+  });
+
+  it('dividenddeep seeds contain dividend / payout ratio patterns', () => {
+    const seeds = generateSeedKeywords('dividenddeep', ['AAPL']);
+    const joined = seeds.join(' ').toLowerCase();
+    assert.ok(joined.includes('dividend'), 'Should contain "dividend"');
+    assert.ok(joined.includes('payout ratio'), 'Should contain "payout ratio"');
+  });
+
+  it('returns empty array for unknown blog', () => {
+    assert.deepStrictEqual(generateSeedKeywords('unknown_blog', ['AAPL']), []);
+  });
+
+  it('uses provided tickers in seeds', () => {
+    const seeds = generateSeedKeywords('insiderbuying', ['TSLA']);
+    assert.ok(seeds.some((s) => s.includes('TSLA')), 'Should include ticker TSLA');
+  });
+});
+
+// ---------------------------------------------------------------------------
+// Test: Dedup
+// ---------------------------------------------------------------------------
+describe('isDuplicate', () => {
+  it('exact match (case-insensitive) is duplicate', () => {
+    const existing = ['insider buying AAPL', 'NVDA earnings analysis'];
+    assert.equal(isDuplicate('INSIDER BUYING AAPL', existing), true);
+    assert.equal(isDuplicate('insider buying aapl', existing), true);
+  });
+
+  it('different keyword is not duplicate', () => {
+    const existing = ['insider buying AAPL'];
+    assert.equal(isDuplicate('insider buying NVDA', existing), false);
+  });
+
+  it('handles empty existing list', () => {
+    assert.equal(isDuplicate('anything', []), false);
+  });
+});
+
+// ---------------------------------------------------------------------------
+// Test: Batch output — selectTopKeywords produces exactly 21
+// ---------------------------------------------------------------------------
+describe('selectTopKeywords', () => {
+  it('returns exactly 21 keywords from larger pool', () => {
+    const candidates = [];
+    for (let i = 0; i < 50; i++) {
+      candidates.push({
+        keyword: `keyword ${i}`,
+        search_volume: 1000 - i * 10,
+        difficulty: 20 + i,
+        cpc: 1.5,
+        article_type: 'A',
+        intent_multiplier: 1.0,
+        priority_score: computePriorityScore(1000 - i * 10, 20 + i, 1.0),
+      });
+    }
+    const selected = selectTopKeywords(candidates, 21);
+    assert.equal(selected.length, 21);
+  });
+
+  it('returns all if pool has fewer than 21', () => {
+    const candidates = [
+      { keyword: 'a', priority_score: 100 },
+      { keyword: 'b', priority_score: 50 },
+    ];
+    const selected = selectTopKeywords(candidates, 21);
+    assert.equal(selected.length, 2);
+  });
+
+  it('returns keywords sorted by priority_score descending', () => {
+    const candidates = [
+      { keyword: 'low', priority_score: 10 },
+      { keyword: 'high', priority_score: 500 },
+      { keyword: 'mid', priority_score: 200 },
+    ];
+    const selected = selectTopKeywords(candidates, 21);
+    assert.equal(selected[0].keyword, 'high');
+    assert.equal(selected[1].keyword, 'mid');
+    assert.equal(selected[2].keyword, 'low');
+  });
+});
+
+// ---------------------------------------------------------------------------
+// Test: Multi-blog — 2 blogs produce 42 keywords
+// ---------------------------------------------------------------------------
+describe('multi-blog keyword selection', () => {
+  it('2 active blogs produce separate keyword sets', () => {
+    const blog1Candidates = Array.from({ length: 30 }, (_, i) => ({
+      keyword: `blog1_kw_${i}`,
+      blog: 'insiderbuying',
+      priority_score: 1000 - i * 10,
+    }));
+    const blog2Candidates = Array.from({ length: 30 }, (_, i) => ({
+      keyword: `blog2_kw_${i}`,
+      blog: 'deepstockanalysis',
+      priority_score: 900 - i * 10,
+    }));
+
+    const selected1 = selectTopKeywords(blog1Candidates, 21);
+    const selected2 = selectTopKeywords(blog2Candidates, 21);
+    const total = [...selected1, ...selected2];
+
+    assert.equal(total.length, 42);
+    assert.equal(selected1.length, 21);
+    assert.equal(selected2.length, 21);
+  });
+});
+
+// ---------------------------------------------------------------------------
+// Test: INTENT_MULTIPLIERS constant
+// ---------------------------------------------------------------------------
+describe('INTENT_MULTIPLIERS', () => {
+  it('A=1.0, B=1.2, C=0.8, D=0.9', () => {
+    assert.equal(INTENT_MULTIPLIERS.A, 1.0);
+    assert.equal(INTENT_MULTIPLIERS.B, 1.2);
+    assert.equal(INTENT_MULTIPLIERS.C, 0.8);
+    assert.equal(INTENT_MULTIPLIERS.D, 0.9);
+  });
+});
+
+// ---------------------------------------------------------------------------
+// Test: TYPE_MAP has all required signal words
+// ---------------------------------------------------------------------------
+describe('TYPE_MAP', () => {
+  it('type A contains earnings, analysis, forecast, valuation', () => {
+    assert.ok(TYPE_MAP.A.includes('earnings'));
+    assert.ok(TYPE_MAP.A.includes('analysis'));
+    assert.ok(TYPE_MAP.A.includes('forecast'));
+    assert.ok(TYPE_MAP.A.includes('valuation'));
+  });
+
+  it('type B contains why, signal, insider, pattern', () => {
+    assert.ok(TYPE_MAP.B.includes('why'));
+    assert.ok(TYPE_MAP.B.includes('signal'));
+    assert.ok(TYPE_MAP.B.includes('insider'));
+    assert.ok(TYPE_MAP.B.includes('pattern'));
+  });
+
+  it('type C contains vs, compare, best, top', () => {
+    assert.ok(TYPE_MAP.C.includes('vs'));
+    assert.ok(TYPE_MAP.C.includes('compare'));
+    assert.ok(TYPE_MAP.C.includes('best'));
+    assert.ok(TYPE_MAP.C.includes('top'));
+  });
+
+  it('type D contains strategy, guide, opinion, should', () => {
+    assert.ok(TYPE_MAP.D.includes('strategy'));
+    assert.ok(TYPE_MAP.D.includes('guide'));
+    assert.ok(TYPE_MAP.D.includes('opinion'));
+    assert.ok(TYPE_MAP.D.includes('should'));
+  });
+});
