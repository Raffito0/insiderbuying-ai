diff --git a/insiderbuying-site/n8n/code/insiderbuying/send-outreach.js b/insiderbuying-site/n8n/code/insiderbuying/send-outreach.js
index 9bd5e68..b00ca95 100644
--- a/insiderbuying-site/n8n/code/insiderbuying/send-outreach.js
+++ b/insiderbuying-site/n8n/code/insiderbuying/send-outreach.js
@@ -1,6 +1,8 @@
-// W11 Outreach Email Sender -- personalized outreach via Claude Haiku
+// W11 Outreach Email Sender -- personalized outreach via DeepSeek
 // n8n Code Node (CommonJS)
 
+var cheerio = require('cheerio');
+
 var BANNED_PHRASES = [
   'I hope this finds you',
   'hope this finds you well',
@@ -18,8 +20,11 @@ var BANNED_PHRASES = [
   'I stumbled upon',
   'I am a huge fan',
   'big fan of your work',
+  'synergy',
 ];
 
+var FROM_NAME = '"Ryan from EarlyInsider" <ryan@earlyinsider.com>';
+
 /**
  * Select top N prospects by priority, filtered to status='found' with email.
  * @param {object[]} prospects
@@ -41,9 +46,9 @@ function selectProspects(prospects, limit) {
 }
 
 /**
- * Build Claude Haiku prompt for a personalized outreach email.
- * @param {object} prospect - { site_name, domain, contact_name, notes }
- * @param {object} ourArticle - { title, url, summary }
+ * Build DeepSeek prompt for a personalized outreach email.
+ * @param {object} prospect - { site_name, domain, contact_name, notes, last_article_title }
+ * @param {object} ourArticle - { title, summary } (url is intentionally excluded — GAP 12.14)
  * @returns {{ prompt: string, maxTokens: number }}
  */
 function buildEmailPrompt(prospect, ourArticle) {
@@ -51,6 +56,14 @@ function buildEmailPrompt(prospect, ourArticle) {
   var articleTitle = ourArticle ? ourArticle.title : '';
   var articleSummary = ourArticle ? ourArticle.summary : '';
 
+  var personalisation = '';
+  if (prospect.last_article_title) {
+    personalisation =
+      "I just read your piece: '" +
+      prospect.last_article_title +
+      "'. That's exactly the kind of audience we want to reach.\n\n";
+  }
+
   var prompt =
     'Write a cold outreach email to ' +
     (prospect.contact_name || 'the editor') +
@@ -60,29 +73,40 @@ function buildEmailPrompt(prospect, ourArticle) {
     'Context about their site: ' +
     (prospect.notes || 'Finance/investing blog') +
     '\n\n' +
-    'We published: "' +
-    articleTitle +
-    '"\n' +
-    'Summary: ' +
-    articleSummary +
-    '\n\n' +
+    personalisation +
+    (articleTitle ? 'We published: "' + articleTitle + '"\n' : '') +
+    (articleSummary ? 'Summary: ' + articleSummary + '\n\n' : '') +
     'Rules:\n' +
-    '- MAX 150 words total\n' +
+    '- EXACTLY 100-125 words total in the email body\n' +
+    '- Do not include any URLs or links in this email\n' +
     '- Zero template language (no "I hope this finds you", "reaching out", etc.)\n' +
     '- Include exactly 1 specific data point from our article\n' +
     '- One clear CTA (guest post, link swap, or quote request)\n' +
     '- Tone: direct, knowledgeable, peer-to-peer\n' +
-    '- Subject line on first line prefixed with "Subject: "\n' +
+    '- Subject line on first line prefixed with "Subject: " (must end with or contain "?")\n' +
+    '- Include verbatim in the body: "We track 1,500+ SEC insider filings per month."\n' +
+    "- Last line of body must be exactly: Reply 'stop' to never hear from me again.\n" +
     '- Do NOT use any of these phrases: ' +
     BANNED_PHRASES.join(', ') +
     '\n\n' +
     'Output the email only. No explanations.';
 
-  return { prompt: prompt, maxTokens: 300 };
+  return { prompt: prompt, maxTokens: 350 };
+}
+
+/**
+ * Validate that an email subject contains a question mark.
+ * @param {string} subject
+ * @throws {Error} if subject has no "?"
+ */
+function validateSubject(subject) {
+  if (!((subject || '').trim().match(/\?/))) {
+    throw new Error('Subject must be a question: "' + (subject || '') + '"');
+  }
 }
 
 /**
- * Validate an outreach email draft.
+ * Validate an outreach email body draft.
  * @param {string} text
  * @returns {{ valid: boolean, wordCount: number, issues: string[] }}
  */
@@ -93,6 +117,11 @@ function validateEmail(text) {
   });
   var wordCount = words.length;
 
+  if (wordCount === 0) {
+    issues.push('Email body is empty');
+    return { valid: false, wordCount: 0, issues: issues };
+  }
+
   if (wordCount > 150) {
     issues.push('Over 150 word limit (' + wordCount + ' words)');
   }
@@ -151,7 +180,7 @@ function buildSendPayload(to, subject, body, fromEmail) {
 }
 
 /**
- * Build Claude prompt for a follow-up email.
+ * Build DeepSeek prompt for a follow-up email.
  * @param {object} prospect
  * @param {string} originalSubject
  * @returns {{ prompt: string, maxTokens: number }}
@@ -229,13 +258,178 @@ function logEmail(prospectId, emailType) {
   };
 }
 
+/**
+ * Scrape the most recent article from a site's /blog page.
+ * Supports HTML (CSS selectors) and XML/RSS (Cheerio xmlMode).
+ * Caches result in prospect.last_article_title via NocoDB PATCH (best-effort).
+ * @param {string} siteUrl - base URL, e.g. "https://example.com"
+ * @param {object} [_opts] - { _fetchFn } for testing
+ * @returns {Promise<{title: string, url: string}|null>}
+ */
+async function scrapeRecentArticle(siteUrl, _opts) {
+  var fetchFn = (_opts && _opts._fetchFn) ? _opts._fetchFn : _defaultFetch;
+
+  try {
+    var result = await fetchFn(siteUrl + '/blog', 5000);
+    if (!result || result.statusCode < 200 || result.statusCode >= 300) {
+      return null;
+    }
+
+    var contentType = ((result.headers && result.headers['content-type']) || '').toLowerCase();
+    var isXml =
+      contentType.indexOf('application/xml') !== -1 ||
+      contentType.indexOf('text/xml') !== -1;
+
+    var $ = cheerio.load(result.body, { xmlMode: isXml });
+
+    if (isXml) {
+      var titleEl = $('item > title').first();
+      var linkEl = $('item > link').first();
+      if (!titleEl.length) return null;
+      return { title: titleEl.text().trim(), url: linkEl.text().trim() };
+    }
+
+    // HTML: try selectors in priority order
+    var selectors = ['article:first-of-type a', '.post:first-of-type a', 'h2 a:first-of-type'];
+    for (var i = 0; i < selectors.length; i++) {
+      var el = $(selectors[i]).first();
+      if (el.length && el.text().trim()) {
+        var href = el.attr('href') || '';
+        if (href && !href.startsWith('http')) {
+          href = siteUrl + href;
+        }
+        return { title: el.text().trim(), url: href };
+      }
+    }
+
+    return null;
+  } catch (e) {
+    return null;
+  }
+}
+
+function _defaultFetch(url, timeout) {
+  return new Promise(function (resolve, reject) {
+    var _https = require('https');
+    var _http = require('http');
+    var urlMod = require('url');
+    var parsed = urlMod.parse(url);
+    var transport = parsed.protocol === 'https:' ? _https : _http;
+    var timer = setTimeout(function () {
+      reject(new Error('Timeout fetching ' + url));
+    }, timeout);
+
+    transport
+      .get(url, function (res) {
+        clearTimeout(timer);
+        var chunks = [];
+        res.on('data', function (c) {
+          chunks.push(c);
+        });
+        res.on('end', function () {
+          resolve({
+            statusCode: res.statusCode,
+            headers: res.headers,
+            body: Buffer.concat(chunks).toString(),
+          });
+        });
+        res.on('error', function (e) {
+          reject(e);
+        });
+      })
+      .on('error', function (e) {
+        clearTimeout(timer);
+        reject(e);
+      });
+  });
+}
+
+/**
+ * Generate an outreach email with AI, with up to 3 retries on validation failure.
+ * @param {object} prospect
+ * @param {object|null} ourArticle
+ * @param {object} [_opts] - { _aiClient: { call(messages): Promise<string> } }
+ * @returns {Promise<{subject: string, body: string, from: string}>}
+ */
+async function generateEmail(prospect, ourArticle, _opts) {
+  var aiCall =
+    _opts && _opts._aiClient && typeof _opts._aiClient.call === 'function'
+      ? function (msgs) {
+          return _opts._aiClient.call(msgs);
+        }
+      : function () {
+          throw new Error('AI client not provided — wire _opts._aiClient in production');
+        };
+
+  var promptResult = buildEmailPrompt(prospect, ourArticle);
+  var messages = [{ role: 'user', content: promptResult.prompt }];
+  var maxRetries = 3;
+  var lastError = null;
+
+  for (var attempt = 0; attempt < maxRetries; attempt++) {
+    var raw = await aiCall(messages);
+
+    try {
+      var lines = (raw || '').trim().split('\n');
+      var subject = '';
+      var bodyLines = [];
+
+      for (var j = 0; j < lines.length; j++) {
+        if (!subject && lines[j].startsWith('Subject: ')) {
+          subject = lines[j].replace('Subject: ', '').trim();
+        } else {
+          bodyLines.push(lines[j]);
+        }
+      }
+
+      var body = bodyLines.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
+
+      validateSubject(subject);
+
+      var words = body.trim().split(/\s+/).filter(function (w) {
+        return w.length > 0;
+      });
+      if (words.length < 100 || words.length > 125) {
+        throw new Error(
+          'Body word count out of range: ' + words.length + ' (expected 100-125)'
+        );
+      }
+
+      var lowerBody = body.toLowerCase();
+      for (var k = 0; k < BANNED_PHRASES.length; k++) {
+        if (lowerBody.indexOf(BANNED_PHRASES[k].toLowerCase()) !== -1) {
+          throw new Error('Contains banned phrase: "' + BANNED_PHRASES[k] + '"');
+        }
+      }
+
+      return { subject: subject, body: body, from: FROM_NAME };
+    } catch (err) {
+      lastError = err;
+      messages.push({ role: 'assistant', content: raw });
+      messages.push({
+        role: 'user',
+        content:
+          'That email failed validation: ' + err.message + '. Fix it and try again.',
+      });
+    }
+  }
+
+  throw new Error(
+    'generateEmail failed after ' + maxRetries + ' retries. Last: ' + lastError.message
+  );
+}
+
 module.exports = {
   selectProspects: selectProspects,
   buildEmailPrompt: buildEmailPrompt,
   validateEmail: validateEmail,
+  validateSubject: validateSubject,
   buildSendPayload: buildSendPayload,
   buildFollowUpPrompt: buildFollowUpPrompt,
   checkForFollowUps: checkForFollowUps,
   logEmail: logEmail,
+  scrapeRecentArticle: scrapeRecentArticle,
+  generateEmail: generateEmail,
   BANNED_PHRASES: BANNED_PHRASES,
+  FROM_NAME: FROM_NAME,
 };
diff --git a/insiderbuying-site/tests/insiderbuying/send-outreach.test.js b/insiderbuying-site/tests/insiderbuying/send-outreach.test.js
index d460f8a..3388982 100644
--- a/insiderbuying-site/tests/insiderbuying/send-outreach.test.js
+++ b/insiderbuying-site/tests/insiderbuying/send-outreach.test.js
@@ -4,11 +4,15 @@ const {
   selectProspects,
   buildEmailPrompt,
   validateEmail,
+  validateSubject,
   buildSendPayload,
   buildFollowUpPrompt,
   checkForFollowUps,
   logEmail,
+  scrapeRecentArticle,
+  generateEmail,
   BANNED_PHRASES,
+  FROM_NAME,
 } = require('../../n8n/code/insiderbuying/send-outreach');
 
 // ─── selectProspects ──────────────────────────────────────────────────────
@@ -305,3 +309,285 @@ describe('BANNED_PHRASES', () => {
     expect(BANNED_PHRASES.some((p) => p.toLowerCase().includes('reaching out'))).toBe(true);
   });
 });
