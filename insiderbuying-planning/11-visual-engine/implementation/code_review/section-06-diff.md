diff --git a/ryan_cole/insiderbuying-site/n8n/code/insiderbuying/identity-assets.js b/ryan_cole/insiderbuying-site/n8n/code/insiderbuying/identity-assets.js
new file mode 100644
index 0000000..eed72b7
--- /dev/null
+++ b/ryan_cole/insiderbuying-site/n8n/code/insiderbuying/identity-assets.js
@@ -0,0 +1,186 @@
+'use strict';
+
+const { uploadToR2 } = require('./render-pdf');
+
+const BRANDFETCH_BASE = 'https://cdn.brandfetch.io';
+const SIZE_LIMIT = 500 * 1024; // 500KB
+const TTL_SECONDS = 2592000;   // 30 days
+
+// ─── Internal NocoDB helpers ──────────────────────────────────────────────────
+
+async function _nocoGet(url, token, fetchFn) {
+  const res = await fetchFn(url, { headers: { 'xc-token': token } });
+  return res.json();
+}
+
+/**
+ * Check NocoDB cache with TTL validation.
+ * Returns the record if found and within TTL, otherwise null.
+ */
+async function _cacheGet(tableId, keyField, keyValue, helpers) {
+  const url = `${helpers.env.NOCODB_API_URL}/api/v2/tables/${tableId}/records?where=(${keyField},eq,${encodeURIComponent(keyValue)})&limit=1`;
+  const body = await _nocoGet(url, helpers.env.NOCODB_API_TOKEN, helpers.fetchFn);
+  const record = body.list && body.list[0];
+  if (!record) return null;
+  const fetchedAt = new Date(record.fetched_at).getTime();
+  const ttlMs = (record.ttl_seconds || 0) * 1000;
+  if (fetchedAt + ttlMs > Date.now()) return record;
+  return null; // expired
+}
+
+/**
+ * Upsert a row in NocoDB (PATCH if exists, POST if not).
+ * Existence check ignores TTL — just looks for row presence.
+ */
+async function _cacheSet(tableId, keyField, keyValue, data, helpers) {
+  const url = `${helpers.env.NOCODB_API_URL}/api/v2/tables/${tableId}/records?where=(${keyField},eq,${encodeURIComponent(keyValue)})&limit=1`;
+  const body = await _nocoGet(url, helpers.env.NOCODB_API_TOKEN, helpers.fetchFn);
+  const existing = body.list && body.list[0];
+  const token = helpers.env.NOCODB_API_TOKEN;
+  const baseUrl = helpers.env.NOCODB_API_URL;
+
+  if (existing) {
+    await helpers.fetchFn(`${baseUrl}/api/v2/tables/${tableId}/records/${existing.Id}`, {
+      method: 'PATCH',
+      headers: { 'xc-token': token, 'Content-Type': 'application/json' },
+      body: JSON.stringify(data),
+    });
+  } else {
+    await helpers.fetchFn(`${baseUrl}/api/v2/tables/${tableId}/records`, {
+      method: 'POST',
+      headers: { 'xc-token': token, 'Content-Type': 'application/json' },
+      body: JSON.stringify(data),
+    });
+  }
+}
+
+// ─── SVG rasterization via screenshot server ──────────────────────────────────
+
+async function _rasterizeSvg(svgBuffer, helpers) {
+  const b64 = svgBuffer.toString('base64');
+  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;}</style></head><body><img src="data:image/svg+xml;base64,${b64}" width="200" height="200"></body></html>`;
+  const base = (helpers.env && helpers.env.SCREENSHOT_SERVER_URL) || 'http://host.docker.internal:3456';
+  const res = await helpers.fetchFn(`${base}/screenshot`, {
+    method: 'POST',
+    headers: { 'Content-Type': 'application/json' },
+    body: JSON.stringify({ html, viewport: { width: 200, height: 200 }, format: 'png' }),
+  });
+  if (!res.ok) throw new Error(`Screenshot rasterize error: ${res.status}`);
+  return res.buffer();
+}
+
+// ─── getCompanyLogo ───────────────────────────────────────────────────────────
+
+/**
+ * Resolve a company logo URL with NocoDB caching.
+ * 2-tier cascade: Brandfetch CDN → UI Avatars fallback.
+ * Always returns a URL string.
+ */
+async function getCompanyLogo(domain, tickerAbbrev, helpers) {
+  const tableId = helpers.env.NOCODB_LOGO_TABLE_ID;
+
+  // Step 1: Check cache
+  const cached = await _cacheGet(tableId, 'domain', domain, helpers);
+  if (cached) return cached.logo_url;
+
+  // Step 2: Try Brandfetch
+  let logoUrl = null;
+  try {
+    const brandfetchUrl = `${BRANDFETCH_BASE}/${domain}/w/200/h/200`;
+    const res = await helpers.fetchFn(brandfetchUrl);
+
+    if (res.status === 200) {
+      const ct = res.headers.get('content-type') || '';
+      if (!ct.startsWith('image/')) throw new Error(`Non-image content-type: ${ct}`);
+
+      // Size check via content-length header first
+      const clHeader = res.headers.get('content-length');
+      if (clHeader && Number(clHeader) > SIZE_LIMIT) throw new Error(`Logo too large: ${clHeader} bytes`);
+
+      const rawBuffer = await res.buffer();
+      if (rawBuffer.length > SIZE_LIMIT) throw new Error(`Logo buffer too large: ${rawBuffer.length} bytes`);
+
+      let pngBuffer;
+      if (ct.startsWith('image/svg+xml')) {
+        pngBuffer = await _rasterizeSvg(rawBuffer, helpers);
+      } else {
+        pngBuffer = rawBuffer;
+      }
+
+      const key = `earlyinsider/logos/${domain}_${Date.now()}.png`;
+      logoUrl = await uploadToR2(pngBuffer, key, 'image/png');
+    } else {
+      throw new Error(`Brandfetch ${res.status}`);
+    }
+  } catch (err) {
+    console.warn(`[identity-assets] Brandfetch failed for ${domain}: ${err.message}`);
+    logoUrl = null;
+  }
+
+  // Step 3: UI Avatars fallback
+  if (!logoUrl) {
+    logoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(tickerAbbrev)}&background=1A2238&color=4A9EFF&size=200&bold=true`;
+    await _cacheSet(tableId, 'domain', domain, {
+      domain,
+      logo_url: logoUrl,
+      source: 'ui_avatars',
+      fetched_at: new Date().toISOString(),
+      ttl_seconds: TTL_SECONDS,
+    }, helpers);
+    return logoUrl;
+  }
+
+  // Cache successful Brandfetch result
+  await _cacheSet(tableId, 'domain', domain, {
+    domain,
+    logo_url: logoUrl,
+    source: 'brandfetch',
+    fetched_at: new Date().toISOString(),
+    ttl_seconds: TTL_SECONDS,
+  }, helpers);
+
+  return logoUrl;
+}
+
+// ─── prefetchLogos ────────────────────────────────────────────────────────────
+
+/**
+ * Prefetch and cache logos for multiple domains.
+ * Deduplicates input, skips cached domains, fetches missing in chunks of 3.
+ */
+async function prefetchLogos(domains, helpers) {
+  if (!domains || domains.length === 0) return;
+
+  // 1. Deduplicate
+  const unique = [...new Set(domains)];
+
+  // 2. Batch cache check
+  const tableId = helpers.env.NOCODB_LOGO_TABLE_ID;
+  const whereClause = unique.map(d => `(domain,eq,${encodeURIComponent(d)})`).join('~or');
+  const batchUrl = `${helpers.env.NOCODB_API_URL}/api/v2/tables/${tableId}/records?where=${whereClause}&limit=${unique.length}`;
+  const body = await _nocoGet(batchUrl, helpers.env.NOCODB_API_TOKEN, helpers.fetchFn);
+  const cachedDomains = new Set((body.list || []).map(r => r.domain));
+
+  // 3. Find missing
+  const missing = unique.filter(d => !cachedDomains.has(d));
+
+  // 4. Fetch missing in chunks of 3
+  const CONCURRENCY = 3;
+  for (let i = 0; i < missing.length; i += CONCURRENCY) {
+    const chunk = missing.slice(i, i + CONCURRENCY);
+    await Promise.all(chunk.map(domain => {
+      const abbrev = domain.split('.')[0].toUpperCase();
+      return getCompanyLogo(domain, abbrev, helpers).catch(err =>
+        console.warn(`[identity-assets] prefetch failed for ${domain}: ${err.message}`)
+      );
+    }));
+  }
+}
+
+// ─── Exports ──────────────────────────────────────────────────────────────────
+
+module.exports = {
+  getCompanyLogo,
+  prefetchLogos,
+  // getInsiderPhoto added in Section 07
+};
diff --git a/ryan_cole/insiderbuying-site/tests/insiderbuying/identity-assets.test.js b/ryan_cole/insiderbuying-site/tests/insiderbuying/identity-assets.test.js
new file mode 100644
index 0000000..2784866
--- /dev/null
+++ b/ryan_cole/insiderbuying-site/tests/insiderbuying/identity-assets.test.js
@@ -0,0 +1,288 @@
+'use strict';
+
+jest.mock('../../n8n/code/insiderbuying/render-pdf', () => ({
+  uploadToR2: jest.fn().mockResolvedValue('https://pub.r2.dev/earlyinsider/logos/nvidia.com_123.png'),
+}));
+
+const { uploadToR2 } = require('../../n8n/code/insiderbuying/render-pdf');
+const { getCompanyLogo, prefetchLogos } = require('../../n8n/code/insiderbuying/identity-assets');
+
+const PNG_BUFFER = Buffer.alloc(100);
+const LARGE_BUFFER = Buffer.alloc(600 * 1024); // > 500KB
+
+const ENV = {
+  NOCODB_API_URL: 'http://nocodb.test',
+  NOCODB_API_TOKEN: 'test-token',
+  NOCODB_LOGO_TABLE_ID: 'tbl_logos_test',
+  SCREENSHOT_SERVER_URL: 'http://host.docker.internal:3456',
+};
+
+function makeHelpers(fetchMocks) {
+  const fetchFn = jest.fn();
+  let idx = 0;
+  fetchMocks.forEach(m => {
+    if (typeof m === 'function') {
+      fetchFn.mockImplementationOnce(m);
+    } else {
+      fetchFn.mockResolvedValueOnce(m);
+    }
+  });
+  return { fetchFn, env: ENV, _sleep: jest.fn() };
+}
+
+function nocoCacheMiss() {
+  return { ok: true, json: async () => ({ list: [] }) };
+}
+
+function nocoCacheHit(domain, logo_url, ttl_seconds = 2592000) {
+  const fetched_at = new Date(Date.now() - 1000).toISOString(); // 1 second ago
+  return {
+    ok: true,
+    json: async () => ({ list: [{ Id: 42, domain, logo_url, source: 'brandfetch', fetched_at, ttl_seconds }] }),
+  };
+}
+
+function nocoCacheExpired(domain, logo_url) {
+  const fetched_at = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(); // 40 days ago
+  return {
+    ok: true,
+    json: async () => ({ list: [{ Id: 42, domain, logo_url, source: 'brandfetch', fetched_at, ttl_seconds: 2592000 }] }),
+  };
+}
+
+function brandfetchHit(contentType = 'image/png', bufferSize = 100) {
+  const buf = Buffer.alloc(bufferSize);
+  return {
+    status: 200,
+    headers: { get: (h) => h === 'content-type' ? contentType : (h === 'content-length' ? String(bufferSize) : null) },
+    buffer: async () => buf,
+  };
+}
+
+function brandfetch404() {
+  return { status: 404, headers: { get: () => null }, buffer: async () => Buffer.alloc(0) };
+}
+
+function nocoDone() {
+  return { ok: true, json: async () => ({ Id: 99 }) };
+}
+
+function screenshotResponse() {
+  return {
+    ok: true,
+    headers: { get: () => 'image/png' },
+    buffer: async () => PNG_BUFFER,
+  };
+}
+
+beforeEach(() => {
+  jest.clearAllMocks();
+  uploadToR2.mockResolvedValue('https://pub.r2.dev/earlyinsider/logos/nvidia.com_123.png');
+});
+
+// ─── Cache hit ────────────────────────────────────────────────────────────────
+
+describe('getCompanyLogo — cache hit', () => {
+  test('returns cached URL without calling Brandfetch', async () => {
+    const helpers = makeHelpers([
+      nocoCacheHit('nvidia.com', 'https://r2.dev/logos/nvidia.png'),
+    ]);
+    const url = await getCompanyLogo('nvidia.com', 'NVDA', helpers);
+    expect(url).toBe('https://r2.dev/logos/nvidia.png');
+    expect(helpers.fetchFn).toHaveBeenCalledTimes(1); // only NocoDB GET
+  });
+});
+
+// ─── Cache miss + Brandfetch hit ──────────────────────────────────────────────
+
+describe('getCompanyLogo — Brandfetch PNG hit', () => {
+  test('uploads PNG to R2, caches, returns R2 URL', async () => {
+    const helpers = makeHelpers([
+      nocoCacheMiss(),                        // initial cache check
+      brandfetchHit('image/png'),             // Brandfetch hit
+      nocoCacheMiss(),                        // _cacheSet existence check
+      nocoDone(),                             // NocoDB POST
+    ]);
+    const url = await getCompanyLogo('nvidia.com', 'NVDA', helpers);
+    expect(url).toContain('r2');
+    expect(uploadToR2).toHaveBeenCalled();
+  });
+
+  test('NocoDB POST called to cache logo', async () => {
+    const helpers = makeHelpers([
+      nocoCacheMiss(),
+      brandfetchHit('image/png'),
+      nocoCacheMiss(),
+      nocoDone(),
+    ]);
+    await getCompanyLogo('nvidia.com', 'NVDA', helpers);
+    // 4 calls: cache miss, brandfetch, cacheSet-miss, POST
+    expect(helpers.fetchFn).toHaveBeenCalledTimes(4);
+  });
+});
+
+// ─── Cache miss + Brandfetch SVG ──────────────────────────────────────────────
+
+describe('getCompanyLogo — Brandfetch SVG', () => {
+  test('rasterizes SVG via screenshot server then uploads PNG', async () => {
+    const helpers = makeHelpers([
+      nocoCacheMiss(),
+      brandfetchHit('image/svg+xml'),
+      screenshotResponse(),
+      nocoCacheMiss(),
+      nocoDone(),
+    ]);
+    const url = await getCompanyLogo('nvidia.com', 'NVDA', helpers);
+    expect(url).toContain('r2');
+    expect(uploadToR2).toHaveBeenCalled();
+    // Should have called screenshot server
+    const calls = helpers.fetchFn.mock.calls.map(c => c[0]);
+    expect(calls.some(u => u.includes('/screenshot'))).toBe(true);
+  });
+});
+
+// ─── Brandfetch failures → UI Avatars ────────────────────────────────────────
+
+describe('getCompanyLogo — Brandfetch fallback', () => {
+  test('Brandfetch 404 → falls through to UI Avatars', async () => {
+    const helpers = makeHelpers([
+      nocoCacheMiss(),
+      brandfetch404(),
+      nocoCacheMiss(),
+      nocoDone(),
+    ]);
+    const url = await getCompanyLogo('nvidia.com', 'NVDA', helpers);
+    expect(url).toContain('ui-avatars.com');
+    expect(url).toContain('NVDA');
+  });
+
+  test('Brandfetch response > 500KB → falls through to UI Avatars', async () => {
+    const helpers = makeHelpers([
+      nocoCacheMiss(),
+      {
+        status: 200,
+        headers: { get: (h) => h === 'content-type' ? 'image/png' : (h === 'content-length' ? '600000' : null) },
+        buffer: async () => LARGE_BUFFER,
+      },
+      nocoCacheMiss(),
+      nocoDone(),
+    ]);
+    const url = await getCompanyLogo('nvidia.com', 'NVDA', helpers);
+    expect(url).toContain('ui-avatars.com');
+  });
+
+  test('Brandfetch timeout → falls through to UI Avatars', async () => {
+    const helpers = makeHelpers([
+      nocoCacheMiss(),
+      () => Promise.reject(new Error('AbortError: timeout')),
+      nocoCacheMiss(),
+      nocoDone(),
+    ]);
+    const url = await getCompanyLogo('nvidia.com', 'NVDA', helpers);
+    expect(url).toContain('ui-avatars.com');
+  });
+
+  test('UI Avatars URL contains tickerAbbrev', async () => {
+    const helpers = makeHelpers([
+      nocoCacheMiss(), brandfetch404(), nocoCacheMiss(), nocoDone(),
+    ]);
+    const url = await getCompanyLogo('apple.com', 'AAPL', helpers);
+    expect(url).toContain('AAPL');
+  });
+
+  test('UI Avatars result cached in NocoDB with source=ui_avatars', async () => {
+    const helpers = makeHelpers([
+      nocoCacheMiss(), brandfetch404(), nocoCacheMiss(), nocoDone(),
+    ]);
+    await getCompanyLogo('nvidia.com', 'NVDA', helpers);
+    const postCall = helpers.fetchFn.mock.calls.find(c => c[1] && c[1].method === 'POST');
+    const posted = JSON.parse(postCall[1].body);
+    expect(posted.source).toBe('ui_avatars');
+  });
+});
+
+// ─── Cache expiry + PATCH ─────────────────────────────────────────────────────
+
+describe('getCompanyLogo — cache expiry', () => {
+  test('expired cache re-fetches from Brandfetch', async () => {
+    const helpers = makeHelpers([
+      nocoCacheExpired('nvidia.com', 'https://old.url/logo.png'), // expired
+      brandfetchHit('image/png'),
+      nocoCacheHit('nvidia.com', 'https://old.url/logo.png'),    // row EXISTS in _cacheSet check
+      nocoDone(),                                                  // PATCH
+    ]);
+    const url = await getCompanyLogo('nvidia.com', 'NVDA', helpers);
+    expect(url).toContain('r2');
+  });
+
+  test('NocoDB PATCH called when row already exists', async () => {
+    const helpers = makeHelpers([
+      nocoCacheExpired('nvidia.com', 'https://old.url/logo.png'),
+      brandfetchHit('image/png'),
+      nocoCacheHit('nvidia.com', 'https://old.url/logo.png'),
+      nocoDone(),
+    ]);
+    await getCompanyLogo('nvidia.com', 'NVDA', helpers);
+    const patchCall = helpers.fetchFn.mock.calls.find(c => c[1] && c[1].method === 'PATCH');
+    expect(patchCall).toBeDefined();
+    const postCall = helpers.fetchFn.mock.calls.find(c => c[1] && c[1].method === 'POST');
+    expect(postCall).toBeUndefined(); // PATCH not POST
+  });
+});
+
+// ─── prefetchLogos ────────────────────────────────────────────────────────────
+
+// URL-routing mock: NocoDB → miss, Brandfetch → image/png
+function makeSmartFetch(opts = {}) {
+  const { cachedDomains = [], branchfetchFail = false } = opts;
+  const brandfetchTracker = [];
+  const fetchFn = jest.fn().mockImplementation((url, options) => {
+    if (typeof url === 'string' && url.includes('brandfetch')) {
+      brandfetchTracker.push(url);
+      if (branchfetchFail) return Promise.resolve(brandfetch404());
+      return Promise.resolve(brandfetchHit('image/png'));
+    }
+    // NocoDB batch query (contains ~or)
+    if (url.includes('~or') || url.includes('records?where')) {
+      const matchedDomains = cachedDomains.filter(d => url.includes(d));
+      const list = matchedDomains.map((d, i) => ({
+        Id: i + 1, domain: d, logo_url: `https://r2/logos/${d}.png`,
+        fetched_at: new Date().toISOString(), ttl_seconds: 2592000,
+      }));
+      return Promise.resolve({ ok: true, json: async () => ({ list }) });
+    }
+    // NocoDB other (single record lookup for _cacheGet/_cacheSet)
+    return Promise.resolve({ ok: true, json: async () => ({ list: [] }) });
+  });
+  return { fetchFn, brandfetchTracker };
+}
+
+describe('prefetchLogos', () => {
+  test('deduplicates input array (2x nvidia.com → 1 Brandfetch call)', async () => {
+    const { fetchFn, brandfetchTracker } = makeSmartFetch();
+    const helpers = { fetchFn, env: ENV, _sleep: jest.fn() };
+    await prefetchLogos(['nvidia.com', 'nvidia.com'], helpers);
+    expect(brandfetchTracker).toHaveLength(1);
+  });
+
+  test('skips already-cached domains', async () => {
+    const { fetchFn, brandfetchTracker } = makeSmartFetch({ cachedDomains: ['nvidia.com'] });
+    const helpers = { fetchFn, env: ENV, _sleep: jest.fn() };
+    await prefetchLogos(['nvidia.com'], helpers);
+    expect(brandfetchTracker).toHaveLength(0);
+  });
+
+  test('fetches missing domains', async () => {
+    const { fetchFn, brandfetchTracker } = makeSmartFetch();
+    const helpers = { fetchFn, env: ENV, _sleep: jest.fn() };
+    await prefetchLogos(['apple.com'], helpers);
+    expect(brandfetchTracker).toHaveLength(1);
+  });
+
+  test('limits concurrency to 3 (4 domains → all 4 eventually fetched)', async () => {
+    const { fetchFn, brandfetchTracker } = makeSmartFetch();
+    const helpers = { fetchFn, env: ENV, _sleep: jest.fn() };
+    await prefetchLogos(['a.com', 'b.com', 'c.com', 'd.com'], helpers);
+    expect(brandfetchTracker).toHaveLength(4);
+  });
+});
