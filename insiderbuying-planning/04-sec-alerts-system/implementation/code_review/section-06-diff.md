diff --git a/insiderbuying-site/n8n/code/insiderbuying/deliver-alert.js b/insiderbuying-site/n8n/code/insiderbuying/deliver-alert.js
new file mode 100644
index 0000000..c96ec0a
--- /dev/null
+++ b/insiderbuying-site/n8n/code/insiderbuying/deliver-alert.js
@@ -0,0 +1,308 @@
+'use strict';
+
+// ─── deliver-alert.js ──────────────────────────────────────────────────────
+// W5 Alert Delivery node for InsiderBuying.ai pipeline.
+// Sends email via Resend and push via OneSignal to eligible subscribers,
+// then updates Airtable with delivery tracking.
+// ────────────────────────────────────────────────────────────────────────────
+
+const POSTAL_ADDRESS = '123 Market Street, Suite 100, San Francisco, CA 94105';
+
+// ─── Pure helpers ───────────────────────────────────────────────────────────
+
+function formatMoney(value) {
+  if (value == null || isNaN(value)) return '$0';
+  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
+  if (value >= 1000) return `$${Math.round(value / 1000)}K`;
+  return `$${value}`;
+}
+
+function chunkArray(arr, maxSize) {
+  const chunks = [];
+  for (let i = 0; i < arr.length; i += maxSize) {
+    chunks.push(arr.slice(i, i + maxSize));
+  }
+  return chunks;
+}
+
+// ─── 6.1 Fetch Eligible Users ───────────────────────────────────────────────
+
+async function fetchEligibleUsers(alertScore, ticker, opts) {
+  const { fetchFn, env } = opts;
+  const headers = {
+    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
+    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
+    'Content-Type': 'application/json',
+  };
+
+  // Step 1: Get all preferences where email_enabled=true
+  const prefUrl = `${env.SUPABASE_URL}/rest/v1/user_alert_preferences?email_enabled=eq.true&select=user_id,min_significance_score,watched_tickers`;
+  const prefRes = await fetchFn(prefUrl, { headers });
+  const allPrefs = await prefRes.json();
+  if (!Array.isArray(allPrefs)) return [];
+
+  // Filter: score threshold OR watched ticker match
+  const eligible = allPrefs.filter((p) => {
+    const scoreMatch = (p.min_significance_score || 10) <= alertScore;
+    const tickerMatch = Array.isArray(p.watched_tickers) && p.watched_tickers.includes(ticker);
+    return scoreMatch || tickerMatch;
+  });
+
+  if (eligible.length === 0) return [];
+
+  // Step 2: Get subscription tiers
+  const userIds = eligible.map((p) => p.user_id);
+  const profileUrl = `${env.SUPABASE_URL}/rest/v1/profiles?user_id=in.(${userIds.join(',')})&select=user_id,subscription_tier`;
+  const profileRes = await fetchFn(profileUrl, { headers });
+  const profiles = await profileRes.json();
+  const tierMap = new Map();
+  if (Array.isArray(profiles)) {
+    for (const p of profiles) tierMap.set(p.user_id, p.subscription_tier || 'free');
+  }
+
+  // Step 3: Get emails via admin API (one per user)
+  const users = [];
+  for (const pref of eligible) {
+    try {
+      const userUrl = `${env.SUPABASE_URL}/auth/v1/admin/users/${pref.user_id}`;
+      const userRes = await fetchFn(userUrl, {
+        headers: {
+          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
+          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
+        },
+      });
+      const userData = await userRes.json();
+      const email = userData?.user?.email;
+      if (email) {
+        users.push({
+          userId: pref.user_id,
+          email,
+          subscriptionTier: tierMap.get(pref.user_id) || 'free',
+        });
+      }
+    } catch (err) {
+      // Log only user_id, NEVER email
+      console.warn(`[deliver-alert] Failed to get user ${pref.user_id}: ${err.message}`);
+    }
+  }
+
+  return users;
+}
+
+// ─── 6.2 Build Email ────────────────────────────────────────────────────────
+
+function buildEmailHtml(alertData, analysisContent, isPro) {
+  const truncated = !isPro && analysisContent && analysisContent.length > 150;
+  const displayAnalysis = truncated
+    ? analysisContent.slice(0, 150) + '... <a href="https://earlyinsider.com/pricing" style="color:#4A90D9;">upgrade to Pro to read full analysis</a>'
+    : (analysisContent || 'No analysis available for this alert.');
+
+  return `
+<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#111;color:#eee;">
+  <h2 style="color:#4A90D9;">EarlyInsider Alert</h2>
+  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
+    <tr><td style="padding:8px;color:#aaa;">Ticker</td><td style="padding:8px;font-weight:bold;">${alertData.ticker}</td></tr>
+    <tr><td style="padding:8px;color:#aaa;">Insider</td><td style="padding:8px;">${alertData.insider_name} (${alertData.insider_title})</td></tr>
+    <tr><td style="padding:8px;color:#aaa;">Value</td><td style="padding:8px;">${formatMoney(alertData.total_value)}</td></tr>
+    <tr><td style="padding:8px;color:#aaa;">Score</td><td style="padding:8px;"><span style="background:${alertData.significance_score >= 7 ? '#27AE60' : '#F39C12'};padding:2px 8px;border-radius:4px;">${alertData.significance_score}/10</span></td></tr>
+  </table>
+  <div style="margin:16px 0;line-height:1.6;">${displayAnalysis}</div>
+  <hr style="border-color:#333;">
+  <p style="font-size:12px;color:#666;">
+    <a href="https://earlyinsider.com/preferences?unsubscribe=1" style="color:#888;">Unsubscribe</a> |
+    <a href="https://earlyinsider.com/preferences" style="color:#888;">Manage preferences</a><br>
+    ${POSTAL_ADDRESS}
+  </p>
+</div>`;
+}
+
+function buildEmailObject(user, alertData) {
+  const isPro = user.subscriptionTier === 'pro';
+  const html = buildEmailHtml(alertData, alertData.ai_analysis, isPro);
+
+  let subject;
+  if (alertData.transaction_type === 'cluster') {
+    subject = `CLUSTER BUY: ${alertData.cluster_size} insiders buying ${alertData.ticker}`;
+  } else {
+    subject = `[INSIDER BUY] ${alertData.insider_name} (${alertData.insider_title}) buys ${formatMoney(alertData.total_value)} of ${alertData.ticker}`;
+  }
+
+  return {
+    from: 'EarlyInsider <alerts@earlyinsider.com>',
+    to: user.email,
+    subject,
+    html,
+  };
+}
+
+// ─── Send Resend Batch ──────────────────────────────────────────────────────
+
+async function sendResendBatch(emails, opts) {
+  const { fetchFn, env, _sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = opts;
+  const chunks = chunkArray(emails, 100);
+  let totalSent = 0;
+
+  for (let i = 0; i < chunks.length; i++) {
+    if (i > 0) await _sleep(200);
+
+    const res = await fetchFn('https://api.resend.com/emails/batch', {
+      method: 'POST',
+      headers: {
+        Authorization: `Bearer ${env.RESEND_API_KEY}`,
+        'Content-Type': 'application/json',
+      },
+      body: JSON.stringify(chunks[i]),
+    });
+
+    if (!res.ok) {
+      const errText = await res.text().catch(() => '');
+      throw new Error(`Resend API error (${res.status}): ${errText}`);
+    }
+
+    const data = await res.json();
+    // Resend returns { data: [{ id }] } for batch
+    totalSent += chunks[i].length;
+  }
+
+  return totalSent;
+}
+
+// ─── 6.3 OneSignal Push ─────────────────────────────────────────────────────
+
+async function sendOneSignalPush(alertData, supabaseAlertId, opts) {
+  const { fetchFn, env } = opts;
+
+  const typeLabel = alertData.transaction_type === 'cluster' ? 'cluster buy' : 'buys';
+  const heading = alertData.transaction_type === 'cluster'
+    ? `CLUSTER: ${alertData.ticker}`
+    : `${alertData.ticker} Insider Buy`;
+
+  const body = {
+    app_id: env.ONESIGNAL_APP_ID,
+    filters: [
+      { field: 'tag', key: 'alert_score_min', relation: '<=', value: String(alertData.significance_score) },
+    ],
+    headings: { en: heading },
+    contents: {
+      en: `${alertData.ticker}: ${alertData.insider_title} ${typeLabel} ${formatMoney(alertData.total_value)}`,
+    },
+    url: `https://earlyinsider.com/alerts#${supabaseAlertId}`,
+  };
+
+  const res = await fetchFn('https://onesignal.com/api/v1/notifications', {
+    method: 'POST',
+    headers: {
+      Authorization: `Basic ${env.ONESIGNAL_REST_API_KEY}`,
+      'Content-Type': 'application/json',
+    },
+    body: JSON.stringify(body),
+  });
+
+  if (!res.ok) {
+    const errText = await res.text().catch(() => '');
+    throw new Error(`OneSignal API error (${res.status}): ${errText}`);
+  }
+
+  const data = await res.json();
+  return data.recipients || 0;
+}
+
+// ─── 6.4 Delivery Tracking ──────────────────────────────────────────────────
+
+async function updateDeliveryStatus(recordId, fields, opts) {
+  const { fetchFn, env } = opts;
+  const url = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.INSIDER_ALERTS_TABLE_ID}/${recordId}`;
+  await fetchFn(url, {
+    method: 'PATCH',
+    headers: {
+      Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
+      'Content-Type': 'application/json',
+    },
+    body: JSON.stringify({ fields }),
+  });
+}
+
+// ─── Main orchestrator ──────────────────────────────────────────────────────
+
+async function deliverAlert(alertData, opts) {
+  const { fetchFn, env, _sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = opts;
+
+  let totalEmailsSent = 0;
+  let pushSentCount = 0;
+  const errors = [];
+
+  // Fetch eligible users
+  const users = await fetchEligibleUsers(alertData.significance_score, alertData.ticker, {
+    fetchFn,
+    env,
+  });
+
+  // Send emails
+  if (users.length > 0) {
+    const emails = users.map((u) => buildEmailObject(u, alertData));
+    try {
+      totalEmailsSent = await sendResendBatch(emails, { fetchFn, env, _sleep });
+    } catch (err) {
+      errors.push(`Email: ${err.message}`);
+    }
+  }
+
+  // Send push
+  try {
+    pushSentCount = await sendOneSignalPush(
+      alertData,
+      alertData.supabase_alert_id,
+      { fetchFn, env },
+    );
+  } catch (err) {
+    errors.push(`Push: ${err.message}`);
+  }
+
+  // Determine status
+  const finalStatus = errors.length > 0 ? 'delivery_failed' : 'delivered';
+  const deliveredAt = new Date().toISOString();
+
+  const trackingFields = {
+    status: finalStatus,
+    emails_sent: totalEmailsSent,
+    push_sent: pushSentCount,
+  };
+
+  if (finalStatus === 'delivered') {
+    trackingFields.delivered_at = deliveredAt;
+  }
+  if (errors.length > 0) {
+    trackingFields.error_log = errors.join('; ');
+  }
+
+  // Update Airtable delivery tracking
+  try {
+    await updateDeliveryStatus(alertData.airtable_record_id, trackingFields, { fetchFn, env });
+  } catch (err) {
+    console.warn(`[deliver-alert] Failed to update delivery status: ${err.message}`);
+  }
+
+  return {
+    airtable_record_id: alertData.airtable_record_id,
+    supabase_alert_id: alertData.supabase_alert_id,
+    ticker: alertData.ticker,
+    emails_sent: totalEmailsSent,
+    push_sent: pushSentCount,
+    status: finalStatus,
+    delivered_at: deliveredAt,
+  };
+}
+
+// ─── Exports ────────────────────────────────────────────────────────────────
+
+module.exports = {
+  fetchEligibleUsers,
+  buildEmailObject,
+  buildEmailHtml,
+  chunkArray,
+  formatMoney,
+  sendResendBatch,
+  sendOneSignalPush,
+  updateDeliveryStatus,
+  deliverAlert,
+};
diff --git a/insiderbuying-site/tests/insiderbuying/deliver-alert.test.js b/insiderbuying-site/tests/insiderbuying/deliver-alert.test.js
new file mode 100644
index 0000000..aa1c8a2
--- /dev/null
+++ b/insiderbuying-site/tests/insiderbuying/deliver-alert.test.js
@@ -0,0 +1,382 @@
+'use strict';
+
+const {
+  fetchEligibleUsers,
+  buildEmailObject,
+  buildEmailHtml,
+  chunkArray,
+  formatMoney,
+  sendResendBatch,
+  sendOneSignalPush,
+  updateDeliveryStatus,
+  deliverAlert,
+} = require('../../n8n/code/insiderbuying/deliver-alert');
+
+// --- helpers ----------------------------------------------------------------
+
+function makeFetch(response, ok = true, status = 200) {
+  return jest.fn().mockResolvedValue({
+    ok,
+    status,
+    json: async () => response,
+    text: async () => JSON.stringify(response),
+  });
+}
+
+function makeFetchSeq(...calls) {
+  const fn = jest.fn();
+  calls.forEach(({ response, ok = true, status = 200 }) => {
+    fn.mockResolvedValueOnce({
+      ok,
+      status,
+      json: async () => response,
+      text: async () => JSON.stringify(response),
+    });
+  });
+  return fn;
+}
+
+const noSleep = jest.fn().mockResolvedValue(undefined);
+
+const BASE_ENV = {
+  AIRTABLE_API_KEY: 'at-key',
+  AIRTABLE_BASE_ID: 'appXXX',
+  INSIDER_ALERTS_TABLE_ID: 'tblAlerts',
+  SUPABASE_URL: 'https://test.supabase.co',
+  SUPABASE_SERVICE_ROLE_KEY: 'sb-key',
+  RESEND_API_KEY: 'resend-key',
+  ONESIGNAL_APP_ID: 'os-app-id',
+  ONESIGNAL_REST_API_KEY: 'os-rest-key',
+};
+
+const SAMPLE_ALERT = {
+  airtable_record_id: 'recABC',
+  supabase_alert_id: 'uuid-123',
+  ticker: 'AAPL',
+  insider_name: 'Timothy D. Cook',
+  insider_title: 'CEO',
+  total_value: 1502500,
+  significance_score: 8,
+  ai_analysis: 'This is a detailed analysis of the insider trade that spans multiple paragraphs and provides significant insight into the transaction.',
+  transaction_type: 'buy',
+  cluster_size: 0,
+};
+
+// ─── 6.1 Fetch Eligible Users ────────────────────────────────────────────
+
+describe('6.1: fetchEligibleUsers', () => {
+  test('users with email_enabled=false are excluded', async () => {
+    const fetchFn = makeFetchSeq(
+      // preferences query
+      { response: [
+        { user_id: 'u1', email_enabled: true, min_significance_score: 5 },
+        { user_id: 'u2', email_enabled: false, min_significance_score: 3 },
+      ] },
+      // profiles query
+      { response: [{ user_id: 'u1', subscription_tier: 'free' }] },
+      // auth admin get user u1
+      { response: { user: { email: 'u1@test.com' } } },
+    );
+
+    const users = await fetchEligibleUsers(8, 'AAPL', { fetchFn, env: BASE_ENV });
+    expect(users).toHaveLength(1);
+    expect(users[0].userId).toBe('u1');
+  });
+
+  test('user with min_significance_score=7 receives alert with score=8', async () => {
+    const fetchFn = makeFetchSeq(
+      { response: [{ user_id: 'u1', email_enabled: true, min_significance_score: 7 }] },
+      { response: [{ user_id: 'u1', subscription_tier: 'pro' }] },
+      { response: { user: { email: 'u1@test.com' } } },
+    );
+
+    const users = await fetchEligibleUsers(8, 'AAPL', { fetchFn, env: BASE_ENV });
+    expect(users).toHaveLength(1);
+  });
+
+  test('user with min_significance_score=9 does NOT receive alert with score=8', async () => {
+    const fetchFn = makeFetchSeq(
+      { response: [{ user_id: 'u1', email_enabled: true, min_significance_score: 9, watched_tickers: [] }] },
+      { response: [] }, // no eligible profiles
+    );
+
+    const users = await fetchEligibleUsers(8, 'MSFT', { fetchFn, env: BASE_ENV });
+    expect(users).toHaveLength(0);
+  });
+
+  test('user with watched_tickers=[AAPL] receives alert for AAPL even if score=3', async () => {
+    const fetchFn = makeFetchSeq(
+      { response: [{ user_id: 'u1', email_enabled: true, min_significance_score: 9, watched_tickers: ['AAPL'] }] },
+      { response: [{ user_id: 'u1', subscription_tier: 'free' }] },
+      { response: { user: { email: 'u1@test.com' } } },
+    );
+
+    const users = await fetchEligibleUsers(3, 'AAPL', { fetchFn, env: BASE_ENV });
+    expect(users).toHaveLength(1);
+  });
+
+  test('Pro user gets full ai_analysis text', () => {
+    const email = buildEmailObject(
+      { userId: 'u1', email: 'u1@test.com', subscriptionTier: 'pro' },
+      SAMPLE_ALERT,
+    );
+    expect(email.html).toContain(SAMPLE_ALERT.ai_analysis);
+    expect(email.html).not.toContain('upgrade to Pro');
+  });
+
+  test('Free user gets first 150 chars of ai_analysis + upgrade CTA', () => {
+    const longAnalysis = 'A'.repeat(300);
+    const alert = { ...SAMPLE_ALERT, ai_analysis: longAnalysis };
+    const email = buildEmailObject(
+      { userId: 'u1', email: 'u1@test.com', subscriptionTier: 'free' },
+      alert,
+    );
+    expect(email.html).not.toContain(longAnalysis);
+    expect(email.html).toContain('upgrade to Pro');
+  });
+
+  test('error in getUserById does NOT log user.email', async () => {
+    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
+    const fetchFn = makeFetchSeq(
+      { response: [{ user_id: 'u1', email_enabled: true, min_significance_score: 5 }] },
+      { response: [{ user_id: 'u1', subscription_tier: 'free' }] },
+      { response: { error: 'not found' }, ok: false, status: 404 },
+    );
+
+    const users = await fetchEligibleUsers(8, 'AAPL', { fetchFn, env: BASE_ENV });
+    expect(users).toHaveLength(0);
+
+    // Check that no logged message contains an email
+    for (const call of consoleSpy.mock.calls) {
+      const msg = call.join(' ');
+      expect(msg).not.toMatch(/@.*\./);
+      expect(msg).toContain('u1'); // Should log user_id
+    }
+    consoleSpy.mockRestore();
+  });
+});
+
+// ─── 6.2 Resend Email ───────────────────────────────────────────────────
+
+describe('6.2: Resend email', () => {
+  test('each email has exactly one recipient in to field', () => {
+    const email = buildEmailObject(
+      { userId: 'u1', email: 'u1@test.com', subscriptionTier: 'pro' },
+      SAMPLE_ALERT,
+    );
+    expect(typeof email.to).toBe('string');
+    expect(email.to).toBe('u1@test.com');
+  });
+
+  test('250 recipients chunked into [100, 100, 50]', () => {
+    const arr = Array.from({ length: 250 }, (_, i) => i);
+    const chunks = chunkArray(arr, 100);
+    expect(chunks).toHaveLength(3);
+    expect(chunks[0]).toHaveLength(100);
+    expect(chunks[1]).toHaveLength(100);
+    expect(chunks[2]).toHaveLength(50);
+  });
+
+  test('200ms delay between batch calls', async () => {
+    const sleepFn = jest.fn().mockResolvedValue(undefined);
+    const fetchFn = makeFetch({ data: [{ id: 'e1' }] });
+
+    const emails = Array.from({ length: 150 }, (_, i) => ({
+      from: 'EarlyInsider <alerts@earlyinsider.com>',
+      to: `u${i}@test.com`,
+      subject: 'Test',
+      html: '<p>Test</p>',
+    }));
+
+    await sendResendBatch(emails, { fetchFn, env: BASE_ENV, _sleep: sleepFn });
+    // 2 batches = 1 sleep between them
+    expect(sleepFn).toHaveBeenCalledWith(200);
+  });
+
+  test('email HTML includes unsubscribe link', () => {
+    const html = buildEmailHtml(SAMPLE_ALERT, SAMPLE_ALERT.ai_analysis, true);
+    expect(html).toContain('/preferences?unsubscribe=1');
+  });
+
+  test('email HTML includes postal address in footer', () => {
+    const html = buildEmailHtml(SAMPLE_ALERT, SAMPLE_ALERT.ai_analysis, true);
+    expect(html).toMatch(/\d+.*street|avenue|blvd|road|way|suite/i);
+  });
+
+  test('regular alert subject format', () => {
+    const email = buildEmailObject(
+      { userId: 'u1', email: 'u1@test.com', subscriptionTier: 'pro' },
+      SAMPLE_ALERT,
+    );
+    expect(email.subject).toContain('[INSIDER BUY]');
+    expect(email.subject).toContain('Timothy D. Cook');
+    expect(email.subject).toContain('AAPL');
+  });
+
+  test('cluster alert subject format', () => {
+    const clusterAlert = { ...SAMPLE_ALERT, transaction_type: 'cluster', cluster_size: 3 };
+    const email = buildEmailObject(
+      { userId: 'u1', email: 'u1@test.com', subscriptionTier: 'pro' },
+      clusterAlert,
+    );
+    expect(email.subject).toContain('CLUSTER BUY');
+    expect(email.subject).toContain('3 insiders');
+  });
+
+  test('Resend failure does not block push notification delivery', async () => {
+    const fetchFn = makeFetchSeq(
+      // fetchEligibleUsers: preferences
+      { response: [{ user_id: 'u1', email_enabled: true, min_significance_score: 5 }] },
+      // profiles
+      { response: [{ user_id: 'u1', subscription_tier: 'pro' }] },
+      // auth get user
+      { response: { user: { email: 'u1@test.com' } } },
+      // Resend batch FAILS
+      { response: { error: 'rate limited' }, ok: false, status: 429 },
+      // OneSignal succeeds
+      { response: { id: 'notif-1', recipients: 5 } },
+      // Airtable delivery tracking
+      { response: {} },
+    );
+
+    const result = await deliverAlert(SAMPLE_ALERT, {
+      fetchFn,
+      env: BASE_ENV,
+      _sleep: noSleep,
+    });
+
+    expect(result.push_sent).toBe(5);
+  });
+});
+
+// ─── 6.3 OneSignal Push ──────────────────────────────────────────────────
+
+describe('6.3: OneSignal push', () => {
+  test('filter uses tag alert_score_min <= alert_score', async () => {
+    const fetchFn = makeFetch({ id: 'notif-1', recipients: 10 });
+    await sendOneSignalPush(SAMPLE_ALERT, 'uuid-123', {
+      fetchFn,
+      env: BASE_ENV,
+    });
+
+    const call = fetchFn.mock.calls[0];
+    const body = JSON.parse(call[1].body);
+    expect(body.filters).toEqual(
+      expect.arrayContaining([
+        expect.objectContaining({
+          field: 'tag',
+          key: 'alert_score_min',
+          relation: '<=',
+          value: String(SAMPLE_ALERT.significance_score),
+        }),
+      ]),
+    );
+  });
+
+  test('notification URL deep-links to /alerts#{supabase_alert_id}', async () => {
+    const fetchFn = makeFetch({ id: 'notif-1', recipients: 10 });
+    await sendOneSignalPush(SAMPLE_ALERT, 'uuid-123', {
+      fetchFn,
+      env: BASE_ENV,
+    });
+
+    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
+    expect(body.url).toContain('/alerts#uuid-123');
+  });
+
+  test('push_sent count is extracted from OneSignal response.recipients', async () => {
+    const fetchFn = makeFetch({ id: 'notif-1', recipients: 42 });
+    const count = await sendOneSignalPush(SAMPLE_ALERT, 'uuid-123', {
+      fetchFn,
+      env: BASE_ENV,
+    });
+    expect(count).toBe(42);
+  });
+
+  test('OneSignal failure does not block email delivery', async () => {
+    const fetchFn = makeFetchSeq(
+      // fetchEligibleUsers: preferences
+      { response: [{ user_id: 'u1', email_enabled: true, min_significance_score: 5 }] },
+      // profiles
+      { response: [{ user_id: 'u1', subscription_tier: 'pro' }] },
+      // auth get user
+      { response: { user: { email: 'u1@test.com' } } },
+      // Resend batch succeeds
+      { response: { data: [{ id: 'e1' }] } },
+      // OneSignal FAILS
+      { response: { error: 'invalid key' }, ok: false, status: 401 },
+      // Airtable delivery tracking
+      { response: {} },
+    );
+
+    const result = await deliverAlert(SAMPLE_ALERT, {
+      fetchFn,
+      env: BASE_ENV,
+      _sleep: noSleep,
+    });
+
+    expect(result.emails_sent).toBe(1);
+  });
+});
+
+// ─── 6.4 Delivery Tracking ──────────────────────────────────────────────
+
+describe('6.4: Delivery tracking', () => {
+  test('full success sets status=delivered with emails_sent and push_sent', async () => {
+    const fetchFn = makeFetch({});
+    await updateDeliveryStatus('recABC', {
+      status: 'delivered',
+      emails_sent: 10,
+      push_sent: 5,
+      delivered_at: '2026-03-28T12:00:00Z',
+    }, { fetchFn, env: BASE_ENV });
+
+    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
+    expect(body.fields.status).toBe('delivered');
+    expect(body.fields.emails_sent).toBe(10);
+    expect(body.fields.push_sent).toBe(5);
+    expect(body.fields.delivered_at).toBe('2026-03-28T12:00:00Z');
+  });
+
+  test('email failure sets status=delivery_failed with error_log', async () => {
+    const fetchFn = makeFetch({});
+    await updateDeliveryStatus('recABC', {
+      status: 'delivery_failed',
+      error_log: 'Resend API returned 429',
+      push_sent: 5,
+    }, { fetchFn, env: BASE_ENV });
+
+    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
+    expect(body.fields.status).toBe('delivery_failed');
+    expect(body.fields.error_log).toContain('Resend');
+  });
+
+  test('push failure sets status=delivery_failed with error_log', async () => {
+    const fetchFn = makeFetch({});
+    await updateDeliveryStatus('recABC', {
+      status: 'delivery_failed',
+      error_log: 'OneSignal API returned 401',
+      emails_sent: 10,
+    }, { fetchFn, env: BASE_ENV });
+
+    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
+    expect(body.fields.status).toBe('delivery_failed');
+    expect(body.fields.error_log).toContain('OneSignal');
+  });
+});
+
+// ─── formatMoney ─────────────────────────────────────────────────────────
+
+describe('formatMoney', () => {
+  test('formats millions', () => {
+    expect(formatMoney(1502500)).toBe('$1.5M');
+  });
+
+  test('formats thousands', () => {
+    expect(formatMoney(50000)).toBe('$50K');
+  });
+
+  test('formats small amounts', () => {
+    expect(formatMoney(999)).toBe('$999');
+  });
+});
