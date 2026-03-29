diff --git a/insiderbuying-site/n8n/code/insiderbuying/send-outreach.js b/insiderbuying-site/n8n/code/insiderbuying/send-outreach.js
index eca2aeb..920c43e 100644
--- a/insiderbuying-site/n8n/code/insiderbuying/send-outreach.js
+++ b/insiderbuying-site/n8n/code/insiderbuying/send-outreach.js
@@ -443,6 +443,375 @@ async function generateEmail(prospect, ourArticle, _opts) {
   );
 }
 
+// ─── Section 05: Follow-Up Sequence ──────────────────────────────────────────
+
+/**
+ * Determine which follow-up stage is due given elapsed days and current count.
+ * Threshold logic handles missed cron runs gracefully.
+ * @param {number} days - days since initial send
+ * @param {number} followupCount - current followup_count (0=none sent, 99=cancelled)
+ * @returns {1|2|3|null}
+ */
+function getFollowUpStage(days, followupCount) {
+  if (days >= 16 && followupCount === 2) return 3;
+  if (days >= 10 && followupCount === 1) return 2;
+  if (days >= 5  && followupCount === 0) return 1;
+  return null;
+}
+
+/**
+ * Query NocoDB for prospects that are due for a follow-up.
+ * Returns array of { prospect, stage } objects.
+ * @param {{ queryRecords: Function }} nocodbApi
+ * @returns {Promise<Array<{prospect: object, stage: number}>>}
+ */
+async function checkFollowUpsDue(nocodbApi) {
+  var records = await nocodbApi.queryRecords('Outreach_Prospects', {
+    where: '(followup_count,lt,3)~and(replied,eq,false)~and(sent_at,isnot,)',
+  });
+
+  var now = Date.now();
+  var results = [];
+  (records || []).forEach(function (p) {
+    // Safety guards (NocoDB filter handles these in production; guards here for correctness)
+    if (!p.sent_at) return;
+    if (p.replied) return;
+    if ((p.followup_count || 0) >= 3) return;
+
+    var days = Math.floor((now - new Date(p.sent_at).getTime()) / 86400000);
+    var stage = getFollowUpStage(days, p.followup_count || 0);
+    if (stage !== null) {
+      results.push({ prospect: p, stage: stage });
+    }
+  });
+  return results;
+}
+
+/**
+ * Build DeepSeek prompt for FU1 (50-75 words, same thread, soft check-in).
+ * @param {object} prospect
+ * @returns {{ prompt: string, maxTokens: number }}
+ */
+function buildFu1Prompt(prospect) {
+  var prompt =
+    'Write a 50-75 word follow-up email body to ' +
+    (prospect.contact_name || 'the editor') +
+    ' at ' +
+    (prospect.site_name || prospect.domain) +
+    '.\n\n' +
+    'Context: They did not reply to a cold email about EarlyInsider — we track 1,500+ SEC insider filings/month.\n\n' +
+    'Rules:\n' +
+    '- EXACTLY 50-75 words\n' +
+    '- Do NOT use any of these phrases: ' + BANNED_PHRASES.join(', ') + '\n' +
+    '- Mention one new specific insider-buying data point\n' +
+    '- End with a soft, low-pressure question\n' +
+    '- No URLs\n\n' +
+    'Output the email body only. No subject line.';
+  return { prompt: prompt, maxTokens: 200 };
+}
+
+/**
+ * Build DeepSeek prompt for FU2 (30-50 words, new thread, different angle).
+ * @param {object} prospect
+ * @returns {{ prompt: string, maxTokens: number }}
+ */
+function buildFu2Prompt(prospect) {
+  var prompt =
+    'Write a 30-50 word cold outreach email to ' +
+    (prospect.contact_name || 'the editor') +
+    ' at ' +
+    (prospect.site_name || prospect.domain) +
+    '.\n\n' +
+    'Context: Finance/investing blog. Approach from a completely different angle — do NOT reference any prior emails.\n\n' +
+    'Rules:\n' +
+    '- EXACTLY 30-50 words in the email body\n' +
+    '- Different angle: pitch data depth (we score 1,500+ filings/month for conviction signals)\n' +
+    '- One clear question at the end\n' +
+    '- No URLs\n' +
+    '- Subject line on first line prefixed "Subject: " (must contain "?")\n' +
+    '- Do NOT use any of these phrases: ' + BANNED_PHRASES.join(', ') + '\n\n' +
+    'Output the email only.';
+  return { prompt: prompt, maxTokens: 150 };
+}
+
+/**
+ * Build fixed-copy FU3 body (~25 words, no AI needed).
+ * @param {object} prospect - { contact_name }
+ * @returns {string}
+ */
+function buildFu3Body(prospect) {
+  var firstName = ((prospect.contact_name || '').split(' ')[0]) || 'there';
+  return (
+    'Hi ' + firstName + ', last note from me on this — ' +
+    'the data offer stands whenever insider trading coverage is relevant for your readers.'
+  );
+}
+
+/**
+ * Build SMTP payload for FU1 or FU3 (same-thread follow-ups).
+ * Includes In-Reply-To and References headers when resendId is present.
+ * @param {string} to
+ * @param {string} subject
+ * @param {string} body
+ * @param {string} fromEmail
+ * @param {string|null} resendId
+ * @returns {object}
+ */
+function buildFuThreadedPayload(to, subject, body, fromEmail, resendId) {
+  var htmlBody = (body || '')
+    .split('\n')
+    .map(function (line) {
+      return '<p>' + escapeHtml(line) + '</p>';
+    })
+    .join('\n');
+
+  var payload = {
+    from: fromEmail,
+    to: to,
+    subject: subject,
+    html: htmlBody,
+    text: body,
+    headers: {},
+  };
+
+  if (resendId) {
+    payload.headers['In-Reply-To'] = '<' + resendId + '>';
+    payload.headers['References'] = '<' + resendId + '>';
+  }
+
+  return payload;
+}
+
+/**
+ * Build SMTP payload for FU2 (new thread — no In-Reply-To / References).
+ * @param {string} to
+ * @param {string} subject
+ * @param {string} body
+ * @param {string} fromEmail
+ * @returns {object}
+ */
+function buildFu2Payload(to, subject, body, fromEmail) {
+  var htmlBody = (body || '')
+    .split('\n')
+    .map(function (line) {
+      return '<p>' + escapeHtml(line) + '</p>';
+    })
+    .join('\n');
+
+  return {
+    from: fromEmail,
+    to: to,
+    subject: subject,
+    html: htmlBody,
+    text: body,
+  };
+}
+
+/**
+ * Low-level HTTPS POST to Resend API.
+ * @param {object} payload - email payload object
+ * @param {Function} postFn - fetch-like function (url, opts) => { status, json(), text() }
+ * @returns {Promise<object>} Resend response JSON
+ */
+async function _resendEmailPost(payload, postFn) {
+  var RESEND_API_KEY = process.env.RESEND_API_KEY || '';
+  var resp = await postFn('https://api.resend.com/emails', {
+    method: 'POST',
+    headers: {
+      Authorization: 'Bearer ' + RESEND_API_KEY,
+      'Content-Type': 'application/json',
+    },
+    body: JSON.stringify(payload),
+  });
+
+  if (resp.status < 200 || resp.status >= 300) {
+    var errBody = '';
+    try { errBody = await resp.text(); } catch (_e) {}
+    throw new Error('Resend send failed with HTTP ' + resp.status + ': ' + errBody);
+  }
+
+  try {
+    return await resp.json();
+  } catch (_e) {
+    return {};
+  }
+}
+
+/**
+ * Send initial outreach email and store Resend ID + sent_at + followup_count=0 in NocoDB.
+ * @param {object} prospect - { id }
+ * @param {object} emailPayload - SMTP payload from buildSendPayload
+ * @param {{ updateRecord: Function }} nocodbApi
+ * @param {{ _postFn?: Function }} [_opts]
+ * @returns {Promise<object>} Resend response
+ */
+async function sendInitialOutreach(prospect, emailPayload, nocodbApi, _opts) {
+  var postFn =
+    _opts && _opts._postFn
+      ? _opts._postFn
+      : function () {
+          throw new Error('_postFn not provided — wire _opts._postFn in production');
+        };
+
+  var resendResp = await _resendEmailPost(emailPayload, postFn);
+  var resendId = (resendResp && resendResp.id) || null;
+
+  await nocodbApi.updateRecord('Outreach_Prospects', prospect.id, {
+    last_resend_id: resendId,
+    sent_at: new Date().toISOString(),
+    followup_count: 0,
+  });
+
+  return resendResp;
+}
+
+/**
+ * Generate a follow-up body with AI, retrying up to 3 times on validation failure.
+ * @param {Function} aiCall
+ * @param {{ prompt: string }} promptResult
+ * @param {number} minWords
+ * @param {number} maxWords
+ * @returns {Promise<string>}
+ */
+async function _generateFollowUpBody(aiCall, promptResult, minWords, maxWords) {
+  var messages = [{ role: 'user', content: promptResult.prompt }];
+  var maxAttempts = 3;
+  var lastError = null;
+
+  for (var attempt = 0; attempt < maxAttempts; attempt++) {
+    var raw = await aiCall(messages);
+    var body = (raw || '').trim();
+
+    try {
+      var words = body.split(/\s+/).filter(function (w) { return w.length > 0; });
+      if (words.length < minWords || words.length > maxWords) {
+        throw new Error(
+          'Word count ' + words.length + ' out of range [' + minWords + ',' + maxWords + ']'
+        );
+      }
+      var lowerBody = body.toLowerCase();
+      for (var k = 0; k < BANNED_PHRASES.length; k++) {
+        if (lowerBody.indexOf(BANNED_PHRASES[k].toLowerCase()) !== -1) {
+          throw new Error('Contains banned phrase: "' + BANNED_PHRASES[k] + '"');
+        }
+      }
+      return body;
+    } catch (err) {
+      lastError = err;
+      messages.push({ role: 'assistant', content: raw });
+      messages.push({
+        role: 'user',
+        content: 'That follow-up failed validation: ' + err.message + '. Fix it and try again.',
+      });
+    }
+  }
+
+  throw new Error(
+    'Follow-up generation failed after ' + maxAttempts + ' attempts. Last: ' + lastError.message
+  );
+}
+
+/**
+ * Send a follow-up email (FU1, FU2, or FU3) and increment followup_count in NocoDB.
+ * @param {object} prospect - { id, contact_email, original_subject, last_resend_id, ... }
+ * @param {1|2|3} stage
+ * @param {{ updateRecord: Function }} nocodbApi
+ * @param {{ _aiClient?: object, _postFn?: Function }} [_opts]
+ * @returns {Promise<object>} Resend response
+ */
+async function sendFollowUp(prospect, stage, nocodbApi, _opts) {
+  var aiCall =
+    _opts && _opts._aiClient && typeof _opts._aiClient.call === 'function'
+      ? function (msgs) { return _opts._aiClient.call(msgs); }
+      : function () { throw new Error('AI client not provided — wire _opts._aiClient in production'); };
+
+  var postFn =
+    _opts && _opts._postFn
+      ? _opts._postFn
+      : function () { throw new Error('_postFn not provided'); };
+
+  var to = prospect.contact_email;
+  var resendId = prospect.last_resend_id || null;
+  var originalSubject = prospect.original_subject || '';
+
+  if (stage === 1) {
+    var body1 = await _generateFollowUpBody(aiCall, buildFu1Prompt(prospect), 50, 75);
+    var payload1 = buildFuThreadedPayload(to, 'Re: ' + originalSubject, body1, FROM_NAME, resendId);
+    var resp1 = await _resendEmailPost(payload1, postFn);
+    await nocodbApi.updateRecord('Outreach_Prospects', prospect.id, { followup_count: 1 });
+    return resp1;
+  }
+
+  if (stage === 2) {
+    var promptResult2 = buildFu2Prompt(prospect);
+    var messages2 = [{ role: 'user', content: promptResult2.prompt }];
+    var maxAttempts2 = 3;
+    var lastError2 = null;
+    var subject2 = '';
+    var body2 = '';
+
+    for (var a = 0; a < maxAttempts2; a++) {
+      var raw2 = await aiCall(messages2);
+      try {
+        var lines2 = (raw2 || '').trim().split('\n');
+        var parsedSubject = '';
+        var bodyLines = [];
+        for (var j = 0; j < lines2.length; j++) {
+          if (!parsedSubject && lines2[j].startsWith('Subject: ')) {
+            parsedSubject = lines2[j].replace('Subject: ', '').trim();
+          } else {
+            bodyLines.push(lines2[j]);
+          }
+        }
+        var parsedBody = bodyLines.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
+        validateSubject(parsedSubject);
+        var words2 = parsedBody.trim().split(/\s+/).filter(function (w) { return w.length > 0; });
+        if (words2.length < 30 || words2.length > 50) {
+          throw new Error('FU2 word count ' + words2.length + ' out of range [30,50]');
+        }
+        subject2 = parsedSubject;
+        body2 = parsedBody;
+        break;
+      } catch (err2) {
+        lastError2 = err2;
+        messages2.push({ role: 'assistant', content: raw2 });
+        messages2.push({
+          role: 'user',
+          content: 'That FU2 failed validation: ' + err2.message + '. Fix it and try again.',
+        });
+        if (a === maxAttempts2 - 1) {
+          throw new Error('FU2 generation failed after ' + maxAttempts2 + ' attempts. Last: ' + lastError2.message);
+        }
+      }
+    }
+
+    var payload2 = buildFu2Payload(to, subject2, body2, FROM_NAME);
+    var resp2 = await _resendEmailPost(payload2, postFn);
+    await nocodbApi.updateRecord('Outreach_Prospects', prospect.id, { followup_count: 2 });
+    return resp2;
+  }
+
+  if (stage === 3) {
+    var body3 = buildFu3Body(prospect);
+    var payload3 = buildFuThreadedPayload(to, 'Re: ' + originalSubject, body3, FROM_NAME, resendId);
+    var resp3 = await _resendEmailPost(payload3, postFn);
+    await nocodbApi.updateRecord('Outreach_Prospects', prospect.id, { followup_count: 3 });
+    return resp3;
+  }
+
+  throw new Error('Invalid follow-up stage: ' + stage);
+}
+
+/**
+ * Cancel follow-ups for a prospect permanently (e.g. after they reply).
+ * Sets followup_count=99 so checkFollowUpsDue never selects them again.
+ * @param {string} prospectId
+ * @param {{ updateRecord: Function }} nocodbApi
+ */
+async function cancelFollowUps(prospectId, nocodbApi) {
+  await nocodbApi.updateRecord('Outreach_Prospects', prospectId, { followup_count: 99 });
+}
+
 module.exports = {
   selectProspects: selectProspects,
   buildEmailPrompt: buildEmailPrompt,
@@ -456,4 +825,13 @@ module.exports = {
   generateEmail: generateEmail,
   BANNED_PHRASES: BANNED_PHRASES,
   FROM_NAME: FROM_NAME,
+  // section-05
+  getFollowUpStage: getFollowUpStage,
+  checkFollowUpsDue: checkFollowUpsDue,
+  buildFu3Body: buildFu3Body,
+  buildFuThreadedPayload: buildFuThreadedPayload,
+  buildFu2Payload: buildFu2Payload,
+  sendInitialOutreach: sendInitialOutreach,
+  sendFollowUp: sendFollowUp,
+  cancelFollowUps: cancelFollowUps,
 };
diff --git a/insiderbuying-site/tests/insiderbuying/send-outreach.test.js b/insiderbuying-site/tests/insiderbuying/send-outreach.test.js
index 42416a8..19bfb3a 100644
--- a/insiderbuying-site/tests/insiderbuying/send-outreach.test.js
+++ b/insiderbuying-site/tests/insiderbuying/send-outreach.test.js
@@ -13,6 +13,14 @@ const {
   generateEmail,
   BANNED_PHRASES,
   FROM_NAME,
+  getFollowUpStage,
+  checkFollowUpsDue,
+  buildFu3Body,
+  buildFuThreadedPayload,
+  buildFu2Payload,
+  sendInitialOutreach,
+  sendFollowUp,
+  cancelFollowUps,
 } = require('../../n8n/code/insiderbuying/send-outreach');
 
 // ─── selectProspects ──────────────────────────────────────────────────────
@@ -628,3 +636,276 @@ describe('section-04: scrapeRecentArticle XML/RSS mode', () => {
     expect(result.title).toBe('CEO Buys Big');
   });
 });
