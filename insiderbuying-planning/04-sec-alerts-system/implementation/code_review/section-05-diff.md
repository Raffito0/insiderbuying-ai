diff --git a/insiderbuying-site/n8n/code/insiderbuying/write-persistence.js b/insiderbuying-site/n8n/code/insiderbuying/write-persistence.js
new file mode 100644
index 0000000..e735e9c
--- /dev/null
+++ b/insiderbuying-site/n8n/code/insiderbuying/write-persistence.js
@@ -0,0 +1,446 @@
+'use strict';
+
+// ─── write-persistence.js ──────────────────────────────────────────────────
+// Persistence layer for the W4 InsiderBuying.ai pipeline.
+// Runs after scoring (score-alert.js) and AI analysis (analyze-alert.js).
+// Writes each filing individually to Airtable then Supabase, updates
+// Monitor_State, creates cluster summaries, and handles error alerting.
+// ────────────────────────────────────────────────────────────────────────────
+
+// ─── 5.1 Create Airtable Record ────────────────────────────────────────────
+
+/**
+ * Create a record in Airtable Insider_Alerts for a scored+analyzed filing.
+ * Returns the Airtable record ID on success, throws on failure.
+ */
+async function createAirtableRecord(filing, opts) {
+  const { fetchFn, env } = opts;
+  const url = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.INSIDER_ALERTS_TABLE_ID}`;
+
+  const fields = {
+    dedup_key: filing.dedup_key,
+    ticker: filing.ticker,
+    company_name: filing.company_name,
+    insider_name: filing.insider_name,
+    insider_title: filing.insider_title,
+    insider_category: filing.insider_category,
+    transaction_type: filing.transaction_type,
+    shares: filing.shares,
+    price_per_share: filing.price_per_share,
+    total_value: filing.total_value,
+    transaction_date: filing.transaction_date,
+    filing_date: filing.filing_date,
+    significance_score: filing.significance_score,
+    score_reasoning: filing.score_reasoning,
+    ai_analysis: filing.ai_analysis || '',
+    is_cluster_buy: filing.is_cluster_buy || false,
+    cluster_size: filing.cluster_size || 0,
+    raw_filing_data: filing.raw_filing_data,
+    status: 'processed',
+  };
+
+  // Only include cluster_id if present
+  if (filing.cluster_id) {
+    fields.cluster_id = filing.cluster_id;
+  }
+
+  const res = await fetchFn(url, {
+    method: 'POST',
+    headers: {
+      Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
+      'Content-Type': 'application/json',
+    },
+    body: JSON.stringify({ fields }),
+  });
+
+  const data = await res.json();
+  if (!data.id) {
+    throw new Error(`Airtable create failed: ${JSON.stringify(data)}`);
+  }
+  return data.id;
+}
+
+// ─── 5.2 Insert to Supabase ────────────────────────────────────────────────
+
+/**
+ * Insert filing into Supabase insider_alerts.
+ * Uses ON CONFLICT (dedup_key) DO NOTHING via Prefer header.
+ * Returns the UUID on insert, null on conflict (graceful dedup).
+ */
+async function insertToSupabase(filing, opts) {
+  const { fetchFn, env } = opts;
+  const url =
+    `${env.SUPABASE_URL}/rest/v1/insider_alerts?on_conflict=dedup_key`;
+
+  const body = {
+    dedup_key: filing.dedup_key,
+    ticker: filing.ticker,
+    company_name: filing.company_name,
+    insider_name: filing.insider_name,
+    insider_title: filing.insider_title,
+    insider_category: filing.insider_category,
+    transaction_type: filing.transaction_type,
+    shares: filing.shares,
+    price_per_share: filing.price_per_share,
+    total_value: filing.total_value,
+    transaction_date: filing.transaction_date,
+    filing_date: filing.filing_date,
+    significance_score: filing.significance_score,
+    score_reasoning: filing.score_reasoning,
+    ai_analysis: filing.ai_analysis || null,
+    is_cluster_buy: filing.is_cluster_buy || false,
+    cluster_id: filing.cluster_id || null,
+    cluster_size: filing.cluster_size || 0,
+    raw_filing_data: filing.raw_filing_data,
+    status: 'processed',
+  };
+
+  const res = await fetchFn(url, {
+    method: 'POST',
+    headers: {
+      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
+      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
+      'Content-Type': 'application/json',
+      Prefer: 'return=representation,resolution=merge-duplicates',
+    },
+    body: JSON.stringify(body),
+  });
+
+  const data = await res.json();
+  if (Array.isArray(data) && data.length > 0 && data[0].id) {
+    return data[0].id;
+  }
+  // Conflict / empty = graceful no-op
+  return null;
+}
+
+// ─── 5.1+5.2 Combined per-filing write ──────────────────────────────────────
+
+/**
+ * Write a single filing to Airtable then Supabase, cross-reference IDs.
+ * Mutates ctx (failureCount, firstError, failedFilings, successfulFilings).
+ */
+async function writeFilingPersistence(filing, ctx, opts) {
+  const { fetchFn, env } = opts;
+  let airtableRecordId = null;
+
+  // Step 1: Create Airtable record
+  try {
+    airtableRecordId = await createAirtableRecord(filing, { fetchFn, env });
+  } catch (err) {
+    ctx.failureCount++;
+    if (!ctx.firstError) ctx.firstError = `Airtable create for ${filing.dedup_key}: ${err.message}`;
+    ctx.failedFilings.push({ ...filing, _lastError: err.message });
+    return;
+  }
+
+  // Step 2: Insert to Supabase
+  let supabaseId = null;
+  try {
+    supabaseId = await insertToSupabase(filing, { fetchFn, env });
+  } catch (err) {
+    ctx.failureCount++;
+    if (!ctx.firstError) ctx.firstError = `Supabase insert for ${filing.dedup_key}: ${err.message}`;
+    ctx.failedFilings.push({ ...filing, airtable_record_id: airtableRecordId, _lastError: err.message });
+    // Attempt to mark Airtable record as failed
+    try {
+      await patchAirtableRecord(airtableRecordId, { status: 'failed' }, { fetchFn, env });
+    } catch (_) { /* non-critical */ }
+    return;
+  }
+
+  // Step 3: Patch Airtable with supabase_id (non-critical)
+  if (supabaseId) {
+    try {
+      await patchAirtableRecord(airtableRecordId, { supabase_id: supabaseId }, { fetchFn, env });
+    } catch (err) {
+      console.warn(`[write-persistence] Failed to patch supabase_id on ${airtableRecordId}: ${err.message}`);
+    }
+  }
+
+  // Step 4: Success
+  ctx.successfulFilings.push({ ...filing, airtable_record_id: airtableRecordId, supabase_id: supabaseId });
+}
+
+// ─── Helper: PATCH Airtable record ──────────────────────────────────────────
+
+async function patchAirtableRecord(recordId, fields, opts) {
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
+// ─── 5.3 Monitor_State Update ───────────────────────────────────────────────
+
+/**
+ * Update Monitor_State after all filings processed.
+ * Rolls back timestamp to min(failed_filing.filing_date) on partial failure,
+ * excluding dead-letter filings (retry_count > 3).
+ */
+async function updateMonitorState(workflowName, successfulFilings, failedFilings, firstError, opts) {
+  const { fetchFn, env } = opts;
+
+  // Fetch the Monitor_State record for this workflow
+  const stateUrl =
+    `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.MONITOR_STATE_TABLE_ID}` +
+    `?filterByFormula=${encodeURIComponent(`{name}='${workflowName}'`)}`;
+
+  const stateRes = await fetchFn(stateUrl, {
+    headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` },
+  });
+  const stateData = await stateRes.json();
+  const stateRecord = stateData.records && stateData.records[0];
+  if (!stateRecord) return;
+
+  // Filter out dead-letter filings from timestamp rollback
+  const retryableFailures = failedFilings.filter((f) => !f.retry_count || f.retry_count <= 3);
+
+  let timestamp;
+  let status;
+
+  if (failedFilings.length === 0) {
+    // All succeeded
+    timestamp = new Date().toISOString();
+    status = 'success';
+  } else if (retryableFailures.length === 0) {
+    // All failures are dead-lettered — advance timestamp
+    timestamp = new Date().toISOString();
+    status = 'error';
+  } else {
+    // Roll back to earliest retryable failed filing date
+    const dates = retryableFailures
+      .map((f) => f.filing_date)
+      .filter(Boolean)
+      .sort();
+    timestamp = dates[0] || new Date().toISOString();
+    status = 'error';
+  }
+
+  const fields = {
+    last_check_timestamp: timestamp,
+    last_run_status: status,
+  };
+  if (firstError && failedFilings.length > 0) {
+    fields.last_run_error = firstError;
+  }
+
+  await fetchFn(
+    `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.MONITOR_STATE_TABLE_ID}/${stateRecord.id}`,
+    {
+      method: 'PATCH',
+      headers: {
+        Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
+        'Content-Type': 'application/json',
+      },
+      body: JSON.stringify({ fields }),
+    },
+  );
+}
+
+// ─── 5.3 Dead-Letter Handler ────────────────────────────────────────────────
+
+/**
+ * Mark a filing as dead_letter in Airtable and send Telegram notification.
+ */
+async function handleDeadLetter(filing, airtableRecordId, workflowName, opts) {
+  const { fetchFn, env } = opts;
+
+  // PATCH Airtable status
+  await patchAirtableRecord(airtableRecordId, { status: 'dead_letter' }, { fetchFn, env });
+
+  // Send Telegram notification
+  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_MONITORING_CHAT_ID) {
+    const msg = encodeURIComponent(
+      `Dead letter: ${workflowName}\n` +
+      `Key: ${filing.dedup_key}\n` +
+      `Ticker: ${filing.ticker}\n` +
+      `Error: ${filing._lastError || 'unknown'}`,
+    );
+    await fetchFn(
+      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage` +
+      `?chat_id=${env.TELEGRAM_MONITORING_CHAT_ID}&text=${msg}`,
+    ).catch(() => {});
+  }
+}
+
+// ─── 5.4 Cluster Alert Creation ─────────────────────────────────────────────
+
+/**
+ * Create or update a cluster summary record in Airtable + Supabase.
+ * Returns { created: bool, triggerW5: bool }.
+ */
+async function createOrUpdateClusterSummary(clusterId, clusterFilings, opts) {
+  const { fetchFn, env } = opts;
+
+  // Calculate cluster score
+  const maxScore = Math.max(...clusterFilings.map((f) => f.significance_score || 0));
+  const newScore = Math.min(10, maxScore + 3);
+  const clusterSize = clusterFilings.length;
+  const ticker = clusterFilings[0].ticker;
+
+  // Build composite analysis
+  const memberSummaries = clusterFilings
+    .map((f) => `${f.insider_name} (${f.insider_title}): $${(f.total_value || 0).toLocaleString()}`)
+    .join('; ');
+  const analysisText = `Cluster buy alert: ${clusterSize} insiders at ${ticker} buying within 7 days. ${memberSummaries}.`;
+
+  // Check for existing cluster summary in Airtable
+  const searchUrl =
+    `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.INSIDER_ALERTS_TABLE_ID}` +
+    `?filterByFormula=${encodeURIComponent(`AND({transaction_type}='cluster',{cluster_id}='${clusterId}')`)}`;
+
+  const searchRes = await fetchFn(searchUrl, {
+    headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` },
+  });
+  const searchData = await searchRes.json();
+  const existing = searchData.records && searchData.records[0];
+
+  if (!existing) {
+    // Create new cluster summary
+    const fields = {
+      dedup_key: `cluster_${clusterId}`,
+      ticker,
+      company_name: clusterFilings[0].company_name,
+      insider_name: `${clusterSize} Insiders`,
+      insider_title: 'Multiple',
+      insider_category: 'Cluster',
+      transaction_type: 'cluster',
+      cluster_id: clusterId,
+      is_cluster_buy: true,
+      cluster_size: clusterSize,
+      significance_score: newScore,
+      ai_analysis: analysisText,
+      status: 'processed',
+    };
+
+    const createRes = await fetchFn(
+      `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.INSIDER_ALERTS_TABLE_ID}`,
+      {
+        method: 'POST',
+        headers: {
+          Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
+          'Content-Type': 'application/json',
+        },
+        body: JSON.stringify({ fields }),
+      },
+    );
+    const createData = await createRes.json();
+
+    // Also insert to Supabase
+    const supabaseId = await insertToSupabase(
+      { ...fields, raw_filing_data: JSON.stringify({ cluster_members: memberSummaries }) },
+      { fetchFn, env },
+    );
+
+    // Patch Airtable with supabase_id
+    if (supabaseId && createData.id) {
+      try {
+        await patchAirtableRecord(createData.id, { supabase_id: supabaseId }, { fetchFn, env });
+      } catch (_) { /* non-critical */ }
+    }
+
+    return { created: true, triggerW5: true };
+  }
+
+  // Update existing cluster summary
+  const oldScore = existing.fields.significance_score || 0;
+  const oldSize = existing.fields.cluster_size || 0;
+
+  const updateFields = {
+    cluster_size: oldSize + clusterFilings.length,
+    significance_score: newScore,
+    ai_analysis: analysisText,
+  };
+
+  await fetchFn(
+    `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.INSIDER_ALERTS_TABLE_ID}/${existing.id}`,
+    {
+      method: 'PATCH',
+      headers: {
+        Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
+        'Content-Type': 'application/json',
+      },
+      body: JSON.stringify({ fields: updateFields }),
+    },
+  );
+
+  // Only re-trigger W5 if score increased by >= 2
+  const scoreDelta = newScore - oldScore;
+  return { created: false, triggerW5: scoreDelta >= 2 };
+}
+
+// ─── 5.5 Post-Processing (Monitor State + Error Alert + Clusters) ──────────
+
+/**
+ * Run all post-processing after filings are written.
+ * Called once at end of run.
+ */
+async function runPostProcessing(
+  workflowName,
+  successfulFilings,
+  failedFilings,
+  failureCount,
+  firstError,
+  allFilings,
+  opts,
+) {
+  const { fetchFn, env } = opts;
+
+  // Update Monitor_State
+  await updateMonitorState(workflowName, successfulFilings, failedFilings, firstError, {
+    fetchFn,
+    env,
+  });
+
+  // Telegram alert if too many failures
+  if (failureCount > 5 && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_MONITORING_CHAT_ID) {
+    const msg = encodeURIComponent(
+      `W4 ${workflowName}: ${failureCount} failures\nFirst error: ${firstError}`,
+    );
+    await fetchFn(
+      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage` +
+      `?chat_id=${env.TELEGRAM_MONITORING_CHAT_ID}&text=${msg}`,
+    ).catch(() => {});
+  }
+
+  // Cluster summaries
+  const clusterGroups = new Map();
+  for (const f of allFilings) {
+    if (f.cluster_id) {
+      if (!clusterGroups.has(f.cluster_id)) clusterGroups.set(f.cluster_id, []);
+      clusterGroups.get(f.cluster_id).push(f);
+    }
+  }
+
+  const clusterResults = [];
+  for (const [cid, filings] of clusterGroups) {
+    try {
+      const result = await createOrUpdateClusterSummary(cid, filings, { fetchFn, env });
+      clusterResults.push({ clusterId: cid, ...result });
+    } catch (err) {
+      console.warn(`[write-persistence] Cluster summary failed for ${cid}: ${err.message}`);
+    }
+  }
+
+  return clusterResults;
+}
+
+// ─── Exports ────────────────────────────────────────────────────────────────
+
+module.exports = {
+  createAirtableRecord,
+  insertToSupabase,
+  writeFilingPersistence,
+  updateMonitorState,
+  handleDeadLetter,
+  createOrUpdateClusterSummary,
+  runPostProcessing,
+  patchAirtableRecord,
+};
diff --git a/insiderbuying-site/tests/insiderbuying/write-persistence.test.js b/insiderbuying-site/tests/insiderbuying/write-persistence.test.js
new file mode 100644
index 0000000..989c077
--- /dev/null
+++ b/insiderbuying-site/tests/insiderbuying/write-persistence.test.js
@@ -0,0 +1,447 @@
+'use strict';
+
+const {
+  createAirtableRecord,
+  insertToSupabase,
+  updateMonitorState,
+  handleDeadLetter,
+  createOrUpdateClusterSummary,
+  writeFilingPersistence,
+  runPostProcessing,
+} = require('../../n8n/code/insiderbuying/write-persistence');
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
+  MONITOR_STATE_TABLE_ID: 'tblState',
+  SUPABASE_URL: 'https://test.supabase.co',
+  SUPABASE_SERVICE_ROLE_KEY: 'sb-key',
+  TELEGRAM_BOT_TOKEN: 'tg-token',
+  TELEGRAM_MONITORING_CHAT_ID: '-100123',
+};
+
+const SAMPLE_FILING = {
+  ticker: 'AAPL',
+  company_name: 'Apple Inc.',
+  insider_name: 'Timothy D. Cook',
+  insider_title: 'Chief Executive Officer',
+  insider_category: 'C-Suite',
+  transaction_type: 'buy',
+  shares: 10000,
+  price_per_share: 150.25,
+  total_value: 1502500,
+  transaction_date: '2026-03-20',
+  filing_date: '2026-03-22',
+  significance_score: 8,
+  score_reasoning: 'Large C-Suite purchase signals confidence.',
+  ai_analysis: 'Two paragraphs of analysis...\n\nSecond paragraph here.',
+  cluster_id: null,
+  is_cluster_buy: false,
+  cluster_size: 0,
+  dedup_key: 'AAPL_Timothy_D._Cook_2026-03-20_10000',
+  raw_filing_data: '{"name":"Timothy D. Cook"}',
+};
+
+// ─── 5.1 Airtable Record ──────────────────────────────────────────────────
+
+describe('5.1: createAirtableRecord', () => {
+  test('includes all required fields including dedup_key and status=processed', async () => {
+    const fetchFn = makeFetch({ id: 'recABC123', fields: {} });
+    const result = await createAirtableRecord(SAMPLE_FILING, {
+      fetchFn,
+      env: BASE_ENV,
+    });
+
+    expect(result).toBe('recABC123');
+    expect(fetchFn).toHaveBeenCalledTimes(1);
+
+    const call = fetchFn.mock.calls[0];
+    const body = JSON.parse(call[1].body);
+    expect(body.fields.dedup_key).toBe(SAMPLE_FILING.dedup_key);
+    expect(body.fields.status).toBe('processed');
+    expect(body.fields.ticker).toBe('AAPL');
+    expect(body.fields.company_name).toBe('Apple Inc.');
+    expect(body.fields.insider_name).toBe('Timothy D. Cook');
+    expect(body.fields.insider_title).toBe('Chief Executive Officer');
+    expect(body.fields.insider_category).toBe('C-Suite');
+    expect(body.fields.transaction_type).toBe('buy');
+    expect(body.fields.shares).toBe(10000);
+    expect(body.fields.price_per_share).toBe(150.25);
+    expect(body.fields.total_value).toBe(1502500);
+    expect(body.fields.transaction_date).toBe('2026-03-20');
+    expect(body.fields.filing_date).toBe('2026-03-22');
+  });
+
+  test('includes score_reasoning from Haiku', async () => {
+    const fetchFn = makeFetch({ id: 'recABC123', fields: {} });
+    await createAirtableRecord(SAMPLE_FILING, { fetchFn, env: BASE_ENV });
+
+    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
+    expect(body.fields.score_reasoning).toBe('Large C-Suite purchase signals confidence.');
+  });
+
+  test('includes ai_analysis (may be null)', async () => {
+    const fetchFn = makeFetch({ id: 'recABC123', fields: {} });
+
+    // With analysis
+    await createAirtableRecord(SAMPLE_FILING, { fetchFn, env: BASE_ENV });
+    let body = JSON.parse(fetchFn.mock.calls[0][1].body);
+    expect(body.fields.ai_analysis).toBe(SAMPLE_FILING.ai_analysis);
+
+    // With null analysis
+    const filingNoAnalysis = { ...SAMPLE_FILING, ai_analysis: null };
+    await createAirtableRecord(filingNoAnalysis, { fetchFn, env: BASE_ENV });
+    body = JSON.parse(fetchFn.mock.calls[1][1].body);
+    expect(body.fields.ai_analysis).toBe('');
+  });
+
+  test('stores raw_filing_data as JSON string', async () => {
+    const fetchFn = makeFetch({ id: 'recABC123', fields: {} });
+    await createAirtableRecord(SAMPLE_FILING, { fetchFn, env: BASE_ENV });
+
+    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
+    expect(body.fields.raw_filing_data).toBe('{"name":"Timothy D. Cook"}');
+  });
+});
+
+// ─── 5.2 Supabase Insert ─────────────────────────────────────────────────
+
+describe('5.2: insertToSupabase', () => {
+  test('uses onConflict dedup_key with ignore-duplicates header', async () => {
+    const fetchFn = makeFetch([{ id: 'uuid-123' }]);
+    await insertToSupabase(SAMPLE_FILING, { fetchFn, env: BASE_ENV });
+
+    const call = fetchFn.mock.calls[0];
+    expect(call[0]).toContain('/rest/v1/insider_alerts');
+    expect(call[1].headers.Prefer).toContain('resolution=merge-duplicates');
+    const url = call[0];
+    expect(url).toContain('on_conflict=dedup_key');
+  });
+
+  test('duplicate insert returns gracefully, does not throw', async () => {
+    // Supabase returns empty array on conflict with DO NOTHING
+    const fetchFn = makeFetch([]);
+    const result = await insertToSupabase(SAMPLE_FILING, { fetchFn, env: BASE_ENV });
+    expect(result).toBeNull(); // no ID returned for duplicate
+  });
+
+  test('returned supabase_id (UUID) is extracted', async () => {
+    const fetchFn = makeFetch([{ id: 'abc-def-123' }]);
+    const result = await insertToSupabase(SAMPLE_FILING, { fetchFn, env: BASE_ENV });
+    expect(result).toBe('abc-def-123');
+  });
+});
+
+// ─── 5.3 Monitor_State Update ────────────────────────────────────────────
+
+describe('5.3: updateMonitorState', () => {
+  test('all-success run sets last_check_timestamp to approximately now()', async () => {
+    const fetchFn = makeFetchSeq(
+      { response: { records: [{ id: 'recState1', fields: { name: 'market' } }] } },
+      { response: {} }, // PATCH response
+    );
+
+    await updateMonitorState('market', [], [], null, { fetchFn, env: BASE_ENV });
+
+    const patchCall = fetchFn.mock.calls[1];
+    const body = JSON.parse(patchCall[1].body);
+    expect(body.fields.last_run_status).toBe('success');
+    // Timestamp should be close to now
+    const ts = new Date(body.fields.last_check_timestamp);
+    expect(Date.now() - ts.getTime()).toBeLessThan(5000);
+  });
+
+  test('partial-failure run rolls back timestamp to min(failed_filing.filing_date)', async () => {
+    const fetchFn = makeFetchSeq(
+      { response: { records: [{ id: 'recState1', fields: { name: 'market' } }] } },
+      { response: {} },
+    );
+    const failedFilings = [
+      { filing_date: '2026-03-20' },
+      { filing_date: '2026-03-18' },
+      { filing_date: '2026-03-22' },
+    ];
+
+    await updateMonitorState('market', [], failedFilings, 'some error', {
+      fetchFn,
+      env: BASE_ENV,
+    });
+
+    const body = JSON.parse(fetchFn.mock.calls[1][1].body);
+    expect(body.fields.last_check_timestamp).toBe('2026-03-18');
+    expect(body.fields.last_run_status).toBe('error');
+    expect(body.fields.last_run_error).toBe('some error');
+  });
+
+  test('filing with retry_count > 3 is marked dead_letter, timestamp NOT held back', async () => {
+    const fetchFn = makeFetchSeq(
+      { response: { records: [{ id: 'recState1', fields: { name: 'market' } }] } },
+      { response: {} },
+    );
+    const failedFilings = [
+      { filing_date: '2026-03-18', retry_count: 4, airtable_record_id: 'recDL1' },
+    ];
+
+    await updateMonitorState('market', [{ filing_date: '2026-03-22' }], failedFilings, 'err', {
+      fetchFn,
+      env: BASE_ENV,
+    });
+
+    // Dead letter filing should not hold back the timestamp
+    const body = JSON.parse(fetchFn.mock.calls[1][1].body);
+    const ts = new Date(body.fields.last_check_timestamp);
+    // Should advance to now() since the only failed filing is dead-lettered
+    expect(Date.now() - ts.getTime()).toBeLessThan(5000);
+  });
+
+  test('dead-letter filing triggers Telegram notification', async () => {
+    const fetchFn = makeFetchSeq(
+      { response: { id: 'recDL1', fields: {} } }, // Airtable PATCH
+      { response: {} }, // Telegram sendMessage
+    );
+
+    await handleDeadLetter(
+      { dedup_key: 'AAPL_Cook_2026-03-20_10000', ticker: 'AAPL', _lastError: 'FD API down' },
+      'recDL1',
+      'market',
+      { fetchFn, env: BASE_ENV },
+    );
+
+    // Should have called Airtable PATCH and Telegram
+    expect(fetchFn).toHaveBeenCalledTimes(2);
+    const tgCall = fetchFn.mock.calls[1][0];
+    expect(tgCall).toContain('api.telegram.org');
+    expect(tgCall).toContain('sendMessage');
+  });
+
+  test('last_run_status = error when any filing fails', async () => {
+    const fetchFn = makeFetchSeq(
+      { response: { records: [{ id: 'recState1', fields: { name: 'market' } }] } },
+      { response: {} },
+    );
+
+    await updateMonitorState('market', [SAMPLE_FILING], [{ filing_date: '2026-03-18' }], 'err', {
+      fetchFn,
+      env: BASE_ENV,
+    });
+
+    const body = JSON.parse(fetchFn.mock.calls[1][1].body);
+    expect(body.fields.last_run_status).toBe('error');
+  });
+});
+
+// ─── 5.4 Cluster Alert Creation ──────────────────────────────────────────
+
+describe('5.4: createOrUpdateClusterSummary', () => {
+  const clusterFilings = [
+    { ...SAMPLE_FILING, cluster_id: 'cluster-1', is_cluster_buy: true, significance_score: 7, insider_name: 'Tim Cook', insider_title: 'CEO', total_value: 1500000 },
+    { ...SAMPLE_FILING, cluster_id: 'cluster-1', is_cluster_buy: true, significance_score: 6, insider_name: 'Luca Maestri', insider_title: 'CFO', total_value: 800000 },
+    { ...SAMPLE_FILING, cluster_id: 'cluster-1', is_cluster_buy: true, significance_score: 5, insider_name: 'Jeff Williams', insider_title: 'COO', total_value: 500000 },
+  ];
+
+  test('3 cluster members in one run creates exactly 1 cluster summary record', async () => {
+    const fetchFn = makeFetchSeq(
+      // Search for existing cluster summary: none found
+      { response: { records: [] } },
+      // Create new Airtable record
+      { response: { id: 'recCluster1', fields: {} } },
+      // Insert to Supabase
+      { response: [{ id: 'uuid-cluster-1' }] },
+      // Patch Airtable with supabase_id
+      { response: {} },
+    );
+
+    const result = await createOrUpdateClusterSummary('cluster-1', clusterFilings, {
+      fetchFn,
+      env: BASE_ENV,
+    });
+
+    expect(result.created).toBe(true);
+    expect(result.triggerW5).toBe(true);
+  });
+
+  test('cluster summary has transaction_type = cluster', async () => {
+    const fetchFn = makeFetchSeq(
+      { response: { records: [] } },
+      { response: { id: 'recCluster1', fields: {} } },
+      { response: [{ id: 'uuid-cluster-1' }] },
+      { response: {} },
+    );
+
+    await createOrUpdateClusterSummary('cluster-1', clusterFilings, {
+      fetchFn,
+      env: BASE_ENV,
+    });
+
+    // The CREATE call is the second call
+    const createBody = JSON.parse(fetchFn.mock.calls[1][1].body);
+    expect(createBody.fields.transaction_type).toBe('cluster');
+  });
+
+  test('cluster summary significance_score = min(10, max_individual_score + 3)', async () => {
+    const fetchFn = makeFetchSeq(
+      { response: { records: [] } },
+      { response: { id: 'recCluster1', fields: {} } },
+      { response: [{ id: 'uuid-cluster-1' }] },
+      { response: {} },
+    );
+
+    await createOrUpdateClusterSummary('cluster-1', clusterFilings, {
+      fetchFn,
+      env: BASE_ENV,
+    });
+
+    const createBody = JSON.parse(fetchFn.mock.calls[1][1].body);
+    // max individual score = 7, so cluster score = min(10, 7+3) = 10
+    expect(createBody.fields.significance_score).toBe(10);
+  });
+
+  test('second run with 4th member updates existing summary (not new row)', async () => {
+    const fetchFn = makeFetchSeq(
+      // Search finds existing cluster summary with score 8
+      {
+        response: {
+          records: [{
+            id: 'recCluster1',
+            fields: {
+              transaction_type: 'cluster',
+              cluster_id: 'cluster-1',
+              significance_score: 8,
+              cluster_size: 3,
+            },
+          }],
+        },
+      },
+      // PATCH existing record
+      { response: {} },
+    );
+
+    const newMember = { ...SAMPLE_FILING, cluster_id: 'cluster-1', is_cluster_buy: true, significance_score: 6 };
+    const result = await createOrUpdateClusterSummary('cluster-1', [newMember], {
+      fetchFn,
+      env: BASE_ENV,
+    });
+
+    expect(result.created).toBe(false);
+    // Score delta: new max(6)+3=9 vs existing 8. delta=1 < 2 so no re-trigger
+  });
+
+  test('cluster summary update does NOT re-trigger W5 if score delta < 2', async () => {
+    const fetchFn = makeFetchSeq(
+      {
+        response: {
+          records: [{
+            id: 'recCluster1',
+            fields: { significance_score: 9, cluster_size: 3, cluster_id: 'cluster-1', transaction_type: 'cluster' },
+          }],
+        },
+      },
+      { response: {} },
+    );
+
+    const result = await createOrUpdateClusterSummary('cluster-1',
+      [{ ...SAMPLE_FILING, significance_score: 7 }],
+      { fetchFn, env: BASE_ENV },
+    );
+
+    // new score = min(10, 7+3) = 10, old = 9, delta = 1 < 2
+    expect(result.triggerW5).toBe(false);
+  });
+
+  test('cluster summary update DOES re-trigger W5 if score increases >= 2', async () => {
+    const fetchFn = makeFetchSeq(
+      {
+        response: {
+          records: [{
+            id: 'recCluster1',
+            fields: { significance_score: 7, cluster_size: 2, cluster_id: 'cluster-1', transaction_type: 'cluster' },
+          }],
+        },
+      },
+      { response: {} },
+    );
+
+    const result = await createOrUpdateClusterSummary('cluster-1',
+      [{ ...SAMPLE_FILING, significance_score: 8 }],
+      { fetchFn, env: BASE_ENV },
+    );
+
+    // new score = min(10, 8+3) = 10, old = 7, delta = 3 >= 2
+    expect(result.triggerW5).toBe(true);
+  });
+});
+
+// ─── 5.5 Error Counting ──────────────────────────────────────────────────
+
+describe('5.5: writeFilingPersistence error counting', () => {
+  test('failureCount increments on each filing failure', async () => {
+    const fetchFn = jest.fn().mockRejectedValue(new Error('Airtable down'));
+
+    const ctx = { failureCount: 0, firstError: null, failedFilings: [], successfulFilings: [] };
+    await writeFilingPersistence(SAMPLE_FILING, ctx, { fetchFn, env: BASE_ENV });
+
+    expect(ctx.failureCount).toBe(1);
+    expect(ctx.firstError).toContain('Airtable down');
+  });
+
+  test('failureCount <= 5 does NOT trigger Telegram alert in runPostProcessing', async () => {
+    const fetchFn = makeFetchSeq(
+      { response: { records: [{ id: 'recState1', fields: { name: 'market' } }] } },
+      { response: {} },
+    );
+
+    await runPostProcessing('market', [SAMPLE_FILING], [], 3, 'err', [], {
+      fetchFn,
+      env: BASE_ENV,
+    });
+
+    // Only 2 calls: state lookup + state update. No Telegram call
+    expect(fetchFn).toHaveBeenCalledTimes(2);
+  });
+
+  test('failureCount > 5 triggers Telegram alert in runPostProcessing', async () => {
+    const fetchFn = makeFetchSeq(
+      { response: { records: [{ id: 'recState1', fields: { name: 'market' } }] } },
+      { response: {} }, // state update
+      { response: {} }, // Telegram alert
+    );
+
+    await runPostProcessing('market', [SAMPLE_FILING], [], 6, 'big error', [], {
+      fetchFn,
+      env: BASE_ENV,
+    });
+
+    // 3 calls: state lookup + state update + Telegram alert
+    expect(fetchFn).toHaveBeenCalledTimes(3);
+    const tgCall = fetchFn.mock.calls[2][0];
+    expect(tgCall).toContain('api.telegram.org');
+    expect(tgCall).toContain('sendMessage');
+  });
+});