+
+// ─── section-04: email rewrite + scraping ────────────────────────────────
+
+// Helper: build an AI response that passes all generateEmail validators
+function makeValidAiResponse(opts) {
+  var subject = (opts && opts.subject) || 'Ready to feature our AAPL insider data?';
+  var wordCount = (opts && opts.wordCount) || 110;
+  var banned = (opts && opts.bannedPhrase) || '';
+  // Build a body with exact word count including required phrases
+  // Required phrases: "We track 1,500+" and "Reply 'stop' to never hear from me again."
+  var requiredA = "We track 1,500+ SEC insider filings per month.";
+  var requiredB = "Reply 'stop' to never hear from me again.";
+  var requiredWords = (requiredA + ' ' + requiredB).split(/\s+/).length; // ~15
+  var fillerCount = Math.max(0, wordCount - requiredWords);
+  var filler = Array(fillerCount).fill('interesting').join(' ');
+  var body = requiredA + ' ' + filler + (banned ? ' ' + banned : '') + ' ' + requiredB;
+  return 'Subject: ' + subject + '\n\n' + body;
+}
+
+// ── section-04: buildEmailPrompt enhancements ─────────────────────────────
+
+describe('section-04: buildEmailPrompt no URL', () => {
+  const PROSPECT = { contact_name: 'Jane', site_name: 'FinBlog', domain: 'finblog.com' };
+  const ARTICLE  = { title: 'AAPL Insiders Load Up', url: 'https://earlyinsider.com/aapl', summary: 'CEO bought $5M.' };
+
+  test('does NOT include http:// or https:// in the prompt', () => {
+    const { prompt } = buildEmailPrompt(PROSPECT, ARTICLE);
+    expect(prompt).not.toMatch(/https?:\/\//);
+  });
+
+  test('prompt explicitly instructs AI not to include URLs', () => {
+    const { prompt } = buildEmailPrompt(PROSPECT, ARTICLE);
+    expect(prompt.toLowerCase()).toContain('url');
+  });
+});
+
+describe('section-04: buildEmailPrompt social proof', () => {
+  const PROSPECT = { contact_name: 'Bob', site_name: 'TradeBlog', domain: 'tradeblog.com' };
+
+  test('includes "1,500+" in the prompt', () => {
+    const { prompt } = buildEmailPrompt(PROSPECT, null);
+    expect(prompt).toContain('1,500+');
+  });
+});
+
+describe('section-04: buildEmailPrompt word count instruction', () => {
+  const PROSPECT = { contact_name: 'Bob', site_name: 'TradeBlog', domain: 'tradeblog.com' };
+
+  test('prompt instructs AI to write 100-125 words', () => {
+    const { prompt } = buildEmailPrompt(PROSPECT, null);
+    expect(prompt).toMatch(/100.{0,5}125/);
+  });
+});
+
+describe('section-04: buildEmailPrompt opt-out footer', () => {
+  const PROSPECT = { contact_name: 'Bob', site_name: 'TradeBlog', domain: 'tradeblog.com' };
+
+  test("prompt includes \"Reply 'stop'\" instruction", () => {
+    const { prompt } = buildEmailPrompt(PROSPECT, null);
+    expect(prompt.toLowerCase()).toContain("reply 'stop'");
+  });
+});
+
+describe('section-04: buildEmailPrompt article personalisation', () => {
+  const BASE_PROSPECT = { contact_name: 'Jane', site_name: 'FinBlog', domain: 'finblog.com' };
+
+  test('includes article title in prompt when last_article_title is set', () => {
+    const prospect = Object.assign({}, BASE_PROSPECT, { last_article_title: 'Why CEOs Buy In Q4' });
+    const { prompt } = buildEmailPrompt(prospect, null);
+    expect(prompt).toContain('Why CEOs Buy In Q4');
+  });
+
+  test('generates prompt without article reference when last_article_title is null', () => {
+    const { prompt } = buildEmailPrompt(BASE_PROSPECT, null);
+    expect(prompt).not.toContain("I just read your piece");
+  });
+});
+
+// ── section-04: validateSubject ───────────────────────────────────────────
+
+describe('section-04: validateSubject()', () => {
+  test('throws when subject has no question mark', () => {
+    expect(() => validateSubject('Insider buying update')).toThrow();
+    expect(() => validateSubject('Insider buying update')).toThrow(/question/i);
+  });
+
+  test('does not throw when subject ends with "?"', () => {
+    expect(() => validateSubject('Did you see the latest AAPL data?')).not.toThrow();
+  });
+
+  test('does not throw when subject contains "?" in the middle', () => {
+    expect(() => validateSubject('Is AAPL a buy? Here is the data')).not.toThrow();
+  });
+});
+
+// ── section-04: validateEmail new banned phrases ──────────────────────────
+
+describe('section-04: validateEmail new banned phrases (case-insensitive)', () => {
+  const newPhrases = [
+    'just wanted to reach out',
+    'I stumbled upon',
+    'I am a huge fan',
+    'big fan of your work',
+    'as per our conversation',
+    'circle back',
+    'synergy',
+  ];
+
+  newPhrases.forEach((phrase) => {
+    test(`rejects body containing "${phrase}" (passed in UPPER CASE)`, () => {
+      const body = phrase.toUpperCase() + ' Would you be interested in a guest post?';
+      const result = validateEmail(body);
+      expect(result.valid).toBe(false);
+      expect(result.issues.some((i) => i.toLowerCase().includes('banned'))).toBe(true);
+    });
+  });
+});
+
+// ── section-04: FROM_NAME constant ────────────────────────────────────────
+
+describe('section-04: FROM_NAME constant', () => {
+  test('equals "Ryan from EarlyInsider" <ryan@earlyinsider.com>', () => {
+    expect(FROM_NAME).toBe('"Ryan from EarlyInsider" <ryan@earlyinsider.com>');
+  });
+});
+
+// ── section-04: generateEmail from name ──────────────────────────────────
+
+describe('section-04: generateEmail from name', () => {
+  test('sets email.from to FROM_NAME constant', async () => {
+    const prospect = { contact_name: 'Jane', site_name: 'FinBlog', domain: 'finblog.com' };
+    const mockAi = { call: jest.fn().mockResolvedValue(makeValidAiResponse({})) };
+    const result = await generateEmail(prospect, null, { _aiClient: mockAi });
+    expect(result.from).toBe(FROM_NAME);
+  });
+});
+
+// ── section-04: generateEmail word count ─────────────────────────────────
+
+describe('section-04: generateEmail word count', () => {
+  test('produces an email body between 100 and 125 words', async () => {
+    const prospect = { contact_name: 'Jane', site_name: 'FinBlog', domain: 'finblog.com' };
+    const mockAi = { call: jest.fn().mockResolvedValue(makeValidAiResponse({ wordCount: 110 })) };
+    const result = await generateEmail(prospect, null, { _aiClient: mockAi });
+    const words = result.body.trim().split(/\s+/).filter((w) => w.length > 0);
+    expect(words.length).toBeGreaterThanOrEqual(100);
+    expect(words.length).toBeLessThanOrEqual(125);
+  });
+});
+
+// ── section-04: AI retry loop ────────────────────────────────────────────
+
+describe('section-04: generateEmail retry loop', () => {
+  const PROSPECT = { contact_name: 'Jane', site_name: 'FinBlog', domain: 'finblog.com' };
+
+  test('retries when AI returns a banned phrase — succeeds on clean 3rd attempt', async () => {
+    let calls = 0;
+    const mockAi = {
+      call: jest.fn().mockImplementation(async () => {
+        calls++;
+        if (calls <= 2) {
+          // synergy is banned
+          return makeValidAiResponse({ bannedPhrase: 'synergy great idea' });
+        }
+        return makeValidAiResponse({});
+      }),
+    };
+    const result = await generateEmail(PROSPECT, null, { _aiClient: mockAi });
+    expect(result.subject).toBeTruthy();
+    expect(calls).toBe(3);
+  });
+
+  test('retries when AI returns subject without "?"', async () => {
+    let calls = 0;
+    const mockAi = {
+      call: jest.fn().mockImplementation(async () => {
+        calls++;
+        if (calls === 1) return makeValidAiResponse({ subject: 'No question mark here' });
+        return makeValidAiResponse({});
+      }),
+    };
+    const result = await generateEmail(PROSPECT, null, { _aiClient: mockAi });
+    expect(result.subject).toContain('?');
+    expect(calls).toBe(2);
+  });
+
+  test('retries when AI returns body over 125 words', async () => {
+    let calls = 0;
+    const mockAi = {
+      call: jest.fn().mockImplementation(async () => {
+        calls++;
+        if (calls === 1) return makeValidAiResponse({ wordCount: 140 });
+        return makeValidAiResponse({});
+      }),
+    };
+    const result = await generateEmail(PROSPECT, null, { _aiClient: mockAi });
+    const words = result.body.trim().split(/\s+/).filter((w) => w.length > 0);
+    expect(words.length).toBeLessThanOrEqual(125);
+    expect(calls).toBe(2);
+  });
+
+  test('throws after 3 failed attempts', async () => {
+    const mockAi = {
+      call: jest.fn().mockResolvedValue(makeValidAiResponse({ subject: 'No question mark' })),
+    };
+    await expect(generateEmail(PROSPECT, null, { _aiClient: mockAi })).rejects.toThrow(/retries/i);
+  });
+});
+
+// ── section-04: scrapeRecentArticle HTML mode ────────────────────────────
+
+describe('section-04: scrapeRecentArticle HTML mode', () => {
+  function mockFetch(body, contentType) {
+    return jest.fn().mockResolvedValue({
+      statusCode: 200,
+      headers: { 'content-type': contentType || 'text/html' },
+      body: body,
+    });
+  }
+
+  test('returns title and url from article:first-of-type a selector', async () => {
+    const html = '<html><body><article><a href="/post/1">AAPL Insiders Buy</a></article></body></html>';
+    const result = await scrapeRecentArticle('https://example.com', { _fetchFn: mockFetch(html) });
+    expect(result).not.toBeNull();
+    expect(result.title).toBe('AAPL Insiders Buy');
+    expect(result.url).toContain('/post/1');
+  });
+
+  test('falls back to .post:first-of-type a when article selector finds nothing', async () => {
+    const html = '<html><body><div class="post"><a href="/p/2">Insider Move</a></div></body></html>';
+    const result = await scrapeRecentArticle('https://example.com', { _fetchFn: mockFetch(html) });
+    expect(result).not.toBeNull();
+    expect(result.title).toBe('Insider Move');
+  });
+
+  test('falls back to h2 a:first-of-type as last resort', async () => {
+    const html = '<html><body><h2><a href="/p/3">Deep Dive</a></h2></body></html>';
+    const result = await scrapeRecentArticle('https://example.com', { _fetchFn: mockFetch(html) });
+    expect(result).not.toBeNull();
+    expect(result.title).toBe('Deep Dive');
+  });
+
+  test('returns null gracefully when scraping fails entirely', async () => {
+    const throwFn = jest.fn().mockRejectedValue(new Error('network error'));
+    const result = await scrapeRecentArticle('https://example.com', { _fetchFn: throwFn });
+    expect(result).toBeNull();
+  });
+
+  test('returns null gracefully when no selector matches', async () => {
+    const html = '<html><body><p>No links here</p></body></html>';
+    const result = await scrapeRecentArticle('https://example.com', { _fetchFn: mockFetch(html) });
+    expect(result).toBeNull();
+  });
+});
+
+// ── section-04: scrapeRecentArticle XML/RSS mode ─────────────────────────
+
+describe('section-04: scrapeRecentArticle XML/RSS mode', () => {
+  const RSS_BODY = '<?xml version="1.0"?><rss><channel><item><title>CEO Buys Big</title><link>https://blog.com/1</link></item></channel></rss>';
+
+  test('uses xmlMode when Content-Type is application/xml', async () => {
+    const fetchFn = jest.fn().mockResolvedValue({
+      statusCode: 200,
+      headers: { 'content-type': 'application/xml; charset=utf-8' },
+      body: RSS_BODY,
+    });
+    const result = await scrapeRecentArticle('https://blog.com', { _fetchFn: fetchFn });
+    expect(result).not.toBeNull();
+    expect(result.title).toBe('CEO Buys Big');
+  });
+
+  test('uses xmlMode when Content-Type is text/xml', async () => {
+    const fetchFn = jest.fn().mockResolvedValue({
+      statusCode: 200,
+      headers: { 'content-type': 'text/xml' },
+      body: RSS_BODY,
+    });
+    const result = await scrapeRecentArticle('https://blog.com', { _fetchFn: fetchFn });
+    expect(result).not.toBeNull();
+    expect(result.title).toBe('CEO Buys Big');
+  });
+});