+
+// ═══════════════════════════════════════════════════════════════════════════
+// section-05: Follow-Up Sequence
+// ═══════════════════════════════════════════════════════════════════════════
+
+// ── section-05: getFollowUpStage ─────────────────────────────────────────
+
+describe('section-05: getFollowUpStage', () => {
+  test('returns 1 for day 5 with followup_count=0', () => {
+    expect(getFollowUpStage(5, 0)).toBe(1);
+  });
+  test('returns 1 for day 7 with followup_count=0 (resilient to missed cron)', () => {
+    expect(getFollowUpStage(7, 0)).toBe(1);
+  });
+  test('returns 2 for day 10 with followup_count=1', () => {
+    expect(getFollowUpStage(10, 1)).toBe(2);
+  });
+  test('returns 2 for day 12 with followup_count=1', () => {
+    expect(getFollowUpStage(12, 1)).toBe(2);
+  });
+  test('returns 3 for day 16 with followup_count=2', () => {
+    expect(getFollowUpStage(16, 2)).toBe(3);
+  });
+  test('returns null for day 4 with followup_count=0 (not yet due)', () => {
+    expect(getFollowUpStage(4, 0)).toBeNull();
+  });
+  test('returns null for day 5 with followup_count=1 (wrong stage)', () => {
+    expect(getFollowUpStage(5, 1)).toBeNull();
+  });
+  test('returns null for followup_count=99 (cancelled)', () => {
+    expect(getFollowUpStage(20, 99)).toBeNull();
+  });
+});
+
+// ── section-05: checkFollowUpsDue ────────────────────────────────────────
+
+describe('section-05: checkFollowUpsDue', () => {
+  function makeNocodbApi(records) {
+    return {
+      queryRecords: jest.fn().mockResolvedValue(records || []),
+      updateRecord: jest.fn().mockResolvedValue({}),
+    };
+  }
+
+  function makeProspect(daysAgo, followupCount, overrides) {
+    return Object.assign({
+      id: 'p1',
+      contact_email: 'ed@site.com',
+      contact_name: 'Ed Smith',
+      site_name: 'FinSite',
+      domain: 'finsite.com',
+      sent_at: new Date(Date.now() - daysAgo * 86400000).toISOString(),
+      followup_count: followupCount,
+      replied: false,
+      last_resend_id: 'resend-abc-123',
+      original_subject: 'Want to partner?',
+    }, overrides || {});
+  }
+
+  test('selects prospect at day 5 with followup_count=0 as FU1', async () => {
+    const api = makeNocodbApi([makeProspect(5, 0)]);
+    const result = await checkFollowUpsDue(api);
+    expect(result).toHaveLength(1);
+    expect(result[0].stage).toBe(1);
+  });
+
+  test('selects prospect at day 10 with followup_count=1 as FU2', async () => {
+    const api = makeNocodbApi([makeProspect(10, 1)]);
+    const result = await checkFollowUpsDue(api);
+    expect(result[0].stage).toBe(2);
+  });
+
+  test('selects prospect at day 16 with followup_count=2 as FU3', async () => {
+    const api = makeNocodbApi([makeProspect(16, 2)]);
+    const result = await checkFollowUpsDue(api);
+    expect(result[0].stage).toBe(3);
+  });
+
+  test('selects FU1 for prospect at day 7 with followup_count=0 (days >= 5)', async () => {
+    const api = makeNocodbApi([makeProspect(7, 0)]);
+    const result = await checkFollowUpsDue(api);
+    expect(result[0].stage).toBe(1);
+  });
+
+  test('selects FU2 for prospect at day 12 with followup_count=1 (days >= 10)', async () => {
+    const api = makeNocodbApi([makeProspect(12, 1)]);
+    const result = await checkFollowUpsDue(api);
+    expect(result[0].stage).toBe(2);
+  });
+
+  test('does NOT select prospect with followup_count=99 (cancelled)', async () => {
+    const api = makeNocodbApi([makeProspect(10, 99)]);
+    const result = await checkFollowUpsDue(api);
+    expect(result).toHaveLength(0);
+  });
+
+  test('does NOT select prospect with replied=true', async () => {
+    const api = makeNocodbApi([makeProspect(10, 0, { replied: true })]);
+    const result = await checkFollowUpsDue(api);
+    expect(result).toHaveLength(0);
+  });
+
+  test('does NOT select prospect where sent_at is NULL', async () => {
+    const api = makeNocodbApi([makeProspect(5, 0, { sent_at: null })]);
+    const result = await checkFollowUpsDue(api);
+    expect(result).toHaveLength(0);
+  });
+});
+
+// ── section-05: buildFuThreadedPayload (FU1/FU3 headers) ─────────────────
+
+describe('section-05: buildFuThreadedPayload', () => {
+  test('includes In-Reply-To header with wrapped resendId', () => {
+    const payload = buildFuThreadedPayload(
+      'ed@site.com', 'Re: Partner?', 'Hello', FROM_NAME, 'resend-abc-123'
+    );
+    expect(payload.headers['In-Reply-To']).toBe('<resend-abc-123>');
+  });
+
+  test('includes References header with wrapped resendId', () => {
+    const payload = buildFuThreadedPayload(
+      'ed@site.com', 'Re: Partner?', 'Hello', FROM_NAME, 'resend-abc-123'
+    );
+    expect(payload.headers['References']).toBe('<resend-abc-123>');
+  });
+
+  test('omits threading headers when resendId is null', () => {
+    const payload = buildFuThreadedPayload(
+      'ed@site.com', 'Re: Partner?', 'Hello', FROM_NAME, null
+    );
+    expect(payload.headers['In-Reply-To']).toBeUndefined();
+    expect(payload.headers['References']).toBeUndefined();
+  });
+});
+
+// ── section-05: buildFu2Payload (new thread) ─────────────────────────────
+
+describe('section-05: buildFu2Payload', () => {
+  test('does NOT include In-Reply-To header', () => {
+    const payload = buildFu2Payload('ed@site.com', 'Fresh angle?', 'Body text', FROM_NAME);
+    expect(payload.headers).toBeUndefined();
+    expect(payload['In-Reply-To']).toBeUndefined();
+  });
+
+  test('subject does NOT start with "Re:"', () => {
+    const payload = buildFu2Payload('ed@site.com', 'Fresh angle?', 'Body text', FROM_NAME);
+    expect(payload.subject).not.toMatch(/^Re:/i);
+  });
+});
+
+// ── section-05: buildFu3Body ──────────────────────────────────────────────
+
+describe('section-05: buildFu3Body', () => {
+  test('uses first name from contact_name', () => {
+    const body = buildFu3Body({ contact_name: 'John Smith' });
+    expect(body).toMatch(/^Hi John,/);
+  });
+
+  test('falls back to "there" when contact_name is missing', () => {
+    const body = buildFu3Body({ contact_name: '' });
+    expect(body).toMatch(/^Hi there,/);
+  });
+
+  test('body is approximately 25 words', () => {
+    const body = buildFu3Body({ contact_name: 'Jane' });
+    const words = body.trim().split(/\s+/).length;
+    expect(words).toBeGreaterThanOrEqual(20);
+    expect(words).toBeLessThanOrEqual(35);
+  });
+});
+
+// ── section-05: sendInitialOutreach — state tracking ─────────────────────
+
+describe('section-05: sendInitialOutreach', () => {
+  test('stores Resend response id in Outreach_Prospects.last_resend_id', async () => {
+    const mockPost = jest.fn().mockResolvedValue({
+      status: 200,
+      json: () => Promise.resolve({ id: 'resend-xyz-789' }),
+    });
+    const nocodbApi = { updateRecord: jest.fn().mockResolvedValue({}) };
+    const prospect = { id: 'p1', contact_email: 'ed@site.com' };
+    const emailPayload = { from: FROM_NAME, to: 'ed@site.com', subject: 'Test?', html: '<p>Hi</p>', text: 'Hi' };
+
+    await sendInitialOutreach(prospect, emailPayload, nocodbApi, { _postFn: mockPost });
+
+    expect(nocodbApi.updateRecord).toHaveBeenCalledWith(
+      'Outreach_Prospects', 'p1',
+      expect.objectContaining({ last_resend_id: 'resend-xyz-789' })
+    );
+  });
+});
+
+// ── section-05: sendFollowUp — followup_count increment ──────────────────
+
+describe('section-05: sendFollowUp', () => {
+  function makeProspect(stage) {
+    return {
+      id: 'p1',
+      contact_email: 'ed@site.com',
+      contact_name: 'Ed',
+      site_name: 'FinSite',
+      domain: 'finsite.com',
+      last_resend_id: 'resend-abc-123',
+      original_subject: 'Want to partner?',
+      followup_count: stage - 1,
+    };
+  }
+
+  function makeFu1AiResponse() {
+    return Array(60).fill('interesting').join(' ');
+  }
+
+  function makeFu2AiResponse() {
+    return 'Subject: Different angle for FinSite?\n\n' + Array(40).fill('specific').join(' ');
+  }
+
+  function makePostFn() {
+    return jest.fn().mockResolvedValue({
+      status: 200,
+      json: () => Promise.resolve({ id: 'resend-fu-001' }),
+    });
+  }
+
+  test('FU1: increments followup_count to 1 after send', async () => {
+    const nocodbApi = { updateRecord: jest.fn().mockResolvedValue({}) };
+    const aiClient = { call: jest.fn().mockResolvedValue(makeFu1AiResponse()) };
+    await sendFollowUp(makeProspect(1), 1, nocodbApi, { _aiClient: aiClient, _postFn: makePostFn() });
+    expect(nocodbApi.updateRecord).toHaveBeenCalledWith(
+      'Outreach_Prospects', 'p1', expect.objectContaining({ followup_count: 1 })
+    );
+  });
+
+  test('FU2: increments followup_count to 2 after send', async () => {
+    const nocodbApi = { updateRecord: jest.fn().mockResolvedValue({}) };
+    const aiClient = { call: jest.fn().mockResolvedValue(makeFu2AiResponse()) };
+    await sendFollowUp(makeProspect(2), 2, nocodbApi, { _aiClient: aiClient, _postFn: makePostFn() });
+    expect(nocodbApi.updateRecord).toHaveBeenCalledWith(
+      'Outreach_Prospects', 'p1', expect.objectContaining({ followup_count: 2 })
+    );
+  });
+
+  test('FU3: increments followup_count to 3 after send (no AI needed)', async () => {
+    const nocodbApi = { updateRecord: jest.fn().mockResolvedValue({}) };
+    await sendFollowUp(makeProspect(3), 3, nocodbApi, { _postFn: makePostFn() });
+    expect(nocodbApi.updateRecord).toHaveBeenCalledWith(
+      'Outreach_Prospects', 'p1', expect.objectContaining({ followup_count: 3 })
+    );
+  });
+
+  test('FU1: payload includes In-Reply-To header', async () => {
+    let capturedPayload = null;
+    const postFn = jest.fn().mockImplementation((url, opts) => {
+      capturedPayload = JSON.parse(opts.body);
+      return Promise.resolve({ status: 200, json: () => Promise.resolve({ id: 'r1' }) });
+    });
+    const nocodbApi = { updateRecord: jest.fn().mockResolvedValue({}) };
+    const aiClient = { call: jest.fn().mockResolvedValue(makeFu1AiResponse()) };
+    await sendFollowUp(makeProspect(1), 1, nocodbApi, { _aiClient: aiClient, _postFn: postFn });
+    expect(capturedPayload.headers['In-Reply-To']).toBe('<resend-abc-123>');
+  });
+});
+
+// ── section-05: cancelFollowUps ───────────────────────────────────────────
+
+describe('section-05: cancelFollowUps', () => {
+  test('sets followup_count=99 on the given prospect ID', async () => {
+    const nocodbApi = { updateRecord: jest.fn().mockResolvedValue({}) };
+    await cancelFollowUps('p42', nocodbApi);
+    expect(nocodbApi.updateRecord).toHaveBeenCalledWith(
+      'Outreach_Prospects', 'p42', { followup_count: 99 }
+    );
+  });
+});
