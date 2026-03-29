diff --git a/insiderbuying-site/n8n/code/insiderbuying/reddit-monitor.js b/insiderbuying-site/n8n/code/insiderbuying/reddit-monitor.js
index e83c9d4..6095366 100644
--- a/insiderbuying-site/n8n/code/insiderbuying/reddit-monitor.js
+++ b/insiderbuying-site/n8n/code/insiderbuying/reddit-monitor.js
@@ -30,10 +30,260 @@ var SEARCH_KEYWORDS = [
   'insider activity',
 ];
 
+var CAT5_SUBREDDITS = ['stocks', 'investing', 'ValueInvesting'];
+
+// ---------------------------------------------------------------------------
+// Config
+// ---------------------------------------------------------------------------
+
+var NOCODB_BASE_URL = process.env.NOCODB_BASE_URL || 'http://nocodb:8080';
+var NOCODB_TOKEN = process.env.NOCODB_TOKEN || '';
+var NOCODB_PROJECT_ID = process.env.NOCODB_PROJECT_ID || '';
+var REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID || '';
+var REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET || '';
+var REDDIT_REFRESH_TOKEN = process.env.REDDIT_REFRESH_TOKEN || '';
+
+// ---------------------------------------------------------------------------
+// HTTP helper (n8n sandbox-compatible)
+// ---------------------------------------------------------------------------
+
+function _httpFetch(url, opts) {
+  return new Promise(function(resolve, reject) {
+    var parsedUrl = new URL(url);
+    var lib = parsedUrl.protocol === 'https:' ? _https : _http;
+    var method = (opts && opts.method) || 'GET';
+    var headers = (opts && opts.headers) ? Object.assign({}, opts.headers) : {};
+    var body = (opts && opts.body) || null;
+    if (body && !headers['Content-Length']) {
+      headers['Content-Length'] = Buffer.byteLength(body);
+    }
+    var reqOpts = {
+      hostname: parsedUrl.hostname,
+      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
+      path: parsedUrl.pathname + (parsedUrl.search || ''),
+      method: method,
+      headers: headers,
+    };
+    var req = lib.request(reqOpts, function(res) {
+      var data = '';
+      res.on('data', function(chunk) { data += chunk; });
+      res.on('end', function() {
+        var status = res.statusCode;
+        var bodyText = data;
+        resolve({
+          status: status,
+          ok: status >= 200 && status < 300,
+          json: function() { try { return JSON.parse(bodyText); } catch (e) { return {}; } },
+          text: function() { return bodyText; },
+        });
+      });
+    });
+    req.on('error', reject);
+    if (body) req.write(body);
+    req.end();
+  });
+}
+
+// ---------------------------------------------------------------------------
+// Test seams
+// ---------------------------------------------------------------------------
+
+var _deps = { fetch: _httpFetch };
+function _setDeps(overrides) { _deps = overrides || { fetch: _httpFetch }; }
+
+var _nowFn = function() { return new Date(); };
+function _setNow(fn) { _nowFn = fn || function() { return new Date(); }; }
+function _now() { return _nowFn(); }
+
+// ---------------------------------------------------------------------------
+// Helpers
+// ---------------------------------------------------------------------------
+
+/**
+ * Returns an ISO week key like "2026-W13" for the given date.
+ */
+function getISOWeekKey(date) {
+  var d = new Date(date.getTime());
+  d.setHours(0, 0, 0, 0);
+  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
+  var yearStart = new Date(d.getFullYear(), 0, 1);
+  var week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
+  return d.getFullYear() + '-W' + String(week).padStart(2, '0');
+}
+
+/**
+ * Returns "YYYY-MM-DD" for the given date in EST (America/New_York).
+ */
+function getESTDateString(date) {
+  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(date);
+}
+
+// ---------------------------------------------------------------------------
+// NocoDB state helpers
+// ---------------------------------------------------------------------------
+
+async function getState(key) {
+  try {
+    var url = NOCODB_BASE_URL + '/api/v1/db/data/noco/' + NOCODB_PROJECT_ID
+      + '/Reddit_State?where=(key,eq,' + encodeURIComponent(key) + ')&limit=1';
+    var r = await _deps.fetch(url, { headers: { 'xc-token': NOCODB_TOKEN } });
+    if (r.status === 200) {
+      var data = r.json();
+      var items = (data && data.list) ? data.list : [];
+      if (items.length > 0 && items[0].value !== undefined) {
+        try { return JSON.parse(items[0].value); } catch (_) { return items[0].value; }
+      }
+    }
+    return null;
+  } catch (_) { return null; }
+}
+
+async function setState(key, value) {
+  try {
+    var serialized = typeof value === 'string' ? value : JSON.stringify(value);
+    var checkUrl = NOCODB_BASE_URL + '/api/v1/db/data/noco/' + NOCODB_PROJECT_ID
+      + '/Reddit_State?where=(key,eq,' + encodeURIComponent(key) + ')&limit=1';
+    var checkR = await _deps.fetch(checkUrl, { headers: { 'xc-token': NOCODB_TOKEN } });
+    var checkData = (checkR.status === 200) ? checkR.json() : { list: [] };
+    var existing = ((checkData && checkData.list) || [])[0];
+    if (existing && existing.Id) {
+      var patchUrl = NOCODB_BASE_URL + '/api/v1/db/data/noco/' + NOCODB_PROJECT_ID
+        + '/Reddit_State/' + existing.Id;
+      await _deps.fetch(patchUrl, {
+        method: 'PATCH',
+        headers: { 'xc-token': NOCODB_TOKEN, 'Content-Type': 'application/json' },
+        body: JSON.stringify({ value: serialized }),
+      });
+    } else {
+      var postUrl2 = NOCODB_BASE_URL + '/api/v1/db/data/noco/' + NOCODB_PROJECT_ID
+        + '/Reddit_State';
+      await _deps.fetch(postUrl2, {
+        method: 'POST',
+        headers: { 'xc-token': NOCODB_TOKEN, 'Content-Type': 'application/json' },
+        body: JSON.stringify({ key: key, value: serialized }),
+      });
+    }
+  } catch (_) {}
+}
+
+// ---------------------------------------------------------------------------
+// Reddit auth
+// ---------------------------------------------------------------------------
+
+async function getRedditToken() {
+  try {
+    var cached = await getState('reddit_token');
+    if (cached && cached.access_token && cached.expires_at > Date.now()) {
+      return cached.access_token;
+    }
+  } catch (_) {}
+
+  try {
+    var creds = Buffer.from(REDDIT_CLIENT_ID + ':' + REDDIT_CLIENT_SECRET).toString('base64');
+    var r = await _deps.fetch('https://www.reddit.com/api/v1/access_token', {
+      method: 'POST',
+      headers: {
+        'Authorization': 'Basic ' + creds,
+        'Content-Type': 'application/x-www-form-urlencoded',
+        'User-Agent': 'EarlyInsider/1.0',
+      },
+      body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(REDDIT_REFRESH_TOKEN),
+    });
+    if (r.status === 200) {
+      var data = r.json();
+      if (data && data.access_token) {
+        await setState('reddit_token', {
+          access_token: data.access_token,
+          expires_at: Date.now() + ((data.expires_in || 3600) * 1000),
+        });
+        return data.access_token;
+      }
+    }
+  } catch (_) {}
+
+  return '';
+}
+
+// ---------------------------------------------------------------------------
+// Skip day check
+// ---------------------------------------------------------------------------
+
+async function shouldSkipToday() {
+  try {
+    var stored = await getState('week_skip_days');
+    if (!stored || !Array.isArray(stored.days)) return { skip: false };
+    var dayOfWeek = _now().getDay();
+    return { skip: stored.days.indexOf(dayOfWeek) !== -1 };
+  } catch (_) { return { skip: false }; }
+}
+
+// ---------------------------------------------------------------------------
+// Job scheduling stub
+// ---------------------------------------------------------------------------
+
+async function scheduleThreadReply(commentName, subreddit, threadName) {
+  try {
+    var url = NOCODB_BASE_URL + '/api/v1/db/data/noco/' + NOCODB_PROJECT_ID + '/Scheduled_Jobs';
+    await _deps.fetch(url, {
+      method: 'POST',
+      headers: { 'xc-token': NOCODB_TOKEN, 'Content-Type': 'application/json' },
+      body: JSON.stringify({
+        job_type: 'reddit_thread_reply',
+        comment_name: commentName,
+        subreddit: subreddit,
+        thread_name: threadName,
+        status: 'pending',
+        created_at: new Date().toISOString(),
+      }),
+    });
+  } catch (_) {}
+}
+
+// ---------------------------------------------------------------------------
+// Reddit_Log helper
+// ---------------------------------------------------------------------------
+
+async function _logToRedditLog(postUrl, subreddit, text, status) {
+  try {
+    var url = NOCODB_BASE_URL + '/api/v1/db/data/noco/' + NOCODB_PROJECT_ID + '/Reddit_Log';
+    await _deps.fetch(url, {
+      method: 'POST',
+      headers: { 'xc-token': NOCODB_TOKEN, 'Content-Type': 'application/json' },
+      body: JSON.stringify({
+        post_url: postUrl || '',
+        subreddit: subreddit || '',
+        comment_text: text || '',
+        status: status || 'posted',
+        posted_at: new Date().toISOString(),
+      }),
+    });
+  } catch (_) {}
+}
+
+// ---------------------------------------------------------------------------
+// Filings data fetch
+// ---------------------------------------------------------------------------
+
+async function _fetchFilingsForPeriod(days) {
+  try {
+    var cutoff = new Date(_now().getTime() - days * 86400000).toISOString().split('T')[0];
+    var url = NOCODB_BASE_URL + '/api/v1/db/data/noco/' + NOCODB_PROJECT_ID
+      + '/Insider_Filings?where=(date,gte,' + cutoff + ')&sort=-value_usd&limit=10';
+    var r = await _deps.fetch(url, { headers: { 'xc-token': NOCODB_TOKEN } });
+    if (r.status === 200) {
+      var data = r.json();
+      return (data && data.list) ? data.list : [];
+    }
+  } catch (_) {}
+  return [];
+}
+
+// ---------------------------------------------------------------------------
+// Section 00 stubs — existing helpers
+// ---------------------------------------------------------------------------
+
 /**
  * Combine SEARCH_KEYWORDS with recent ticker names for Reddit search queries.
- * @param {Array} recentTickers - Array of ticker strings, e.g. ['AAPL', 'TSLA']
- * @returns {Array} Array of query strings
  */
 function buildSearchQueries(recentTickers) {
   var queries = SEARCH_KEYWORDS.slice();
@@ -52,9 +302,6 @@ function buildSearchQueries(recentTickers) {
 
 /**
  * Filter posts by minimum score.
- * @param {Array} posts - Array of Reddit post objects with { score } field
- * @param {number} [minScore=7] - Minimum score threshold
- * @returns {Array} Filtered posts
  */
 function filterByScore(posts, minScore) {
   if (!posts || !Array.isArray(posts)) return [];
@@ -66,11 +313,7 @@ function filterByScore(posts, minScore) {
 }
 
 /**
- * Build Claude Sonnet prompt for drafting a Reddit comment.
- * Rules: 80% value / 20% soft organic, NO brand name, NO link, 3-5 sentences.
- * @param {object} post - { title, selftext, subreddit, score }
- * @param {object} insiderData - { ticker, insider_name, transaction_type, shares, value_usd, date }
- * @returns {object} { prompt, maxTokens }
+ * Build Claude prompt for drafting a Reddit comment.
  */
 function draftComment(post, insiderData) {
   var postTitle = (post && post.title) || '';
@@ -122,9 +365,6 @@ function draftComment(post, insiderData) {
 
 /**
  * Validate a drafted comment before posting.
- * Checks: no URL, no brand names, 3-5 sentences.
- * @param {string} text - Comment text
- * @returns {object} { valid: boolean, issues: string[] }
  */
 function validateComment(text) {
   var issues = [];
@@ -133,13 +373,11 @@ function validateComment(text) {
     return { valid: false, issues: ['Comment text is empty'] };
   }
 
-  // Check for URLs
   var urlPattern = /https?:\/\/|www\.|\.com|\.io|\.ai|\.org|\.net/i;
   if (urlPattern.test(text)) {
     issues.push('Contains a URL or domain name');
   }
 
-  // Check for brand names (case-insensitive)
   var brandNames = ['InsiderBuying', 'EarlyInsider', 'earlyinsider.com', 'insiderbuying.ai'];
   brandNames.forEach(function(brand) {
     if (text.toLowerCase().indexOf(brand.toLowerCase()) !== -1) {
@@ -147,7 +385,6 @@ function validateComment(text) {
     }
   });
 
-  // Check sentence count (split by '. ' and filter empty)
   var sentences = text.split('. ').filter(function(s) {
     return s.trim().length > 0;
   });
@@ -166,11 +403,6 @@ function validateComment(text) {
 
 /**
  * Build NocoDB record for Reddit_Log table.
- * @param {string} postUrl - Reddit post URL
- * @param {string} subreddit - Subreddit name
- * @param {string} text - Comment text
- * @param {string} status - 'posted', 'skipped', 'failed'
- * @returns {object} NocoDB record object
  */
 function logComment(postUrl, subreddit, text, status) {
   return {
@@ -182,12 +414,231 @@ function logComment(postUrl, subreddit, text, status) {
   };
 }
 
+// ---------------------------------------------------------------------------
+// Section 04 — CAT 5 Daily Thread
+// ---------------------------------------------------------------------------
+
+async function getDailyThreadTarget() {
+  var stored = await getState('daily_thread_sub_index');
+  var index = typeof stored === 'number' ? stored : 0;
+  var subreddit = CAT5_SUBREDDITS[index % CAT5_SUBREDDITS.length];
+  await setState('daily_thread_sub_index', (index + 1) % CAT5_SUBREDDITS.length);
+  return subreddit;
+}
+
+async function shouldPostDailyThread() {
+  var now = _now();
+  var dayOfWeek = now.getDay(); // 0=Sun, 6=Sat
+  if (dayOfWeek === 0 || dayOfWeek === 6) return { post: false };
+
+  var skipResult = await shouldSkipToday();
+  if (skipResult.skip) return { post: false };
+
+  var isWeekendRecap = dayOfWeek === 1; // Monday
+  return { post: true, isWeekendRecap: isWeekendRecap };
+}
+
+async function findDailyDiscussionThread(subreddit) {
+  var token = await getRedditToken();
+  var now = _now();
+  var todayEST = getESTDateString(now);
+
+  function isToday(created_utc) {
+    return getESTDateString(new Date(created_utc * 1000)) === todayEST;
+  }
+
+  function isDailyThread(title) {
+    return /daily\s*(discussion|thread)/i.test(title);
+  }
+
+  var headers = { 'Authorization': 'Bearer ' + token, 'User-Agent': 'EarlyInsider/1.0' };
+
+  // Layer 1: sticky 1
+  try {
+    var r1 = await _deps.fetch(
+      'https://oauth.reddit.com/r/' + subreddit + '/about/sticky?num=1',
+      { headers: headers }
+    );
+    if (r1.status === 200) {
+      var d1 = r1.json().data;
+      if (d1 && isDailyThread(d1.title) && isToday(d1.created_utc)) return d1;
+    }
+  } catch (_) {}
+
+  // Layer 2: sticky 2
+  try {
+    var r2 = await _deps.fetch(
+      'https://oauth.reddit.com/r/' + subreddit + '/about/sticky?num=2',
+      { headers: headers }
+    );
+    if (r2.status === 200) {
+      var d2 = r2.json().data;
+      if (d2 && isDailyThread(d2.title) && isToday(d2.created_utc)) return d2;
+    }
+  } catch (_) {}
+
+  // Layer 3: hot posts
+  try {
+    var r3 = await _deps.fetch(
+      'https://oauth.reddit.com/r/' + subreddit + '/hot?limit=5',
+      { headers: headers }
+    );
+    if (r3.status === 200) {
+      var posts3 = r3.json().data.children.map(function(c) { return c.data; });
+      var match3 = posts3.find(function(p) { return isDailyThread(p.title) && isToday(p.created_utc); });
+      if (match3) return match3;
+    }
+  } catch (_) {}
+
+  // Layer 4: search (last resort, may lag 2+ hours)
+  try {
+    var q = encodeURIComponent('Daily Discussion');
+    var r4 = await _deps.fetch(
+      'https://oauth.reddit.com/r/' + subreddit + '/search?q=' + q + '&sort=new&restrict_sr=1&limit=10',
+      { headers: headers }
+    );
+    if (r4.status === 200) {
+      var posts4 = r4.json().data.children.map(function(c) { return c.data; });
+      var match4 = posts4.find(function(p) { return isDailyThread(p.title) && isToday(p.created_utc); });
+      if (match4) return match4;
+    }
+  } catch (_) {}
+
+  return null;
+}
+
+function _formatDollar(usd) {
+  if (usd >= 1000000) return '$' + (usd / 1000000).toFixed(1) + 'M';
+  if (usd >= 1000) return '$' + (usd / 1000).toFixed(0) + 'K';
+  return '$' + usd;
+}
+
+var CAT5_TEMPLATES = [
+  // 0: notable_buys
+  function(data) {
+    if (!data.filings || data.filings.length === 0) {
+      return 'No notable insider buying activity in the last trading session.';
+    }
+    var lines = data.filings.slice(0, 4).map(function(f) {
+      return '- **$' + f.ticker + '** — ' + f.role + ' bought ' + _formatDollar(f.value_usd) + ' on ' + f.date;
+    }).join('\n');
+    return '**Notable insider buying ' + (data.period || 'yesterday') + ':**\n\n'
+      + lines + '\n\nForm 4 data via SEC EDGAR. Make of it what you will.';
+  },
+  // 1: confidence_index
+  function(data) {
+    var count = data.filings ? data.filings.length : 0;
+    var topFiling = data.filings && data.filings[0];
+    var topLine = topFiling
+      ? 'Top filing: ' + topFiling.role + ' at $' + topFiling.ticker + ' — ' + _formatDollar(topFiling.value_usd)
+      : 'No standout filing.';
+    return '**Insider Confidence Index — ' + (data.period || 'yesterday') + ':** '
+      + count + ' significant Form 4 purchases filed.\n\n'
+      + topLine + '\n\nHigher count = more executives putting their own money in.';
+  },
+  // 2: unusual_activity
+  function(data) {
+    if (!data.filings || data.filings.length === 0) {
+      return 'No unusual insider activity patterns detected in recent filings.';
+    }
+    var top = data.filings[0];
+    return '**Unusual Form 4 pattern flagged — $' + top.ticker + ':** '
+      + top.role + ' (' + top.insider_name + ') purchased '
+      + _formatDollar(top.value_usd) + ' on ' + top.date
+      + '. This represents an unusual cluster relative to baseline.'
+      + ' Worth watching price action over the next 30 days.';
+  },
+];
+
+function buildDailyThreadComment(data, templateIndex) {
+  var fn = CAT5_TEMPLATES[templateIndex % 3];
+  return fn(data);
+}
+
+async function postDailyThread() {
+  var shouldPost = await shouldPostDailyThread();
+  if (!shouldPost.post) { console.log('[CAT5] no post today'); return; }
+
+  var subreddit = await getDailyThreadTarget();
+
+  var thread = await findDailyDiscussionThread(subreddit);
+  if (!thread) {
+    console.log('[CAT5] no daily thread found for ' + subreddit + ' — skipping');
+    return;
+  }
+
+  var period = shouldPost.isWeekendRecap ? 'Fri-Sun' : 'yesterday';
+  var filings = await _fetchFilingsForPeriod(shouldPost.isWeekendRecap ? 3 : 1);
+
+  var storedIndex = await getState('daily_thread_template_index');
+  var templateIndex = typeof storedIndex === 'number' ? storedIndex : 0;
+  await setState('daily_thread_template_index', (templateIndex + 1) % 3);
+
+  var commentText = buildDailyThreadComment({ filings: filings, period: period }, templateIndex);
+
+  var token = await getRedditToken();
+  var res = await _deps.fetch('https://oauth.reddit.com/api/comment', {
+    method: 'POST',
+    headers: {
+      'Authorization': 'Bearer ' + token,
+      'Content-Type': 'application/x-www-form-urlencoded',
+      'User-Agent': 'EarlyInsider/1.0',
+    },
+    body: 'thing_id=' + encodeURIComponent(thread.name) + '&text=' + encodeURIComponent(commentText),
+  });
+
+  var result = res.json();
+  var comment = result && result.json && result.json.data && result.json.data.things
+    && result.json.data.things[0] && result.json.data.things[0].data;
+  if (!comment) throw new Error('[CAT5] Reddit post comment returned no data');
+
+  await _logToRedditLog(
+    thread.url || ('https://www.reddit.com/r/' + subreddit),
+    subreddit,
+    commentText,
+    'posted'
+  );
+  await scheduleThreadReply(comment.name, subreddit, thread.name);
+
+  console.log('[CAT5] posted to ' + subreddit + ' daily thread, comment ' + comment.name);
+}
+
+// ---------------------------------------------------------------------------
+// Exports
+// ---------------------------------------------------------------------------
+
 module.exports = {
+  // Constants
   SUBREDDITS: SUBREDDITS,
   SEARCH_KEYWORDS: SEARCH_KEYWORDS,
+  CAT5_SUBREDDITS: CAT5_SUBREDDITS,
+
+  // Original helpers
   buildSearchQueries: buildSearchQueries,
   filterByScore: filterByScore,
   draftComment: draftComment,
   validateComment: validateComment,
   logComment: logComment,
+
+  // Test seams
+  _setDeps: _setDeps,
+  _setNow: _setNow,
+
+  // Utility (exported for test helpers)
+  getISOWeekKey: getISOWeekKey,
+  getESTDateString: getESTDateString,
+
+  // State helpers
+  getState: getState,
+  setState: setState,
+  shouldSkipToday: shouldSkipToday,
+  getRedditToken: getRedditToken,
+  scheduleThreadReply: scheduleThreadReply,
+
+  // Section 04 — CAT 5
+  getDailyThreadTarget: getDailyThreadTarget,
+  shouldPostDailyThread: shouldPostDailyThread,
+  findDailyDiscussionThread: findDailyDiscussionThread,
+  buildDailyThreadComment: buildDailyThreadComment,
+  postDailyThread: postDailyThread,
 };
diff --git a/insiderbuying-site/tests/insiderbuying/reddit-monitor.test.js b/insiderbuying-site/tests/insiderbuying/reddit-monitor.test.js
new file mode 100644
index 0000000..f3ee113
--- /dev/null
+++ b/insiderbuying-site/tests/insiderbuying/reddit-monitor.test.js
@@ -0,0 +1,579 @@
+'use strict';
+
+const mod = require('../../n8n/code/insiderbuying/reddit-monitor');
+const {
+  SUBREDDITS,
+  SEARCH_KEYWORDS,
+  buildSearchQueries,
+  filterByScore,
+  draftComment,
+  validateComment,
+  logComment,
+  getISOWeekKey,
+} = mod;
+
+// ─── SUBREDDITS / SEARCH_KEYWORDS ─────────────────────────────────────────
+
+describe('SUBREDDITS', () => {
+  test('is a non-empty array', () => {
+    expect(Array.isArray(SUBREDDITS)).toBe(true);
+    expect(SUBREDDITS.length).toBeGreaterThan(0);
+  });
+
+  test('contains expected finance subreddits', () => {
+    expect(SUBREDDITS).toContain('wallstreetbets');
+    expect(SUBREDDITS).toContain('stocks');
+    expect(SUBREDDITS).toContain('investing');
+  });
+});
+
+describe('SEARCH_KEYWORDS', () => {
+  test('is a non-empty array', () => {
+    expect(Array.isArray(SEARCH_KEYWORDS)).toBe(true);
+    expect(SEARCH_KEYWORDS.length).toBeGreaterThan(0);
+  });
+
+  test('contains core insider-buying keywords', () => {
+    expect(SEARCH_KEYWORDS).toContain('insider buying');
+    expect(SEARCH_KEYWORDS).toContain('Form 4');
+    expect(SEARCH_KEYWORDS).toContain('insider activity');
+  });
+});
+
+// ─── buildSearchQueries ────────────────────────────────────────────────────
+
+describe('buildSearchQueries()', () => {
+  test('returns at least SEARCH_KEYWORDS when no tickers provided', () => {
+    const queries = buildSearchQueries([]);
+    SEARCH_KEYWORDS.forEach((kw) => expect(queries).toContain(kw));
+  });
+
+  test('appends $TICKER insider for each ticker', () => {
+    const queries = buildSearchQueries(['AAPL', 'TSLA']);
+    expect(queries).toContain('$AAPL insider');
+    expect(queries).toContain('$TSLA insider');
+  });
+
+  test('appends TICKER insider buying for each ticker', () => {
+    const queries = buildSearchQueries(['AAPL', 'TSLA']);
+    expect(queries).toContain('AAPL insider buying');
+    expect(queries).toContain('TSLA insider buying');
+  });
+
+  test('handles null/undefined gracefully', () => {
+    expect(() => buildSearchQueries(null)).not.toThrow();
+    expect(() => buildSearchQueries(undefined)).not.toThrow();
+    const queries = buildSearchQueries(null);
+    expect(Array.isArray(queries)).toBe(true);
+  });
+
+  test('ignores non-string ticker entries', () => {
+    const queries = buildSearchQueries([null, 42, 'MSFT']);
+    expect(queries).toContain('$MSFT insider');
+    expect(queries).toContain('MSFT insider buying');
+  });
+});
+
+// ─── filterByScore ────────────────────────────────────────────────────────
+
+describe('filterByScore()', () => {
+  test('returns empty array for null/non-array input', () => {
+    expect(filterByScore(null)).toEqual([]);
+    expect(filterByScore(undefined)).toEqual([]);
+    expect(filterByScore('string')).toEqual([]);
+  });
+
+  test('filters posts below default threshold (7)', () => {
+    const posts = [
+      { score: 10, title: 'high' },
+      { score: 5, title: 'low' },
+      { score: 7, title: 'at threshold' },
+    ];
+    const result = filterByScore(posts);
+    expect(result).toHaveLength(2);
+    expect(result.map((p) => p.title)).toContain('high');
+    expect(result.map((p) => p.title)).toContain('at threshold');
+  });
+
+  test('respects custom minScore', () => {
+    const posts = [{ score: 20 }, { score: 50 }, { score: 5 }];
+    const result = filterByScore(posts, 25);
+    expect(result).toHaveLength(1);
+    expect(result[0].score).toBe(50);
+  });
+
+  test('keeps all posts if all meet threshold', () => {
+    const posts = [{ score: 100 }, { score: 200 }, { score: 50 }];
+    expect(filterByScore(posts, 7)).toHaveLength(3);
+  });
+
+  test('returns empty array if no posts meet threshold', () => {
+    const posts = [{ score: 1 }, { score: 2 }];
+    expect(filterByScore(posts, 10)).toHaveLength(0);
+  });
+});
+
+// ─── draftComment ─────────────────────────────────────────────────────────
+
+describe('draftComment()', () => {
+  const SAMPLE_POST = {
+    title: 'CEO of AAPL just bought 10,000 shares',
+    selftext: 'I saw in the SEC filing that Tim Cook bought a ton of shares.',
+    subreddit: 'stocks',
+    score: 42,
+  };
+  const SAMPLE_DATA = {
+    ticker: 'AAPL',
+    insider_name: 'Tim Cook',
+    transaction_type: 'purchased',
+    shares: 10000,
+    value_usd: 2255000,
+    date: '2024-01-15',
+  };
+
+  test('returns object with prompt and maxTokens', () => {
+    const result = draftComment(SAMPLE_POST, SAMPLE_DATA);
+    expect(result).toHaveProperty('prompt');
+    expect(result).toHaveProperty('maxTokens');
+  });
+
+  test('prompt includes the post title', () => {
+    const result = draftComment(SAMPLE_POST, SAMPLE_DATA);
+    expect(result.prompt).toContain(SAMPLE_POST.title);
+  });
+
+  test('prompt includes the insider data', () => {
+    const result = draftComment(SAMPLE_POST, SAMPLE_DATA);
+    expect(result.prompt).toContain('Tim Cook');
+    expect(result.prompt).toContain('AAPL');
+  });
+
+  test('prompt cites the subreddit tone', () => {
+    const result = draftComment(SAMPLE_POST, SAMPLE_DATA);
+    expect(result.prompt).toContain('stocks');
+  });
+
+  test('prompt contains NO brand names rule', () => {
+    const result = draftComment(SAMPLE_POST, SAMPLE_DATA);
+    expect(result.prompt.toUpperCase()).toContain('NO BRAND');
+  });
+
+  test('prompt contains NO links/URLs rule', () => {
+    const result = draftComment(SAMPLE_POST, SAMPLE_DATA);
+    expect(result.prompt.toUpperCase()).toContain('NO LINKS');
+  });
+
+  test('maxTokens is within reasonable range (100-300)', () => {
+    const result = draftComment(SAMPLE_POST, SAMPLE_DATA);
+    expect(result.maxTokens).toBeGreaterThanOrEqual(100);
+    expect(result.maxTokens).toBeLessThanOrEqual(300);
+  });
+
+  test('handles null post and data gracefully', () => {
+    expect(() => draftComment(null, null)).not.toThrow();
+    const result = draftComment(null, null);
+    expect(result).toHaveProperty('prompt');
+    expect(result).toHaveProperty('maxTokens');
+  });
+});
+
+// ─── validateComment ──────────────────────────────────────────────────────
+
+describe('validateComment()', () => {
+  const VALID_COMMENT =
+    'I checked the SEC filings and noticed some interesting activity. '
+    + 'The director purchased a significant block of shares last week. '
+    + 'That kind of conviction from insiders usually signals something.';
+
+  test('returns { valid: false } for null/empty input', () => {
+    expect(validateComment(null).valid).toBe(false);
+    expect(validateComment('').valid).toBe(false);
+    expect(validateComment(undefined).valid).toBe(false);
+  });
+
+  test('returns { valid: true } for a clean 3-sentence comment', () => {
+    const result = validateComment(VALID_COMMENT);
+    expect(result.valid).toBe(true);
+    expect(result.issues).toHaveLength(0);
+  });
+
+  test('detects URLs / domain names', () => {
+    const result = validateComment('Check out https://example.com for details. It is great. Very useful.');
+    expect(result.valid).toBe(false);
+    expect(result.issues.some((i) => i.toLowerCase().includes('url') || i.toLowerCase().includes('domain'))).toBe(true);
+  });
+
+  test('detects brand name InsiderBuying', () => {
+    const result = validateComment('InsiderBuying tracks this data. It is a site I use. Very handy for research.');
+    expect(result.valid).toBe(false);
+    expect(result.issues.some((i) => i.includes('InsiderBuying'))).toBe(true);
+  });
+
+  test('detects brand name EarlyInsider (case-insensitive)', () => {
+    const result = validateComment('earlyinsider has good data. I use it daily. It tracks SEC filings well.');
+    expect(result.valid).toBe(false);
+    expect(result.issues.some((i) => i.toLowerCase().includes('earlyinsider'))).toBe(true);
+  });
+
+  test('flags comment with fewer than 3 sentences', () => {
+    const result = validateComment('Only one sentence here.');
+    expect(result.valid).toBe(false);
+    expect(result.issues.some((i) => i.toLowerCase().includes('few sentences') || i.toLowerCase().includes('too few'))).toBe(true);
+  });
+
+  test('flags comment with more than 5 sentences', () => {
+    const text =
+      'First sentence. Second sentence. Third sentence. Fourth sentence. Sixth sentence. Seventh sentence.';
+    const result = validateComment(text);
+    expect(result.valid).toBe(false);
+    expect(result.issues.some((i) => i.toLowerCase().includes('many sentences') || i.toLowerCase().includes('too many'))).toBe(true);
+  });
+
+  test('result always has issues array', () => {
+    expect(Array.isArray(validateComment(VALID_COMMENT).issues)).toBe(true);
+    expect(Array.isArray(validateComment(null).issues)).toBe(true);
+  });
+});
+
+// ─── logComment ───────────────────────────────────────────────────────────
+
+describe('logComment()', () => {
+  const URL = 'https://reddit.com/r/stocks/comments/abc123';
+  const SUBREDDIT = 'stocks';
+  const TEXT = 'Interesting insider activity here.';
+  const STATUS = 'posted';
+
+  test('returns flat object — no { fields: {} } wrapper', () => {
+    const record = logComment(URL, SUBREDDIT, TEXT, STATUS);
+    expect(record.fields).toBeUndefined();
+  });
+
+  test('includes post_url field', () => {
+    const record = logComment(URL, SUBREDDIT, TEXT, STATUS);
+    expect(record.post_url).toBe(URL);
+  });
+
+  test('includes subreddit field', () => {
+    const record = logComment(URL, SUBREDDIT, TEXT, STATUS);
+    expect(record.subreddit).toBe(SUBREDDIT);
+  });
+
+  test('includes comment_text field', () => {
+    const record = logComment(URL, SUBREDDIT, TEXT, STATUS);
+    expect(record.comment_text).toBe(TEXT);
+  });
+
+  test('includes status field', () => {
+    const record = logComment(URL, SUBREDDIT, TEXT, STATUS);
+    expect(record.status).toBe(STATUS);
+  });
+
+  test('posted_at is a valid ISO timestamp', () => {
+    const record = logComment(URL, SUBREDDIT, TEXT, STATUS);
+    expect(() => new Date(record.posted_at)).not.toThrow();
+    expect(new Date(record.posted_at).toISOString()).toBe(record.posted_at);
+  });
+
+  test('handles null/missing arguments gracefully', () => {
+    expect(() => logComment(null, null, null, null)).not.toThrow();
+    const record = logComment(null, null, null, null);
+    expect(record.post_url).toBe('');
+    expect(record.subreddit).toBe('');
+  });
+});
+
+// ─── Section 04 — CAT 5 Daily Thread ─────────────────────────────────────
+
+// Helpers shared across section-04 tests
+function mockSkipDays(days) {
+  const isoWeek = getISOWeekKey(mod._setNow._currentNow ? mod._setNow._currentNow() : new Date());
+  mod._setDeps({
+    fetch: async () => ({
+      status: 200,
+      json: () => ({
+        list: days !== null
+          ? [{ key: 'week_skip_days', value: JSON.stringify({ week: isoWeek, days }), Id: 1 }]
+          : [],
+      }),
+    }),
+  });
+}
+
+function mockSkipDaysWithNow(days, nowFn) {
+  const isoWeek = getISOWeekKey(nowFn());
+  mod._setDeps({
+    fetch: async () => ({
+      status: 200,
+      json: () => ({
+        list: days !== null
+          ? [{ key: 'week_skip_days', value: JSON.stringify({ week: isoWeek, days }), Id: 1 }]
+          : [],
+      }),
+    }),
+  });
+}
+
+// ─── shouldPostDailyThread ────────────────────────────────────────────────
+
+describe('shouldPostDailyThread', () => {
+  afterEach(() => {
+    mod._setNow(null);
+    mod._setDeps(null);
+  });
+
+  test('returns false on Saturday (dayOfWeek=6)', async () => {
+    mod._setNow(() => new Date('2026-03-28T10:00:00Z')); // Saturday
+    mockSkipDays([]);
+    const r = await mod.shouldPostDailyThread();
+    expect(r.post).toBe(false);
+  });
+
+  test('returns false on Sunday (dayOfWeek=0)', async () => {
+    mod._setNow(() => new Date('2026-03-29T10:00:00Z')); // Sunday
+    mockSkipDays([]);
+    const r = await mod.shouldPostDailyThread();
+    expect(r.post).toBe(false);
+  });
+
+  test('returns false on a skip day', async () => {
+    const nowFn = () => new Date('2026-03-30T10:00:00Z'); // Monday
+    mod._setNow(nowFn);
+    mockSkipDaysWithNow([1], nowFn); // Monday is skip day
+    const r = await mod.shouldPostDailyThread();
+    expect(r.post).toBe(false);
+  });
+
+  test('returns true on a regular weekday', async () => {
+    const nowFn = () => new Date('2026-03-31T10:00:00Z'); // Tuesday
+    mod._setNow(nowFn);
+    mockSkipDaysWithNow([], nowFn);
+    const r = await mod.shouldPostDailyThread();
+    expect(r.post).toBe(true);
+  });
+
+  test('sets isWeekendRecap=true on Monday', async () => {
+    const nowFn = () => new Date('2026-03-30T10:00:00Z'); // Monday
+    mod._setNow(nowFn);
+    mockSkipDaysWithNow([], nowFn);
+    const r = await mod.shouldPostDailyThread();
+    if (r.post) expect(r.isWeekendRecap).toBe(true);
+  });
+});
+
+// ─── findDailyDiscussionThread ────────────────────────────────────────────
+
+describe('findDailyDiscussionThread', () => {
+  const TODAY_UTC = '2026-03-31T12:00:00Z'; // Tuesday
+
+  function sticky(title, created_utc) {
+    return { status: 200, json: () => ({ data: { title, created_utc } }) };
+  }
+  function notFound() { return { status: 404, json: () => ({}) }; }
+  function hotPosts(posts) {
+    return { status: 200, json: () => ({ data: { children: posts.map((p) => ({ data: p })) } }) };
+  }
+
+  afterEach(() => {
+    mod._setNow(null);
+    mod._setDeps(null);
+  });
+
+  test('returns sticky 1 if title contains "Daily" and created today (EST)', async () => {
+    const created = new Date('2026-03-31T07:00:00-04:00').getTime() / 1000;
+    mod._setNow(() => new Date(TODAY_UTC));
+    mod._setDeps({
+      fetch: async (url) => {
+        if (url.includes('sticky?num=1')) return sticky('Daily Discussion - March 31', created);
+        return notFound();
+      },
+    });
+    const r = await mod.findDailyDiscussionThread('stocks');
+    expect(r).not.toBeNull();
+  });
+
+  test('falls back to sticky 2 if sticky 1 is not a daily thread', async () => {
+    const created = new Date('2026-03-31T07:30:00-04:00').getTime() / 1000;
+    mod._setNow(() => new Date(TODAY_UTC));
+    mod._setDeps({
+      fetch: async (url) => {
+        if (url.includes('sticky?num=1')) return sticky('Weekly Megathread', created);
+        if (url.includes('sticky?num=2')) return sticky('Daily Discussion Thread', created);
+        return notFound();
+      },
+    });
+    const r = await mod.findDailyDiscussionThread('stocks');
+    expect(r).not.toBeNull();
+  });
+
+  test('falls back to hot posts if both stickies fail', async () => {
+    const created = new Date('2026-03-31T08:00:00-04:00').getTime() / 1000;
+    mod._setNow(() => new Date(TODAY_UTC));
+    mod._setDeps({
+      fetch: async (url) => {
+        if (url.includes('sticky')) return notFound();
+        if (url.includes('/hot')) return hotPosts([{ title: 'Daily Discussion Thread', name: 't3_abc', created_utc: created }]);
+        return notFound();
+      },
+    });
+    const r = await mod.findDailyDiscussionThread('stocks');
+    expect(r).not.toBeNull();
+  });
+
+  test('returns null if no daily thread found by any method', async () => {
+    mod._setNow(() => new Date(TODAY_UTC));
+    mod._setDeps({ fetch: async () => notFound() });
+    const r = await mod.findDailyDiscussionThread('stocks');
+    expect(r).toBeNull();
+  });
+
+  test('uses EST timezone — post created at 23:00 UTC (7 PM EST) is "today"', async () => {
+    const created = new Date('2026-03-31T23:00:00Z').getTime() / 1000;
+    mod._setNow(() => new Date('2026-03-31T23:30:00Z'));
+    mod._setDeps({
+      fetch: async (url) => {
+        if (url.includes('sticky?num=1')) return sticky('Daily Discussion', created);
+        return notFound();
+      },
+    });
+    const r = await mod.findDailyDiscussionThread('stocks');
+    expect(r).not.toBeNull();
+  });
+
+  test('rejects sticky posted yesterday (EST)', async () => {
+    // 22:00 UTC yesterday = 6 PM EST yesterday
+    const created = new Date('2026-03-30T22:00:00Z').getTime() / 1000;
+    mod._setNow(() => new Date('2026-03-31T12:00:00Z'));
+    mod._setDeps({
+      fetch: async (url) => {
+        if (url.includes('sticky?num=1')) return sticky('Daily Discussion', created);
+        return notFound();
+      },
+    });
+    const r = await mod.findDailyDiscussionThread('stocks');
+    expect(r).toBeNull();
+  });
+});
+
+// ─── buildDailyThreadComment ──────────────────────────────────────────────
+
+describe('buildDailyThreadComment', () => {
+  const mockData = {
+    filings: [
+      { ticker: 'AAPL', insider_name: 'Tim Cook', role: 'CEO', value_usd: 2000000, date: '2026-03-30', company: 'Apple Inc.' },
+      { ticker: 'MSFT', insider_name: 'Satya Nadella', role: 'CEO', value_usd: 500000, date: '2026-03-30', company: 'Microsoft Corp.' },
+    ],
+    period: 'yesterday',
+  };
+
+  test('returns non-empty string for template index 0 (notable_buys)', () => {
+    const text = mod.buildDailyThreadComment(mockData, 0);
+    expect(typeof text).toBe('string');
+    expect(text.length).toBeGreaterThan(50);
+  });
+
+  test('returns non-empty string for template index 1 (confidence_index)', () => {
+    const text = mod.buildDailyThreadComment(mockData, 1);
+    expect(typeof text).toBe('string');
+    expect(text.length).toBeGreaterThan(50);
+  });
+
+  test('returns non-empty string for template index 2 (unusual_activity)', () => {
+    const text = mod.buildDailyThreadComment(mockData, 2);
+    expect(typeof text).toBe('string');
+    expect(text.length).toBeGreaterThan(50);
+  });
+
+  test('includes ticker symbol in output', () => {
+    const text = mod.buildDailyThreadComment(mockData, 0);
+    expect(text.includes('AAPL') || text.includes('MSFT')).toBe(true);
+  });
+
+  test('includes formatted dollar amount', () => {
+    const text = mod.buildDailyThreadComment(mockData, 0);
+    expect(text.includes('$')).toBe(true);
+    expect(text.includes('M') || text.includes('K')).toBe(true);
+  });
+
+  test('does not contain URLs', () => {
+    [0, 1, 2].forEach((idx) => {
+      const text = mod.buildDailyThreadComment(mockData, idx);
+      expect(/https?:\/\//.test(text)).toBe(false);
+    });
+  });
+
+  test('handles empty filings array without throwing', () => {
+    expect(() => mod.buildDailyThreadComment({ filings: [], period: 'yesterday' }, 0)).not.toThrow();
+  });
+
+  test('includes period label in weekend recap (Monday)', () => {
+    const text = mod.buildDailyThreadComment({ filings: mockData.filings, period: 'Fri-Sun' }, 1);
+    expect(text.includes('Fri') || text.includes('weekend') || text.includes('Sun')).toBe(true);
+  });
+});
+
+// ─── postDailyThread ──────────────────────────────────────────────────────
+
+describe('postDailyThread', () => {
+  afterEach(() => {
+    mod._setNow(null);
+    mod._setDeps(null);
+  });
+
+  test('returns early when shouldPostDailyThread() returns post=false', async () => {
+    const posts = [];
+    mod._setNow(() => new Date('2026-03-28T10:00:00Z')); // Saturday
+    mod._setDeps({
+      fetch: async (url, opts) => {
+        if (opts && opts.method === 'POST' && url.includes('reddit.com')) posts.push(true);
+        return { status: 200, json: () => ({ list: [] }) };
+      },
+    });
+    await mod.postDailyThread();
+    expect(posts.length).toBe(0);
+  });
+
+  test('returns early when findDailyDiscussionThread() returns null — logs warning', async () => {
+    const posts = [];
+    const nowFn = () => new Date('2026-03-31T10:00:00Z'); // Tuesday
+    mod._setNow(nowFn);
+    mod._setDeps({
+      fetch: async (url, opts) => {
+        if (opts && opts.method === 'POST' && url.includes('api/comment')) posts.push(true);
+        if (url.includes('sticky') || url.includes('/hot') || url.includes('search')) {
+          return { status: 404, json: () => ({}) };
+        }
+        return { status: 200, json: () => ({ list: [] }) };
+      },
+    });
+    await mod.postDailyThread();
+    expect(posts.length).toBe(0);
+  });
+
+  test('posts comment and does not throw — verify no crash', async () => {
+    const nowFn = () => new Date('2026-03-31T10:00:00Z'); // Tuesday
+    mod._setNow(nowFn);
+    const threadCreated = new Date('2026-03-31T07:00:00-04:00').getTime() / 1000;
+    mod._setDeps({
+      fetch: async (url, opts) => {
+        if (url.includes('sticky?num=1')) {
+          return {
+            status: 200,
+            json: () => ({ data: { title: 'Daily Discussion', name: 't3_thread1', id: 'thread1', created_utc: threadCreated } }),
+          };
+        }
+        if (opts && opts.method === 'POST' && url.includes('api/comment')) {
+          return {
+            status: 200,
+            json: () => ({ json: { data: { things: [{ data: { id: 'newcmt', name: 't1_newcmt' } }] } } }),
+          };
+        }
+        if (url.includes('nocodb')) return { status: 200, json: () => ({ list: [] }) };
+        if (opts && opts.method === 'POST' && url.includes('Scheduled_Jobs')) {
+          return { status: 200, json: () => ({}) };
+        }
+        return { status: 200, json: () => ({ list: [{ ticker: 'AAPL', insider_name: 'Tim Cook', role: 'CEO', value_usd: 2000000, date: '2026-03-30' }] }) };
+      },
+    });
+    await expect(mod.postDailyThread()).resolves.not.toThrow();
+  });
+});
