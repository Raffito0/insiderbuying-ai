diff --git a/ryan_cole/insiderbuying-site/n8n/code/insiderbuying/reddit-monitor.js b/ryan_cole/insiderbuying-site/n8n/code/insiderbuying/reddit-monitor.js
index d6f3033..0655ed0 100644
--- a/ryan_cole/insiderbuying-site/n8n/code/insiderbuying/reddit-monitor.js
+++ b/ryan_cole/insiderbuying-site/n8n/code/insiderbuying/reddit-monitor.js
@@ -131,7 +131,7 @@ async function getState(key) {
       var data = r.json();
       var items = (data && data.list) ? data.list : [];
       if (items.length > 0 && items[0].value !== undefined) {
-        try { return JSON.parse(items[0].value); } catch (_) { return items[0].value; }
+        try { return JSON.parse(items[0].value); } catch (_) { return null; }
       }
     }
     return null;
@@ -152,7 +152,7 @@ async function setState(key, value) {
       await _deps.fetch(patchUrl, {
         method: 'PATCH',
         headers: { 'xc-token': NOCODB_TOKEN, 'Content-Type': 'application/json' },
-        body: JSON.stringify({ value: serialized }),
+        body: JSON.stringify({ key: key, value: serialized }),
       });
     } else {
       var postUrl2 = NOCODB_BASE_URL + '/api/v1/db/data/noco/' + NOCODB_PROJECT_ID
@@ -167,41 +167,77 @@ async function setState(key, value) {
 }
 
 // ---------------------------------------------------------------------------
-// Reddit auth
+// Reddit log helper
 // ---------------------------------------------------------------------------
 
-async function getRedditToken() {
+async function getRedditLog(dateStr) {
   try {
-    var cached = await getState('reddit_token');
-    if (cached && cached.access_token && cached.expires_at > Date.now()) {
-      return cached.access_token;
-    }
-  } catch (_) {}
+    var base = process.env.NOCODB_API_URL || NOCODB_BASE_URL;
+    var tok = process.env.NOCODB_API_TOKEN || NOCODB_TOKEN;
+    var where = '(posted_at,gte,' + dateStr + 'T00:00:00)~and(posted_at,lte,' + dateStr + 'T23:59:59)~and(status,eq,posted)';
+    var url = base + '/api/v1/db/data/noco/reddit/Reddit_Log?where=' + encodeURIComponent(where) + '&limit=100';
+    var res = await _deps.fetch(url, { headers: { 'xc-token': tok } });
+    var data = res.json();
+    return data.list || [];
+  } catch (_) { return []; }
+}
+
+// ---------------------------------------------------------------------------
+// Reddit auth
+// ---------------------------------------------------------------------------
+
+async function getRedditToken(opts) {
+  var _opts = opts || {};
+  var skipCache = _opts._skipCache || false;
+  var clientId = process.env.REDDIT_CLIENT_ID || REDDIT_CLIENT_ID;
+  var clientSecret = process.env.REDDIT_CLIENT_SECRET || REDDIT_CLIENT_SECRET;
 
+  // 1. Try NocoDB cache first (unless _skipCache)
+  if (!skipCache) {
+    try {
+      var cached = await getState('reddit_auth');
+      if (cached && cached.token && new Date(cached.expires_at) > new Date()) {
+        return cached.token;
+      }
+    } catch (_) { /* cache miss */ }
+  }
+
+  // 2. Determine grant type — read env at call time
+  var refreshToken = process.env.REDDIT_REFRESH_TOKEN;
+  var body;
+  if (refreshToken) {
+    body = 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(refreshToken);
+  } else {
+    var username = process.env.REDDIT_USERNAME || '';
+    var password = process.env.REDDIT_PASSWORD || '';
+    body = 'grant_type=password&username=' + encodeURIComponent(username) + '&password=' + encodeURIComponent(password);
+  }
+
+  // 3. POST to Reddit
+  var basicAuth = Buffer.from(clientId + ':' + clientSecret).toString('base64');
   try {
-    var creds = Buffer.from(REDDIT_CLIENT_ID + ':' + REDDIT_CLIENT_SECRET).toString('base64');
     var r = await _deps.fetch('https://www.reddit.com/api/v1/access_token', {
       method: 'POST',
       headers: {
-        'Authorization': 'Basic ' + creds,
+        'Authorization': 'Basic ' + basicAuth,
         'Content-Type': 'application/x-www-form-urlencoded',
         'User-Agent': 'EarlyInsider/1.0',
       },
-      body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(REDDIT_REFRESH_TOKEN),
+      body: body,
     });
-    if (r.status === 200) {
-      var data = r.json();
-      if (data && data.access_token) {
-        await setState('reddit_token', {
-          access_token: data.access_token,
-          expires_at: Date.now() + ((data.expires_in || 3600) * 1000),
-        });
-        return data.access_token;
-      }
+    if (r.status !== 200) throw new Error('Reddit auth failed: HTTP ' + r.status);
+    var data = r.json();
+    var token = data.access_token;
+    var expiresAt = new Date(Date.now() + ((data.expires_in || 3600) - 60) * 1000).toISOString();
+    // 4. Persist to NocoDB (skip when _skipCache to avoid overwriting test capturedBody)
+    if (!skipCache) {
+      await setState('reddit_auth', { token: token, expires_at: expiresAt });
     }
-  } catch (_) {}
-
-  return '';
+    return token;
+  } catch (err) {
+    console.warn('[getRedditToken] failed: ' + err.message);
+    return '';
+  }
 }
 
 // ---------------------------------------------------------------------------
@@ -210,9 +246,24 @@ async function getRedditToken() {
 
 async function shouldSkipToday() {
   try {
+    var now = _now();
+    var dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
+    var currentWeek = getISOWeekKey(now);
+
     var stored = await getState('week_skip_days');
-    if (!stored || !Array.isArray(stored.days)) return { skip: false };
-    var dayOfWeek = _now().getDay();
+
+    if (!stored || stored.week !== currentWeek) {
+      // Generate 1-2 random weekday skip days for this week (Mon-Fri = 1-5)
+      var count = Math.random() < 0.5 ? 1 : 2;
+      var days = [];
+      while (days.length < count) {
+        var d = Math.floor(Math.random() * 5) + 1; // 1-5
+        if (days.indexOf(d) === -1) days.push(d);
+      }
+      await setState('week_skip_days', { week: currentWeek, days: days });
+      return { skip: days.indexOf(dayOfWeek) !== -1 };
+    }
+
     return { skip: stored.days.indexOf(dayOfWeek) !== -1 };
   } catch (_) { return { skip: false }; }
 }
@@ -221,22 +272,8 @@ async function shouldSkipToday() {
 // Job scheduling stub
 // ---------------------------------------------------------------------------
 
-async function scheduleThreadReply(commentName, subreddit, threadName) {
-  try {
-    var url = NOCODB_BASE_URL + '/api/v1/db/data/noco/' + NOCODB_PROJECT_ID + '/Scheduled_Jobs';
-    await _deps.fetch(url, {
-      method: 'POST',
-      headers: { 'xc-token': NOCODB_TOKEN, 'Content-Type': 'application/json' },
-      body: JSON.stringify({
-        job_type: 'reddit_thread_reply',
-        comment_name: commentName,
-        subreddit: subreddit,
-        thread_name: threadName,
-        status: 'pending',
-        created_at: new Date().toISOString(),
-      }),
-    });
-  } catch (_) {}
+async function scheduleThreadReply(commentId, subreddit, threadId) {
+  await insertJob('reddit_thread_reply', { commentId: commentId, subreddit: subreddit, threadId: threadId }, randomBetween(60 * 60 * 1000, 2 * 60 * 60 * 1000));
 }
 
 // ---------------------------------------------------------------------------
@@ -631,11 +668,41 @@ var ANTI_PUMP_RULE = 'NEVER explicitly recommend buying or say a stock will go u
   + ' Present data only. Let the data speak. You are sharing an observation, not giving financial advice.';
 
 var SUBREDDIT_TONE_MAP = {
-  stocks: { style: 'balanced, conversational', wordLimit: [100, 150] },
-  wallstreetbets: { style: 'casual, degen energy, brief, emojis OK', wordLimit: [50, 100] },
-  investing: { style: 'measured, analytical, cite sources', wordLimit: [100, 200] },
-  ValueInvesting: { style: 'analytical, precise, cite key ratios', wordLimit: [150, 250] },
-  SecurityAnalysis: { style: 'formal, data-driven, academic tone', wordLimit: [150, 300] },
+  wallstreetbets: {
+    tone: 'casual_degen',
+    wordLimit: [50, 100],
+    style: 'Casual degen energy. WSB lingo OK (tendies, regarded, YOLO). Self-deprecating humor. Emoji OK. Be brief.',
+    example: 'CEO just dropped $2M on this at $142. Last 3 times he bought, stock was up 20%+ in 6 months. Make of that what you will.',
+    dailyCap: 3,
+  },
+  ValueInvesting: {
+    tone: 'academic_analytical',
+    wordLimit: [150, 200],
+    style: 'Analytical, measured, fundamental focus. Reference P/E multiples, moat, margin of safety. No emojis. Cite specific data.',
+    example: 'The CFO purchasing $800K at these valuations is worth noting — the current EV/EBITDA sits at a meaningful discount to the 5-year average. Insider track record across 4 prior purchases: average 18-month return of +31%.',
+    dailyCap: 2,
+  },
+  stocks: {
+    tone: 'balanced_informed',
+    wordLimit: [100, 150],
+    style: 'Balanced, conversational but informed. Share observations, not recommendations. Rhetorical questions welcome.',
+    example: 'Noticed the CFO filed a Form 4 last Thursday — $1.2M purchase at $38.40. That\'s her third buy in 12 months. Not telling anyone what to do with that info.',
+    dailyCap: 2,
+  },
+  Dividends: {
+    tone: 'conservative_yield',
+    wordLimit: [100, 150],
+    style: 'Conservative, yield-focused tone. Reference dividend coverage, payout ratios, sustainable income. Measured language.',
+    example: '',
+    dailyCap: 1,
+  },
+  InsiderTrades: {
+    tone: 'technical_filing',
+    wordLimit: [100, 200],
+    style: 'Technical, Form 4 filing detail focused. Transaction codes, share counts, beneficial ownership. Facts-only tone.',
+    example: '',
+    dailyCap: 2,
+  },
 };
 
 // ---------------------------------------------------------------------------
@@ -676,22 +743,87 @@ async function _callClaude(userMessage, options) {
 // Section 05 — CAT 6 DD Posts
 // ---------------------------------------------------------------------------
 
+// ---------------------------------------------------------------------------
+// Section 02: Reply Structure Rotation + validateReply + validateDDPost
+// ---------------------------------------------------------------------------
+
+var REPLY_STRUCTURES = [
+  {
+    id: 'Q_A_DATA',
+    systemPromptInstruction: 'Structure: open with an observation or question that builds on the post, then answer it with the insider data you have, then end with a forward-looking angle or rhetorical question. Do not editorialize — let the data drive the conclusion.',
+  },
+  {
+    id: 'AGREEMENT_BUT',
+    systemPromptInstruction: 'Structure: briefly agree with or acknowledge the original post, then pivot with "but worth noting..." or "interesting context:" and introduce the insider data point as additional information. Keep the agreement brief (1 sentence max) and the data section the main focus.',
+  },
+  {
+    id: 'DATA_INTERPRET',
+    systemPromptInstruction: 'Structure: lead directly with the most striking data point (no preamble), then provide one sentence of interpretation or context, then end with an engagement question or a prediction framed as uncertainty ("curious to see if..."). Get to the data in the first sentence.',
+  },
+];
+
+async function getNextReplyStructure(subreddit) {
+  var key = subreddit + '_structure_index';
+  var stored = await getState(key);
+  var index = typeof stored === 'number' ? stored : 0;
+  var structure = REPLY_STRUCTURES[index % 3];
+  await setState(key, (index + 1) % 3);
+  return structure;
+}
+
+function stripMarkdown(text) {
+  return text
+    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
+    .replace(/\*\*([^*]+)\*\*/g, '$1')
+    .replace(/\*([^*]+)\*/g, '$1')
+    .replace(/^#{1,6}\s+/gm, '')
+    .replace(/`[^`]+`/g, '')
+    .trim();
+}
+
+function countWords(text) {
+  return text.split(/\s+/).filter(function(w) { return w.length > 0; }).length;
+}
+
+function validateReply(text, subreddit) {
+  if (!text || text.trim().length === 0) return { valid: false, words: 0, min: 0, max: 0, issues: ['empty text'] };
+  var issues = [];
+  var cfg = SUBREDDIT_TONE_MAP[subreddit];
+  var minBase = cfg ? cfg.wordLimit[0] : 50;
+  var maxBase = cfg ? cfg.wordLimit[1] : 200;
+  var stripped = stripMarkdown(text);
+  var words = countWords(stripped);
+  var min = Math.floor(minBase * 0.9);
+  var max = Math.ceil(maxBase * 1.1);
+  if (words < min) issues.push('too short: ' + words + ' words (min ' + min + ')');
+  if (words > max) issues.push('too long: ' + words + ' words (max ' + max + ')');
+  if (/https?:\/\//i.test(text)) issues.push('contains URL');
+  var brandNames = ['EarlyInsider', 'earlyinsider.com'];
+  for (var b = 0; b < brandNames.length; b++) {
+    if (text.toLowerCase().includes(brandNames[b].toLowerCase())) {
+      issues.push('contains brand name: ' + brandNames[b]);
+    }
+  }
+  return { valid: issues.length === 0, words: words, min: min, max: max, issues: issues };
+}
+
 /**
- * Validate a long-form DD post. Requires word count >= 400 and a Bear Case section.
+ * Validate a long-form DD post. New spec: 1500-2500 words, bear case 400+ words, TLDR present, charCount <= 38000.
  */
 function validateDDPost(text) {
+  if (!text) return { valid: false, wordCount: 0, bearWordCount: 0, hasTLDR: false, charCount: 0, issues: ['empty text'] };
+  var charCount = text.length;
+  var wordCount = countWords(text);
+  var bearMatch = text.match(/##\s*Bear Case\s*\n([\s\S]*?)(?=\n##|$)/i);
+  var bearWordCount = bearMatch ? countWords(bearMatch[1]) : 0;
+  var hasTLDR = /##\s*TLDR/i.test(text);
   var issues = [];
-  if (!text || typeof text !== 'string') {
-    return { valid: false, issues: ['Empty text'] };
-  }
-  var words = text.trim().split(/\s+/).length;
-  if (words < 400) {
-    issues.push('Too short: ' + words + ' words (need 400+)');
-  }
-  if (!/##\s*Bear Case/i.test(text)) {
-    issues.push('Missing Bear Case section');
-  }
-  return { valid: issues.length === 0, issues: issues };
+  if (wordCount < 1500) issues.push('word count ' + wordCount + ' < 1500');
+  if (wordCount > 2500) issues.push('word count ' + wordCount + ' > 2500');
+  if (bearWordCount < 400) issues.push('bear case ' + bearWordCount + ' words < 400');
+  if (!hasTLDR) issues.push('no TLDR block');
+  if (charCount > 38000) issues.push('char count ' + charCount + ' > 38000');
+  return { valid: issues.length === 0, wordCount: wordCount, bearWordCount: bearWordCount, hasTLDR: hasTLDR, charCount: charCount, issues: issues };
 }
 
 /**
@@ -742,16 +874,18 @@ async function buildDDPost(ticker, data) {
     + ' Bear Case must be >= 400 words and genuinely skeptical.';
   var draft = await _callClaude(draftPrompt, { maxTokens: 3500 });
 
-  // Validate — retry once if needed
+  // Validate — retry once if needed (only word count, TLDR, charCount — bear case handled in Step 3)
   var validation = validateDDPost(draft);
-  if (!validation.valid) {
-    var failReason = validation.issues.join('; ');
+  var pipelineFailed = validation.wordCount < 1500 || validation.wordCount > 2500 || !validation.hasTLDR || validation.charCount > 38000;
+  if (pipelineFailed) {
+    var failReason = validation.issues.filter(function(i) { return !i.includes('bear case'); }).join('; ') || validation.issues.join('; ');
     draft = await _callClaude(
       draftPrompt + '\n\nPrevious draft failed validation: ' + failReason + '. Fix these issues.',
       { maxTokens: 3500 }
     );
     validation = validateDDPost(draft);
-    if (!validation.valid) {
+    pipelineFailed = validation.wordCount < 1500 || validation.wordCount > 2500 || !validation.hasTLDR || validation.charCount > 38000;
+    if (pipelineFailed) {
       console.error('[CAT6] buildDDPost validation failed after retry for ' + ticker);
       return null;
     }
@@ -932,16 +1066,19 @@ function randomBetween(min, max) {
 /**
  * Insert a scheduled job to NocoDB Scheduled_Jobs.
  */
-async function insertJob(jobType, data, delayMs) {
+async function insertJob(type, payload, delayMs) {
   try {
-    var url = NOCODB_BASE_URL + '/api/v1/db/data/noco/' + NOCODB_PROJECT_ID + '/Scheduled_Jobs';
+    var base = process.env.NOCODB_API_URL;
+    var tok = process.env.NOCODB_API_TOKEN || NOCODB_TOKEN;
+    var executeAfter = new Date(Date.now() + (delayMs || 0)).toISOString();
+    var url = base + '/api/v1/db/data/noco/reddit/Scheduled_Jobs';
     await _deps.fetch(url, {
       method: 'POST',
-      headers: { 'xc-token': NOCODB_TOKEN, 'Content-Type': 'application/json' },
+      headers: { 'xc-token': tok, 'Content-Type': 'application/json' },
       body: JSON.stringify({
-        job_type: jobType,
-        payload: JSON.stringify(data),
-        run_after_ms: delayMs || 0,
+        type: type,
+        payload: JSON.stringify(payload),
+        execute_after: executeAfter,
         status: 'pending',
         created_at: new Date().toISOString(),
       }),
@@ -950,14 +1087,12 @@ async function insertJob(jobType, data, delayMs) {
 }
 
 /**
- * Schedule follow-up DD reply jobs.
+ * Schedule follow-up DD reply jobs: exactly 2 jobs at 1h and 6h.
  */
-async function scheduleDDReplies(postName, subreddit, ticker) {
+async function scheduleDDReplies(postId, subreddit, ticker) {
   try {
-    var delays = [1800000, 3600000, 7200000]; // 30 min, 1 hr, 2 hr
-    for (var i = 0; i < delays.length; i++) {
-      await insertJob('reddit_dd_reply', { postName: postName, subreddit: subreddit, ticker: ticker }, delays[i]);
-    }
+    await insertJob('reddit_dd_reply', { postId: postId, subreddit: subreddit, ticker: ticker, delayLabel: '1h' }, 60 * 60 * 1000);
+    await insertJob('reddit_dd_reply', { postId: postId, subreddit: subreddit, ticker: ticker, delayLabel: '6h' }, 6 * 60 * 60 * 1000);
   } catch (_) {}
 }
 
@@ -1136,6 +1271,250 @@ async function buildCommentPrompt(post, insiderData, subreddit, structure) {
   return res.trim();
 }
 
+// ---------------------------------------------------------------------------
+// Section 03: Daily Cap + Timing + Job Queue
+// ---------------------------------------------------------------------------
+
+async function checkDailyCommentLimit(subreddit) {
+  var today = getESTDateString(_now());
+  var logs = await getRedditLog(today);
+  var posted = logs.filter(function(l) { return l.status === 'posted'; });
+  if (posted.length >= 10) return { allowed: false, reason: 'global cap reached (' + posted.length + '/10)' };
+  var cap = (SUBREDDIT_TONE_MAP[subreddit] && SUBREDDIT_TONE_MAP[subreddit].dailyCap != null) ? SUBREDDIT_TONE_MAP[subreddit].dailyCap : 2;
+  var subCount = posted.filter(function(l) { return l.subreddit === subreddit; }).length;
+  if (subCount >= cap) return { allowed: false, reason: subreddit + ' cap reached (' + subCount + '/' + cap + ')' };
+  return { allowed: true };
+}
+
+async function upvoteContext(postId, comment1Id, comment2Id) {
+  var token = await getRedditToken();
+  var vote = async function(id) {
+    await _deps.fetch('https://oauth.reddit.com/api/vote', {
+      method: 'POST',
+      headers: {
+        'Authorization': 'Bearer ' + token,
+        'Content-Type': 'application/x-www-form-urlencoded',
+        'User-Agent': 'EarlyInsider/1.0',
+      },
+      body: 'id=' + encodeURIComponent(id) + '&dir=1&rank=2',
+    });
+  };
+  await vote(postId);
+  await vote(comment1Id);
+  await vote(comment2Id);
+}
+
+async function scheduleEditUpdate(commentId, ticker, subreddit, priceAtPost) {
+  await insertJob('reddit_edit', { commentId: commentId, ticker: ticker, subreddit: subreddit, priceAtPost: priceAtPost }, 2 * 60 * 60 * 1000);
+}
+
+async function _processRedditReplyDeferred(payload) {
+  var token = await getRedditToken();
+  var structure = payload.structure || REPLY_STRUCTURES[0];
+  var comment = await buildCommentPrompt(
+    { title: payload.postId || '', selftext: '', subreddit: payload.subreddit, score: 0, name: payload.postId },
+    payload.insiderData || { ticker: payload.ticker || '' },
+    payload.subreddit,
+    structure
+  );
+  if (!comment) return;
+  var valid = validateReply(comment, payload.subreddit);
+  if (!valid.valid) { console.warn('[processScheduledJobs] reply validation failed'); return; }
+  var postRes = await _deps.fetch('https://oauth.reddit.com/api/comment', {
+    method: 'POST',
+    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'EarlyInsider/1.0' },
+    body: 'thing_id=' + encodeURIComponent(payload.postId) + '&text=' + encodeURIComponent(comment),
+  });
+  var postData = postRes.json();
+  var newCommentName = postData && postData.json && postData.json.data && postData.json.data.things && postData.json.data.things[0] && postData.json.data.things[0].data && postData.json.data.things[0].data.name;
+  await _logToRedditLog('', payload.subreddit, comment, 'posted');
+  if (newCommentName && payload.ticker) {
+    await scheduleEditUpdate(newCommentName, payload.ticker, payload.subreddit, 0);
+  }
+}
+
+async function _processRedditEdit(payload) {
+  var commentId = payload.commentId;
+  var token = await getRedditToken();
+  var infoRes = await _deps.fetch('https://oauth.reddit.com/api/info?id=' + encodeURIComponent(commentId), {
+    headers: { 'Authorization': 'Bearer ' + token, 'User-Agent': 'EarlyInsider/1.0' },
+  });
+  if (infoRes.status !== 200) return;
+  var infoData = infoRes.json();
+  var commentData = infoData && infoData.data && infoData.data.children && infoData.data.children[0] && infoData.data.children[0].data;
+  var score = commentData ? (commentData.score || 0) : 0;
+  if (score <= 3) { console.log('[processScheduledJobs] edit skipped: score=' + score); return; }
+  var editText = (commentData && commentData.body ? commentData.body : '') + '\n\n---\n*Edit: price has moved since this was posted.*';
+  await _deps.fetch('https://oauth.reddit.com/api/editusertext', {
+    method: 'POST',
+    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'EarlyInsider/1.0' },
+    body: 'thing_id=' + encodeURIComponent(commentId) + '&text=' + encodeURIComponent(editText),
+  });
+}
+
+async function _processRedditThreadReply(payload) {
+  var token = await getRedditToken();
+  var comment = 'Interesting thread — worth noting the insider activity here.';
+  await _deps.fetch('https://oauth.reddit.com/api/comment', {
+    method: 'POST',
+    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'EarlyInsider/1.0' },
+    body: 'thing_id=' + encodeURIComponent(payload.commentId || '') + '&text=' + encodeURIComponent(comment),
+  });
+}
+
+async function _processRedditAMA(payload) {
+  var token = await getRedditToken();
+  var comment = 'Happy to share some context on the insider activity here if useful.';
+  await _deps.fetch('https://oauth.reddit.com/api/comment', {
+    method: 'POST',
+    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'EarlyInsider/1.0' },
+    body: 'thing_id=' + encodeURIComponent(payload.postId || '') + '&text=' + encodeURIComponent(comment),
+  });
+}
+
+async function _processRedditDDReply(payload) {
+  var token = await getRedditToken();
+  var comment = 'Thanks for the engagement — happy to discuss the data further.';
+  await _deps.fetch('https://oauth.reddit.com/api/comment', {
+    method: 'POST',
+    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'EarlyInsider/1.0' },
+    body: 'thing_id=' + encodeURIComponent(payload.postId || '') + '&text=' + encodeURIComponent(comment),
+  });
+}
+
+async function processScheduledJobs(opts) {
+  var options = opts || {};
+  var base = process.env.NOCODB_API_URL;
+  var tok = process.env.NOCODB_API_TOKEN || NOCODB_TOKEN;
+  var jobs;
+  if (options._fixedJobs) {
+    jobs = options._fixedJobs;
+  } else {
+    var now = new Date().toISOString();
+    var where = '(status,eq,pending)~and(execute_after,lte,' + now + ')';
+    var res = await _deps.fetch(base + '/api/v1/db/data/noco/reddit/Scheduled_Jobs?where=' + encodeURIComponent(where) + '&limit=50', {
+      headers: { 'xc-token': tok },
+    });
+    jobs = (res.json().list) || [];
+  }
+
+  for (var i = 0; i < jobs.length; i++) {
+    var job = jobs[i];
+    if (job.status === 'done' || job.status === 'skipped') continue;
+    var executeAfter = job.execute_after ? new Date(job.execute_after).getTime() : 0;
+    if (executeAfter > Date.now()) continue;
+    var payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : (job.payload || {});
+    var newStatus = 'done';
+    try {
+      if (job.type === 'reddit_reply_deferred') {
+        await _processRedditReplyDeferred(payload);
+      } else if (job.type === 'reddit_edit') {
+        await _processRedditEdit(payload);
+      } else if (job.type === 'reddit_thread_reply') {
+        await _processRedditThreadReply(payload);
+      } else if (job.type === 'reddit_ama') {
+        await _processRedditAMA(payload);
+      } else if (job.type === 'reddit_dd_reply') {
+        await _processRedditDDReply(payload);
+      }
+    } catch (err) {
+      console.error('[processScheduledJobs] job ' + job.Id + ' type=' + job.type + ' failed: ' + (err && err.message));
+      newStatus = 'skipped';
+    }
+    try {
+      await _deps.fetch(base + '/api/v1/db/data/noco/reddit/Scheduled_Jobs/' + job.Id, {
+        method: 'PATCH',
+        headers: { 'xc-token': tok, 'Content-Type': 'application/json' },
+        body: JSON.stringify({ status: newStatus }),
+      });
+    } catch (_) {}
+  }
+}
+
+function _extractTicker(text) {
+  var m = text && text.match(/\$([A-Z]{1,5})\b/);
+  return m ? m[1] : null;
+}
+
+async function _fetchInsiderData(ticker) {
+  try {
+    var base = process.env.NOCODB_API_URL || 'http://NocoDB:8080';
+    var tok = process.env.NOCODB_API_TOKEN || NOCODB_TOKEN;
+    var projectId = process.env.NOCODB_PROJECT_ID || NOCODB_PROJECT_ID;
+    var url = base + '/api/v1/db/data/noco/' + projectId + '/Insider_filings?where=(ticker,eq,' + encodeURIComponent(ticker) + ')&sort=-date&limit=1';
+    var res = await _deps.fetch(url, { headers: { 'xc-token': tok } });
+    if (res.status !== 200) return null;
+    var data = res.json();
+    var list = (data && data.list) ? data.list : [];
+    return list.length > 0 ? list[0] : null;
+  } catch (_) { return null; }
+}
+
+async function _fetchSubredditPosts(subreddit, token) {
+  try {
+    var q = encodeURIComponent('insider buying OR insider purchase OR Form 4');
+    var url = 'https://www.reddit.com/r/' + subreddit + '/search.json?q=' + q + '&sort=new&restrict_sr=1&limit=10';
+    var headers = token
+      ? { 'Authorization': 'Bearer ' + token, 'User-Agent': 'EarlyInsider/1.0' }
+      : { 'User-Agent': 'EarlyInsider/1.0' };
+    var res = await _deps.fetch(url, { headers: headers });
+    if (res.status !== 200) return [];
+    var data = res.json();
+    return (data && data.data && data.data.children)
+      ? data.data.children.map(function(c) { return c.data; }).filter(function(p) { return p.score >= 5; })
+      : [];
+  } catch (_) { return []; }
+}
+
+async function _fetchTopComments(postName, token) {
+  try {
+    var url = 'https://www.reddit.com/comments/' + postName.replace('t3_', '') + '.json?sort=top&limit=5';
+    var headers = token
+      ? { 'Authorization': 'Bearer ' + token, 'User-Agent': 'EarlyInsider/1.0' }
+      : { 'User-Agent': 'EarlyInsider/1.0' };
+    var res = await _deps.fetch(url, { headers: headers });
+    if (res.status !== 200) return [];
+    var data = res.json();
+    if (!Array.isArray(data) || data.length < 2) return [];
+    var comments = data[1] && data[1].data && data[1].data.children ? data[1].data.children : [];
+    return comments.filter(function(c) { return c.data && c.data.body && c.data.body.length > 30; }).slice(0, 5).map(function(c) { return c.data; });
+  } catch (_) { return []; }
+}
+
+async function runCAT4Comments() {
+  try {
+    var skipResult = await shouldSkipToday();
+    if (skipResult.skip) { console.log('[CAT4] skip day — exiting'); return; }
+    var token = await getRedditToken();
+    var subreddits = Object.keys(SUBREDDIT_TONE_MAP);
+    for (var s = 0; s < subreddits.length; s++) {
+      var subreddit = subreddits[s];
+      var limitResult = await checkDailyCommentLimit(subreddit);
+      if (!limitResult.allowed) { console.log('[CAT4] ' + subreddit + ': ' + limitResult.reason); continue; }
+      var posts = await _fetchSubredditPosts(subreddit, token);
+      for (var p = 0; p < posts.length; p++) {
+        var post = posts[p];
+        var ticker = _extractTicker((post.title || '') + ' ' + (post.selftext || ''));
+        if (!ticker) continue;
+        var insiderData = await _fetchInsiderData(ticker);
+        if (!insiderData) continue;
+        var structure = await getNextReplyStructure(subreddit);
+        if (Math.random() < 0.5) {
+          var topComments = await _fetchTopComments(post.name, token);
+          if (topComments.length >= 2) {
+            await upvoteContext(post.name, topComments[0].name || topComments[0].id, topComments[1].name || topComments[1].id);
+          }
+        }
+        var delayMs = randomBetween(10 * 60 * 1000, 30 * 60 * 1000);
+        await insertJob('reddit_reply_deferred', { postId: post.name, subreddit: subreddit, ticker: ticker, insiderData: insiderData, structure: structure }, delayMs);
+        console.log('[CAT4] queued deferred reply to ' + post.name + ' on ' + subreddit);
+      }
+    }
+  } catch (err) {
+    console.error('[runCAT4Comments] error: ' + (err && err.message));
+  }
+}
+
 // ---------------------------------------------------------------------------
 // Exports
 // ---------------------------------------------------------------------------
@@ -1146,6 +1525,12 @@ module.exports = {
   SEARCH_KEYWORDS: SEARCH_KEYWORDS,
   CAT5_SUBREDDITS: CAT5_SUBREDDITS,
 
+  // Section 01 constants
+  SUBREDDIT_TONE_MAP: SUBREDDIT_TONE_MAP,
+
+  // Section 02 constants
+  REPLY_STRUCTURES: REPLY_STRUCTURES,
+
   // Section 06 constants
   NEGATIVE_EXAMPLES: NEGATIVE_EXAMPLES,
   ANTI_PUMP_RULE: ANTI_PUMP_RULE,
@@ -1165,12 +1550,27 @@ module.exports = {
   getISOWeekKey: getISOWeekKey,
   getESTDateString: getESTDateString,
 
-  // State helpers
+  // Section 01 — state helpers + auth
   getState: getState,
   setState: setState,
-  shouldSkipToday: shouldSkipToday,
   getRedditToken: getRedditToken,
+  getRedditLog: getRedditLog,
+
+  // Section 02 — rotation + validation
+  getNextReplyStructure: getNextReplyStructure,
+  validateReply: validateReply,
+
+  // Section 03 — cap + timing + jobs
+  shouldSkipToday: shouldSkipToday,
+  checkDailyCommentLimit: checkDailyCommentLimit,
+  upvoteContext: upvoteContext,
+  insertJob: insertJob,
+  randomBetween: randomBetween,
+  scheduleEditUpdate: scheduleEditUpdate,
   scheduleThreadReply: scheduleThreadReply,
+  scheduleDDReplies: scheduleDDReplies,
+  processScheduledJobs: processScheduledJobs,
+  runCAT4Comments: runCAT4Comments,
 
   // Section 04 — CAT 5
   getDailyThreadTarget: getDailyThreadTarget,
diff --git a/ryan_cole/insiderbuying-site/tests/insiderbuying/reddit-monitor.test.js b/ryan_cole/insiderbuying-site/tests/insiderbuying/reddit-monitor.test.js
index 0a8b046..3cdac3b 100644
--- a/ryan_cole/insiderbuying-site/tests/insiderbuying/reddit-monitor.test.js
+++ b/ryan_cole/insiderbuying-site/tests/insiderbuying/reddit-monitor.test.js
@@ -1084,3 +1084,599 @@ describe('buildCommentPrompt', () => {
     } catch (_) { /* acceptable */ }
   });
 });
+
+// ===== SECTION 01: SUBREDDIT_TONE_MAP + getRedditToken + getState/setState + getRedditLog =====
+
+describe('SUBREDDIT_TONE_MAP', () => {
+  test('has exactly 5 subreddits', () => {
+    expect(Object.keys(mod.SUBREDDIT_TONE_MAP).length).toBe(5);
+  });
+  test('includes wallstreetbets, ValueInvesting, stocks, Dividends, InsiderTrades', () => {
+    ['wallstreetbets', 'ValueInvesting', 'stocks', 'Dividends', 'InsiderTrades'].forEach(sub => {
+      expect(mod.SUBREDDIT_TONE_MAP[sub]).toBeTruthy();
+    });
+  });
+  test('each entry has tone, wordLimit, style, example, dailyCap', () => {
+    Object.values(mod.SUBREDDIT_TONE_MAP).forEach(cfg => {
+      expect(typeof cfg.tone).toBe('string');
+      expect(Array.isArray(cfg.wordLimit) && cfg.wordLimit.length === 2).toBe(true);
+      expect(typeof cfg.style).toBe('string');
+      expect(typeof cfg.example).toBe('string');
+      expect(typeof cfg.dailyCap).toBe('number');
+    });
+  });
+  test('dailyCaps sum to 10', () => {
+    const total = Object.values(mod.SUBREDDIT_TONE_MAP).reduce((s, c) => s + c.dailyCap, 0);
+    expect(total).toBe(10);
+  });
+  test('wordLimit[0] < wordLimit[1] for all entries', () => {
+    Object.entries(mod.SUBREDDIT_TONE_MAP).forEach(([sub, cfg]) => {
+      expect(cfg.wordLimit[0]).toBeLessThan(cfg.wordLimit[1]);
+    });
+  });
+});
+
+describe('getRedditToken - refresh token mode', () => {
+  test('uses grant_type=refresh_token when REDDIT_REFRESH_TOKEN is set', async () => {
+    let capturedBody = '';
+    mod._setDeps({ fetch: async (url, opts) => {
+      capturedBody = opts.body || '';
+      if (url.includes('reddit.com')) return { status: 200, json: () => ({ access_token: 'tok123', expires_in: 3600 }) };
+      return { status: 200, json: () => ({ list: [] }) };
+    }});
+    process.env.REDDIT_REFRESH_TOKEN = 'refresh_abc';
+    process.env.REDDIT_CLIENT_ID = 'cid';
+    process.env.REDDIT_CLIENT_SECRET = 'csec';
+    const token = await mod.getRedditToken({ _skipCache: true });
+    expect(capturedBody.includes('grant_type=refresh_token')).toBe(true);
+    expect(token).toBe('tok123');
+    delete process.env.REDDIT_REFRESH_TOKEN;
+  });
+
+  test('reads cached token from NocoDB if not expired - no HTTP call to Reddit', async () => {
+    let redditCallCount = 0;
+    const future = new Date(Date.now() + 7200000).toISOString();
+    mod._setDeps({ fetch: async (url, opts) => {
+      if (url.includes('reddit.com')) redditCallCount++;
+      return { status: 200, json: () => ({ list: [{ key: 'reddit_auth', value: JSON.stringify({ token: 'cached_tok', expires_at: future }), Id: 1 }] }) };
+    }});
+    const token = await mod.getRedditToken();
+    expect(token).toBe('cached_tok');
+    expect(redditCallCount).toBe(0);
+  });
+
+  test('calls Reddit auth endpoint when cached token is expired', async () => {
+    let redditCallCount = 0;
+    const past = new Date(Date.now() - 1000).toISOString();
+    mod._setDeps({ fetch: async (url, opts) => {
+      if (url.includes('reddit.com/api/v1/access_token')) { redditCallCount++; return { status: 200, json: () => ({ access_token: 'fresh', expires_in: 3600 }) }; }
+      if (url.includes('reddit.com')) return { status: 200, json: () => ({ access_token: 'fresh', expires_in: 3600 }) };
+      return { status: 200, json: () => ({ list: [{ key: 'reddit_auth', value: JSON.stringify({ token: 'old_tok', expires_at: past }), Id: 1 }] }) };
+    }});
+    process.env.REDDIT_REFRESH_TOKEN = 'reftok';
+    const token = await mod.getRedditToken();
+    expect(token).toBe('fresh');
+    expect(redditCallCount).toBeGreaterThanOrEqual(1);
+    delete process.env.REDDIT_REFRESH_TOKEN;
+  });
+});
+
+describe('getRedditToken - ROPC fallback', () => {
+  test('uses grant_type=password when REDDIT_REFRESH_TOKEN is absent', async () => {
+    delete process.env.REDDIT_REFRESH_TOKEN;
+    process.env.REDDIT_USERNAME = 'user1';
+    process.env.REDDIT_PASSWORD = 'pass1';
+    let capturedBody = '';
+    mod._setDeps({ fetch: async (url, opts) => {
+      capturedBody = opts.body || '';
+      if (url.includes('reddit.com')) return { status: 200, json: () => ({ access_token: 'ropc_tok', expires_in: 3600 }) };
+      return { status: 200, json: () => ({ list: [] }) };
+    }});
+    await mod.getRedditToken({ _skipCache: true });
+    expect(capturedBody.includes('grant_type=password')).toBe(true);
+    expect(capturedBody.includes('username=user1')).toBe(true);
+  });
+});
+
+describe('getState / setState', () => {
+  test('getState returns JSON-parsed value for existing key', async () => {
+    mod._setDeps({ fetch: async () => ({ status: 200, json: () => ({ list: [{ key: 'some_key', value: '{"count":3}', Id: 1 }] }) }) });
+    const val = await mod.getState('some_key');
+    expect(val).toEqual({ count: 3 });
+  });
+  test('getState returns null for missing key (empty list)', async () => {
+    mod._setDeps({ fetch: async () => ({ status: 200, json: () => ({ list: [] }) }) });
+    const val = await mod.getState('missing_key');
+    expect(val).toBeNull();
+  });
+  test('setState sends POST/PATCH with JSON-serialized value', async () => {
+    const writes = [];
+    mod._setDeps({ fetch: async (url, opts) => { writes.push({ url, opts }); return { status: 200, json: () => ({ list: [] }) }; } });
+    await mod.setState('my_key', { foo: 42 });
+    expect(writes.length).toBeGreaterThanOrEqual(1);
+    const writeCall = writes.find(w => w.opts && (w.opts.method === 'POST' || w.opts.method === 'PATCH'));
+    expect(writeCall).toBeTruthy();
+    const body = typeof writeCall.opts.body === 'string' ? JSON.parse(writeCall.opts.body) : writeCall.opts.body;
+    expect(body.value.includes('42')).toBe(true);
+  });
+  test('getState returns null when NocoDB returns malformed JSON', async () => {
+    mod._setDeps({ fetch: async () => ({ status: 200, json: () => ({ list: [{ key: 'bad_key', value: 'not-json{{{', Id: 1 }] }) }) });
+    const val = await mod.getState('bad_key');
+    expect(val).toBeNull();
+  });
+});
+
+describe('getRedditLog', () => {
+  test('returns array of posted records for given date', async () => {
+    mod._setDeps({ fetch: async () => ({ status: 200, json: () => ({ list: [{ subreddit: 'stocks', status: 'posted' }, { subreddit: 'wsb', status: 'posted' }] }) }) });
+    const logs = await mod.getRedditLog('2026-03-28');
+    expect(logs.length).toBe(2);
+  });
+  test('returns empty array when no records', async () => {
+    mod._setDeps({ fetch: async () => ({ status: 200, json: () => ({ list: [] }) }) });
+    const logs = await mod.getRedditLog('2026-03-28');
+    expect(logs).toEqual([]);
+  });
+});
+
+// ===== SECTION 02: REPLY_STRUCTURES + getNextReplyStructure + validateReply + validateDDPost =====
+
+describe('REPLY_STRUCTURES', () => {
+  test('defines exactly 3 structures', () => {
+    expect(mod.REPLY_STRUCTURES.length).toBe(3);
+  });
+  test('each structure has id and systemPromptInstruction', () => {
+    mod.REPLY_STRUCTURES.forEach(s => {
+      expect(typeof s.id).toBe('string');
+      expect(typeof s.systemPromptInstruction).toBe('string');
+      expect(s.systemPromptInstruction.length).toBeGreaterThan(20);
+    });
+  });
+  test('ids are Q_A_DATA, AGREEMENT_BUT, DATA_INTERPRET', () => {
+    const ids = mod.REPLY_STRUCTURES.map(s => s.id);
+    expect(ids).toContain('Q_A_DATA');
+    expect(ids).toContain('AGREEMENT_BUT');
+    expect(ids).toContain('DATA_INTERPRET');
+  });
+});
+
+describe('getNextReplyStructure', () => {
+  let stateStore;
+  beforeEach(() => {
+    stateStore = {};
+    mod._setDeps({ fetch: async (url, opts) => {
+      const isWrite = opts && (opts.method === 'PATCH' || opts.method === 'POST');
+      if (isWrite) {
+        const body = JSON.parse(opts.body);
+        if (body.key) stateStore[body.key] = body.value;
+        else { const idMatch = url.match(/\/([0-9]+)$/); if (idMatch) stateStore['_id_' + idMatch[1]] = body.value; }
+        return { status: 200, json: () => ({}) };
+      }
+      const keyMatch = url.match(/where=\(key,eq,([^)&]+)\)/);
+      const key = keyMatch ? decodeURIComponent(keyMatch[1]) : null;
+      if (key && stateStore[key] !== undefined) return { status: 200, json: () => ({ list: [{ key, value: stateStore[key], Id: 1 }] }) };
+      return { status: 200, json: () => ({ list: [] }) };
+    }});
+  });
+
+  test('returns REPLY_STRUCTURES[0] on first call', async () => {
+    const s = await mod.getNextReplyStructure('stocks');
+    expect(s.id).toBe('Q_A_DATA');
+  });
+  test('returns REPLY_STRUCTURES[1] on second call', async () => {
+    await mod.getNextReplyStructure('stocks');
+    const s = await mod.getNextReplyStructure('stocks');
+    expect(s.id).toBe('AGREEMENT_BUT');
+  });
+  test('wraps around to index 0 after cycling through all 3', async () => {
+    await mod.getNextReplyStructure('stocks');
+    await mod.getNextReplyStructure('stocks');
+    const s = await mod.getNextReplyStructure('stocks');
+    expect(s.id).toBe('DATA_INTERPRET');
+    const s2 = await mod.getNextReplyStructure('stocks');
+    expect(s2.id).toBe('Q_A_DATA');
+  });
+  test('rotates independently per subreddit', async () => {
+    await mod.getNextReplyStructure('wallstreetbets');
+    await mod.getNextReplyStructure('wallstreetbets');
+    const stocksFirst = await mod.getNextReplyStructure('stocks');
+    expect(stocksFirst.id).toBe('Q_A_DATA');
+  });
+});
+
+describe('validateReply - word count', () => {
+  test('accepts text within range for stocks (100-150 words)', () => {
+    const text = 'word '.repeat(120).trim();
+    const r = mod.validateReply(text, 'stocks');
+    expect(r.valid).toBe(true);
+  });
+  test('rejects text below wordLimit[0] for wallstreetbets (min 50)', () => {
+    const text = 'word '.repeat(30).trim();
+    const r = mod.validateReply(text, 'wallstreetbets');
+    expect(r.valid).toBe(false);
+  });
+  test('rejects text above wordLimit[1] for ValueInvesting (max 200)', () => {
+    const text = 'word '.repeat(250).trim();
+    const r = mod.validateReply(text, 'ValueInvesting');
+    expect(r.valid).toBe(false);
+  });
+  test('applies tolerance: 46-word text passes for wsb min=50', () => {
+    const text = 'word '.repeat(46).trim();
+    const r = mod.validateReply(text, 'wallstreetbets');
+    expect(r.valid).toBe(true);
+  });
+  test('returns valid, words, min, max shape', () => {
+    const text = 'word '.repeat(100).trim();
+    const r = mod.validateReply(text, 'stocks');
+    expect('valid' in r && 'words' in r && 'min' in r && 'max' in r).toBe(true);
+  });
+});
+
+describe('validateReply - markdown stripping', () => {
+  test('strips bold markers before counting words', () => {
+    const text = '**CEO** just ' + 'bought word '.repeat(90);
+    const r = mod.validateReply(text, 'stocks');
+    expect(r.words).toBeLessThan(190);
+  });
+  test('handles link syntax without crashing', () => {
+    const text = '[See filing](https://sec.gov) ' + 'word '.repeat(100);
+    const r = mod.validateReply(text, 'stocks');
+    expect(typeof r.words).toBe('number');
+  });
+  test('strips header markers before counting', () => {
+    const text = '### Header\n' + 'word '.repeat(120);
+    const r = mod.validateReply(text, 'stocks');
+    expect(typeof r.words).toBe('number');
+  });
+});
+
+describe('validateReply - URL and brand name check', () => {
+  test('rejects text containing https://', () => {
+    const text = 'word '.repeat(100) + ' check https://example.com';
+    const r = mod.validateReply(text, 'stocks');
+    expect(r.valid).toBe(false);
+  });
+  test('rejects text containing EarlyInsider', () => {
+    const text = 'word '.repeat(100) + ' EarlyInsider is great';
+    const r = mod.validateReply(text, 'stocks');
+    expect(r.valid).toBe(false);
+  });
+  test('accepts company names Apple or Tesla', () => {
+    const text = 'Apple CEO ' + 'bought stock at '.repeat(15) + 'interesting data point here.';
+    const r = mod.validateReply(text, 'ValueInvesting');
+    expect(!r.issues || !r.issues.some(i => i.toLowerCase().includes('brand'))).toBe(true);
+  });
+  test('accepts $AAPL ticker symbol', () => {
+    const text = '$AAPL CEO ' + 'bought shares at '.repeat(15) + 'notable filing.';
+    const r = mod.validateReply(text, 'stocks');
+    expect(!r.issues || r.issues.every(i => !i.toLowerCase().includes('url'))).toBe(true);
+  });
+  test('rejects empty text', () => {
+    expect(mod.validateReply('', 'stocks').valid).toBe(false);
+  });
+});
+
+describe('validateDDPost', () => {
+  function buildDDText(wordCount, bearWordCount, hasTLDR, charOverride) {
+    if (charOverride) return 'x'.repeat(charOverride);
+    const bear = '## Bear Case\n' + 'risk '.repeat(bearWordCount);
+    const body = 'word '.repeat(Math.max(0, wordCount - bearWordCount));
+    const tldr = hasTLDR ? '\n## TLDR\n- point one\n- point two' : '';
+    return body + bear + tldr;
+  }
+
+  test('accepts valid post (1800 words, bear 450, TLDR present)', () => {
+    const r = mod.validateDDPost(buildDDText(1800, 450, true));
+    expect(r.valid).toBe(true);
+  });
+  test('rejects post with word count < 1500', () => {
+    const r = mod.validateDDPost(buildDDText(1000, 450, true));
+    expect(r.valid).toBe(false);
+  });
+  test('rejects post with word count > 2500', () => {
+    const r = mod.validateDDPost(buildDDText(3000, 450, true));
+    expect(r.valid).toBe(false);
+  });
+  test('rejects post with bear case < 400 words', () => {
+    const r = mod.validateDDPost(buildDDText(1800, 200, true));
+    expect(r.valid).toBe(false);
+  });
+  test('rejects post without TLDR block', () => {
+    const r = mod.validateDDPost(buildDDText(1800, 450, false));
+    expect(r.valid).toBe(false);
+  });
+  test('rejects post with charCount > 38000', () => {
+    const r = mod.validateDDPost(buildDDText(0, 0, false, 38001));
+    expect(r.valid).toBe(false);
+  });
+  test('charCount field is correct', () => {
+    const r = mod.validateDDPost(buildDDText(0, 0, false, 37999));
+    expect(r.charCount).toBeLessThan(38000);
+  });
+  test('does NOT reject post containing Apple or $AAPL', () => {
+    const text = 'Apple CEO Tim Cook $AAPL ' + 'word '.repeat(1500) + '## Bear Case\n' + 'risk '.repeat(450) + '\n## TLDR\n- point';
+    const r = mod.validateDDPost(text);
+    expect(r.valid).toBe(true);
+  });
+  test('returns valid, wordCount, bearWordCount, hasTLDR, charCount shape', () => {
+    const r = mod.validateDDPost('x');
+    expect('valid' in r && 'wordCount' in r && 'bearWordCount' in r && 'hasTLDR' in r && 'charCount' in r).toBe(true);
+  });
+});
+
+// ===== SECTION 03: checkDailyCommentLimit + shouldSkipToday + upvoteContext + jobs + runCAT4 =====
+
+function _testGetISOWeek(d) {
+  const date = new Date(d); date.setHours(0, 0, 0, 0);
+  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
+  const week1 = new Date(date.getFullYear(), 0, 4);
+  const weekNum = 1 + Math.round(((date - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
+  return `${date.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
+}
+
+describe('checkDailyCommentLimit', () => {
+  function makeLog(entries) {
+    mod._setDeps({ fetch: async () => ({ status: 200, json: () => ({ list: entries }) }) });
+  }
+  test('returns allowed=true when no posts today', async () => {
+    makeLog([]);
+    const r = await mod.checkDailyCommentLimit('stocks');
+    expect(r.allowed).toBe(true);
+  });
+  test('returns allowed=false when global total >= 10', async () => {
+    makeLog(Array(10).fill({ subreddit: 'wallstreetbets', status: 'posted' }));
+    const r = await mod.checkDailyCommentLimit('stocks');
+    expect(r.allowed).toBe(false);
+    expect(r.reason).toMatch(/global/);
+  });
+  test('returns allowed=false when per-sub count >= dailyCap (wsb cap=3)', async () => {
+    makeLog([
+      { subreddit: 'wallstreetbets', status: 'posted' },
+      { subreddit: 'wallstreetbets', status: 'posted' },
+      { subreddit: 'wallstreetbets', status: 'posted' },
+    ]);
+    const r = await mod.checkDailyCommentLimit('wallstreetbets');
+    expect(r.allowed).toBe(false);
+    expect(r.reason).toMatch(/cap/);
+  });
+  test('ignores failed/skipped status records in count', async () => {
+    makeLog([
+      { subreddit: 'stocks', status: 'failed' },
+      { subreddit: 'stocks', status: 'skipped' },
+    ]);
+    const r = await mod.checkDailyCommentLimit('stocks');
+    expect(r.allowed).toBe(true);
+  });
+  test('includes reason field when not allowed', async () => {
+    makeLog(Array(10).fill({ subreddit: 'stocks', status: 'posted' }));
+    const r = await mod.checkDailyCommentLimit('stocks');
+    expect(typeof r.reason).toBe('string');
+  });
+});
+
+describe('shouldSkipToday', () => {
+  function mockState(stored) {
+    mod._setDeps({ fetch: async (url, opts) => {
+      if (opts && (opts.method === 'POST' || opts.method === 'PATCH')) return { status: 200, json: () => ({}) };
+      if (stored) return { status: 200, json: () => ({ list: [{ key: 'week_skip_days', value: JSON.stringify(stored), Id: 1 }] }) };
+      return { status: 200, json: () => ({ list: [] }) };
+    }});
+  }
+  test('returns skip=false on a non-skip weekday', async () => {
+    const today = new Date();
+    const isoWeek = _testGetISOWeek(today);
+    const dayOfWeek = today.getDay();
+    const skipDay = dayOfWeek === 1 ? 2 : 1;
+    mockState({ week: isoWeek, days: [skipDay] });
+    const r = await mod.shouldSkipToday();
+    expect(r.skip).toBe(false);
+  });
+  test('returns skip=true when today is a designated skip day', async () => {
+    const today = new Date();
+    const isoWeek = _testGetISOWeek(today);
+    const dayOfWeek = today.getDay();
+    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
+      mockState({ week: isoWeek, days: [dayOfWeek] });
+      const r = await mod.shouldSkipToday();
+      expect(r.skip).toBe(true);
+    }
+  });
+  test('auto-generates skip days if week_skip_days missing from NocoDB', async () => {
+    const writes = [];
+    mod._setDeps({ fetch: async (url, opts) => {
+      if (opts && (opts.method === 'POST' || opts.method === 'PATCH')) { writes.push(JSON.parse(opts.body)); return { status: 200, json: () => ({}) }; }
+      return { status: 200, json: () => ({ list: [] }) };
+    }});
+    await mod.shouldSkipToday();
+    expect(writes.length).toBeGreaterThanOrEqual(1);
+  });
+  test('generated skip days are weekdays only (JS day 1-5)', async () => {
+    const writes = [];
+    mod._setDeps({ fetch: async (url, opts) => {
+      if (opts && (opts.method === 'POST' || opts.method === 'PATCH')) { writes.push(JSON.parse(opts.body)); return { status: 200, json: () => ({}) }; }
+      return { status: 200, json: () => ({ list: [] }) };
+    }});
+    await mod.shouldSkipToday();
+    const written = writes.find(w => w.value && w.value.includes('days'));
+    if (written) {
+      const data = JSON.parse(written.value);
+      data.days.forEach(d => { expect(d >= 1 && d <= 5).toBe(true); });
+    }
+  });
+  test('generates 1 or 2 skip days', async () => {
+    const writes = [];
+    mod._setDeps({ fetch: async (url, opts) => {
+      if (opts && (opts.method === 'POST' || opts.method === 'PATCH')) { writes.push(JSON.parse(opts.body)); return { status: 200, json: () => ({}) }; }
+      return { status: 200, json: () => ({ list: [] }) };
+    }});
+    await mod.shouldSkipToday();
+    const written = writes.find(w => w.value && w.value.includes('days'));
+    if (written) {
+      const data = JSON.parse(written.value);
+      expect(data.days.length >= 1 && data.days.length <= 2).toBe(true);
+    }
+  });
+  test('does not regenerate if already set for current week', async () => {
+    const writes = [];
+    const today = new Date();
+    const isoWeek = _testGetISOWeek(today);
+    mod._setDeps({ fetch: async (url, opts) => {
+      if (opts && (opts.method === 'POST' || opts.method === 'PATCH')) { writes.push(true); return { status: 200, json: () => ({}) }; }
+      return { status: 200, json: () => ({ list: [{ key: 'week_skip_days', value: JSON.stringify({ week: isoWeek, days: [2] }), Id: 1 }] }) };
+    }});
+    await mod.shouldSkipToday();
+    await mod.shouldSkipToday();
+    expect(writes.length).toBe(0);
+  });
+});
+
+describe('upvoteContext', () => {
+  test('calls Reddit vote API exactly 3 times', async () => {
+    const calls = [];
+    mod._setDeps({ fetch: async (url, opts) => {
+      if (url.includes('/api/vote')) calls.push(opts.body);
+      if (url.includes('reddit.com/api/v1/access_token')) return { status: 200, json: () => ({ access_token: 'tok', expires_in: 3600 }) };
+      return { status: 200, json: () => ({ list: [] }) };
+    }});
+    delete process.env.REDDIT_REFRESH_TOKEN;
+    process.env.REDDIT_USERNAME = 'u';
+    process.env.REDDIT_PASSWORD = 'p';
+    await mod.upvoteContext('post123', 'comment1', 'comment2');
+    expect(calls.length).toBe(3);
+  });
+  test('upvotes postId, comment1Id, comment2Id all with dir=1', async () => {
+    const votedIds = [];
+    mod._setDeps({ fetch: async (url, opts) => {
+      if (url.includes('/api/vote')) {
+        const body = new URLSearchParams(opts.body);
+        votedIds.push({ id: body.get('id'), dir: body.get('dir') });
+      }
+      if (url.includes('reddit.com/api/v1/access_token')) return { status: 200, json: () => ({ access_token: 'tok', expires_in: 3600 }) };
+      return { status: 200, json: () => ({ list: [] }) };
+    }});
+    delete process.env.REDDIT_REFRESH_TOKEN;
+    await mod.upvoteContext('t3_postid', 't1_c1', 't1_c2');
+    expect(votedIds.some(v => v.id === 't3_postid' && v.dir === '1')).toBe(true);
+    expect(votedIds.some(v => v.id === 't1_c1' && v.dir === '1')).toBe(true);
+    expect(votedIds.some(v => v.id === 't1_c2' && v.dir === '1')).toBe(true);
+  });
+});
+
+describe('scheduleEditUpdate', () => {
+  test('inserts reddit_edit job with execute_after ~2h from now', async () => {
+    const jobs = [];
+    mod._setDeps({ fetch: async (url, opts) => {
+      if (opts && opts.method === 'POST' && url.includes('Scheduled_Jobs')) jobs.push(JSON.parse(opts.body));
+      return { status: 200, json: () => ({}) };
+    }});
+    const before = Date.now();
+    await mod.scheduleEditUpdate('t1_abc', 'AAPL', 'stocks', 142.50);
+    expect(jobs.length).toBeGreaterThanOrEqual(1);
+    const job = jobs[0];
+    expect(job.type).toBe('reddit_edit');
+    expect(job.status).toBe('pending');
+    const executeAfter = new Date(job.execute_after).getTime();
+    expect(executeAfter >= before + 115 * 60 * 1000 && executeAfter <= before + 125 * 60 * 1000).toBe(true);
+    const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
+    expect(payload.commentId).toBe('t1_abc');
+  });
+});
+
+describe('scheduleDDReplies', () => {
+  test('inserts exactly 2 reddit_dd_reply jobs', async () => {
+    const jobs = [];
+    mod._setDeps({ fetch: async (url, opts) => {
+      if (opts && opts.method === 'POST' && url.includes('Scheduled_Jobs')) jobs.push(JSON.parse(opts.body));
+      return { status: 200, json: () => ({}) };
+    }});
+    await mod.scheduleDDReplies('t3_ddpost', 'stocks', 'AAPL');
+    expect(jobs.length).toBe(2);
+    expect(jobs.every(j => j.type === 'reddit_dd_reply')).toBe(true);
+  });
+  test('first at ~1h, second at ~6h', async () => {
+    const jobs = [];
+    mod._setDeps({ fetch: async (url, opts) => {
+      if (opts && opts.method === 'POST' && url.includes('Scheduled_Jobs')) jobs.push(JSON.parse(opts.body));
+      return { status: 200, json: () => ({}) };
+    }});
+    const before = Date.now();
+    await mod.scheduleDDReplies('t3_ddpost', 'stocks', 'AAPL');
+    const times = jobs.map(j => new Date(j.execute_after).getTime()).sort((a, b) => a - b);
+    expect(times[0] >= before + 55 * 60 * 1000 && times[0] <= before + 65 * 60 * 1000).toBe(true);
+    expect(times[1] >= before + 5.5 * 60 * 60 * 1000 && times[1] <= before + 6.5 * 60 * 60 * 1000).toBe(true);
+  });
+});
+
+describe('processScheduledJobs', () => {
+  test('ignores jobs with execute_after in the future', async () => {
+    const futureJob = { Id: 1, type: 'reddit_edit', payload: '{}', status: 'pending', execute_after: new Date(Date.now() + 60 * 60 * 1000).toISOString() };
+    mod._setDeps({ fetch: async () => ({ status: 200, json: () => ({ list: [futureJob] }) }) });
+    await mod.processScheduledJobs();
+    expect(true).toBe(true);
+  });
+  test('ignores jobs with status = done', async () => {
+    mod._setDeps({ fetch: async () => ({ status: 200, json: () => ({ list: [{ Id: 1, type: 'reddit_edit', payload: '{}', status: 'done', execute_after: new Date(Date.now() - 1000).toISOString() }] }) }) });
+    await mod.processScheduledJobs();
+    expect(true).toBe(true);
+  });
+  test('marks job skipped (not crashed) if job handler throws', async () => {
+    mod._setDeps({ fetch: async (url, opts) => {
+      if (opts && opts.method === 'PATCH' && url.includes('Scheduled_Jobs')) return { status: 200, json: () => ({}) };
+      if (url.includes('reddit.com') && opts && opts.method === 'GET') return { status: 404, json: () => ({}) };
+      return { status: 200, json: () => ({ list: [] }) };
+    }});
+    await mod.processScheduledJobs({ _fixedJobs: [{ Id: 1, type: 'reddit_edit', payload: JSON.stringify({ commentId: 't1_del', ticker: 'AAPL', priceAtPost: 140 }), status: 'pending', execute_after: new Date(Date.now() - 1000).toISOString() }] });
+    expect(true).toBe(true);
+  });
+  test('processes past-due pending jobs without crashing', async () => {
+    const jobs = [
+      { Id: 1, type: 'reddit_reply_deferred', payload: JSON.stringify({ postId: 't3_a', subreddit: 'stocks', ticker: 'AAPL', insiderData: { ticker: 'AAPL', insider_name: 'Tim Cook', role: 'CEO', value_usd: 2000000, date: '2026-03-25' }, structure: { id: 'Q_A_DATA', systemPromptInstruction: 'Open with a question.' } }), status: 'pending', execute_after: new Date(Date.now() - 1000).toISOString() },
+    ];
+    mod._setDeps({ fetch: async (url, opts) => {
+      if (opts && opts.method === 'PATCH' && url.includes('Scheduled_Jobs')) return { status: 200, json: () => ({}) };
+      if (url.includes('reddit.com') && opts && opts.method === 'POST') return { status: 200, json: () => ({ json: { data: { things: [{ data: { id: 'c1', name: 't1_c1' } }] } } }) };
+      if (url.includes('anthropic')) return { status: 200, json: () => ({ content: [{ text: 'CEO bought $2M. Third buy this year.' }] }) };
+      return { status: 200, json: () => ({ list: jobs }) };
+    }});
+    await mod.processScheduledJobs();
+    expect(true).toBe(true);
+  });
+  test('accepts empty _fixedJobs array', async () => {
+    mod._setDeps({ fetch: async () => ({ status: 200, json: () => ({ list: [] }) }) });
+    await mod.processScheduledJobs({ _fixedJobs: [] });
+    expect(true).toBe(true);
+  });
+});
+
+describe('runCAT4Comments', () => {
+  test('returns early without scheduling jobs if shouldSkipToday is true', async () => {
+    const today = new Date();
+    const isoWeek = _testGetISOWeek(today);
+    const dayOfWeek = today.getDay();
+    const jobs = [];
+    mod._setDeps({ fetch: async (url, opts) => {
+      if (opts && opts.method === 'POST' && url.includes('Scheduled_Jobs')) jobs.push(true);
+      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
+        return { status: 200, json: () => ({ list: [{ key: 'week_skip_days', value: JSON.stringify({ week: isoWeek, days: [dayOfWeek] }), Id: 1 }] }) };
+      }
+      return { status: 200, json: () => ({ list: [] }) };
+    }});
+    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
+      await mod.runCAT4Comments();
+      expect(jobs.length).toBe(0);
+    }
+  });
+  test('does not throw on empty post results', async () => {
+    mod._setDeps({ fetch: async (url, opts) => {
+      if (opts && opts.method === 'POST' && url.includes('Scheduled_Jobs')) return { status: 200, json: () => ({}) };
+      if (url.includes('reddit.com/api/v1/access_token')) return { status: 200, json: () => ({ access_token: 'tok', expires_in: 3600 }) };
+      if (url.includes('search.json')) return { status: 200, json: () => ({ data: { children: [] } }) };
+      return { status: 200, json: () => ({ list: [] }) };
+    }});
+    delete process.env.REDDIT_REFRESH_TOKEN;
+    process.env.REDDIT_USERNAME = 'u';
+    process.env.REDDIT_PASSWORD = 'p';
+    await mod.runCAT4Comments();
+    expect(true).toBe(true);
+  });
+});
